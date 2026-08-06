import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as XLSX from 'xlsx';
import { extractDocumentText } from './documentText';

/**
 * 受け入れ基準 §8.2 #2 の自動化。
 *
 * 「PDF / Word / Excel / CSV / テキストの5形式すべてから本文が抽出できる」
 * ことを、実際のファイルバイト列で検証する。これまで手動アップロードで
 * 確認していた項目を自動テスト化し、退行を検知できるようにする。
 *
 * 本番(Vercel サーバーレス)には DOMMatrix が無く、それが原因で PDF 抽出が
 * 落ちた実績がある。Node 実行環境にも DOMMatrix は無いため、このテストが
 * 通ることは同じ条件での動作確認になる。
 */

/** テキストが取れる最小の PDF(約400バイト)をその場で組み立てる。 */
function makeMinimalPdf(text: string): Buffer {
  const content = `BT /F1 14 Tf 20 100 Td (${text}) Tj ET`;
  return Buffer.from(
    `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 144]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length ${content.length}>>stream
${content}
endstream endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
trailer<</Root 1 0 R>>
%%EOF`,
    'latin1',
  );
}

describe('文書取り込み 5形式の統合テスト(受け入れ基準 §8.2 #2)', () => {
  it('PDF から本文を抽出できる(DOMMatrix 非依存)', async () => {
    const buf = makeMinimalPdf('Safety Manual: harness required');
    const { text, kind } = await extractDocumentText(
      buf,
      'application/pdf',
      'manual.pdf',
    );
    expect(kind).toBe('pdf');
    expect(text).toContain('harness required');
  });

  it('Word(.docx) から日本語の本文を抽出できる', async () => {
    const buf = readFileSync(
      join(__dirname, '__fixtures__', 'sample-word.docx'),
    );
    const { text, kind } = await extractDocumentText(
      buf,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'sample-word.docx',
    );
    expect(kind).toBe('word');
    expect(text).toContain('年次有給休暇');
    expect(text).toContain('第15条');
  });

  it('Excel(.xlsx)から全シートを抽出し、シート名を見出しとして残す', async () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ['製品名', '卸価格'],
        ['スチール棚 A型', 12600],
      ]),
      '製品価格',
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ['数量', '割引率'],
        ['50個以上', '10%'],
      ]),
      '割引ルール',
    );
    const buf = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));

    const { text, kind } = await extractDocumentText(
      buf,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'price.xlsx',
    );
    expect(kind).toBe('excel');
    // 2シートとも取れていること
    expect(text).toContain('# 製品価格');
    expect(text).toContain('スチール棚 A型');
    expect(text).toContain('12600');
    expect(text).toContain('# 割引ルール');
    expect(text).toContain('50個以上');
  });

  it('CSV から日本語を文字化けせず抽出できる', async () => {
    const buf = Buffer.from(
      '費目,上限額\n宿泊費,12000\n交通費,指定席まで\n',
      'utf-8',
    );
    const { text, kind } = await extractDocumentText(buf, 'text/csv', 'k.csv');
    expect(kind).toBe('csv');
    expect(text).toContain('宿泊費');
    expect(text).toContain('12000');
    expect(text).toContain('指定席まで');
  });

  it('テキストから本文を抽出できる', async () => {
    const buf = Buffer.from(
      '第3条(宿泊費)\n宿泊費の上限は1泊あたり12,000円とする。',
      'utf-8',
    );
    const { text, kind } = await extractDocumentText(
      buf,
      'text/plain',
      'rule.txt',
    );
    expect(kind).toBe('text');
    expect(text).toContain('宿泊費の上限');
    expect(text).toContain('12,000円');
  });

  it('画像だけの PDF など本文が無い場合は空文字を返す(呼び出し側で 400 にする)', async () => {
    // 本文ストリームを持たない PDF
    const empty = Buffer.from(
      `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 144]>>endobj
trailer<</Root 1 0 R>>
%%EOF`,
      'latin1',
    );
    const { text } = await extractDocumentText(empty, 'application/pdf', 'x.pdf');
    expect(text.trim()).toBe('');
  });
});
