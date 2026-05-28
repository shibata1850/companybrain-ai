import Link from 'next/link';
import { unstable_noStore as noStore } from 'next/cache';
import { storageBucket, supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

type AvatarRow = {
  id: string;
  name: string;
  description: string | null;
  cover_image_path: string | null;
  created_at: string;
};

async function loadAvatars() {
  noStore();
  const db = supabaseAdmin();
  const { data } = await db
    .from('avatars')
    .select('id, name, description, cover_image_path, created_at')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  const rows = (data ?? []) as AvatarRow[];

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
    <div className="space-y-10">
      <section>
        <h1 className="text-3xl font-semibold tracking-tight">ブレイン</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-neutral-500">
          動画から学習した人物に質問すると、その人の口調と知識で答える動画が
          自動生成されます。
        </p>
      </section>

      {loadError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <strong>読み込みエラー:</strong> {loadError}
        </div>
      )}

      {!loadError && avatars.length === 0 && (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-16 text-center">
          <p className="text-neutral-500">まだブレインがありません。</p>
          <Link
            href="/avatars/new"
            className="mt-5 inline-block rounded-full bg-neutral-900 px-5 py-2 text-sm font-medium text-white hover:bg-neutral-700"
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
            className="group overflow-hidden rounded-2xl border border-neutral-200 bg-white transition hover:border-neutral-900 hover:shadow-lg"
          >
            <div className="aspect-[4/3] bg-neutral-100">
              {a.cover_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={a.cover_url}
                  alt={a.name}
                  className="h-full w-full object-cover transition group-hover:scale-[1.02]"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-neutral-300">
                  no cover
                </div>
              )}
            </div>
            <div className="p-4">
              <h3 className="font-medium tracking-tight">{a.name}</h3>
              {a.description && (
                <p className="mt-1 line-clamp-2 text-sm text-neutral-500">
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
