-- 数独跨设备同步：用户数据表（每个账号一行，存全部本地数据）
-- 在 Supabase 控制台 → SQL Editor 中执行本文件。

create table if not exists public.user_data (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  settings   jsonb not null default '{}'::jsonb,
  history    jsonb not null default '[]'::jsonb,
  leaderboard jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists user_data_updated_at_idx on public.user_data (updated_at desc);

-- 行级安全：用户只能读写自己的那一行
alter table public.user_data enable row level security;

drop policy if exists "user_data_own_row" on public.user_data;
create policy "user_data_own_row" on public.user_data
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 全球排行榜：任何人可读，允许匿名/登录用户写入自己的最佳成绩
-- 每个 device_id / user_id 在每个难度下只保留最好的一条（更优成绩覆盖）
create table if not exists public.global_leaderboard (
  id         uuid primary key default gen_random_uuid(),
  device_id  text not null default '',
  user_id    uuid references auth.users (id) on delete set null,
  nickname   text not null default '匿名玩家',
  difficulty text not null,
  duration_ms integer not null,
  mistakes   integer not null default 0,
  hints_used integer not null default 0,
  score      integer not null default 0,
  played_at  timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists global_lb_score_idx on public.global_leaderboard (score desc);
create index if not exists global_lb_difficulty_score_idx on public.global_leaderboard (difficulty, score desc);
create index if not exists global_lb_device_id_idx on public.global_leaderboard (device_id);
create index if not exists global_lb_user_id_idx on public.global_leaderboard (user_id);

alter table public.global_leaderboard enable row level security;

-- 读取：公开；写入/更新/删除通过 security definer 函数完成，避免匿名用户 RLS 下难以自证 device_id
drop policy if exists "global_lb_select_public" on public.global_leaderboard;
create policy "global_lb_select_public" on public.global_leaderboard
  for select
  using (true);

-- 触发器：自动维护 updated_at
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists global_lb_updated_at on public.global_leaderboard;
create trigger global_lb_updated_at
  before update on public.global_leaderboard
  for each row
  execute function public.set_updated_at();

-- 防重复：同 device_id + difficulty 或同 user_id + difficulty 只保留一条最佳
create unique index if not exists global_lb_unique_device_diff
  on public.global_leaderboard (coalesce(device_id, ''), difficulty)
  where device_id <> '' and user_id is null;

create unique index if not exists global_lb_unique_user_diff
  on public.global_leaderboard (user_id, difficulty)
  where user_id is not null;

-- 提交成绩：匿名/登录用户均可调用，函数内部只更新自己的最佳记录
create or replace function public.submit_global_score(
  p_device_id text,
  p_user_id uuid,
  p_nickname text,
  p_difficulty text,
  p_duration_ms integer,
  p_mistakes integer,
  p_hints_used integer,
  p_score integer
) returns void
language plpgsql
security definer
as $$
declare
  existing record;
  should_update boolean := false;
begin
  -- 已登录用户：按 user_id + difficulty 更新
  if p_user_id is not null then
    select * into existing from public.global_leaderboard
    where user_id = p_user_id and difficulty = p_difficulty
    limit 1;

    if not found then
      should_update := true;
    elsif p_score > existing.score or (p_score = existing.score and p_duration_ms < existing.duration_ms) then
      should_update := true;
    end if;

    if should_update then
      delete from public.global_leaderboard
      where user_id = p_user_id and difficulty = p_difficulty;
      insert into public.global_leaderboard (device_id, user_id, nickname, difficulty, duration_ms, mistakes, hints_used, score)
      values ('', p_user_id, p_nickname, p_difficulty, p_duration_ms, p_mistakes, p_hints_used, p_score);
    end if;

  -- 匿名用户：按 device_id + difficulty 更新
  elsif p_device_id is not null and p_device_id <> '' then
    select * into existing from public.global_leaderboard
    where device_id = p_device_id and difficulty = p_difficulty and user_id is null
    limit 1;

    if not found then
      should_update := true;
    elsif p_score > existing.score or (p_score = existing.score and p_duration_ms < existing.duration_ms) then
      should_update := true;
    end if;

    if should_update then
      delete from public.global_leaderboard
      where device_id = p_device_id and difficulty = p_difficulty and user_id is null;
      insert into public.global_leaderboard (device_id, user_id, nickname, difficulty, duration_ms, mistakes, hints_used, score)
      values (p_device_id, null, p_nickname, p_difficulty, p_duration_ms, p_mistakes, p_hints_used, p_score);
    end if;
  end if;
end;
$$;

-- 允许匿名和认证用户调用 RPC
grant execute on function public.submit_global_score(text, uuid, text, text, integer, integer, integer, integer) to anon, authenticated;
