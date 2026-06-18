import { NextResponse } from 'next/server';
import { env } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Lists Gemini models that support embedContent so we can pick one that
 * actually exists on the user's API tier. The embedding endpoint silently
 * 404s when the model name is wrong; this lets us see what's available
 * before changing GEMINI_EMBEDDING_MODEL.
 */
export async function GET() {
  try {
    const apiKey = env.geminiApiKey();
    const variants = [
      'https://generativelanguage.googleapis.com/v1beta/models',
      'https://generativelanguage.googleapis.com/v1/models',
    ];
    const out: Record<string, unknown> = {};
    for (const url of variants) {
      const res = await fetch(`${url}?key=${apiKey}&pageSize=200`);
      const text = await res.text();
      const tag = url.includes('v1beta') ? 'v1beta' : 'v1';
      if (!res.ok) {
        out[tag] = { status: res.status, body: text };
        continue;
      }
      const data = JSON.parse(text) as {
        models?: Array<{
          name: string;
          supportedGenerationMethods?: string[];
        }>;
      };
      const filtered = (data.models ?? []).filter((m) => {
        const methods = (m.supportedGenerationMethods ?? []).join(',');
        return (
          methods.includes('embedContent') || /embed/i.test(m.name)
        );
      });
      out[tag] = filtered.map((m) => ({
        name: m.name,
        methods: m.supportedGenerationMethods,
      }));
    }
    return NextResponse.json(out);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
