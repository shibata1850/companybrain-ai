import { useAuth } from "@/lib/AuthContext";

/**
 * 現在ログイン中ユーザーの clientCompanyId を返す共通フック。
 *
 * 用途：従来の `const CLIENT_ID = "69fc3d9af68187d823c1a41b"` ハードコードを置換し、
 * マルチテナント整合性を保つ。
 *
 * 注意点：
 * - 初回ロード中は `null` を返す。useQuery / useMutation などは
 *   `enabled: !!clientCompanyId` を付けて待機すること。
 * - softdoing_admin（横断管理者）でも自テナントの id を返す。
 *   横断管理画面で他テナント参照したい場合は、別途 props/URL パラメータで上書き。
 */
export function useClientCompanyId() {
  const { user } = useAuth();
  return user?.clientCompanyId || null;
}
