/**
 * コトノハ(キオスクの「文字の銀河」演出)用の語彙抽出。
 *
 * アバターの学習素材テキストから「このブレインが何を知っているか」を
 * 表す言葉を拾い、画面を泳ぐ文字粒の材料にする。ブレインごとに銀河の
 * 中身が変わる=知識がそのまま姿になる、という演出の土台。
 *
 * 形態素解析は使わず、表記の連なり(漢字2〜4連・カタカナ2〜6連・
 * 英大文字2〜4連)を言葉とみなす軽量ヒューリスティック。固有名詞
 * (展勝地・鬼剣舞 など)は頻度で自然に浮かび上がる。
 */

/** 頻出するが「知識らしさ」のない定型語は銀河に入れない。 */
const STOP_WORDS = new Set([
  '自分',
  '今日',
  '明日',
  '昨日',
  '場合',
  '時間',
  '一番',
  '本当',
  '普通',
  '結構',
  '感じ',
  '意味',
  '理解',
  '最初',
  '最後',
  '以上',
  '以下',
  '質問',
  '回答',
  'ソース',
  'データ',
]);

export function extractKotonohaWords(texts: string[], max = 40): string[] {
  const joined = texts.join('\n');
  if (!joined.trim()) return [];

  // 複数文字の「言葉」: 2回以上出てくるものだけ(偶然の連なりを除く)。
  const wordFreq = new Map<string, number>();
  const wordRe = /[一-鿿]{2,4}|[゠-ヿー]{2,6}|[A-Z]{2,4}/g;
  for (const m of joined.matchAll(wordRe)) {
    const w = m[0];
    if (STOP_WORDS.has(w)) continue;
    wordFreq.set(w, (wordFreq.get(w) ?? 0) + 1);
  }
  const words = [...wordFreq.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, Math.ceil(max * 0.4))
    .map(([w]) => w);

  // 単漢字: 銀河の小さな粒。頻度上位から。
  const kanjiFreq = new Map<string, number>();
  for (const m of joined.matchAll(/[一-鿿]/g)) {
    kanjiFreq.set(m[0], (kanjiFreq.get(m[0]) ?? 0) + 1);
  }
  const kanji = [...kanjiFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([w]) => w);

  const out = new Set<string>();
  for (const w of kanji) {
    if (out.size >= max - words.length) break;
    out.add(w);
  }
  for (const w of words) out.add(w);
  return [...out].slice(0, max);
}
