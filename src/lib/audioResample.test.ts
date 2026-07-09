import { describe, expect, it } from 'vitest';
import { TARGET_INPUT_RATE, floatTo16kPcm } from './audioResample';

describe('floatTo16kPcm', () => {
  it('16kHz はレート変換せず、そのまま PCM16 化する', () => {
    const input = new Float32Array([0, 0.5, -0.5, 1, -1]);
    const out = floatTo16kPcm(input, TARGET_INPUT_RATE);
    expect(out.length).toBe(5);
    expect(out[0]).toBe(0);
    // Int16Array は 0 方向に切り捨て(16383.5 → 16383)
    expect(out[1]).toBe(Math.trunc(0.5 * 0x7fff));
    expect(out[3]).toBe(0x7fff); // +1.0 → 32767
    expect(out[4]).toBe(-0x8000); // -1.0 → -32768
  });

  it('48kHz は約1/3の長さにダウンサンプルする', () => {
    const input = new Float32Array(48000).fill(0.25);
    const out = floatTo16kPcm(input, 48000);
    // 48000 / (48000/16000)=3 → 16000 サンプル
    expect(out.length).toBe(16000);
    // 一定値の入力は変換後も一定値(補間しても同じ)
    expect(out[0]).toBe(Math.trunc(0.25 * 0x7fff));
    expect(out[8000]).toBe(Math.trunc(0.25 * 0x7fff));
  });

  it('44.1kHz でも 16kHz 相当の長さに縮む', () => {
    const input = new Float32Array(44100).fill(0);
    const out = floatTo16kPcm(input, 44100);
    // floor(44100 / (44100/16000)) = 16000
    expect(out.length).toBe(16000);
  });

  it('レート 0/未指定は素通し(PCM16 化のみ)', () => {
    const input = new Float32Array([0.1, -0.1]);
    const out = floatTo16kPcm(input, 0);
    expect(out.length).toBe(2);
  });

  it('クリップ: 範囲外の値は ±最大に丸める', () => {
    const out = floatTo16kPcm(new Float32Array([2, -2]), TARGET_INPUT_RATE);
    expect(out[0]).toBe(0x7fff);
    expect(out[1]).toBe(-0x8000);
  });
});
