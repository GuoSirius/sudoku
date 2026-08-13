# Supabase 接入操作指南（数独跨设备同步）

> 本文面向**第一次使用 Supabase** 的你。照着步骤一步步在网页上点即可，不需要写后端代码。
>
> **目标**：让你在 Supabase 上准备好「数据库 + 登录方式」，然后把 **Project URL** 和 **Publishable key（新版）/ anon key（旧版）** 发给我。我拿到后再写代码，把本地记录同步到云端，实现跨设备查看历史 / 复盘 / 排行榜。
>
> **登录方式建议**：**邮箱（魔法链接）为主 + GitHub 可选**。两者都能做、可同时开启；邮箱覆盖所有用户且几乎零配置，GitHub 作为可选加分项（详见下方「认证方式对比」一节）。
>
> **本文只是操作指南，不是代码。** 真正的同步代码等你给我配置后再写，且全部在 `feature/supabase-sync` 分支上进行，不影响你现在能正常玩的主线（`main` / `v1.0.0`）。

---

## 认证方式：邮箱 vs GitHub 有什么区别？（先读这段）

你之前选了 GitHub，但当时不太确定两者差异。下面说清楚，方便你定方案。结论：**推荐邮箱为主、GitHub 可选**，两者都能做、且可同时开启。

### 对「部署」的影响

| | 邮箱登录（魔法链接） | GitHub 登录 |
| --- | --- | --- |
| 额外配置 | **几乎为零**：Supabase 默认就开启邮箱认证，无需申请任何第三方 App | 需在 GitHub 建一个 **OAuth App**，拿到 Client ID / Secret 填回 Supabase |
| 与域名耦合 | 低：只需在 Supabase 填你的站点地址 | 高：OAuth App 的回调地址必须和你**部署的域名**一致；以后换域名要同步改 GitHub + Supabase 两处 |
| 邮件送达 | 免费层用 Supabase 自带发信，**链接可能进垃圾邮件**；要稳定可配自定义 SMTP（如 Resend，免费额度够个人用） | 不涉及邮件，无此问题 |

### 对「用户使用」的影响

| | 邮箱登录 | GitHub 登录 |
| --- | --- | --- |
| 谁能用 | **任何人**（只要有邮箱） | 必须有 **GitHub 账号**（数独用户多为普通玩家，很多人没有） |
| 登录步骤 | 输入邮箱 → 收邮件 → 点链接 → 登录（免记密码） | 点「用 GitHub 登录」→ 授权 → 登录（一步，但需有 GitHub 账号） |
| 移动端 | 邮件链接在手机上点开即可回到站点（PWA 友好） | 同样走网页授权，没问题 |
| 适合人群 | 最广，适合面向公众的游戏 | 偏开发者；作为「可选」补充很合适 |

### 可行性：能不能两个都做？

**能，而且很简单。** Supabase Auth 原生支持**同时开启多个登录方式**，登录界面并列显示多个按钮即可：

- 每个登录方式对应一个独立账号（用邮箱登、用 GitHub 登是**两个不同的账户**，不会自动合并——这是正常的，各登各的）；
- 云端数据按 `auth.uid()`（用户唯一 ID）隔离，哪种方式登录都能正常存 / 取自己的数据；
- 代码上：邮箱是默认主入口；GitHub 作为「可选」按钮，**只有当你配了 GitHub 且打开开关时才显示**，没配就自动隐藏，不影响邮箱登录。

### 推荐方案

> **邮箱（魔法链接）为主 + GitHub 可选。**
> - **邮箱**：覆盖所有用户、部署最简单，作为默认登录方式；
> - **GitHub**：你若想顺手用（毕竟你有 GitHub 账号），就顺便开启作为可选入口，普通玩家不用管它。
>
> 这样你给我的东西也更少：**邮箱开箱即用，你只需提供 Project URL + Publishable key（新版）或 anon key（旧版）**；GitHub 是可选的加分项。

---

## 0. 总体要你做的事（先有个印象）

你只需要在网页上点几步，**全程不用写代码**：

1. 建一个 Supabase 项目
2. 复制 **Project URL** + **Publishable key（新版）/ anon key（旧版）**（这两个发给我）
3. 执行一段 SQL 建数据表（现成的，复制粘贴）
4. （可选）在 GitHub 建一个 OAuth App，并在 Supabase 启用 GitHub 登录 —— **不加也行，邮箱登录默认就有**
5. 把拿到的信息发给我

> 邮箱登录 Supabase 默认已开启，**你什么都不用配**；GitHub 是可选的加分项。你**不需要**把 GitHub 的 Secret 发给我——那个只填在 Supabase 后台，前端代码用不到。
>
> 关于 API key：Supabase 新版控制台把旧的 **anon key** 改名为 **Publishable key**（以 `sb_publishable_` 开头），两者作用完全一样，复制哪一个给我都可以。如果你的项目只显示 Publishable key，就用它。

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

## 2. 拿到 Project URL 和 Publishable/anon key（这两个要发给我）

Supabase 新版控制台把 API key 入口改成了 **Settings → API Keys**，并且新增了 **Publishable key**（`sb_publishable_...`），它就是以前放在前端的 **anon key**。旧的 **anon key**（`eyJ...` 开头）如果没被替换，会放在 **Legacy API Keys** 标签页里。两种 key 都能用，复制你看到的那一个即可。

1. 进入项目后，左侧菜单最底部 **Project Settings**（齿轮图标）
2. 选 **API Keys**（注意：不是旧的 API）
3. 如果看到 **Publishable and secret API keys** 标签页：
   - **Project URL**：形如 `https://abcd1234.supabase.co` → 复制备用
   - **Publishable key**：形如 `sb_publishable_...` → 复制备用
4. 如果没看到 Publishable key，切换到 **Legacy API Keys** 标签页：
   - **Project URL**：同上
   - **anon key**：很长的字符串，以 `eyJ...` 开头 → 复制备用
5. 把这两样**发给我**（直接贴聊天里即可）。**Publishable / anon key 是公开安全的**，可以放在前端代码里，不用担心泄露（真正敏感的操作由后台的 RLS 行级安全控制）。

> **还看不懂这两个值从哪拿？** 你截图里那段环境变量就是答案：
> - `NEXT_PUBLIC_SUPABASE_URL=https://oafefnbyzajzdejelhsw.supabase.co` —— **等号后面整串就是 Project URL**，直接发我即可。
> - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...` —— **等号后面 `sb_publishable_...` 那串就是 Publishable key**。
> - 中间 `oafefnbyzajzdejelhsw` 这一段叫 **project ref（项目代号）**，后面配 GitHub 回调地址会用到。

> 你**不需要**自己 `npm install @supabase/supabase-js`——那是给 Next.js 项目用的。我们这个纯静态 PWA 会由我在代码里通过 CDN 引入库，你只负责把上面两项配置发我。

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

## 4. （可选）配置 GitHub 登录

> **邮箱登录默认已开启，无需任何配置**，可直接跳到下一步。下面 GitHub 是**可选的**：你想用 GitHub 一键登录就做，不想做也不影响邮箱登录。

我们用 **GitHub 登录**作为可选入口。需要两边各配一次：GitHub 侧出「钥匙」，Supabase 侧接「锁」。

### 4.1 在 GitHub 创建 OAuth App

1. 打开 GitHub → 右上角头像 → **Settings** → 左侧 **Developer settings** → **OAuth Apps**
2. 点 **New OAuth App**
3. 填写：
   - **Application name**：`Sudoku Sync`（随便）
   - **Homepage URL**：填你的网站地址，例如 `https://sudoku-3ss.pages.dev`（本地调试也可以填 `http://localhost:8137`，但线上用户用的是部署地址，建议直接填部署域名）
   - **Authorization callback URL（回调地址）**：填
     ```
     https://<你的project-ref>.supabase.co/auth/v1/callback
     ```
     `<你的project-ref>` 就是第 2 步 Project URL 里 `https://` 和 `.supabase.co` 之间的那段（即 `abcd1234`）。**举例**：你的 Project URL 是 `https://oafefnbyzajzdejelhsw.supabase.co`，那回调地址就是 `https://oafefnbyzajzdejelhsw.supabase.co/auth/v1/callback`。这个地址是 Supabase 固定格式，不需要你「去哪拿」，照着填就行。
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

> **localhost 和线上地址的区别**：`localhost:8137` 只代表你**本机跑开发服务器**时的地址；`https://sudoku-3ss.pages.dev` 是你 Cloudflare Pages 上的**真实线上地址**。邮箱魔法链接 / GitHub 授权完成后，Supabase 会把用户跳回「在 Site URL / Redirect URLs 里、且与实际打开网站的地址一致」的那一个。所以**线上用户从哪个地址打开游戏，哪个地址就必须加进 Redirect URLs**，否则会报 redirect 错误。
>
> 结论：**如果只打算让用户在线上玩，把所有 `localhost:8137` 都换成你的线上地址即可**；如果你想本地也调试，就两个都加（不冲突）。

1. Supabase 左侧 **Authentication** → **URL Configuration**
2. **Site URL**：填你的线上地址 `https://sudoku-3ss.pages.dev`（本地调试可填 `http://localhost:8137`）
3. **Redirect URLs**：点 **Add URL**，加上：
   - `https://sudoku-3ss.pages.dev`（**必加**，线上用户走这个）
   - `http://localhost:8137`（可选，仅本地调试用）
4. 点 **Save**

> 📌 **本地端口从哪来**：本项目的本地服务器由 `tools/serve.mjs` 启动（`npm run dev`），默认端口就是 **8137**（代码里 `PORT = process.env.PORT || 8137`）。所以本地地址是 `http://localhost:8137`，不是 Vite 常见的 5173。**如果你用 `PORT=xxxx npm run dev` 改了端口，那 Redirect URLs 里就要加你实际改成的那个端口**——总之「你用哪个地址打开游戏，就把哪个地址加进白名单」。

> ⚠️ **GitHub 的 Client Secret 你自己保存即可，不必发给我。** 只有 Supabase 后台需要它。

#### ⚠️ 排错：为什么我在 localhost 用 GitHub 登录，却跳回了线上地址？

**症状**：你用 `http://localhost:8137` 打开游戏，点「用 GitHub 登录」，授权完之后却被带回了 `https://sudoku-3ss.pages.dev`（线上），而不是你本地的 localhost。

**根因（记牢这一点）**：前端代码在发起 GitHub 登录时，会按你「当前打开网站的地址」自动设置回跳地址，也就是 `redirectTo: window.location.origin`（localhost 时就是 `http://localhost:8137`）。**但 Supabase 有个硬性规则：你传的 `redirectTo` 必须出现在上方「Redirect URLs」白名单里，否则它不认，直接回退到 Site URL。** 而你的 Site URL 填的是线上地址 `https://sudoku-3ss.pages.dev`，于是就被带到了线上。

换句话说：**代码没传错，是 Supabase 后台的 Redirect URLs 白名单里没有 `http://localhost:8137`。**

**怎么验证**：回到 Supabase → **Authentication → URL Configuration**，看 **Redirect URLs** 那一行，确认里面**真的有** `http://localhost:8137` 这一条（不是只填在 Site URL，也不是只填了线上地址）。很多人只加了线上地址，漏了 localhost。

**修复（一步）**：把 `http://localhost:8137` 加进 **Redirect URLs**（点 Add URL → 粘贴 → Save）。加完后再用 localhost 登录，授权完就会乖乖跳回 localhost 了。

> 延伸影响：如果登录被带回了线上地址，你的会话其实**已经建立成功**（Supabase 在回跳 URL 里带回了登录态），只是落在了「错误的源」上。结果是同一个 GitHub 账号的数据被写进了 `sudoku-3ss.pages.dev` 的 localStorage，而 `localhost:8137` 的 localStorage 没同步到——看着像「没登录 / 数据不对」。按上面补上 localhost 后，从哪个地址登录就落到哪个地址，数据就自洽了。
>
> 如果你**只打算让用户线上玩、自己不本地调试**，那最省事的做法是：Site URL 和 Redirect URLs 都只留 `https://sudoku-3ss.pages.dev`，并且**永远用线上地址 `https://sudoku-3ss.pages.dev` 打开游戏来登录**（不要用 localhost 登录）。这样根本不会触发回退。

#### ⚠️ 排错进阶：Redirect URLs 已经加了 localhost，为什么 GitHub 还是跳回线上？

如果你确认 **URL Configuration → Redirect URLs** 里已经有 `http://localhost:8137` / `http://127.0.0.1:8137`，但 GitHub 登录还是从本地跳回了 `https://sudoku-3ss.pages.dev`，那就**不是 URL Configuration 的问题**，而是 GitHub provider 本身的回调地址配错了。去查以下两处：

**A. GitHub OAuth App 的 Authorization callback URL 必须填 Supabase 的固定回调**

打开 GitHub → Settings → Developer settings → OAuth Apps → 你的 Sudoku Sync 应用：

- **Authorization callback URL** 必须是：
  ```
  https://oafefnbyzajzdejelhsw.supabase.co/auth/v1/callback
  ```
- **绝对不能**填你自己的应用地址，例如 `https://sudoku-3ss.pages.dev/auth/callback`、`https://sudoku-3ss.pages.dev` 等。如果填的是你的应用地址，GitHub 授权完就会**直接跳到你的应用地址**，根本不会把 Supabase 的 `redirectTo` 带过去，于是你就落到了线上。

**怎么验证**：点开 GitHub OAuth App 页面，看一眼 Authorization callback URL。只要不是 `https://<你的project-ref>.supabase.co/auth/v1/callback` 这种格式，就是错的。改成正确的即可。

**B. Supabase Providers → GitHub 里的 Redirect URL 字段不要覆盖**

Supabase 项目 → **Authentication → Providers → GitHub**：

- 有些 Supabase 版本在这里会有一个 **Redirect URL (optional)** 字段。如果你填了 `https://sudoku-3ss.pages.dev`，它可能会覆盖代码里动态传的 `redirectTo`，导致本地登录也跳线上。
- **留空**即可（让代码里的 `redirectTo: window.location.origin` 生效），或者填 `http://localhost:8137`（仅本地调试用）。

**C. 一个快速定位方法：先试邮箱登录**

用 localhost 打开游戏，点邮箱登录，输入你的邮箱，去邮件里点魔法链接：

- 如果魔法链接点开后**正确回到了 localhost** → 说明 Supabase URL Configuration 完全没问题，问题只出在 GitHub provider 配置（就是上面 A 或 B）。
- 如果魔法链接点开后也回到了线上 → 说明 URL Configuration 还有漏的地方，再检查 Site URL / Redirect URLs 是否保存成功、有没有拼写错误。

> 📌 **常见错误顺序**：很多人先配了 GitHub OAuth App，回头又改了 Site URL，结果 GitHub OAuth App 的回调地址还是旧的 pages.dev。记住：**GitHub 那边的回调地址永远是 Supabase，不是你的应用域名；你的应用域名只写在 Supabase 的 URL Configuration 里。**

---

## 5. 把以下信息发给我，我就开始写代码

请回复我「开始」并带上：

- ✅ Supabase **Project URL**
- ✅ Supabase **Publishable key（新版）或 anon key（旧版）**
- ✅ 是否启用 GitHub 登录？（**邮箱默认就有，GitHub 是可选**）
  - 若启用：确认 GitHub OAuth App 已创建、Supabase 已启用 GitHub provider、回调 / 跳转地址已配置（**GitHub Client Secret 不必发我**，只填 Supabase 后台）
  - 若不启用：跳过即可，邮箱登录照常工作

收到后我会：

1. 在 `feature/supabase-sync` 分支写代码（**不影响你现在能玩的主线**）；
2. 在 `js/config.js` 填入你的 URL + Publishable/anon key；
3. 默认以**邮箱魔法链接**为主登录方式；若你启用 GitHub，登录页同时显示 GitHub 按钮（未启用则自动隐藏）；
4. 新增登录 / 登出 UI 和云端同步逻辑（登录拉取、本地变动防抖回写、离线照常玩）；
5. 跑通原有测试后，交你在浏览器里实测跨设备。

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
- [ ] 已复制 **Project URL** 和 **Publishable key / anon key**
- [ ] SQL Editor 执行了建表语句，显示 `Success`
- [ ] （可选）GitHub OAuth App 已创建，拿到 Client ID / Secret
- [ ] （可选）Supabase → Authentication → Providers → GitHub 已启用，填入了 Client ID / Secret
- [ ] （可选）Supabase → URL Configuration 的 Site URL / Redirect URLs 已加线上地址 `https://sudoku-3ss.pages.dev`（本地调试可额外加 `http://localhost:8137`）
- [ ] 已把 Project URL + anon key 发给我，并说「开始」（注明是否启用 GitHub）

---

## 9. 代码已就绪，如何验证跨设备同步

同步代码已合入 `feature/supabase-sync` 分支（顶栏新增 👤 账号按钮）。你那边只需：

1. **在 Supabase 执行建表 SQL**（第 3 节），否则登录后会报 `relation user_data does not exist`。
2. **部署新版到 Cloudflare Pages**（覆盖 `sudoku-3ss.pages.dev`）。本地 `npm run dev` 也可，但记得 Redirect URLs 里加了 `localhost`。
3. 打开网站 → 点 👤 → 输入邮箱 → 收魔法链接 → 点开即登录。
4. 玩几局 / 改设置 → 数据会自动防抖回写云端（账号按钮里可「立即同步」）。
5. 换设备（或同设备清掉本地存储）用同一邮箱登录 → 历史 / 排行 / 设置自动拉回。
6. GitHub 登录：仅当 Supabase 后台已启用 GitHub provider 时才显示按钮；没启用则点了会报错，属正常。

> 邮箱魔法链接可能进垃圾邮件；若一直收不到，检查 Supabase 左侧 **Authentication → Email** 的发信配置（Free 层用 Supabase 自带发信，稳定后可配自定义 SMTP）。
