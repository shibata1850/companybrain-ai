import { env } from './env';

const DID_BASE = 'https://api.d-id.com';

function authHeader(): string {
  return `Basic ${env.didApiKey()}`;
}

async function didFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${DID_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: authHeader(),
      Accept: 'application/json',
      ...((init.headers as Record<string, string>) || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`D-ID API error (${res.status}) ${path}: ${text}`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`D-ID returned non-JSON from ${path}: ${text}`);
  }
}

/**
 * Upload a source face image to D-ID. Returns the persistent URL that
 * /talks accepts as `source_url`.
 */
export async function uploadImage(
  bytes: Buffer,
  contentType: string,
): Promise<{ url: string; id?: string }> {
  const form = new FormData();
  const ext = contentType.includes('png') ? 'png' : 'jpg';
  const blob = new Blob([new Uint8Array(bytes)], { type: contentType });
  form.append('image', blob, `face.${ext}`);

  const res = await fetch(`${DID_BASE}/images`, {
    method: 'POST',
    headers: { Authorization: authHeader() },
    body: form,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`D-ID image upload failed (${res.status}): ${text}`);
  }
  const data = JSON.parse(text) as { id?: string; url?: string };
  if (!data.url) {
    throw new Error(`D-ID /images returned no url: ${text}`);
  }
  return { url: data.url, id: data.id };
}

/**
 * Kick off a talking-head video render on D-ID's /talks endpoint.
 * Returns the talk_id to poll.
 */
export async function createTalk(params: {
  sourceUrl: string;
  text: string;
  voiceId?: string;
}): Promise<{ talkId: string }> {
  const voiceId = params.voiceId || env.didVoiceId();
  const body = {
    source_url: params.sourceUrl,
    script: {
      type: 'text',
      input: params.text,
      provider: {
        type: 'microsoft',
        voice_id: voiceId,
      },
    },
    config: {
      fluent: true,
      pad_audio: 0.3,
      stitch: true,
      result_format: 'mp4',
    },
  };
  const data = await didFetch<{ id?: string }>('/talks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!data.id) throw new Error('D-ID /talks returned no id');
  return { talkId: data.id };
}

export type DIDTalkStatus = {
  status: string; // 'created' | 'started' | 'done' | 'error' | ...
  videoUrl?: string;
  thumbnailUrl?: string;
  error?: string;
};

/**
 * Poll the status of a previously-created talk.
 */
export async function getTalkStatus(
  talkId: string,
): Promise<DIDTalkStatus> {
  const data = await didFetch<{
    status?: string;
    result_url?: string;
    thumbnail_url?: string;
    error?: { description?: string; kind?: string };
  }>(`/talks/${encodeURIComponent(talkId)}`);
  return {
    status: data.status || 'pending',
    videoUrl: data.result_url,
    thumbnailUrl: data.thumbnail_url,
    error: data.error?.description,
  };
}

/**
 * Default voice catalogue we surface to users — all Microsoft Azure
 * Neural voices, all Japanese. ja-JP-NanamiNeural is the default.
 */
export const DEFAULT_JA_VOICES: Array<{
  voice_id: string;
  label: string;
}> = [
  { voice_id: 'ja-JP-NanamiNeural', label: 'ななみ(女性・落ち着いた)' },
  { voice_id: 'ja-JP-KeitaNeural', label: 'けいた(男性・自然)' },
  { voice_id: 'ja-JP-MayuNeural', label: 'まゆ(女性・明るい)' },
  { voice_id: 'ja-JP-DaichiNeural', label: 'だいち(男性・力強い)' },
  { voice_id: 'ja-JP-AoiNeural', label: 'あおい(女性・若い)' },
  { voice_id: 'ja-JP-NaokiNeural', label: 'なおき(男性・落ち着いた)' },
  { voice_id: 'ja-JP-ShioriNeural', label: 'しおり(女性・優しい)' },
];
