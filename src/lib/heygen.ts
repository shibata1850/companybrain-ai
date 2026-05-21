import { env } from './env';

const HEYGEN_BASE = 'https://api.heygen.com';
const UPLOAD_BASE = 'https://upload.heygen.com';

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'X-Api-Key': env.heygenApiKey(),
    ...extra,
  };
}

async function heygenFetch<T>(
  url: string,
  init: RequestInit,
): Promise<T> {
  const res = await fetch(url, init);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HeyGen API error (${res.status}) ${url}: ${text}`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`HeyGen returned non-JSON from ${url}: ${text}`);
  }
}

/**
 * Upload a raw asset (image or audio) to HeyGen. Returns the `image_key`
 * or `audio_key` HeyGen uses to reference it.
 *
 * NB: the upload API takes the raw binary as the request body and the
 * content type in the Content-Type header.
 */
export async function uploadAsset(
  bytes: Buffer | Uint8Array,
  contentType: string,
): Promise<{ key: string; url?: string }> {
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  const res = await fetch(`${UPLOAD_BASE}/v1/asset`, {
    method: 'POST',
    headers: headers({ 'Content-Type': contentType }),
    body: ab,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HeyGen asset upload failed (${res.status}): ${text}`);
  }
  const data = JSON.parse(text) as {
    data?: { id?: string; image_key?: string; url?: string };
    code?: number;
  };
  const key = data.data?.image_key || data.data?.id;
  if (!key) {
    throw new Error(`HeyGen asset upload: missing key in response: ${text}`);
  }
  return { key, url: data.data?.url };
}

/**
 * Create a Photo Avatar (talking photo) from an uploaded image asset.
 * Returns a `talking_photo_id` usable in the video generation endpoint.
 */
export async function createTalkingPhoto(
  imageKey: string,
): Promise<{ talkingPhotoId: string }> {
  const data = await heygenFetch<{
    data?: { talking_photo_id?: string; id?: string };
  }>(`${HEYGEN_BASE}/v1/talking_photo`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ image_key: imageKey }),
  });
  const id = data.data?.talking_photo_id || data.data?.id;
  if (!id) throw new Error('HeyGen talking_photo: no id returned');
  return { talkingPhotoId: id };
}

/**
 * Clone a voice from an uploaded audio asset (Instant Voice Clone).
 */
export async function cloneVoice(params: {
  audioKey: string;
  name: string;
}): Promise<{ voiceId: string }> {
  const data = await heygenFetch<{
    data?: { voice_id?: string; id?: string };
  }>(`${HEYGEN_BASE}/v1/voice.instant_clone`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ audio_asset_id: params.audioKey, name: params.name }),
  });
  const id = data.data?.voice_id || data.data?.id;
  if (!id) throw new Error('HeyGen voice clone: no voice_id returned');
  return { voiceId: id };
}

/**
 * Kick off a video render that lip-syncs the talking photo to the cloned
 * voice reading `inputText`. Returns the `video_id` to poll.
 */
export async function generateVideo(params: {
  talkingPhotoId: string;
  voiceId: string;
  inputText: string;
}): Promise<{ videoId: string }> {
  const body = {
    video_inputs: [
      {
        character: {
          type: 'talking_photo',
          talking_photo_id: params.talkingPhotoId,
        },
        voice: {
          type: 'text',
          voice_id: params.voiceId,
          input_text: params.inputText,
        },
      },
    ],
    dimension: { width: 720, height: 1280 },
  };
  const data = await heygenFetch<{ data?: { video_id?: string } }>(
    `${HEYGEN_BASE}/v2/video/generate`,
    {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    },
  );
  const id = data.data?.video_id;
  if (!id) throw new Error('HeyGen generate: no video_id returned');
  return { videoId: id };
}

export type HeyGenVideoStatus = {
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'waiting' | string;
  videoUrl?: string;
  thumbnailUrl?: string;
  error?: string;
};

/**
 * Poll status of a render started by generateVideo.
 */
export async function getVideoStatus(
  videoId: string,
): Promise<HeyGenVideoStatus> {
  const url = `${HEYGEN_BASE}/v1/video_status.get?video_id=${encodeURIComponent(
    videoId,
  )}`;
  const data = await heygenFetch<{
    data?: {
      status?: string;
      video_url?: string;
      thumbnail_url?: string;
      error?: { message?: string } | string;
    };
  }>(url, { method: 'GET', headers: headers() });
  const d = data.data || {};
  return {
    status: (d.status as HeyGenVideoStatus['status']) || 'pending',
    videoUrl: d.video_url,
    thumbnailUrl: d.thumbnail_url,
    error:
      typeof d.error === 'string'
        ? d.error
        : d.error?.message,
  };
}
