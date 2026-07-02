/**
 * 動画アップロードの1ファイル上限。クライアントの事前チェックと
 * サーバー(署名発行/受領時)の検証の両方がこの値を参照する。
 *
 * 50MB の根拠:
 *   - Supabase Storage への直接アップロードなので Vercel の本文上限
 *     (約4.5MB)は受けない。
 *   - ただし文字起こしは Vercel Function 内で行うため、ダウンロード+
 *     Gemini Files API 転送+推論を maxDuration(300秒)内に収める
 *     必要があり、その現実的な上限として 50MB に設定。
 */
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const MAX_VIDEO_LABEL = '50 MB';
