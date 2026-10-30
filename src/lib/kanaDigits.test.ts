import { describe, it, expect } from 'vitest';
import { digitizeKanaNumbers } from './kanaDigits';

describe('digitizeKanaNumbers', () => {
  it('電話番号のカタカナ読みを数字+ハイフンにする', () => {
    expect(
      digitizeKanaNumbers('ゼロイチニーゼロ、ロクキューハチ、ゴーニーゼロ'),
    ).toBe('0120-698-520');
  });

  it('短い読み(ニ・ゴ)が数字読みの間に挟まれていれば変換する', () => {
    expect(digitizeKanaNumbers('ゼロイチニサンヨン')).toBe('01234');
  });

  it('普通語を数字化しない', () => {
    expect(digitizeKanaNumbers('ゴクゴク')).toBe('ゴクゴク');
    expect(digitizeKanaNumbers('サンマルク')).toBe('サンマルク');
    expect(digitizeKanaNumbers('ゴーゴーゴー')).toBe('ゴーゴーゴー');
    expect(digitizeKanaNumbers('ニーズ')).toBe('ニーズ');
    expect(digitizeKanaNumbers('ゴール')).toBe('ゴール');
  });

  it('年の列挙をハイフンでつながない', () => {
    expect(digitizeKanaNumbers('2024、2025年')).toBe('2024、2025年');
  });

  it('0始まりの数字列はハイフンでつなぐ', () => {
    expect(digitizeKanaNumbers('0120、698、520')).toBe('0120-698-520');
  });

  it('数字読みを含まない文はそのまま', () => {
    expect(digitizeKanaNumbers('こんにちは、北上市へようこそ')).toBe(
      'こんにちは、北上市へようこそ',
    );
  });
});
