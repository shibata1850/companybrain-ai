import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import {
  detectDocKind,
  extractDocumentText,
  MAX_DOC_CHARS,
} from './documentText';

describe('detectDocKind', () => {
  it('detects by mime type', () => {
    expect(detectDocKind('application/pdf', 'x')).toBe('pdf');
    expect(
      detectDocKind(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'x',
      ),
    ).toBe('word');
    expect(
      detectDocKind(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'x',
      ),
    ).toBe('excel');
    expect(detectDocKind('text/csv', 'x')).toBe('csv');
    expect(detectDocKind('text/plain', 'x')).toBe('text');
  });

  it('falls back to the file extension when mime is missing', () => {
    expect(detectDocKind('', 'report.PDF')).toBe('pdf');
    expect(detectDocKind('', 'notes.docx')).toBe('word');
    expect(detectDocKind('', 'data.xlsx')).toBe('excel');
    expect(detectDocKind('application/octet-stream', 'a.csv')).toBe('csv');
    expect(detectDocKind('', 'readme.md')).toBe('text');
  });

  it('returns null for unsupported types', () => {
    expect(detectDocKind('image/png', 'a.png')).toBeNull();
    expect(detectDocKind('video/mp4', 'a.mp4')).toBeNull();
    expect(detectDocKind('', 'a.zip')).toBeNull();
  });
});

describe('extractDocumentText', () => {
  it('extracts spreadsheet cells across sheets as CSV with sheet headings', async () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ['費目', '上限'],
        ['宿泊費', 12000],
      ]),
      '経費',
    );
    const buf = Buffer.from(
      XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }),
    );
    const { text, kind } = await extractDocumentText(
      buf,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'keihi.xlsx',
    );
    expect(kind).toBe('excel');
    expect(text).toContain('# 経費');
    expect(text).toContain('宿泊費');
    expect(text).toContain('12000');
  });

  it('decodes plain text and strips control bytes', async () => {
    const buf = Buffer.from('第一条\u0000\u0007出張は事前申請。\r\n第二条', 'utf-8');
    const { text, kind } = await extractDocumentText(buf, 'text/plain', 'a.txt');
    expect(kind).toBe('text');
    // NUL などの制御文字は除去されるが、通常の文字は残る。
    expect(text).not.toContain('\u0000');
    expect(text).not.toContain('\u0007');
    expect(text).toContain('第一条');
    expect(text).toContain('第二条');
  });

  it('caps very long extracted text', async () => {
    const long = 'あ'.repeat(MAX_DOC_CHARS + 5000);
    const { text } = await extractDocumentText(
      Buffer.from(long, 'utf-8'),
      'text/plain',
      'big.txt',
    );
    expect(text.length).toBeLessThanOrEqual(MAX_DOC_CHARS);
  });

  it('rejects unsupported types', async () => {
    await expect(
      extractDocumentText(Buffer.from([1, 2, 3]), 'image/png', 'a.png'),
    ).rejects.toThrow();
  });
});
