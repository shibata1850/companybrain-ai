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
 * (or `audio_key` for audio) HeyGen uses to reference it.
 *
 * The upload API takes the raw binary as the request body and the content
 * type in the Content-Type header.
 *
 * The returned `image_key` can be used directly as `talking_photo_id` in
 * the video generation request — there is no separate "create talking
 * photo" step required.
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
    data?: {
      id?: string;
      image_key?: string;
      audio_key?: string;
      asset_id?: string;
      url?: string;
    };
    code?: number;
  };
  const key =
    data.data?.image_key ||
    data.data?.audio_key ||
    data.data?.id ||
    data.data?.asset_id;
  if (!key) {
    throw new Error(`HeyGen asset upload: missing key in response: ${text}`);
  }
  return { key, url: data.data?.url };
}

/**
 * Register an uploaded image as a Photo Avatar so it can be referenced as
 * a `talking_photo_id` in /v2/video/generate. Just using the raw image_key
 * doesn't work — HeyGen rejects it as "avatar look not found".
 *
 * Flow:
 *   1. POST /v2/photo_avatar/avatar_group/create with the image_key →
 *      creates a group and an initial photo avatar record
 *   2. Poll /v2/photo_avatar/{id} until the record is `ready`
 *   3. Return the photo avatar id; that id is accepted as talking_photo_id
 */
export async function createPhotoAvatar(params: {
  imageKey: string;
  name: string;
}): Promise<{ talkingPhotoId: string }> {
  const createRes = await heygenFetch<{
    data?: {
      id?: string;
      group_id?: string;
      default_look_id?: string;
      photo_avatar_id?: string;
      looks?: Array<{ id?: string }>;
    };
  }>(`${HEYGEN_BASE}/v2/photo_avatar/avatar_group/create`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      name: params.name,
      image_key: params.imageKey,
    }),
  });

  let avatarId =
    createRes.data?.default_look_id ||
    createRes.data?.looks?.[0]?.id ||
    createRes.data?.photo_avatar_id ||
    createRes.data?.id;
  const groupId = createRes.data?.group_id || createRes.data?.id;

  // If we already have an id, poll its status until ready (or timeout).
  // Some plans return the look directly, others require waiting for the
  // photo to be processed.
  if (avatarId) {
    for (let i = 0; i < 30; i++) {
      try {
        const statusRes = await heygenFetch<{
          data?: { status?: string; id?: string };
        }>(`${HEYGEN_BASE}/v2/photo_avatar/${avatarId}`, {
          method: 'GET',
          headers: headers(),
        });
        const status = statusRes.data?.status;
        if (!status || status === 'ready' || status === 'completed') break;
        if (status === 'failed') {
          throw new Error('Photo avatar processing failed');
        }
      } catch (e) {
        // Endpoint variant may not exist; bail out of polling and trust the id.
        console.warn(
          '[heygen] photo_avatar status poll failed:',
          e instanceof Error ? e.message : String(e),
        );
        break;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    return { talkingPhotoId: avatarId };
  }

  // Otherwise fall back to listing photo avatars and finding ours.
  if (groupId) {
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      try {
        const listRes = await heygenFetch<{
          data?: {
            photo_avatar_list?: Array<{
              id?: string;
              group_id?: string;
              status?: string;
            }>;
          };
        }>(`${HEYGEN_BASE}/v2/photo_avatar/list`, {
          method: 'GET',
          headers: headers(),
        });
        const list = listRes.data?.photo_avatar_list || [];
        const found = list.find((p) => p.group_id === groupId);
        if (found?.id) {
          avatarId = found.id;
          break;
        }
      } catch (e) {
        console.warn('[heygen] photo_avatar list poll failed:', e);
      }
    }
  }

  if (!avatarId) {
    throw new Error(
      `Failed to register photo avatar (response: ${JSON.stringify(createRes)})`,
    );
  }
  return { talkingPhotoId: avatarId };
}

/**
 * Try to clone a voice from an uploaded audio asset (Instant Voice Clone).
 *
 * HeyGen's voice cloning is only available on certain plans. If it isn't
 * available we return `null` and the caller should fall back to a default
 * voice.
 */
export async function tryCloneVoice(params: {
  audioKey: string;
  name: string;
}): Promise<string | null> {
  // We try a couple of variants of the endpoint because HeyGen has shipped
  // it under different names depending on the plan / API version.
  const attempts: Array<{ url: string; body: Record<string, unknown> }> = [
    {
      url: `${HEYGEN_BASE}/v2/voice/instant_clone`,
      body: { audio_asset_id: params.audioKey, name: params.name },
    },
    {
      url: `${HEYGEN_BASE}/v1/voice.instant_clone`,
      body: { audio_asset_id: params.audioKey, name: params.name },
    },
  ];

  for (const attempt of attempts) {
    try {
      const data = await heygenFetch<{
        data?: { voice_id?: string; id?: string };
      }>(attempt.url, {
        method: 'POST',
        headers: headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(attempt.body),
      });
      const id = data.data?.voice_id || data.data?.id;
      if (id) return id;
    } catch (e) {
      console.warn(
        `[heygen] voice clone via ${attempt.url} failed:`,
        e instanceof Error ? e.message : String(e),
      );
    }
  }
  return null;
}

/**
 * Find the first Japanese voice in HeyGen's voice library, to use when
 * cloning isn't available.
 */
export async function pickDefaultJapaneseVoice(): Promise<string | null> {
  try {
    const data = await heygenFetch<{
      data?: {
        voices?: Array<{
          voice_id?: string;
          language?: string;
          gender?: string;
        }>;
      };
    }>(`${HEYGEN_BASE}/v2/voices`, { method: 'GET', headers: headers() });
    const voices = data.data?.voices || [];
    const japanese = voices.find(
      (v) =>
        v.language?.toLowerCase().includes('japan') ||
        v.language?.toLowerCase() === 'ja',
    );
    return japanese?.voice_id || voices[0]?.voice_id || null;
  } catch (e) {
    console.warn(
      '[heygen] failed to list voices:',
      e instanceof Error ? e.message : String(e),
    );
    return null;
  }
}

/**
 * Kick off a video render that lip-syncs the talking photo to the chosen
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
