import { createHash, timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';

/**
 * キオスク(公開ディスプレイ)用の認証。
 *
 * ログインの代わりに、サーバー環境変数のアクセスキーと「公開を許可する
 * 1ブレインのID」の組で動く。できることは当該ブレインとの音声会話だけで、
 * 素材・設定・他ブレイン・管理機能には一切届かない。キーが漏れた場合は
 * 環境変数の差し替えで即失効できる。
 *
 *   KIOSK_ACCESS_KEY  展示端末のURLに持たせる合言葉(十分長いランダム文字列)
 *   KIOSK_AVATAR_ID   表示するブレインの UUID
 */

export type KioskConfig = { key: string; avatarId: string };

export function kioskConfig(): KioskConfig | null {
  const key = process.env.KIOSK_ACCESS_KEY || '';
  const avatarId = process.env.KIOSK_AVATAR_ID || '';
  if (!key || !avatarId) return null;
  return { key, avatarId };
}

/** タイミング攻撃に強いキー照合(長さ差はハッシュで吸収)。 */
export function kioskKeyMatches(
  provided: unknown,
  expected: string,
): boolean {
  if (typeof provided !== 'string' || provided.length === 0) return false;
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

/** レート制限キー用のクライアントIP(プロキシ経由の先頭を採る)。 */
export function clientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  );
}
