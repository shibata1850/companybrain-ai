# 課金・プラン変更フロー 設計案 v1

ステータス: **提案(レビュー待ち)** / 著者: AI 社員 / 作成: 2026-06-20

---

## 0. 前提(ヒアリング結果)

| 項目 | 決定 |
|---|---|
| 対象市場 | **日本国内のみ** |
| 無料トライアル | **なし**(サインアップ即 free、有料化はセルフ申込) |
| プラン構成 | **AI が提案**(本書 §2) |
| 決済代行 | **Stripe**(JPY、`payment_intent_data.setup_future_usage` 等を活用) |

理由メモ:
- 国内のみなら Stripe Japan で十分(銀行振込・コンビニ・クレカ・キャリア決済の代替検討は不要)。
- 法人(月額 1.98万 / 4.98万)は **インボイス制度対応の請求書(銀行振込)** ニーズが必ず出る。「Stripe の Invoice Customer」機能で対応可能。
- トライアルなし → ペイウォール(プラン変更)導線をシンプルに設計できる。

---

## 1. 全体方針

3つの**入り口**で課金できるようにする:

1. **マイページ → プラン変更**(主動線、セルフサービス)
2. **アップグレード誘導モーダル**(プラン上限到達時に自動表示)
3. **ランディングの料金表 → サインアップ後にプラン選択へ遷移**

支払い手段は **2 ルート**:
- **(A) クレジットカード(Stripe Checkout / Subscriptions)**:即時開通・自動継続。個人〜中小チーム向け。
- **(B) 銀行振込(Stripe Invoices = 請求書発行)**:適格請求書発行・大企業稟議対応。`standard` / `pro` のみで提示。

解約・ダウングレードはセルフ可。**返金は原則なし、日割りは「アップグレード時のみ」**(下方変更は次期更新から)。

---

## 2. プランラインアップ提案

現行 4 段(free / starter / standard / pro)は概ね妥当。私からの修正提案は **3 点**:

### 提案 A: starter を「ライト」へリネーム + 個人事業主向けに最適化(任意)
- 「スターター」は SaaS 文脈で「お試し版」のニュアンスが強く、有料初級層が「これは試用版か」と誤解しやすい。
- `ライト` / `ベーシック` / `ソロ` のいずれかが直球。**おすすめ: `ベーシック`**。
- ただし変更コストはコピーのみ。**未決定で OK**。

### 提案 B: **年契約 2 ヶ月無料**を明示価格として用意
- 現在ランディングのみで「年契約で 2 ヶ月分無料」と謳っているが、価格 SKU 化していない。
- Stripe では Price を `monthly` / `yearly` の2レーンで持ち、`yearly = monthly × 10` の固定割引で運用。
- 解約時は「次回更新日まで利用可、返金なし」が業界標準。
- **採用推奨**。LTV を引き上げ、Standard / Pro の決裁理由が増える。

### 提案 C: **エンタープライズ枠(問い合わせ)を pro の上に新設**
- pro(月 4.98万・ユーザー無制限)は数字上は「全社展開」だが、稟議が要る大企業は **SSO / 法務確認 / 個別 NDA / 専用窓口** が必要で、セルフでは不可能。
- ランディング & プラン一覧に「**エンタープライズ(お問い合わせ)**」のカードを追加。価格は表示せず、CTA は「相談する(メールフォーム)」。
- 既存 4 プランの価格は据え置き(`break-even ≈ 269社` の試算を崩さない)。

### 結論(推奨)

```
free       ¥0       現状維持
ベーシック  ¥4,980   現 starter をリネーム(任意)
スタンダード ¥19,800  現状維持
プロ       ¥49,800  現状維持
エンタープライズ  個別  新設
```

年契約レーン:`ベーシック ¥49,800/年 (約2か月無料)` / `スタンダード ¥198,000/年` / `プロ ¥498,000/年`

---

## 3. ユーザー体験(主要フロー)

### 3.1 アップグレード(月額カード払い)

```
マイページ > プラン変更
  ↓
プラン比較画面(現プランをハイライト)
  ↓ [アップグレードする] クリック
  ↓
Stripe Checkout (ホスト型) へリダイレクト
  ↓ 決済完了
  ↓
/billing/success へ復帰 → トースト「プランをアップグレードしました」
  ↓
即座にブレイン上限・質問上限・モデル等級が解放
```

ポイント:
- Stripe Checkout(ホスト型)を使う → カード情報を**当方サーバーで一切扱わない**(PCI 範囲ゼロ)。
- `setup_future_usage = off_session` で次月の自動継続を有効化。

### 3.2 ダウングレード / 解約

```
マイページ > プラン変更
  ↓ [現在のプランを変更]
  ↓
プラン比較画面 で下位プラン選択
  ↓
確認モーダル「次回更新日(2026-07-15)から¥4,980プランに変わります」
  ↓ [変更を予約]
  ↓
Stripe Subscription の cancel_at_period_end / schedule で予約
  ↓ マイページに「2026-07-15 から ベーシックに変更予定」のバッジ
```

解約も同じ流れ:`cancel_at_period_end = true` を立てる。期間内は使い続けられる。

### 3.3 請求書(銀行振込)— `standard` / `pro` のみ

```
プラン比較画面
  ↓ [請求書払いで申し込む]
  ↓
法人情報フォーム(会社名 / 担当者 / 部署 / 住所 / インボイス登録番号)
  ↓ 送信 → admin に通知(管理画面に「請求書発行依頼」)
  ↓ admin が Stripe 管理画面で Invoice 発行 + メール送付
  ↓ 顧客が振込完了
  ↓ Stripe webhook(invoice.paid)→ プラン自動アクティベート
```

最初のリリースでは **admin が手動で Invoice 発行**(月数件想定なら十分)。将来 API 化可。

### 3.4 ペイウォール(自動アップグレード誘導)

`canCreateBrain` / `canAsk` / `canStartVoice` / `canAddMaterial` が false を返した時に、**現在の `planLimitResponse` を拡張**:

```ts
// 既に上限到達時にレスポンスとして {error, plan, used, limit, upgradeUrl}
// を返している。フロントで dialog に upgradeUrl を渡し、
// 「今すぐアップグレード」CTA でプラン変更画面へ。
```

→ UX 上の自然な転換点(ユーザーが「もっと使いたい」と感じた瞬間)で課金提案できる。

---

## 4. 技術設計

### 4.1 Stripe オブジェクトの対応

| Stripe | 用途 |
|---|---|
| Product (4 個) | basic / standard / pro / enterprise — `free` は Product 不要 |
| Price (8 個 = 4 product × 月/年) | 通貨 JPY、tax_behavior=`inclusive`(税込表示)を推奨 |
| Customer | 1 ユーザー = 1 Customer(email + metadata.app_user_id) |
| Subscription | 1 Customer = 0..1 アクティブな Subscription |
| Invoice | 銀行振込ルートのみ(`collection_method=send_invoice`) |
| Webhook | `checkout.session.completed` / `invoice.paid` / `customer.subscription.updated` / `customer.subscription.deleted` |

### 4.2 DB スキーマ追加(マイグレーション `0023_billing.sql`)

```sql
-- ユーザーと Stripe Customer の 1:1 マッピング
alter table app_users
  add column if not exists stripe_customer_id text unique,
  add column if not exists plan_paid_until timestamptz, -- 次回更新日
  add column if not exists plan_pending_id text,        -- ダウングレード予約
  add column if not exists plan_pending_at timestamptz;

-- 課金イベントの監査(誰がいつ何を変えたか / Stripe ID で照合)
create table if not exists billing_events (
  id            uuid primary key default gen_random_uuid(),
  app_user      text not null references app_users(email) on delete cascade,
  event_type    text not null,        -- 'subscription.created' 等
  from_plan     text,
  to_plan       text,
  amount_jpy    integer,
  stripe_event  text unique,          -- 冪等性
  raw           jsonb,
  created_at    timestamptz default now()
);
create index billing_events_user_idx on billing_events(app_user, created_at desc);

-- 請求書(銀行振込)依頼
create table if not exists invoice_requests (
  id              uuid primary key default gen_random_uuid(),
  app_user        text not null,
  desired_plan    text not null,
  company_name    text not null,
  contact_name    text not null,
  contact_dept    text,
  postal_address  text not null,
  tax_reg_no      text,  -- インボイス登録番号(T+13桁)
  status          text not null default 'pending', -- pending/issued/paid/cancelled
  stripe_invoice  text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
```

### 4.3 API ルート追加

| ルート | 役割 |
|---|---|
| `POST /api/billing/checkout` | 選択プラン+billing_cycle を受け、Stripe Checkout Session を作成 → URL を返す |
| `POST /api/billing/portal` | Stripe Customer Portal セッション URL を返す(支払方法更新・解約) |
| `POST /api/billing/change` | アップグレード/ダウングレード予約(Subscription Update / Schedule) |
| `POST /api/billing/webhook` | Stripe Webhook 受信(`STRIPE_WEBHOOK_SECRET` で署名検証) |
| `POST /api/billing/invoice-request` | 請求書払い申込 → invoice_requests に挿入 + admin 通知 |
| `GET  /api/billing/status` | 現在の subscription / 次回更新日 / pending change |

### 4.4 既存 `planEnforce` の変更点

- `getPlanUsage` の plan 解決を `app_users.plan_id`(既存)に加え、**`plan_paid_until` が現在時刻より過去なら free に降格**するロジックを追加。
- `plan_pending_id` がある場合は「現プラン継続 + バッジ表示」のみで、判定には影響しない(更新日に webhook で実際の plan_id を書き換え)。

### 4.5 セキュリティ / 監査

- **Webhook**: Stripe 署名検証必須。冪等性は `stripe_event` のユニーク制約で担保。
- **Customer Portal**: 当方では一切カード情報を扱わず、Stripe ホスト画面で完結。
- **billing_events** にすべての差分を残す → 監査画面に課金タブを追加可。
- **管理者は他人の請求情報を変更不可**(本人 + admin の "閲覧のみ" 監査)。

### 4.6 環境変数(Vercel)

```
STRIPE_SECRET_KEY        sk_live_xxx
STRIPE_WEBHOOK_SECRET    whsec_xxx
STRIPE_PRICE_BASIC_M     price_xxx
STRIPE_PRICE_BASIC_Y     price_xxx
STRIPE_PRICE_STANDARD_M  price_xxx
STRIPE_PRICE_STANDARD_Y  price_xxx
STRIPE_PRICE_PRO_M       price_xxx
STRIPE_PRICE_PRO_Y       price_xxx
NEXT_PUBLIC_APP_URL      https://companybrain-ai-chi.vercel.app
```

### 4.7 ライブラリ

- `stripe`(Node SDK)
- Webhook 署名検証で `raw body` が必要 → Next.js App Router で `req.text()` を使う(既知ノウハウ)。

---

## 5. 実装スコープと工数(目安)

| Phase | 内容 | 目安 |
|---|---|---|
| **P1: 土台**(必須) | DB マイグレ / Stripe SDK / Webhook / planEnforce 拡張 / `/api/billing/*` 主要4本 / Customer Portal | 約 1〜2 日 |
| **P2: UI**(必須) | プラン比較画面 / アップグレードCTA / ペイウォール拡張 / マイページ統合 | 約 1 日 |
| **P3: 請求書ルート**(必須) | invoice_requests / 申込フォーム / admin 管理画面 | 約 0.5〜1 日 |
| **P4: 年契約**(任意・推奨) | 月/年トグル / 年プライス追加 / コピー調整 | 約 0.5 日 |
| **P5: エンタープライズ**(任意・推奨) | お問い合わせフォーム + ランディング枠追加 | 約 0.5 日 |

合計目安: **必須のみ 約 3〜4 日、フル 4.5〜5 日**(私が実装する場合の感覚値)。

---

## 6. リスク・確認事項

1. **特商法表記・利用規約・プライバシーポリシー**: 有料化と同時に**必須**。テンプレ起こしは可能だが、最終確認は法務側で。
2. **インボイス制度**: Stripe Invoices には適格請求書要件(発行者名・登録番号・税率・税額)を満たすテンプレを設定する必要あり。スクリプトで自動設定可能。
3. **解約時のデータ取り扱い**: ダウングレード後にブレイン数や素材容量が新プランを超過する場合の挙動を決める必要あり。提案: **既存ブレイン/素材は維持、新規作成と再アップロードのみ制限**。
4. **税込/税抜表記**: 国内 SaaS は税込表示が主流(消費者契約法的にも安全)。Stripe 側 `tax_behavior=inclusive` 推奨。
5. **広告と実態の整合**: ランディングに「日割り清算」「いつでも解約」と明記済みなので、本設計はそれに矛盾しない(アップグレードは日割り、解約は次期更新まで利用)。
6. **テスト**: `STRIPE_SECRET_KEY` のテストキーで E2E を一通り。webhook は Stripe CLI で local 検証。

---

## 7. 次の判断ポイント(あなたから返答が欲しい点)

1. **§2 提案 A**(starter → ベーシックへリネーム): やる / やらない
2. **§2 提案 B**(年契約 SKU): やる / やらない
3. **§2 提案 C**(エンタープライズ枠新設): やる / やらない
4. **§5 スコープ**: 必須のみで進める / フル(P1〜P5)で進める
5. **§6-1 法務まわり**: 特商法・規約・PP のドラフトも作る? それともご自身で用意?

返答いただければ、決まった範囲で**実装に着手**します(マイグレ SQL は私が作成 → 本番反映はユーザー実行、Stripe 環境変数 / Webhook 設定はユーザー作業)。
