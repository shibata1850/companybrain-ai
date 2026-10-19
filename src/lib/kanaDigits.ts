/**
 * 字幕表示用: カタカナ読みの数字列を算用数字に直す。
 *
 * 音声では電話番号を「ゼロイチニーゼロ、ロクキューハチ、ゴーニーゼロ」の
 * ように読ませている(TTSが正しく読むため)。しかし字幕にそのまま出すと
 * 読みにくく、「数字で見たい」という要望に応えられない。表示の段階で
 * カタカナ数字の連なりを検出し、数字に置き換える。
 *
 * 誤変換を避けるための条件:
 *  - カタカナの連続(ラン)が「数字の読みだけ」で完全に分解でき、
 *    かつ数字3桁以上になる場合のみ変換する(「ニーズ」「ゴール」等は
 *    余りが出るので変換されない)
 *  - 変換された数字列同士が「、」「・」や空白で続く場合はハイフンで
 *    つなぐ(ゼロイチニーゼロ、ロクキューハチ → 0120-698)
 *
 * 会話の記録(監査ログ)は話したとおりのまま残し、これは画面表示にだけ使う。
 */

/** 長い読みを先に並べる(ニー を ニ+ー と誤分解しないため)。 */
const DIGIT_TOKENS: Array<[string, string]> = [
  ['ゼロ', '0'],
  ['レイ', '0'],
  ['マル', '0'],
  ['イチ', '1'],
  ['ニー', '2'],
  ['サン', '3'],
  ['ヨン', '4'],
  ['ゴー', '5'],
  ['ロク', '6'],
  ['ナナ', '7'],
  ['シチ', '7'],
  ['ハチ', '8'],
  ['キュー', '9'],
  ['キュウ', '9'],
  ['ニ', '2'],
  ['ゴ', '5'],
  ['ク', '9'],
];

/** カタカナ連続を数字へ。完全に分解できなければ null。 */
function parseKanaRun(run: string): string | null {
  let out = '';
  let i = 0;
  outer: while (i < run.length) {
    for (const [kana, digit] of DIGIT_TOKENS) {
      if (run.startsWith(kana, i)) {
        out += digit;
        i += kana.length;
        continue outer;
      }
    }
    return null; // 数字の読み以外が混ざっている
  }
  return out.length >= 3 ? out : null;
}

export function digitizeKanaNumbers(text: string): string {
  if (!text) return text;
  // カタカナ(長音符含む)の連続を走査して置換。
  const replaced = text.replace(/[ァ-ヶー]+/g, (run) => {
    const digits = parseKanaRun(run);
    return digits ?? run;
  });
  // 数字列が読点・中点・空白で続いていたら電話番号らしくハイフンでつなぐ。
  return replaced.replace(/(\d{2,})[、・\s]+(?=\d{2,})/g, '$1-');
}
