import { NextResponse } from 'next/server';
import { env } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Mint a short-lived streaming session token. The browser SDK uses this
 * to open a WebRTC connection to HeyGen without ever seeing our API key.
 */
export async function POST() {
  try {
    const res = await fetch(
      'https://api.heygen.com/v1/streaming.create_token',
      {
        method: 'POST',
        headers: {
          'X-Api-Key': env.heygenApiKey(),
        },
      },
    );
    const text = await res.text();
    if (!res.ok) {
      return NextResponse.json(
        { error: `HeyGen token failed (${res.status}): ${text}` },
        { status: 500 },
      );
    }
    const data = JSON.parse(text) as {
      data?: { token?: string };
    };
    const token = data.data?.token;
    if (!token) {
      return NextResponse.json(
        { error: 'no token in response' },
        { status: 500 },
      );
    }
    return NextResponse.json({
      token,
      avatarId: env.heygenInteractiveAvatarId(),
      language: env.heygenInteractiveLanguage(),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
