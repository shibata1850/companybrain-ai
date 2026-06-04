import { NextResponse } from 'next/server';
import { env } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Lists Gemini models the configured API key can actually reach, with
 * the supported generation methods (so we can tell which ones can be
 * used for bidiGenerateContent — i.e. the Live API). Useful when the
 * Live model name we hard-coded keeps coming back as "not found".
 */
export async function GET() {
  try {
    const apiKey = env.geminiApiKey();
    const variants = [
      'https://generativelanguage.googleapis.com/v1beta/models',
      'https://generativelanguage.googleapis.com/v1alpha/models',
    ];
    const out: Record<string, unknown> = {};
    for (const url of variants) {
      const res = await fetch(`${url}?key=${apiKey}&pageSize=200`);
      const text = await res.text();
      const tag = url.includes('v1alpha') ? 'v1alpha' : 'v1beta';
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
      // Filter to ones that look related to Live API / bidi / audio.
      const filtered = (data.models ?? []).filter((m) => {
        const methods = (m.supportedGenerationMethods ?? []).join(',');
        return (
          methods.includes('bidiGenerateContent') ||
          /live|audio|dialog/i.test(m.name)
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
