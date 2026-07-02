import { createClient } from '@supabase/supabase-js';

/**
 * ブラウザから Supabase Storage へ動画を直接アップロードする。
 * Vercel の関数を経由しないため、本文サイズ上限(約4.5MB)を受けない。
 *
 * 流れ:
 *   1. /api/uploads/video で署名付きアップロード先を発行してもらう
 *      (認証・プラン容量・1ファイル上限はサーバー側で検証)
 *   2. 返ってきた path + token に向けて Storage へ直接 PUT
 *   3. 呼び出し元は返り値の path を作成/学習 API に渡す
 */
export async function uploadVideoDirect(
  file: File,
  avatarId?: string,
): Promise<{ path: string }> {
  const signRes = await fetch('/api/uploads/video', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      avatarId,
      fileName: file.name,
      size: file.size,
      mimeType: file.type || 'video/mp4',
    }),
  });
  const signed = (await signRes.json()) as {
    bucket?: string;
    path?: string;
    token?: string;
    error?: string;
  };
  if (!signRes.ok || !signed.bucket || !signed.path || !signed.token) {
    throw new Error(signed.error || `アップロード準備に失敗しました (HTTP ${signRes.status})`);
  }

  const supa = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { error } = await supa.storage
    .from(signed.bucket)
    .uploadToSignedUrl(signed.path, signed.token, file, {
      contentType: file.type || 'video/mp4',
    });
  if (error) {
    throw new Error(`アップロードに失敗しました: ${error.message}`);
  }
  return { path: signed.path };
}
