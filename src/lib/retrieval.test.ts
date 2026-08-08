import { describe, it, expect, vi, afterEach } from 'vitest';
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

// ---------------------------------------------------------------------------
// searchKnowledge 本体(引用元の解決を含む)
// ---------------------------------------------------------------------------

/**
 * 回答の「根拠」表示は、どの資料に基づくかを利用者に示す機能。ここが壊れると
 * 誤った出典を提示してしまい、根拠表示そのものが信頼できなくなる。
 * 意味検索の RPC は video_id を返さないためチャンクIDから引き直しており、
 * その解決経路を含めて検証する。
 */

type Row = Record<string, unknown>;

/** Supabase のクエリビルダを模したチェーン可能なスタブ。 */
function makeDb(opts: {
  chunks?: Row[];
  materials?: Row[];
  rpcRows?: Row[];
  failMaterials?: boolean;
}) {
  const calls = { chunkSelects: 0, materialSelects: 0 };
  const from = (table: string) => {
    const builder: Record<string, unknown> = {};
    let rows: Row[] = [];
    if (table === 'knowledge_chunks') {
      calls.chunkSelects++;
      rows = opts.chunks ?? [];
    } else if (table === 'training_videos') {
      calls.materialSelects++;
      if (opts.failMaterials) {
        // 素材名の取得だけが失敗するケース。
        const failing = {
          select: () => failing,
          eq: () => failing,
          ilike: () => failing,
          in: () => failing,
          limit: () => failing,
          then: (resolve: (v: unknown) => unknown) =>
            resolve({ data: null, error: { message: 'materials down' } }),
        };
        return failing;
      }
      rows = opts.materials ?? [];
    }
    const chain = () => builder;
    builder.select = chain;
    builder.eq = chain;
    builder.ilike = chain;
    builder.in = chain;
    builder.limit = chain;
    builder.then = (resolve: (v: unknown) => unknown) =>
      resolve({ data: rows, error: null });
    return builder;
  };
  return {
    db: {
      from,
      rpc: async () => ({ data: opts.rpcRows ?? [], error: null }),
    },
    calls,
  };
}

async function runSearch(dbStub: unknown, query = 'パスワード') {
  vi.resetModules();
  vi.doMock('./supabase', () => ({ supabaseAdmin: () => dbStub }));
  vi.doMock('./gemini', () => ({
    embedTexts: async () => [[0.1, 0.2, 0.3]],
  }));
  const { searchKnowledge } = await import('./retrieval');
  return searchKnowledge('avatar-1', query, 8);
}

describe('searchKnowledge の引用元解決', () => {
  afterEach(() => {
    vi.doUnmock('./supabase');
    vi.doUnmock('./gemini');
    vi.resetModules();
  });

  it('キーワード一致のヒットに素材名が付く', async () => {
    const { db } = makeDb({
      chunks: [{ id: 'c1', content: 'パスワードは8文字以上', video_id: 'v1' }],
      materials: [{ id: 'v1', file_name: '情報セキュリティ規程.pdf' }],
    });
    const hits = await runSearch(db);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].materialName).toBe('情報セキュリティ規程.pdf');
    expect(hits[0].materialId).toBe('v1');
  });

  it('意味検索のヒットもチャンクIDから素材名を解決する', async () => {
    // RPC は video_id を返さない。チャンクID経由で引けることを確認する。
    const { db } = makeDb({
      chunks: [{ id: 'c9', content: '有給は入社半年で付与', video_id: 'v2' }],
      materials: [{ id: 'v2', file_name: '就業規則.docx' }],
      rpcRows: [{ id: 'c9', content: '有給は入社半年で付与', similarity: 0.9 }],
    });
    // キーワードが取れない質問にして、意味検索の経路だけを通す。
    const hits = await runSearch(db, 'それはどう');
    const hit = hits.find((h) => h.content.includes('有給'));
    expect(hit).toBeDefined();
    expect(hit!.materialName).toBe('就業規則.docx');
  });

  it('引用元が無いチャンク(譲渡されたブレイン)でも落ちない', async () => {
    // copy_brain 由来のチャンクは video_id が NULL。
    const { db } = makeDb({
      chunks: [{ id: 'c2', content: 'パスワードの規定です', video_id: null }],
      materials: [],
    });
    const hits = await runSearch(db);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].content).toContain('パスワード');
    expect(hits[0].materialName ?? null).toBeNull(); // 名前なしで返る
  });

  it('素材名の取得が失敗しても検索結果は返す(表示上の補助情報のため)', async () => {
    const { db } = makeDb({
      chunks: [{ id: 'c3', content: 'パスワードは8文字以上', video_id: 'v3' }],
      failMaterials: true,
    });
    const hits = await runSearch(db);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].content).toContain('パスワード'); // 本文は失われない
    expect(hits[0].materialName ?? null).toBeNull();
  });

  it('同じ本文のチャンクを重複して返さない', async () => {
    const { db } = makeDb({
      chunks: [
        { id: 'c4', content: 'パスワードは8文字以上', video_id: 'v1' },
        { id: 'c5', content: 'パスワードは8文字以上', video_id: 'v1' },
      ],
      materials: [{ id: 'v1', file_name: '規程.pdf' }],
    });
    const hits = await runSearch(db);
    expect(hits).toHaveLength(1);
  });
});
