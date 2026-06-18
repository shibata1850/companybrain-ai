'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function ForgotPage() {
  const [admins, setAdmins] = useState<string[]>([]);

  useEffect(() => {
    fetch('/api/auth/admins', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => setAdmins(j.admins ?? []))
      .catch(() => {});
  }, []);

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-neutral-900 text-sm font-bold tracking-tight text-white">
          CB
        </div>
        <h1 className="text-xl font-semibold tracking-tight">
          メアド・パスワードを忘れた方
        </h1>
      </div>

      <div className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <p className="text-sm leading-relaxed text-neutral-700">
          CompanyBrain は招待制のため、メールアドレスやパスワードを忘れた場合は
          管理者に連絡して再発行してもらってください。
        </p>

        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
          <p className="mb-2 text-xs font-medium text-neutral-700">
            管理者の連絡先
          </p>
          {admins.length === 0 ? (
            <p className="text-xs text-neutral-400">読み込み中…</p>
          ) : (
            <ul className="space-y-1">
              {admins.map((a) => (
                <li key={a} className="text-sm">
                  <a
                    href={`mailto:${a}?subject=${encodeURIComponent(
                      'CompanyBrain パスワード再発行のお願い',
                    )}&body=${encodeURIComponent(
                      'お世話になっております。\nCompanyBrain のログイン情報を忘れてしまったため、\nパスワードの再発行をお願いいたします。\n',
                    )}`}
                    className="text-neutral-900 underline hover:text-neutral-700"
                  >
                    {a}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>

        <details className="rounded-xl border border-neutral-200 p-3 text-sm">
          <summary className="cursor-pointer text-xs text-neutral-500">
            管理者が行うこと
          </summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs leading-relaxed text-neutral-600">
            <li>マイページ → ユーザー管理 を開く</li>
            <li>該当ユーザーの「仮パスワード発行」を押す</li>
            <li>表示された仮パスワードを本人に伝える</li>
            <li>本人はログイン後、「パスワード変更」から新しい物に変更</li>
          </ol>
        </details>
      </div>

      <div className="mt-4 text-center">
        <Link
          href="/login"
          className="text-xs text-neutral-500 transition hover:text-neutral-900"
        >
          ← ログインに戻る
        </Link>
      </div>
    </div>
  );
}
