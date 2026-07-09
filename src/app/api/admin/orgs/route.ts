import { NextRequest, NextResponse } from 'next/server';
import { getAppUser } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabase';
import { countOrgMembers } from '@/lib/org';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 運営者(スーパー管理者)用: 組織の作成・シート数設定・会社管理者の
// 割り当て。顧客企業ごとの「会社」を作り、その会社管理者を任命する。

async function requireSuperAdmin() {
  const me = await getAppUser();
  return me && me.role === 'admin' ? me : null;
}

/** 組織一覧(シート使用数つき)。 */
export async function GET() {
  if (!(await requireSuperAdmin())) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const db = supabaseAdmin();
  const { data, error } = await db
    .from('organizations')
    .select('id, name, plan, seats, seat_price_jpy, created_at')
    .order('created_at', { ascending: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const orgs = await Promise.all(
    (data ?? []).map(async (o) => ({
      ...o,
      used: await countOrgMembers(o.id as string),
    })),
  );
  return NextResponse.json({ orgs });
}

/** 組織を作成。Body: { name, seats, seat_price_jpy? } */
export async function POST(req: NextRequest) {
  if (!(await requireSuperAdmin())) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const { name, seats, seat_price_jpy } = (await req.json().catch(() => ({}))) as {
    name?: string;
    seats?: number;
    seat_price_jpy?: number;
  };
  const cleanName = name?.trim();
  if (!cleanName) {
    return NextResponse.json({ error: '会社名を入力してください' }, { status: 400 });
  }
  const seatCount = Number.isFinite(seats) ? Math.max(1, Math.floor(seats!)) : 1;
  const db = supabaseAdmin();
  const { data, error } = await db
    .from('organizations')
    .insert({
      name: cleanName.slice(0, 120),
      seats: seatCount,
      seat_price_jpy:
        Number.isFinite(seat_price_jpy) && seat_price_jpy! >= 0
          ? Math.floor(seat_price_jpy!)
          : null,
    })
    .select('id')
    .single();
  if (error || !data) {
    return NextResponse.json(
      { error: error?.message || 'insert failed' },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, id: data.id });
}

/** 組織を更新(シート数・名前・単価)。Body: { id, name?, seats?, seat_price_jpy? } */
export async function PATCH(req: NextRequest) {
  if (!(await requireSuperAdmin())) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const { id, name, seats, seat_price_jpy } = (await req
    .json()
    .catch(() => ({}))) as {
    id?: string;
    name?: string;
    seats?: number;
    seat_price_jpy?: number | null;
  };
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const updates: Record<string, unknown> = {};
  if (typeof name === 'string' && name.trim()) updates.name = name.trim().slice(0, 120);
  if (Number.isFinite(seats)) {
    const seatCount = Math.max(1, Math.floor(seats!));
    // 既存メンバー数を下回るシート数には減らせない。
    const used = await countOrgMembers(id);
    if (seatCount < used) {
      return NextResponse.json(
        { error: `現在 ${used} 名が所属しているため、シート数を ${seatCount} には減らせません。` },
        { status: 400 },
      );
    }
    updates.seats = seatCount;
  }
  if (seat_price_jpy === null) updates.seat_price_jpy = null;
  else if (Number.isFinite(seat_price_jpy)) updates.seat_price_jpy = Math.floor(seat_price_jpy!);
  if (Object.keys(updates).length === 0) return NextResponse.json({ ok: true });

  const db = supabaseAdmin();
  const { error } = await db.from('organizations').update(updates).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
