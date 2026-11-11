-- 004: カテゴリの管理(v11)。
-- カテゴリ(ふたりで共通)
create table public.categories (
  id bigint generated always as identity primary key,
  name text not null unique check (char_length(name) between 1 and 20),
  icon text not null check (char_length(icon) between 1 and 16),
  color text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  sort_order integer not null default 0,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.categories enable row level security;
grant select, insert, update, delete on public.categories to authenticated;
create policy "login users only" on public.categories
  for all to authenticated using (true) with check (true);
alter publication supabase_realtime add table public.categories;

-- 今のカテゴリを初期値として登録
insert into public.categories (name, icon, color, sort_order) values
  ('食費','🍴','#e5484d',1), ('外食','🍣','#d9822b',2), ('日用品','🪥','#5fb87c',3),
  ('お出かけ・娯楽','⭐','#e0508a',4), ('交際費','👥','#3f6fb5',5), ('交通費','🚃','#6a4fb3',6),
  ('衣服・美容','👕','#f2a93b',7), ('健康・医療','🏥','#f2735a',8), ('自動車','🚗','#8a8f98',9),
  ('教養・教育','📘','#5b7fc7',10), ('子ども・育児','🍼','#4fb3c7',11), ('特別な支出','❗','#9cbf6a',12)
on conflict (name) do nothing;
