import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import { PDFParse } from 'pdf-parse';

/**
 * 社内文書(PDF / Word / Excel / CSV / テキスト)からプレーンテキストを
 * 抽出する。抽出したテキストは train-text と同じ RAG パイプライン
 * (分割 → 埋め込み → 理解)に流し込んで学習に使う。
 *
 * 画像だけのスキャン PDF などテキストが取れない場合は空文字を返すので、
 * 呼び出し側で「抽出できませんでした」を案内する。
 */

export type DocKind = 'pdf' | 'word' | 'excel' | 'csv' | 'text';

export type ExtractResult = { text: string; kind: DocKind };

/** 抽出テキストの安全上限(埋め込みコスト・DB を守るため)。 */
export const MAX_DOC_CHARS = 200_000;

/** MIME / 拡張子から対応文書種別を判定。対応外は null。 */
export function detectDocKind(
  mimeType: string,
  fileName: string,
): DocKind | null {
  const name = (fileName || '').toLowerCase();
  const mt = (mimeType || '').toLowerCase();
  if (mt.includes('pdf') || name.endsWith('.pdf')) return 'pdf';
  if (
    mt.includes('wordprocessingml') ||
    mt === 'application/msword' ||
    name.endsWith('.docx')
  )
    return 'word';
  if (
    mt.includes('spreadsheetml') ||
    mt.includes('ms-excel') ||
    name.endsWith('.xlsx') ||
    name.endsWith('.xls')
  )
    return 'excel';
  if (mt.includes('csv') || name.endsWith('.csv')) return 'csv';
  if (mt.startsWith('text/') || name.endsWith('.txt') || name.endsWith('.md'))
    return 'text';
  return null;
}

/** 対応拡張子(UI の accept 属性と案内に使う)。 */
export const SUPPORTED_DOC_EXTS = [
  '.pdf',
  '.docx',
  '.xlsx',
  '.xls',
  '.csv',
  '.txt',
  '.md',
] as const;

/** 制御文字(NUL 等)を除き、余分な空行を畳んで整える。 */
function normalize(s: string): string {
  return s
    .replace(/\r\n/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function extractPdf(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    // pdf-parse はページ境界に「-- 1 of 3 --」のようなマーカーを挟むので、
    // 学習テキストを汚さないよう取り除く。
    return (result?.text ?? '').replace(
      /^\s*--\s*\d+\s*of\s*\d+\s*--\s*$/gm,
      '',
    );
  } finally {
    // ページリソースを解放(サーバーレスでのメモリリークを避ける)。
    try {
      await parser.destroy();
    } catch {
      // best effort
    }
  }
}

async function extractWord(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result?.value ?? '';
}

function extractSpreadsheet(buffer: Buffer): string {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const parts: string[] = [];
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    const csv = XLSX.utils.sheet_to_csv(sheet);
    if (csv.trim()) {
      // シート名を見出しに付けて文脈を残す(複数シートでも区別できる)。
      parts.push(`# ${sheetName}\n${csv}`);
    }
  }
  return parts.join('\n\n');
}

/**
 * 文書からテキストを抽出する。対応外の種別は例外。抽出できたテキストは
 * 正規化し、上限で切り詰める。
 */
export async function extractDocumentText(
  buffer: Buffer,
  mimeType: string,
  fileName: string,
): Promise<ExtractResult> {
  const kind = detectDocKind(mimeType, fileName);
  if (!kind) {
    throw new Error('unsupported_document');
  }

  let text = '';
  if (kind === 'pdf') {
    text = await extractPdf(buffer);
  } else if (kind === 'word') {
    text = await extractWord(buffer);
  } else if (kind === 'excel' || kind === 'csv') {
    text = extractSpreadsheet(buffer);
  } else {
    text = buffer.toString('utf-8');
  }

  text = normalize(text);
  if (text.length > MAX_DOC_CHARS) {
    text = text.slice(0, MAX_DOC_CHARS);
  }
  return { text, kind };
}
