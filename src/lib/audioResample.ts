/**
 * マイクの Float32 音声を、Gemini Live が要求する 16kHz / 16-bit PCM に
 * 変換する。iOS Safari は AudioContext の sampleRate 指定(16000)を無視して
 * ハードのレート(通常 48000)で動くため、実レート inRate から 16000 へ
 * 線形補間でリサンプリングしないと、送信音声のピッチがずれて認識されない。
 * inRate === 16000(デスクトップ Chrome 等)のときは実質そのまま変換する。
 */
export const TARGET_INPUT_RATE = 16000;

export function floatTo16kPcm(
  input: Float32Array,
  inRate: number,
): Int16Array {
  const clampToPcm = (s: number) => {
    const v = Math.max(-1, Math.min(1, s));
    return v < 0 ? v * 0x8000 : v * 0x7fff;
  };
  if (!inRate || inRate === TARGET_INPUT_RATE) {
    const out = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) out[i] = clampToPcm(input[i]);
    return out;
  }
  const ratio = inRate / TARGET_INPUT_RATE;
  const outLen = Math.max(1, Math.floor(input.length / ratio));
  const out = new Int16Array(outLen);
  for (let j = 0; j < outLen; j++) {
    const pos = j * ratio;
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const frac = pos - i0;
    const sample = input[i0] * (1 - frac) + input[i1] * frac;
    out[j] = clampToPcm(sample);
  }
  return out;
}
