'use client';

import { useEffect, useMemo, useState } from 'react';

/**
 * 利用実績レポート(管理者専用)。
 *
 * 体験導入した見込み客・既存顧客の利用状況を期間指定で集計し、
 * 提案書や振り返りにそのまま貼れるサマリー文を出す。会話の中身は
 * 表示しない(中身の確認は監査ログ画面の役割)。
 */

type Report = {
  user: string;
  from: string;
  to: string;
  truncated: boolean;
  questions: number;
  answers: number;
  answersWithSources: number;
  escalated: number;
  activeDays: number;
  sessions: number;
  voiceSeconds: number;
  brains: Array<{ id: string; name: string | null; questions: number }>;
};

function isoDate(d: Date): string {
  // 日本時間の日付文字列(yyyy-mm-dd)。
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(d);
}

export default function AdminReportPage() {
  const [role, setRole] = useState<'loading' | 'admin' | 'other'>('loading');
  const [users, setUsers] = useState<
    Array<{ email: string; label: string | null }>
  >([]);
  const [email, setEmail] = useState('');
  const [from, setFrom] = useState(() =>
    isoDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)),
  );
  const [to, setTo] = useState(() => isoDate(new Date()));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((j: { user?: { role?: string } | null }) => {
        setRole(j?.user?.role === 'admin' ? 'admin' : 'other');
      })
      .catch(() => setRole('other'));
  }, []);

  useEffect(() => {
    if (role !== 'admin') return;
    fetch('/api/audit?view=users&scope=all')
      .then((r) => r.json())
      .then((j: { users?: Array<{ email: string; label: string | null }> }) => {
        setUsers(j.users ?? []);
      })
      .catch(() => {});
  }, [role]);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const params = new URLSearchParams({
        view: 'report',
        user: email.trim(),
        from,
        to,
      });
      const res = await fetch(`/api/audit?${params.toString()}`);
      const json = (await res.json()) as Report & { error?: string };
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setReport(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  const summaryText = useMemo(() => {
    if (!report) return '';
    // 期間は「表示中のレポートが実際に集計した範囲」から導く。入力欄の
    // 値を使うと、次の集計に向けて日付だけ変えた瞬間にラベルが数字と
    // 食い違う(間違った期間の数字を提案書に貼る事故になる)。
    const jst = (iso: string) =>
      new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(
        new Date(iso),
      );
    const periodFrom = jst(report.from);
    // report.to は排他境界(翌日0時 JST)なので、表示は1日戻す。
    const periodTo = jst(
      new Date(new Date(report.to).getTime() - 24 * 60 * 60 * 1000).toISOString(),
    );
    const voiceMin = Math.round(report.voiceSeconds / 60);
    const perDay =
      report.activeDays > 0
        ? (report.questions / report.activeDays).toFixed(1)
        : '0';
    const top = report.brains[0];
    const srcRate =
      report.answers > 0
        ? Math.round((report.answersWithSources / report.answers) * 100)
        : 0;
    const lines = [
      `【CompanyBrain AI 利用実績】${report.user}`,
      `期間: ${periodFrom} 〜 ${periodTo}(利用日数 ${report.activeDays}日)`,
      `・質問数: ${report.questions}件(1利用日あたり ${perDay}件)`,
      `・音声会話: ${voiceMin}分`,
      `・利用ブレイン: ${report.brains.length}体${
        top ? `(最多: ${top.name ?? '名称不明'} ${top.questions}件)` : ''
      }`,
      `・根拠資料つき回答: ${report.answersWithSources}/${report.answers}件(${srcRate}%)`,
      `・上長確認を要した質問: ${report.escalated}件`,
    ];
    return lines.join('\n');
  }, [report]);

  if (role === 'loading') {
    return <p className="p-8 text-sm text-neutral-500">読み込み中…</p>;
  }
  if (role !== 'admin') {
    return (
      <p className="p-8 text-sm text-neutral-500">
        このページは管理者専用です。
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          利用実績レポート
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-neutral-500">
          体験導入・契約中のユーザーの利用状況を期間で集計します。会話の中身は
          表示しません(内容の確認は監査ログで)。下部のサマリーは提案書や
          振り返り資料にそのまま貼れます。
        </p>
      </header>

      <form
        onSubmit={run}
        className="flex flex-wrap items-end gap-3 rounded-2xl border border-neutral-200 bg-white p-5"
      >
        <div className="min-w-[16rem] flex-1">
          <label className="block text-xs font-medium text-neutral-600">
            ユーザー(メールアドレス)
          </label>
          <input
            list="report-users"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@example.com"
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
            required
          />
          <datalist id="report-users">
            {users.map((u) => (
              <option key={u.email} value={u.email}>
                {u.label ?? ''}
              </option>
            ))}
          </datalist>
        </div>
        <div>
          <label className="block text-xs font-medium text-neutral-600">
            開始日
          </label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="mt-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-neutral-600">
            終了日
          </label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="mt-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="rounded-full bg-neutral-900 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-neutral-700 disabled:opacity-50"
        >
          {loading ? '集計中…' : '集計する'}
        </button>
      </form>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {report && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[
              ['質問数', `${report.questions}件`],
              ['音声会話', `${Math.round(report.voiceSeconds / 60)}分`],
              ['利用日数', `${report.activeDays}日`],
              ['セッション数', `${report.sessions}回`],
              [
                '根拠資料つき回答',
                report.answers > 0
                  ? `${Math.round(
                      (report.answersWithSources / report.answers) * 100,
                    )}%`
                  : '—',
              ],
              ['要・上長確認', `${report.escalated}件`],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-2xl border border-neutral-200 bg-white p-4"
              >
                <p className="text-xs text-neutral-500">{label}</p>
                <p className="mt-1 text-2xl font-bold tracking-tight">
                  {value}
                </p>
              </div>
            ))}
          </div>
          {report.truncated && (
            <p className="text-xs text-amber-700">
              件数が多いため一部のみで集計しています(期間を短くしてください)。
            </p>
          )}

          {report.brains.length > 0 && (
            <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500">
                    <th className="px-4 py-2.5">ブレイン</th>
                    <th className="px-4 py-2.5 text-right">質問数</th>
                  </tr>
                </thead>
                <tbody>
                  {report.brains.slice(0, 10).map((b) => (
                    <tr key={b.id} className="border-b border-neutral-100">
                      <td className="px-4 py-2.5">{b.name ?? '(名称不明)'}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {b.questions}件
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="rounded-2xl border border-neutral-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold">コピー用サマリー</h2>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard
                    .writeText(summaryText)
                    .then(() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    })
                    .catch(() => {});
                }}
                className="rounded-full bg-neutral-100 px-4 py-1.5 text-xs font-bold text-neutral-700 transition hover:bg-neutral-200"
              >
                {copied ? 'コピーしました' : 'コピー'}
              </button>
            </div>
            <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-neutral-50 p-4 text-xs leading-relaxed text-neutral-700">
              {summaryText}
            </pre>
          </div>
        </>
      )}
    </div>
  );
}
