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
2. **配置自定义 SMTP（必须，否则改不了模板也发不稳）**  
   Supabase 自定义 Email Templates 依赖自定义 SMTP。路径：**Authentication → Emails → Custom SMTP**。字段含义与填法见下方「自定义 SMTP 填表指南」。
3. **关键：把邮件模板从「链接」改成「验证码」**  
   Supabase 默认的 Magic Link 模板发送的是**可点击链接**（`{{ .ConfirmationURL }}`）。本项目用应用内 OTP，所以必须改成显示 **6 位数字码**（`{{ .Token }}`）。
   - 路径：**Authentication → Templates → Magic Link / Sign In**
   - 把模板里所有 `{{ .ConfirmationURL }}` 删掉或注释掉
   - 在正文合适位置加上 `{{ .Token }}`，例如：
     ```html
     <p>你的数独登录验证码是：<strong>{{ .Token }}</strong></p>
     <p>请在应用内输入该验证码完成登录，10 分钟内有效。</p>
     ```
   - 保存后再次测试，邮件里应只显示 6 位数字，没有可点击链接。

> 不依赖 Redirect URL（验证码在应用内输入），但 Email provider、自定义 SMTP、正确模板三者缺一不可。模板不改，用户收到的仍是链接，前端 OTP 输入框永远用不上。

### 自定义 SMTP 填表指南

Supabase 后台路径：**Authentication → Emails → Custom SMTP**。截图里的各字段填法如下：

| 字段 | 含义 | 填法 |
|------|------|------|
| **Sender email address** | 发件人邮箱地址 | 填你用来发信的邮箱，如 `noreply@yourdomain.com`。没有自己的域名时，可填 `你的昵称@163.com` 或 QQ 邮箱，但收件箱会显示这个地址。 |
| **Sender name** | 发件人显示名称 | 填 `数独` 或 `Sudoku`，收件人看到的发件人名字。 |
| **Host** | SMTP 服务器地址 | 根据你的邮件服务商填写，见下表。 |
| **Port number** | SMTP 端口 | 优先填 **465**（SSL），其次 **587**（TLS）。不要用 25 端口，基本被运营商/云服务商封掉。 |
| **Minimum interval per user** | 同一用户两次发信最小间隔 | 默认 **60** 秒即可，防刷。 |
| **Username** | SMTP 用户名 | 通常就是完整邮箱地址。 |
| **Password** | SMTP 密码 | **不是邮箱登录密码**，而是邮箱服务商提供的「授权码 / App Password / SMTP 专用密码」。 |

#### 常用国内邮箱 SMTP 配置（免费、适合个人/小项目）

**网易 163 邮箱**
- Host：`smtp.163.com`
- Port：`465`
- Username：`你的完整 163 邮箱地址`（如 `guoplc@163.com`）
- Password：163 邮箱的**授权码**（不是登录密码）
  - 获取方式：登录 163 邮箱 → 设置 → POP3/SMTP/IMAP → 开启 SMTP → 按提示发短信，获得 16 位授权码。

**QQ 邮箱**
- Host：`smtp.qq.com`
- Port：`465`
- Username：`你的完整 QQ 邮箱地址`（如 `123456@qq.com`）
- Password：QQ 邮箱的**授权码**
  - 获取方式：登录 QQ 邮箱 → 设置 → 账户 → 开启 POP3/SMTP 服务 → 按提示获得 16 位授权码。

> ⚠️ 163/QQ 免费 SMTP 有每日/每小时发信限额，且验证码邮件可能被 Gmail/Outlook 等海外邮箱拦截进垃圾箱。仅供测试和小范围使用；正式运营建议用企业邮箱或专业邮件服务商。

#### 专业邮件服务商（适合生产环境）

| 服务商 | Host 示例 | 特点 |
|--------|-----------|------|
| **SendGrid** | `smtp.sendgrid.net` | 国际主流，免费档每天 100 封，国内访问可能不稳。 |
| **Mailgun** | `smtp.mailgun.org` | 需绑定域名，按量计费，海外送达率高。 |
| **Postmark** | `smtp.postmarkapp.com` | Transactional 邮件专攻，送达率高，但需海外支付。 |
| **Amazon SES** | 区域 host | 最便宜，配置略复杂，需 AWS 账号。 |
| **阿里云邮件推送 / 腾讯云邮件** | 按产品文档 | 国内接入方便，需域名备案，适合国内用户。 |

#### 保存后如何验证

1. 在 Supabase 保存 SMTP 配置。
2. 回到 **Authentication → Templates → Magic Link / Sign In**，确保模板只含 `{{ .Token }}`、不含 `{{ .ConfirmationURL }}`。
3. 打开数独网站 → 点账号按钮 → 输入你的邮箱 → 发送验证码。
4. 去邮箱收件箱（或垃圾箱）查看，应收到显示 6 位数字的邮件。
5. 如果 1 分钟内没到：
   - 检查 SMTP 配置是否保存成功；
   - 确认填的是「授权码」而不是邮箱登录密码；
   - 看 Supabase 后台 Auth → Logs 有无发送失败记录；
   - 163/QQ 用户注意是否触发每日限额。

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

**原因 1**：没配自定义 SMTP，Supabase 免费邮件服务被限流或进垃圾箱。  
**修复 1**：按上方「自定义 SMTP 填表指南」配置一个 SMTP（163/QQ 适合测试，专业服务商适合生产）。

**原因 2**：模板里还是 `{{ .ConfirmationURL }}`，发的是链接而不是验证码。  
**修复 2**：改成 `{{ .Token }}`，参见「坑 4」。

**原因 3**：SMTP 密码填成了邮箱登录密码，而不是授权码。  
**修复 3**：163/QQ 等邮箱需要单独开启 SMTP 并获取授权码，参见「自定义 SMTP 填表指南」。

---

## 6. 验证跨设备同步

1. 部署新版到 `sudoku-3ss.pages.dev`（或本地 `npm run dev`）
2. 打开网站 → 点顶栏 👤 → 输入邮箱 → 点「发送验证码」→ 在应用内输入收到的 6 位码
3. 玩一局 / 改设置
4. 换设备或清掉本地存储后，用同一账号登录 → 历史 / 排行 / 设置应自动拉回
