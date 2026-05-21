import Link from 'next/link';
import { storageBucket, supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

type AvatarRow = {
  id: string;
  name: string;
  description: string | null;
  cover_image_path: string | null;
  created_at: string;
};

async function loadAvatars() {
  const db = supabaseAdmin();
  const { data } = await db
    .from('avatars')
    .select('id, name, description, cover_image_path, created_at')
    .order('created_at', { ascending: false });
  const rows = (data ?? []) as AvatarRow[];

  // Sign cover URLs in parallel for the listing.
  const signed = await Promise.all(
    rows.map(async (a) => {
      if (!a.cover_image_path) return { ...a, cover_url: null };
      const { data: s } = await db.storage
        .from(storageBucket())
        .createSignedUrl(a.cover_image_path, 60 * 60);
      return { ...a, cover_url: s?.signedUrl ?? null };
    }),
  );
  return signed;
}

export default async function HomePage() {
  let avatars: Awaited<ReturnType<typeof loadAvatars>> = [];
  let loadError: string | null = null;
  try {
    avatars = await loadAvatars();
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-bold">ブレイン一覧</h1>
        <p className="mt-1 text-sm text-white/60">
          動画から学習した「人物アバター」に質問すると、その人の口調・知識で
          答える動画が自動生成されます。
        </p>
      </section>

      {loadError && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 p-4 text-sm">
          <strong>読み込みエラー:</strong> {loadError}
          <p className="mt-2 text-white/70">
            <code>.env.local</code> の Supabase / Gemini / HeyGen キー設定と、
            <code>supabase/migrations/0001_initial.sql</code>{' '}
            のスキーマ適用を確認してください。
          </p>
        </div>
      )}

      {!loadError && avatars.length === 0 && (
        <div className="rounded-lg border border-white/10 bg-white/5 p-10 text-center">
          <p className="text-white/70">まだブレインがありません。</p>
          <Link
            href="/avatars/new"
            className="mt-4 inline-block rounded-md bg-indigo-500 px-4 py-2 text-sm font-medium hover:bg-indigo-400"
          >
            最初のブレインを作る
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {avatars.map((a) => (
          <Link
            key={a.id}
            href={`/avatars/${a.id}`}
            className="group overflow-hidden rounded-lg border border-white/10 bg-white/5 transition hover:border-indigo-400"
          >
            <div className="aspect-video bg-black/40">
              {a.cover_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={a.cover_url}
                  alt={a.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-white/30">
                  no cover
                </div>
              )}
            </div>
            <div className="p-4">
              <h3 className="font-semibold">{a.name}</h3>
              {a.description && (
                <p className="mt-1 line-clamp-2 text-sm text-white/60">
                  {a.description}
                </p>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
