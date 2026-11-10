-- 001: 記録(entries)と設定(settings)の表。最初に実行済み。
create table public.entries (
  id bigint generated always as identity primary key,
  date date not null,
  amount integer not null check (amount > 0),
  category text not null,
  payer text not null check (payer in ('a','b')),
  memo text,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

create table public.settings (
  key text primary key,
  value text not null
);

alter table public.entries enable row level security;
alter table public.settings enable row level security;

grant select, insert, update, delete on public.entries to authenticated;
grant select, insert, update, delete on public.settings to authenticated;

create policy "login users only" on public.entries
  for all to authenticated using (true) with check (true);
create policy "login users only" on public.settings
  for all to authenticated using (true) with check (true);

alter publication supabase_realtime add table public.entries;
