-- 002: 固定費(v8)。実行済み。
-- 固定費(毎月くり返す記録)の準備
create table public.recurring (
  id bigint generated always as identity primary key,
  day integer not null check (day between 1 and 31),            -- 31 = 月末
  amount integer not null check (amount > 0),
  category text not null,
  payer text not null check (payer in ('a','b')),
  memo text,
  start_month text not null check (start_month ~ '^[0-9]{4}-[0-9]{2}$'),
  last_month text not null check (last_month ~ '^[0-9]{4}-[0-9]{2}$'),  -- 記録を作成済みの月
  end_month text check (end_month ~ '^[0-9]{4}-[0-9]{2}$'),
  active boolean not null default true,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

alter table public.recurring enable row level security;
grant select, insert, update, delete on public.recurring to authenticated;
create policy "login users only" on public.recurring
  for all to authenticated using (true) with check (true);

-- 記録が固定費から作られたことを覚えておく列(固定費を削除しても記録は残る)
alter table public.entries
  add column recurring_id bigint references public.recurring(id) on delete set null;
