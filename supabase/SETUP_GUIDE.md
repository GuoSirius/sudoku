# Supabase 接入操作指南（数独跨设备同步）

> 本文面向**第一次使用 Supabase** 的你。照着步骤一步步在网页上点即可，不需要写后端代码。
>
> **目标**：让你在 Supabase 上准备好「数据库 + GitHub 登录」，然后把 **Project URL** 和 **anon key** 发给我。我拿到后再写代码，把本地记录同步到云端，实现跨设备查看历史 / 复盘 / 排行榜。
>
> **本文只是操作指南，不是代码。** 真正的同步代码等你给我配置后再写，且全部在 `feature/supabase-sync` 分支上进行，不影响你现在能正常玩的主线（`main` / `v1.0.0`）。

---

## 0. 总体要你做的事（先有个印象）

你只需要在网页上点 5 步，**全程不用写代码**：

1. 建一个 Supabase 项目
2. 复制 **Project URL** + **anon key**（这两个发给我）
3. 执行一段 SQL 建数据表（现成的，复制粘贴）
4. 在 GitHub 建一个 OAuth App，并在 Supabase 启用 GitHub 登录
5. 把拿到的信息发给我

你**不需要**把 GitHub 的 Secret 发给我——那个只填在 Supabase 后台，前端代码用不到。

---

## 1. 创建 Supabase 项目

1. 打开 <https://supabase.com>（你已登录）
2. 右上角 **New project**（新建项目）
3. 填写：
   - **Name**：`sudoku-sync`（随便起，能认出就行）
   - **Database Password**：设一个你能记住的密码（后面基本用不到，但忘了要重置，建议记一下）
   - **Region（区域）**：选离你近的，推荐 **Singapore (ap-southeast-1)** 或 **Tokyo (ap-northeast-1)**。注意：Supabase 服务器在境外，国内访问可能偏慢，但功能不受影响。
   - **Pricing plan**：选 **Free**（免费层对个人完全够用）
4. 点 **Create new project**，等 1–2 分钟初始化完成。

---

## 2. 拿到 Project URL 和 anon key（这两个要发给我）

1. 进入项目后，左侧菜单最底部 **Project Settings**（齿轮图标）
2. 选 **API**
3. 这一页你会看到：
   - **Project URL**：形如 `https://abcd1234.supabase.co` → 复制备用
   - **Project API keys** 下方的 **anon** / **public** 那一行（很长的字符串，以 `eyJ...` 开头）→ 复制备用
4. 把这两样**发给我**（直接贴聊天里即可）。**anon key 是公开安全的**，可以放在前端代码里，不用担心泄露（真正敏感的操作由后台的 RLS 行级安全控制）。

---

## 3. 建数据表（执行我给你的 SQL）

1. 左侧菜单 **SQL Editor**（SQL 编辑器）
2. 点 **New query**（新建查询）
3. 把下面这段完整粘贴进去：

```sql
-- 数独跨设备同步：用户数据表（每个账号一行，存全部本地数据）
create table if not exists public.user_data (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  settings    jsonb not null default '{}'::jsonb,
  history     jsonb not null default '[]'::jsonb,
  leaderboard jsonb not null default '[]'::jsonb,
  updated_at  timestamptz not null default now()
);

create index if not exists user_data_updated_at_idx on public.user_data (updated_at desc);

-- 行级安全：用户只能读写自己的那一行
alter table public.user_data enable row level security;

drop policy if exists "user_data_own_row" on public.user_data;
create policy "user_data_own_row" on public.user_data
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

> 这份 SQL 我也保存在仓库 `supabase/schema.sql`，可直接打开复制。

4. 点 **Run**（或 `Ctrl/Cmd+Enter`）执行。
5. 出现 `Success` 即完成。这段做了什么：
   - 建了一张 `user_data` 表，**每个登录用户一行**，存三个 JSON 字段：`settings`（设置）、`history`（历史+复盘走子）、`leaderboard`（排行榜）；
   - 开启了 **RLS 行级安全**：用户只能读写自己的那一行，别人看不到你的数据；
   - 复盘数据很轻（每条只存「题目 + 走子序列」，约 1–2KB），几百条也就几百 KB，完全无压力。

---

## 4. 配置 GitHub 登录（重点，分两段）

我们用 **GitHub 登录**（你之前已选定）。需要两边各配一次：GitHub 侧出「钥匙」，Supabase 侧接「锁」。

### 4.1 在 GitHub 创建 OAuth App

1. 打开 GitHub → 右上角头像 → **Settings** → 左侧 **Developer settings** → **OAuth Apps**
2. 点 **New OAuth App**
3. 填写：
   - **Application name**：`Sudoku Sync`（随便）
   - **Homepage URL**：现在先填 `http://localhost:5173`（本地调试用；以后部署了改成你的网站地址）
   - **Authorization callback URL（回调地址）**：填
     ```
     https://<你的project-ref>.supabase.co/auth/v1/callback
     ```
     `<你的project-ref>` 就是第 2 步 Project URL 里 `https://` 和 `.supabase.co` 之间的那段（即 `abcd1234`）。
4. 点 **Register application**
5. 进入应用页后：
   - **Client ID** 直接显示，复制备用；
   - 点 **Generate a new client secret**，生成后**立即复制**那段 Secret（只显示这一次，关掉就看不见了）。

### 4.2 在 Supabase 启用 GitHub 登录

1. 回到 Supabase 项目，左侧 **Authentication** → **Providers**
2. 找到 **GitHub**，点进去，把开关切到 **Enable**
3. 填入：
   - **Client ID**：刚才 GitHub 复制的
   - **Client Secret**：刚才 GitHub 生成的
4. 点 **Save**

### 4.3 配置跳转（Redirect）地址

1. Supabase 左侧 **Authentication** → **URL Configuration**
2. **Site URL**：填 `http://localhost:5173`（或你的部署域名）
3. **Redirect URLs**：点 **Add URL**，加上：
   - `http://localhost:5173`
   - 以及你以后部署的网站地址（如 `https://your-site.com`）
4. 点 **Save**

> ⚠️ **GitHub 的 Client Secret 你自己保存即可，不必发给我。** 只有 Supabase 后台需要它。

---

## 5. 把以下信息发给我，我就开始写代码

请回复我「开始」并带上：

- ✅ Supabase **Project URL**
- ✅ Supabase **anon key**
- ✅ 确认：GitHub OAuth App 已创建、Supabase 已启用 GitHub provider、回调/跳转地址已配置
- （GitHub Client Secret 不必发我）

收到后我会：

1. 在 `feature/supabase-sync` 分支写代码（**不影响你现在能玩的主线**）；
2. 在 `js/config.js` 填入你的 URL + anon key；
3. 新增登录 / 登出 UI 和云端同步逻辑（登录拉取、本地变动防抖回写、离线照常玩）；
4. 跑通原有测试后，交你在浏览器里实测跨设备。

---

## 6. 国内网络可能的小坑（提前知道，不用操作）

- **supabase.co 偶尔偏慢**：我会在前端用国内可达的 CDN（jsdelivr 镜像）加载 supabase-js 库，并做「加载失败就降级为纯本地」的兜底，**不影响你现在的功能**。
- **GitHub 登录需 github.com 可达**：登录那一下走的是 GitHub 官网，你在国内访问 GitHub 如果慢，是网络问题不是代码问题。
- **区域选新加坡 / 东京**最稳。

---

## 7. 数据同步策略（让你心里有数，不用操作）

- **登录成功后**：先从云端拉取你的 `settings / history / leaderboard` 合并到本地；
- **之后本地变动**：每新增一条历史 / 排行、或改了设置，会**自动（防抖）回写**云端；
- **没网 / 没登录**：照常纯本地玩，完全不受影响；
- **多设备**：任一处改动，另一处下次打开会自动拉到最新；
- **冲突处理**：历史 / 排行按记录 id 去重合并，整行按「最后写入获胜」，无需复杂合并。

---

## 8. 操作完成自检清单（都打勾后通知我「开始」）

- [ ] Supabase 项目已创建（Free 层即可）
- [ ] 已复制 **Project URL** 和 **anon key**
- [ ] SQL Editor 执行了建表语句，显示 `Success`
- [ ] GitHub OAuth App 已创建，拿到 Client ID / Secret
- [ ] Supabase → Authentication → Providers → GitHub 已启用，填入了 Client ID / Secret
- [ ] Supabase → URL Configuration 的 Site URL / Redirect URLs 已加 `http://localhost:5173`
- [ ] 已把 Project URL + anon key 发给我，并说「开始」
