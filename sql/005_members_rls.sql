-- 005: アクセス権を「ふたりは読み書き、バックアップ用は読むだけ」に分ける(v17)
-- 実行前に、下の 3 つのメールアドレスを、Supabase に登録したものに書き換えてください。
-- ※ 書き換えた内容は GitHub には保存しないでください(このリポジトリは公開です)。
-- 3 人がそろっていないときは、何も変更せずにエラーで止まります。

begin;

-- 誰が使えるかの名簿(アプリからは読み書きできない)
create table if not exists public.members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('member', 'backup'))
);
alter table public.members enable row level security;
revoke all on public.members from anon, authenticated;

insert into public.members (user_id, role)
select u.id, v.role
from auth.users u
join (values
  ('MY_EMAIL@example.com',      'member'),   -- ← 自分
  ('PARTNER_EMAIL@example.com', 'member'),   -- ← 奥さん
  ('BACKUP_EMAIL@example.com',  'backup')    -- ← バックアップ用
) as v(email, role) on lower(u.email) = lower(v.email)
on conflict (user_id) do update set role = excluded.role;

do $$
begin
  if (select count(*) from public.members where role = 'member') <> 2
     or (select count(*) from public.members where role = 'backup') <> 1 then
    raise exception 'メールアドレスが一致しません(ふたり=2人、バックアップ用=1人が必要)。書き換えを確認してください';
  end if;
end $$;

-- ログイン中の人の役割を返す(名簿を直接見せずに判定するため security definer)
create or replace function public.member_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.members where user_id = auth.uid()
$$;
revoke all on function public.member_role() from public, anon;
grant execute on function public.member_role() to authenticated;

-- 各表のルールを差し替える
do $$
declare t text;
begin
  foreach t in array array['entries', 'settings', 'recurring', 'categories'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop policy if exists "login users only" on public.%I', t);
    execute format('drop policy if exists "members and backup read" on public.%I', t);
    execute format('drop policy if exists "members insert" on public.%I', t);
    execute format('drop policy if exists "members update" on public.%I', t);
    execute format('drop policy if exists "members delete" on public.%I', t);
    execute format($p$create policy "members and backup read" on public.%I for select to authenticated
                     using (public.member_role() in ('member', 'backup'))$p$, t);
    execute format($p$create policy "members insert" on public.%I for insert to authenticated
                     with check (public.member_role() = 'member')$p$, t);
    execute format($p$create policy "members update" on public.%I for update to authenticated
                     using (public.member_role() = 'member') with check (public.member_role() = 'member')$p$, t);
    execute format($p$create policy "members delete" on public.%I for delete to authenticated
                     using (public.member_role() = 'member')$p$, t);
  end loop;
end $$;

commit;

-- 確認用:3 人と役割が表示されれば成功
select u.email, m.role
from public.members m join auth.users u on u.id = m.user_id
order by m.role desc, u.email;
