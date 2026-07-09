-- 企業向け(組織テナント)とシート課金の土台。
--
-- 個人アカウント(org_id = null)と併存する。組織に所属するユーザーは、
-- 個人プランではなく組織のプラン(enterprise)の「1シートあたりの上限」で
-- 制限される。組織の管理は「会社管理者(org_role='company_admin')」が
-- 自社のメンバーに対してのみ行える。運営者(role='admin')は上位の
-- スーパー管理者として組織の作成・シート数の設定を行う。
create table if not exists organizations (
  id             uuid primary key default uuid_generate_v4(),
  name           text not null,
  plan           text not null default 'enterprise',  -- 将来の拡張用
  seats          integer not null default 1,          -- 契約シート数(上限)
  seat_price_jpy integer,                              -- 請求記録用の単価(任意)
  created_at     timestamptz not null default now()
);

alter table app_users
  add column if not exists org_id uuid references organizations(id) on delete set null;
alter table app_users
  add column if not exists org_role text;  -- 'company_admin' | 'member'(組織内の役割)

create index if not exists app_users_org_idx on app_users(org_id);

-- シート上限をDBレベルで原子的に強制する。アプリ側の「件数を数えてから
-- 追加」はサーバーレスの同時実行で上限を超えうる(TOCTOU)。組織行を
-- FOR UPDATE でロックしてから件数を確認することで、同一組織への同時追加を
-- 直列化し、契約シート数を超える所属を確実に防ぐ。
create or replace function enforce_org_seats() returns trigger as $$
declare
  seat_limit int;
  current_count int;
begin
  if NEW.org_id is null then
    return NEW;
  end if;
  -- 組織への新規所属/組織変更のときだけ確認する(同一組織内の更新は対象外)。
  if TG_OP = 'UPDATE' and OLD.org_id is not distinct from NEW.org_id then
    return NEW;
  end if;
  select seats into seat_limit from organizations where id = NEW.org_id for update;
  if seat_limit is null then
    return NEW; -- 組織が存在しなければ FK 側に任せる
  end if;
  select count(*) into current_count
    from app_users where org_id = NEW.org_id and email <> NEW.email;
  if current_count + 1 > seat_limit then
    raise exception 'seat limit exceeded for organization %', NEW.org_id
      using errcode = 'check_violation';
  end if;
  return NEW;
end;
$$ language plpgsql;

drop trigger if exists app_users_org_seats on app_users;
create trigger app_users_org_seats
  before insert or update on app_users
  for each row execute function enforce_org_seats();
