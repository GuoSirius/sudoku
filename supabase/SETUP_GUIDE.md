# 数独 Supabase 同步：部署与排坑指南

> 目标：在 Supabase 上准备好数据库 + 登录，拿到 **Project URL** 和 **Publishable/anon key**。  
> 推荐：**邮箱魔法链接为主，GitHub 可选**。邮箱零配置；GitHub 需要额外 OAuth App。

---

## 1. 创建 Supabase 项目

1. 打开 <https://supabase.com> → 右上角 **New project**
2. 填写：
   - **Name**：`sudoku-sync`
   - **Region**：**Singapore** 或 **Tokyo**（国内访问更稳）
   - **Pricing plan**：**Free**
3. 点 **Create new project**，等 1–2 分钟初始化完成。

---

## 2. 拿到 Project URL + Publishable/anon key

进入项目 → 左侧底部 **Project Settings** → **API Keys**：

- **Project URL**：形如 `https://<ref>.supabase.co`
- **Publishable key**：`sb_publishable_...`（新版）
- 若看不到 Publishable，切到 **Legacy API Keys** 拿 **anon key**：`eyJ...`

把 **Project URL** 和 **Publishable/anon key** 发给我。

---

## 3. 建数据表

### 方式 A：一键脚本（推荐）

```bash
cp .env.example .env
# 编辑 .env，填入 SUPABASE_DB_URL（Supabase → Settings → Database → Connection string）
npm run deploy:schema
```

脚本会读取 `supabase/schema.sql`，幂等执行，可重复跑。

### 方式 B：手动粘贴 SQL

左侧 **SQL Editor** → **New query**，粘贴执行：

```sql
create table if not exists public.user_data (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  settings    jsonb not null default '{}'::jsonb,
  history     jsonb not null default '[]'::jsonb,
  leaderboard jsonb not null default '[]'::jsonb,
  updated_at  timestamptz not null default now()
);

create index if not exists user_data_updated_at_idx on public.user_data (updated_at desc);

alter table public.user_data enable row level security;

drop policy if exists "user_data_own_row" on public.user_data;
create policy "user_data_own_row" on public.user_data
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

---

## 4. 配置登录

### 邮箱登录（默认已开启，无需配置）

### GitHub 登录（可选）

1. **GitHub 创建 OAuth App**  
   GitHub → Settings → Developer settings → OAuth Apps → **New OAuth App**
   - **Homepage URL**：`https://sudoku-3ss.pages.dev`
   - **Authorization callback URL**：`https://<ref>.supabase.co/auth/v1/callback`
   - 记下 **Client ID**，并生成 **Client Secret**

2. **Supabase 启用 GitHub provider**  
   Authentication → Providers → GitHub → **Enable**，填入 Client ID / Secret → Save

3. **配置跳转白名单**  
   Authentication → URL Configuration：
   - **Site URL**：`https://sudoku-3ss.pages.dev`
   - **Redirect URLs**：
     - `https://sudoku-3ss.pages.dev`（必加）
     - `http://localhost:8137`（本地调试才加）

> 本地端口是 **8137**（`tools/serve.mjs` 默认），不是 5173。

---

## 5. 常见坑

### 坑 1：localhost 用 GitHub 登录后跳回线上地址

**原因**：Supabase 的 Redirect URLs 白名单里没有 `http://localhost:8137`，回退到了 Site URL（线上）。  
**修复**：URL Configuration → Redirect URLs 加上 `http://localhost:8137`。

**如果已经加了仍跳线上**：检查 GitHub OAuth App 的 **Authorization callback URL** 是否错填成 `sudoku-3ss.pages.dev`。必须填 Supabase 的固定回调：`https://<ref>.supabase.co/auth/v1/callback`。

### 坑 2：邮箱 + GitHub 没合并成同一个账号

**原因**：GitHub 隐藏邮箱时，Supabase 拿到的是 `noreply@users.noreply.github.com`。  
**修复**：GitHub → Settings → Emails → 取消勾选 **「Keep my email addresses private」**。

### 坑 3：登录后提示 `relation user_data does not exist`

**原因**：没执行第 3 步建表。  
**修复**：跑 `npm run deploy:schema` 或在 SQL Editor 执行建表 SQL。

### 坑 4：邮箱魔法链接收不到

免费层邮件可能进垃圾邮件；若长期收不到，可在 Supabase → Authentication → Email 配置自定义 SMTP。

---

## 6. 验证跨设备同步

1. 部署新版到 `sudoku-3ss.pages.dev`（或本地 `npm run dev`）
2. 打开网站 → 点顶栏 👤 → 输入邮箱 → 点魔法链接登录
3. 玩一局 / 改设置
4. 换设备或清掉本地存储后，用同一账号登录 → 历史 / 排行 / 设置应自动拉回
