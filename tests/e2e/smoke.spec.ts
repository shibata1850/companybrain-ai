import { test, expect } from '@playwright/test';

/**
 * スモークテスト: 壊れたら即事故になる入口だけを確認する。
 * ログイン済みセッションを要する画面(ブレイン・管理)は対象外
 * (実アカウントが必要なため。将来、テスト用アカウントを用意したら
 * 追加する)。
 */

test('未ログインでアプリを開くとログイン画面へ誘導される', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login/);
  // メール入力とログインボタンが出ていること(=認証の入口が生きている)
  await expect(page.locator('input[type="email"]')).toBeVisible();
});

test('キオスクのリハーサルモードが描画される', async ({ page }) => {
  await page.goto('/kiosk?demo=1');
  // 収差オーブ(canvas)と待機画面のCTAが出ること
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByText('ふれて、話しかけてください')).toBeVisible();
  await expect(page.getByText('会話は記録されます')).toBeVisible();
});

test('法務ページが未ログインで読める', async ({ page }) => {
  for (const path of ['/terms', '/privacy', '/legal', '/security']) {
    await page.goto(path);
    // ログインへ飛ばされないこと(特商法表記などは公開義務)
    await expect(page).toHaveURL(new RegExp(`${path}$`));
  }
  // 特定商取引法ページに事業者名が載っていること
  await page.goto('/legal');
  await expect(page.getByText('柴田')).toBeVisible();
});
