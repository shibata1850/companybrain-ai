import { describe, it, expect } from 'vitest';
import { chunkTranscript } from './gemini';

describe('chunkTranscript', () => {
  it('returns an empty array for empty / whitespace-only input', () => {
    expect(chunkTranscript('')).toEqual([]);
    expect(chunkTranscript('   \n  \t ')).toEqual([]);
  });

  it('returns a single chunk when text fits within chunkSize', () => {
    const out = chunkTranscript('短いテキスト', 400, 50);
    expect(out).toEqual(['短いテキスト']);
  });

  it('collapses runs of whitespace', () => {
    expect(chunkTranscript('a   b\n\nc')).toEqual(['a b c']);
  });

  it('splits long text into overlapping chunks', () => {
    const text = 'x'.repeat(1000);
    const out = chunkTranscript(text, 400, 50);
    expect(out.length).toBeGreaterThan(1);
    // Each chunk no longer than chunkSize.
    for (const c of out) expect(c.length).toBeLessThanOrEqual(400);
    // Step is chunkSize - overlap = 350, so chunks 1 and 2 overlap by 50.
    expect(out[0].slice(350)).toEqual(out[1].slice(0, 50));
  });

  it('covers the entire input across chunks', () => {
    const text = 'abcdefghij'.repeat(80); // 800 chars
    const out = chunkTranscript(text, 300, 50);
    // Last chunk should end with the input's tail.
    expect(out[out.length - 1].endsWith('abcdefghij')).toBe(true);
  });
});
