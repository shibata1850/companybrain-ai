import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 受け入れ基準 §8.3(セキュリティ)の自動化。
 *
 * ブレインの認可ゲート `authorizeAvatar` は本システムの中核的な防御であり、
 * ここが緩むと他社・他人の社内ナレッジが露出する。grep や目視レビューでは
 * 退行を防げないため、代表的な攻撃シナリオをテストで固定する。
 *
 * Supabase(サービスロール / セッション)と env をモックし、DB の状態だけを
 * 差し替えて判定ロジックそのものを検証する。
 */

type TestUser = {
  email: string;
  role: 'admin' | 'member';
  org_id: string | null;
  org_role: 'company_admin' | 'member' | null;
  suspended_at?: string | null;
};

/** テストごとに差し替える「DB とセッションの状態」。 */
let dbState: {
  avatar: Record<string, unknown> | null;
  users: Record<string, TestUser>;
  /** `avatarId::email` で個別共有されているか */
  shares: Set<string>;
  /** avatar_shares が存在しない(0027 未適用)状態を再現 */
  sharesTableMissing?: boolean;
};

/** 現在ログインしているユーザーのメール(null = 未ログイン)。 */
let sessionEmail: string | null = null;

vi.mock('./env', () => ({
  env: {
    supabaseUrl: () => 'https://test.supabase.co',
    supabaseAnonKey: () => 'anon',
    supabaseServiceKey: () => 'service',
    storageBucket: () => 'test',
  },
}));

vi.mock('next/headers', () => ({
  cookies: () => ({ getAll: () => [], set: () => {} }),
}));

// セッション層: ログイン中のメールだけを返す最小実装
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: {
      getUser: async () => ({
        data: { user: sessionEmail ? { email: sessionEmail } : null },
      }),
    },
  }),
}));

// サービスロール層: avatars / app_users / avatar_shares の3テーブル
vi.mock('./supabase', () => ({
  storageBucket: () => 'test',
  supabaseAdmin: () => ({
    from: (table: string) => {
      if (table === 'avatars') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: dbState.avatar, error: null }),
            }),
          }),
        };
      }
      if (table === 'app_users') {
        return {
          select: () => ({
            eq: (_col: string, email: string) => ({
              single: async () => {
                const u = dbState.users[email];
                if (!u) return { data: null, error: null };
                return {
                  data: {
                    email: u.email,
                    role: u.role,
                    display_name: null,
                    suspended_at: u.suspended_at ?? null,
                    avatar_path: null,
                    org_id: u.org_id,
                    org_role: u.org_role,
                  },
                  error: null,
                };
              },
            }),
          }),
        };
      }
      if (table === 'avatar_shares') {
        return {
          select: () => ({
            eq: (_c1: string, avatarId: string) => ({
              eq: (_c2: string, email: string) => ({
                maybeSingle: async () =>
                  dbState.sharesTableMissing
                    ? {
                        data: null,
                        error: { message: 'relation "avatar_shares" does not exist' },
                      }
                    : {
                        data: dbState.shares.has(`${avatarId}::${email}`)
                          ? { id: 'share-1' }
                          : null,
                        error: null,
                      },
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  }),
}));

import { authorizeAvatar } from './authServer';

const OWNER = 'owner@acme.co.jp';
const COLLEAGUE = 'colleague@acme.co.jp';
const OUTSIDER = 'outsider@other.co.jp';
const ADMIN = 'admin@softdoing.jp';
const ORG_A = 'org-a';
const ORG_B = 'org-b';
const AVATAR_ID = 'avatar-1';

/** ログインユーザーを差し替える。 */
function loginAs(email: string | null) {
  sessionEmail = email;
}

beforeEach(() => {
  dbState = {
    avatar: {
      owner_email: OWNER,
      request_id: null,
      shared_with_org: false,
      deleted_at: null,
    },
    users: {
      [OWNER]: { email: OWNER, role: 'member', org_id: ORG_A, org_role: 'member' },
      [COLLEAGUE]: { email: COLLEAGUE, role: 'member', org_id: ORG_A, org_role: 'member' },
      [OUTSIDER]: { email: OUTSIDER, role: 'member', org_id: ORG_B, org_role: 'member' },
      [ADMIN]: { email: ADMIN, role: 'admin', org_id: null, org_role: null },
    },
    shares: new Set(),
  };
  loginAs(null);
});

describe('§8.3-1 他人のブレインの中身にアクセスできない', () => {
  it('所有者はフルアクセス(owner)', async () => {
    loginAs(OWNER);
    const r = await authorizeAvatar(AVATAR_ID);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.access).toBe('owner');
  });

  it('共有されていない同僚は 403', async () => {
    loginAs(COLLEAGUE);
    const r = await authorizeAvatar(AVATAR_ID);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(403);
  });

  it('プラットフォーム管理者でも他人のブレインには入れない(監査のみ)', async () => {
    dbState.avatar!.shared_with_org = true; // 全社共有されていても
    loginAs(ADMIN);
    const r = await authorizeAvatar(AVATAR_ID);
    expect(r.ok).toBe(false);
  });

  it('管理者が組織に割り当てられても共有アクセスを得ない', async () => {
    dbState.avatar!.shared_with_org = true;
    dbState.users[ADMIN] = {
      email: ADMIN,
      role: 'admin',
      org_id: ORG_A, // 同一組織に所属させても
      org_role: 'member',
    };
    loginAs(ADMIN);
    const r = await authorizeAvatar(AVATAR_ID);
    expect(r.ok).toBe(false);
  });
});

describe('§8.3-2 共有相手は編集系ルートで 403', () => {
  it('全社共有された同僚は閲覧・会話は可(shared)', async () => {
    dbState.avatar!.shared_with_org = true;
    loginAs(COLLEAGUE);
    const r = await authorizeAvatar(AVATAR_ID);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.access).toBe('shared');
  });

  it('同じ同僚でも requireOwner のルートでは 403', async () => {
    dbState.avatar!.shared_with_org = true;
    loginAs(COLLEAGUE);
    const r = await authorizeAvatar(AVATAR_ID, { requireOwner: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(403);
  });

  it('個別共有された相手は閲覧可・編集は 403', async () => {
    dbState.shares.add(`${AVATAR_ID}::${COLLEAGUE}`);
    loginAs(COLLEAGUE);
    expect((await authorizeAvatar(AVATAR_ID)).ok).toBe(true);
    expect((await authorizeAvatar(AVATAR_ID, { requireOwner: true })).ok).toBe(false);
  });
});

describe('§8.3-3 別組織・個人アカウントは共有の対象外', () => {
  it('別組織のメンバーは全社共有されていても 403', async () => {
    dbState.avatar!.shared_with_org = true;
    loginAs(OUTSIDER);
    const r = await authorizeAvatar(AVATAR_ID);
    expect(r.ok).toBe(false);
  });

  it('別組織のメンバーは avatar_shares に行があっても 403(同一組織チェックが先)', async () => {
    dbState.shares.add(`${AVATAR_ID}::${OUTSIDER}`);
    loginAs(OUTSIDER);
    const r = await authorizeAvatar(AVATAR_ID);
    expect(r.ok).toBe(false);
  });

  it('個人アカウント(組織なし)は共有アクセスを得ない', async () => {
    dbState.avatar!.shared_with_org = true;
    dbState.users[COLLEAGUE] = {
      email: COLLEAGUE,
      role: 'member',
      org_id: null,
      org_role: null,
    };
    loginAs(COLLEAGUE);
    const r = await authorizeAvatar(AVATAR_ID);
    expect(r.ok).toBe(false);
  });
});

describe('§8.3-5 停止ユーザーの遮断', () => {
  it('停止された所有者は自分のブレインにもアクセスできない', async () => {
    dbState.users[OWNER] = {
      email: OWNER,
      role: 'member',
      org_id: ORG_A,
      org_role: 'member',
      suspended_at: '2026-01-01T00:00:00Z',
    };
    loginAs(OWNER);
    const r = await authorizeAvatar(AVATAR_ID);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(401);
  });
});

describe('ゴミ箱・未適用マイグレーションの扱い', () => {
  it('所有者がゴミ箱に入れたブレインは共有相手からアクセス不可', async () => {
    dbState.avatar!.shared_with_org = true;
    dbState.avatar!.deleted_at = '2026-01-01T00:00:00Z';
    loginAs(COLLEAGUE);
    const r = await authorizeAvatar(AVATAR_ID);
    expect(r.ok).toBe(false);
  });

  it('所有者本人はゴミ箱のブレインにアクセスできる(復元のため)', async () => {
    dbState.avatar!.deleted_at = '2026-01-01T00:00:00Z';
    loginAs(OWNER);
    const r = await authorizeAvatar(AVATAR_ID);
    expect(r.ok).toBe(true);
  });

  it('0027 未適用(avatar_shares が無い)環境では共有なしとして安全側に倒す', async () => {
    dbState.sharesTableMissing = true;
    loginAs(COLLEAGUE);
    const r = await authorizeAvatar(AVATAR_ID);
    expect(r.ok).toBe(false);
  });
});

describe('未ログイン・存在しないブレイン', () => {
  it('未ログインは 401', async () => {
    loginAs(null);
    const r = await authorizeAvatar(AVATAR_ID);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(401);
  });

  it('allowlist に無いユーザーは 401', async () => {
    loginAs('ghost@nowhere.co.jp');
    const r = await authorizeAvatar(AVATAR_ID);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(401);
  });

  it('存在しないブレインは 404', async () => {
    dbState.avatar = null;
    loginAs(OWNER);
    const r = await authorizeAvatar(AVATAR_ID);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(404);
  });
});

describe('依頼で作成されたブレイン(素材ロックの判定材料)', () => {
  it('request_id があれば fromRequest=true を返す', async () => {
    dbState.avatar!.request_id = 'req-1';
    loginAs(OWNER);
    const r = await authorizeAvatar(AVATAR_ID);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.fromRequest).toBe(true);
  });
});
