import { env } from './env';

const HEYGEN_BASE = 'https://api.heygen.com';
const UPLOAD_BASE = 'https://upload.heygen.com';

/**
 * Background passed to /v2/video/generate. Lets us swap the original
 * frame's background for something calm and controlled.
 *
 * Env config:
 *   HEYGEN_BACKGROUND_TYPE  = 'color' | 'image' | 'video' | 'none'
 *   HEYGEN_BACKGROUND_VALUE = hex color (for 'color') or public URL
 *                             (for 'image' / 'video')
 *
 * Default: solid warm neutral wall (#e8e4dc) — reads as a calm office.
 */
function buildBackground(): Record<string, unknown> | null {
  const type = (process.env.HEYGEN_BACKGROUND_TYPE || 'color').toLowerCase();
  if (type === 'none') return null;
  if (type === 'image') {
    const url = process.env.HEYGEN_BACKGROUND_VALUE;
    if (!url) return null;
    return { type: 'image', url };
  }
  if (type === 'video') {
    const url = process.env.HEYGEN_BACKGROUND_VALUE;
    if (!url) return null;
    return { type: 'video', url };
  }
  // color (default)
  const value = process.env.HEYGEN_BACKGROUND_VALUE || '#e8e4dc';
  return { type: 'color', value };
}

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
 *
 * Resolution: env HEYGEN_VIDEO_WIDTH / HEYGEN_VIDEO_HEIGHT (default 1080x1920).
 *
 * Quality mode: env HEYGEN_AVATAR_QUALITY
 *   - "premium" (default): try HeyGen's newest Avatar IV / V4 lip-sync
 *     engine first. Falls back automatically to the standard talking_photo
 *     model if the account / plan can't access V4.
 *   - "standard": skip V4 entirely and use the classic talking_photo flow.
 *     Cheaper per second, lower lip-sync fidelity.
 *
 * NB: Avatar IV typically bills at a higher per-second rate than the
 * standard model. Compare cost in HeyGen's usage page after a few renders.
 */
export async function generateVideo(params: {
  talkingPhotoId: string;
  voiceId: string;
  inputText: string;
}): Promise<{ videoId: string }> {
  const width = Number(process.env.HEYGEN_VIDEO_WIDTH) || 1080;
  const height = Number(process.env.HEYGEN_VIDEO_HEIGHT) || 1920;
  const dimension = { width, height };
  const useV4 =
    (process.env.HEYGEN_AVATAR_QUALITY || 'premium').toLowerCase() !==
    'standard';

  const voice = {
    type: 'text',
    voice_id: params.voiceId,
    input_text: params.inputText,
    speed: 1.0,
    // Emotion gives the audio + lip-sync a more lifelike cadence on
    // plans that support it. Plans that don't will just ignore it.
    emotion: 'Friendly',
  };

  // Background replacement so the speaker is composited over a calm,
  // controlled scene instead of whatever was in the source frame.
  // Defaults to a warm neutral office-wall colour; override via env.
  const background = buildBackground();
  const composeInput = (
    character: Record<string, unknown>,
  ): Record<string, unknown> => ({
    character,
    voice,
    ...(background ? { background } : {}),
  });

  // Try a list of request shapes in order. HeyGen's Avatar IV has shipped
  // under a couple of names while it stabilises, so we cover the variants
  // we know about and fall through to the classic talking_photo engine
  // if none are accepted.
  type Attempt = { name: string; body: Record<string, unknown> };
  const attempts: Attempt[] = [];
  if (useV4) {
    attempts.push({
      name: 'avatar_iv',
      body: {
        video_inputs: [
          composeInput({
            type: 'avatar_iv',
            avatar_iv_id: params.talkingPhotoId,
            scale: 1.0,
          }),
        ],
        dimension,
      },
    });
    attempts.push({
      name: 'talking_photo+v4',
      body: {
        video_inputs: [
          composeInput({
            type: 'talking_photo',
            talking_photo_id: params.talkingPhotoId,
            version: 'v4',
            scale: 1.0,
          }),
        ],
        dimension,
      },
    });
  }
  attempts.push({
    name: 'talking_photo',
    body: {
      video_inputs: [
        composeInput({
          type: 'talking_photo',
          talking_photo_id: params.talkingPhotoId,
          scale: 1.0,
        }),
      ],
      dimension,
    },
  });

  let lastError: unknown = null;
  for (const attempt of attempts) {
    try {
      const data = await heygenFetch<{ data?: { video_id?: string } }>(
        `${HEYGEN_BASE}/v2/video/generate`,
        {
          method: 'POST',
          headers: headers({ 'Content-Type': 'application/json' }),
          body: JSON.stringify(attempt.body),
        },
      );
      const id = data.data?.video_id;
      if (id) {
        console.log(`[heygen] video render started via "${attempt.name}"`);
        return { videoId: id };
      }
    } catch (e) {
      lastError = e;
      console.warn(
        `[heygen] "${attempt.name}" failed:`,
        e instanceof Error ? e.message : String(e),
      );
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error('HeyGen generate: all avatar engines failed');
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
