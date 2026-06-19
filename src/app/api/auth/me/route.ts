import { NextResponse } from 'next/server';
import { getAppUser } from '@/lib/authServer';
import { storageBucket, supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getAppUser();
  if (!user) {
    return NextResponse.json({ user: null }, { status: 200 });
  }
  // Resolve the avatar storage path into a short-lived signed URL so
  // the client can render it without separate logic.
  let avatar_url: string | null = null;
  if (user.avatar_path) {
    const { data } = await supabaseAdmin()
      .storage.from(storageBucket())
      .createSignedUrl(user.avatar_path, 60 * 60);
    avatar_url = data?.signedUrl ?? null;
  }
  return NextResponse.json({ user: { ...user, avatar_url } });
}
