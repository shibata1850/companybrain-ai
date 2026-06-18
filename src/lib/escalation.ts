/**
 * Detect questions that warrant escalation to a human supervisor —
 * the categories where letting the AI answer authoritatively would
 * carry real business risk (money, contracts, customer-facing
 * responses, personnel, compliance). The goal is "勘違いの暴走を止め
 * る" rather than precision: a small over-warning rate is fine, the
 * banner just nudges the user toward human confirmation; under-warning
 * is the dangerous failure mode.
 *
 * Pure regex matching, no model call. Runs on every user message in
 * the chat panel.
 */

export type EscalationCategory =
  | 'money'
  | 'contract'
  | 'complaint'
  | 'personnel'
  | 'compliance'
  | 'decision';

export type EscalationFlag = {
  categories: EscalationCategory[];
  hints: string[];
};

const CATEGORY_LABEL: Record<EscalationCategory, string> = {
  money: '金額',
  contract: '契約・与信',
  complaint: 'クレーム対応',
  personnel: '人事',
  compliance: 'コンプライアンス',
  decision: '意思決定',
};

export function escalationLabel(c: EscalationCategory): string {
  return CATEGORY_LABEL[c];
}

type Rule = {
  category: EscalationCategory;
  pattern: RegExp;
};

const RULES: Rule[] = [
  // 金額: 具体的な額・割引・パーセント
  { category: 'money', pattern: /[0-9]{1,3}(?:[,，][0-9]{3})+\s*円/ },
  { category: 'money', pattern: /[0-9]+\s*(万円|億円|千万|百万)/ },
  { category: 'money', pattern: /[一二三四五六七八九十百千]+万円/ },
  { category: 'money', pattern: /(値引き|値下げ|ディスカウント|減額)/ },
  { category: 'money', pattern: /[0-9]+\s*[％%]\s*(オフ|引|減|安く|下げ)/ },

  // 契約・与信
  { category: 'contract', pattern: /(契約|締結|締約)/ },
  { category: 'contract', pattern: /(与信|与信枠|取引枠|取引限度)/ },
  { category: 'contract', pattern: /(発注|受注|請負|外注)/ },
  { category: 'contract', pattern: /(決裁|承認|サイン|捺印|押印)/ },
  { category: 'contract', pattern: /(融資|借入|貸付)/ },

  // クレーム対応
  { category: 'complaint', pattern: /(クレーム|苦情|抗議|文句)/ },
  { category: 'complaint', pattern: /(お詫び|謝罪|謝る|誤り)/ },
  { category: 'complaint', pattern: /(補償|賠償|弁償|示談)/ },
  { category: 'complaint', pattern: /(返金|返品|交換|キャンセル料)/ },
  { category: 'complaint', pattern: /(健康被害|怪我|事故|食中毒|異物混入)/ },

  // 人事
  { category: 'personnel', pattern: /(解雇|懲戒|降格|処分|減給)/ },
  { category: 'personnel', pattern: /(採用|内定|不採用|不合格)/ },
  { category: 'personnel', pattern: /(査定|人事評価|昇給|昇進|ボーナス|賞与)/ },
  { category: 'personnel', pattern: /(配置転換|異動)/ },

  // コンプライアンス
  { category: 'compliance', pattern: /(違法|違反|不正|脱税|横領|談合)/ },
  { category: 'compliance', pattern: /(個人情報|機密|秘密保持|NDA)/ },
  { category: 'compliance', pattern: /(独占禁止|下請法|労基|労働基準)/ },

  // 意思決定の問い (進めていい? OK? いいですか?)
  // 動詞+てもいい/ていい は広めに拾う。文脈的に判断系の問いかけになる
  { category: 'decision', pattern: /(し|やっ|進め|出し|送っ|返し|渡し|増やし|減らし|締結し|発注し|許可し|承認し|やめ|外し|削っ)て(?:も)?(?:いい|よい|大丈夫|よろしい)/ },
  { category: 'decision', pattern: /(OKです?か|問題ないですか|大丈夫ですか|よろしいですか|構いませんか)/ },
  { category: 'decision', pattern: /(判断して|決断して|決めて(?:いい|よい|ください))/ },
];

export function detectEscalation(text: string): EscalationFlag | null {
  const normalized = text.normalize('NFKC');
  const cats = new Set<EscalationCategory>();
  const hits: string[] = [];
  for (const rule of RULES) {
    const m = normalized.match(rule.pattern);
    if (m) {
      cats.add(rule.category);
      if (!hits.includes(m[0])) hits.push(m[0]);
    }
  }
  if (cats.size === 0) return null;
  return {
    categories: Array.from(cats),
    hints: hits.slice(0, 6),
  };
}
