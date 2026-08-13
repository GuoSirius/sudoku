# 数独 Supabase 同步：部署与排坑指南

> 目标：在 Supabase 上准备好数据库 + 登录，拿到 **Project URL** 和 **Publishable/anon key**。  
> 推荐：**邮箱 OTP 验证码（应用内输码）为主，GitHub 可选**。两者均免密码、浏览器/PWA/原生通用。手机号因需付费 SMS，默认关闭。

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

### 邮箱登录（应用内 OTP 验证码，默认开启）

登录流程已从「魔法链接」改为**应用内 6 位验证码**：用户输入邮箱 → 点发送 → 在应用内输入收到的 6 位码完成登录。全程不跳外部链接，**规避 iOS 已装 PWA 点邮件链接丢失会话**的问题。

需要做的配置：

1. **启用 Email provider**：Authentication → Providers → Email，确保 **Enable**（默认开）。OTP 验证码由 Supabase 通过邮件发送。
2. **（生产必做）配置自定义 SMTP**：Supabase 自带邮件服务有发送限额且标注「请勿用于生产」。正式上线前请在 Authentication → Email → 自定义 SMTP 接入自己的邮件服务（如 Postmark / SendGrid / 企业邮箱），否则可能收不到验证码或被限流。
3. **关键：把邮件模板从「链接」改成「验证码」**  
   Supabase 默认的 Magic Link 模板发送的是**可点击链接**（`{{ .ConfirmationURL }}`）。 our app uses in-app OTP, so you must change it to display the **6-digit code** (`{{ .Token }}`).
   - 路径：**Authentication → Email Templates → Magic Link / Sign In**
   - 把模板里所有 `{{ .ConfirmationURL }}` 删掉或注释掉
   - 在正文合适位置加上 `{{ .Token }}`，例如：
     ```html
     <p>你的数独登录验证码是：<strong>{{ .Token }}</strong></p>
     <p>请在应用内输入该验证码完成登录，10 分钟内有效。</p>
     ```
   - 保存后再次测试，邮件里应只显示 6 位数字，没有可点击链接。

> 不依赖 Redirect URL（验证码在应用内输入），但 Email provider 与 SMTP 必须可用。如果模板不改，用户收到的仍是链接，前端 OTP 输入框永远用不上。

### GitHub 登录（可选，PKCE）

采用 **PKCE** 流程（`flowType: 'pkce'`），授权后回跳站点 origin，由前端在应用内用 `?code=` 换会话，**浏览器/PWA/原生三端共用**。

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

> 本地端口是 **8137**（`tools/serve.mjs` 默认），不是 5173。PKCE 回跳同样走上面的 Redirect URLs。

### 手机号登录（默认关闭，付费）

当前 `js/config.js` 中 `ENABLE_PHONE = false`，登录界面不显示手机入口。原因：Supabase Phone Auth 需接入 SMS 服务商（Twilio 等，**按条计费**），暂不划算。

如后续要启用：
1. `ENABLE_PHONE = true`
2. Supabase → Authentication → Providers → Phone，开启并配置 SMS 服务商
3. 前端 `signInWithOtp({phone})` + `verifyOtp({type:'sms'})` 逻辑已就绪，无需改代码



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

### 坑 4：邮箱收到的是链接而不是验证码

**原因**：Supabase 默认 Magic Link 模板用的是 `{{ .ConfirmationURL }}`，发出去的是可点击链接。前端改成 OTP 输码后，必须让邮件显示 `{{ .Token }}`。  
**修复**：Authentication → Email Templates → Magic Link / Sign In，删掉 `{{ .ConfirmationURL }}`，正文改成：
```html
<p>你的数独登录验证码是：<strong>{{ .Token }}</strong></p>
<p>请在应用内输入该验证码完成登录，10 分钟内有效。</p>
```

### 坑 5：邮箱验证码收不到

免费层邮件可能进垃圾邮件或被限流；**生产环境务必在 Supabase → Authentication → Email 配置自定义 SMTP**，否则可能长期收不到验证码。同时确认 Email Templates 的 Sign In 模板含 `{{ .Token }}`。

---

## 6. 验证跨设备同步

1. 部署新版到 `sudoku-3ss.pages.dev`（或本地 `npm run dev`）
2. 打开网站 → 点顶栏 👤 → 输入邮箱 → 点「发送验证码」→ 在应用内输入收到的 6 位码
3. 玩一局 / 改设置
4. 换设备或清掉本地存储后，用同一账号登录 → 历史 / 排行 / 设置应自动拉回
