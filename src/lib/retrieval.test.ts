import { describe, it, expect } from 'vitest';
import { extractKeywords } from './retrieval';

/**
 * ハイブリッド検索のキーワード抽出。
 *
 * 実測(社内マニュアル184チャンク)では、定型文が95%のチャンクに含まれ、
 * 「パスワードは何文字以上?」「測定器の校正周期は?」が意味検索だけでは
 * answers を取り出せず「資料に記載がない」と回答していた。キーワードが
 * 正しく抜ければ該当チャンクを直接引ける(実測で chunk 92 / 26 に一致)。
 * 抽出が壊れると検索全体が効かなくなるため、テストで固定する。
 */
describe('extractKeywords', () => {
  it('カタカナ語を抽出する(意味検索で埋もれた固有語の救済)', () => {
    const kws = extractKeywords('パスワードは何文字以上?');
    expect(kws).toContain('パスワード');
  });

  it('漢字の複合語を抽出する', () => {
    const kws = extractKeywords('測定器の校正周期は?');
    expect(kws).toContain('測定器');
  });

  it('長い漢字列は2文字単位にも分割する(文書側の表記ゆれを拾う)', () => {
    // 「校正周期」という語が文書に無くても「校正」で引けるようにする
    const kws = extractKeywords('校正周期について教えて');
    expect(kws).toContain('校正');
  });

  it('英数字を抽出する', () => {
    const kws = extractKeywords('WBGT値の基準は?');
    expect(kws).toContain('WBGT');
  });

  it('単独では意味を持たない語を除外する', () => {
    const kws = extractKeywords('上限は何文字以上ですか');
    expect(kws).not.toContain('上限');
    expect(kws).not.toContain('何文字');
  });

  it('1文字の語は拾わない(ノイズになるため)', () => {
    for (const k of extractKeywords('宿泊費の上限は?')) {
      expect(k.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('固有性の高い長い語を優先し、件数を絞る', () => {
    const kws = extractKeywords('フルハーネスと墜落制止用器具の高所作業基準', 3);
    expect(kws.length).toBeLessThanOrEqual(3);
    expect(kws[0].length).toBeGreaterThanOrEqual(kws[kws.length - 1].length);
  });

  it('重複を返さない', () => {
    const kws = extractKeywords('パスワードとパスワードの違い');
    expect(new Set(kws).size).toBe(kws.length);
  });

  it('キーワードが無い質問でも落ちない', () => {
    expect(extractKeywords('？')).toEqual([]);
    expect(extractKeywords('')).toEqual([]);
  });

  it('実際に失敗した2問から、正解チャンクを引ける語が取れる', () => {
    // chunk 92 は「パスワード」、chunk 26 は「測定器」「校正」で一致した
    expect(extractKeywords('パスワードは何文字以上?')).toContain('パスワード');
    const m = extractKeywords('測定器の校正周期は?');
    expect(m.some((k) => k === '測定器' || k === '校正')).toBe(true);
  });
});
