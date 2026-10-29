import { defineConfig, devices } from '@playwright/test';

/**
 * E2E スモークテスト(tests/e2e)。
 *
 * 「ログインできる画面が出る」「キオスクが描画される」「法務ページが
 * 公開されている」といった、壊れたら即事故になる入口だけを最小構成で
 * 確認する。実行は `npm run test:e2e`。
 *
 * - サーバーはテスト側が自動起動する(ポート3270)。ローカルに
 *   .env.local があればそれを使い、無いCI・検証環境でも画面の描画
 *   確認はできるようダミーの Supabase 公開キーで補う
 * - ブラウザは Playwright 標準のダウンロード版を使う。クラウド検証
 *   環境などで同梱 Chromium を使う場合は PLAYWRIGHT_CHROMIUM_PATH に
 *   実行ファイルを指定する
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:3270',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
          : {},
      },
    },
  ],
  webServer: {
    command: 'npx next dev -p 3270',
    port: 3270,
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL:
        process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY:
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'dummy-key-for-smoke-test',
    },
  },
});
