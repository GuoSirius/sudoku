# 数独 Sudoku · 多端可安装版

一个**纯前端、零后端依赖**的数独游戏，同时以三种形态交付：

- 🌐 **网页 / PWA**：打开即用，可「添加到主屏幕」当作 App 安装，离线可用。
- 🖥 **桌面端（Windows）**：基于 Tauri v2 打包成独立 `.exe`，带系统托盘、全局快捷键、关闭最小化到托盘、启动时自动更新。
- 📱 **安卓 App**：基于 Capacitor 8 打包成 `.apk`，网站代码直接装进原生外壳运行（iOS 需 Mac，预留能力）。

核心玩法（计时、个人排行榜、历史复盘、中途暂存续玩、四档难度、笔记、提示、老板键伪装、摸鱼小窗）三端共用同一套 `web/` 代码，单一来源，无需双份维护。

> 数据默认**只存在你本地**（localStorage）。如需跨设备，可在应用内用邮箱验证码（或 GitHub）登录 Supabase，自动把设置 / 历史 / 排行同步到云端，并参与**全球排行榜**。未登录、离线时一切照常游玩，仅失去同步能力。

---

## 功能特性

- ⏱ **计时**：实时计时，暂停 / 退出自动保留已用时长
- 🏆 **个人排行榜**：按难度记录最佳成绩（用时 / 错误 / 提示）
- 📜 **历史查看**：每局结果、用时、错误数、日期一目了然；「未完成」可续玩
- 🎬 **复盘回放**：按落子顺序逐步重演整局，支持上一步 / 下一步 / 自动播放
- 💾 **暂存续玩**：关闭或刷新后可「继续游戏」；支持「重开本局」「新游戏」
- 🎚 **四档难度**：简单 / 中等 / 困难 / 专家（按提示数自动生成并保证唯一解）
- 🌗 **明暗主题**：默认深色，可在设置中切换「跟随系统 / 浅色 / 深色」
- ☁️ **跨设备云同步**：邮箱验证码（免密码）或 GitHub 登录，自动合并设置 / 历史 / 排行到 Supabase（RLS 按账号隔离）
- 🌍 **全球排行榜**：综合分排名，可按难度筛选；匿名也能上榜（按设备），登录后并入账号
- 🐟 **摸鱼小窗**：独立迷你窗口（只显示棋盘、强制暗色），可拖到屏幕角落；点击按钮需二次确认防误触
- 🕶 **老板键伪装**：按 ` 键（桌面端全局 `Alt + \`` 在窗口失焦时也能触发）在「游戏」与「伪装工作界面」间瞬间切换；伪装可选前端 / PHP / Java / Python
- 🖥 **桌面增强（Tauri）**：系统托盘、全局快捷键（`Alt + \`` 老板键、`Alt + S` 显隐窗口）、关闭最小化到托盘、Release 构建优先加载线上最新版（无网回退本地）、启动时自动检测更新
- 📱 **原生 App（Capacitor）**：安卓 `.apk` 一键打包，与网页共用同一套界面与逻辑

---

## 操作与快捷键

| 操作 | 鼠标 / 触摸 | 键盘 |
| --- | --- | --- |
| 选中格子 | 点击格子 | 方向键移动选中 |
| 记候选数 | 数字盘：笔记模式单击 / 按住 `Ctrl` 单击；格内候选：单击切换（添加 / 取消） | 笔记模式 或 按住 `Ctrl` + 数字键 |
| 填入数字 | 数字盘：普通模式单击 = 回填、双击 = 强制回填；格内候选：双击 = 回填 | 普通模式按数字键 `1`–`9`（需先选中格子） |
| 擦除 | 点「擦除」 | `Backspace` / `Delete` / `0` |
| 笔记模式 | 点「笔记」切换 | 按 `N` 切换 |
| 提示（填正确值） | 点「提示」 | — |
| 暂停 / 继续 | 顶栏 ⏸ / 暂停横幅「继续」；游戏中点 ☰ 先暂停再回首页 | — |
| 老板键 / 伪装切换 | — | 同页面按 `` ` `` 键；**桌面端**全局 `Alt + \``（窗口失焦也生效） |
| 显隐窗口（仅桌面端） | 托盘左键单击 | `Alt + S` |

- **统一判定 `wantNote = 笔记模式 || 按住 Ctrl`**：数字盘与键盘数字输入，满足其一就「记候选（切换：有则删、无则加）」，**否则回填**。移动端无 Ctrl，`wantNote` 仅由「笔记」按钮决定——逻辑与 PC 完全一致。
- **数字盘（1–9）**：普通模式单击 = 回填；笔记模式 / `Ctrl` 单击 = 记候选；**双击 = 强制回填**。键盘同理。
- **格子里的候选（单击 / 双击）**：已记候选的格子，单击某个候选小数字 = 切换（添加或取消）；双击 = 正式填入并清空其余候选（「笔记转正」）。
- 未选中格子时按数字键只会提示「请先选择一个格子」，不会自动填入，避免误填。
- **暂停（非阻塞）**：点 ⏸ 仍停留在游戏界面，棋盘轻微变暗、计时停止、进度自动保存；之后可在首页「继续游戏」或返回游戏点「继续」。
- **错误提示（不泄题）**：默认「仅冲突」——只标红同行 / 列 / 宫里**重复**的数字，不逐格比对答案，不削弱难度。可切「全量核对」或「关闭」；随时点「🔍 检查」手动揭示并计错。

---

## 技术说明

| 层 | 技术 |
| --- | --- |
| 网页 / PWA | 原生 HTML + CSS + ES Module JavaScript，**零框架、零构建**（静态资源直接托管） |
| 数独引擎 | 随机回溯生成完整解 → 逐步挖空并回溯计数保证唯一解；冲突检测 |
| 存储 | `localStorage`（设置 / 当前局 / 历史 / 排行榜），封装在 `web/js/storage.js` |
| PWA | `manifest.webmanifest` + `sw.js`（应用壳缓存，离线可用；静态资源网络优先，保证在线拉最新） |
| 桌面端 | **Tauri v2**（Rust）：NSIS 安装包、托盘、全局快捷键、`tauri-plugin-updater` 自动更新 |
| 移动端 | **Capacitor 8**：把 `web/` 装进安卓 WebView（iOS 需 Mac 编译） |
| 云同步 / 全球榜 | **Supabase**：Postgres + RLS + `security definer` RPC；前端用 publishable key（可安全暴露），supabase-js 经 CDN 动态加载、失败降级本地 |
| 部署 | **Cloudflare Pages**（Dashboard 连 GitHub 或 wrangler CLI） |
| CI / 发布 | GitHub Actions：打 `v*` tag 触发，自动构建桌面 / 安卓产物并挂到 GitHub Release |

---

## 目录结构

```
sudoku/
├── web/                      # 网页 / PWA 前端（单一来源，桌面端和 App 共用）
│   ├── index.html            # 页面骨架与各界面
│   ├── css/styles.css        # 样式（明暗主题、响应式棋盘、弹框、摸鱼小窗）
│   ├── js/
│   │   ├── sudoku.js         # 数独引擎（生成 / 唯一解 / 冲突检测）
│   │   ├── storage.js        # localStorage 封装（含设备 ID、全球榜缓存）
│   │   ├── game.js           # 对局状态机与计时
│   │   ├── ui.js             # 棋盘渲染与高亮
│   │   ├── main.js           # 主控制器（路由 / 交互 / 历史 / 复盘 / 排行 / 设置 / 摸鱼 / 老板键）
│   │   ├── sync.js           # Supabase 云同步 + 全球排行榜（动态加载，失败降级本地）
│   │   ├── config.js         # Supabase 接入配置与登录开关
│   │   ├── pwa.js            # Service Worker 注册
│   │   └── version.js        # 版本号（由 tools/sync-version.mjs 自动生成，勿手改）
│   ├── manifest.webmanifest  # PWA 清单
│   ├── sw.js                 # Service Worker（离线缓存）
│   └── icons/                # 应用图标（SVG + PNG）
├── src-tauri/                # 桌面端（Tauri v2，Rust）
│   ├── src/main.rs           # 托盘 / 全局快捷键 / 离线回退 / 关闭最小化 / 自动更新
│   ├── tauri.conf.json       # 窗口、打包（NSIS）、updater pubkey 等
│   ├── capabilities/default.json  # 权限能力集
│   ├── Cargo.toml
│   └── icons/                # 各平台图标（由 tools/gen_icons.py 统一生成）
├── app/                      # 移动端（Capacitor 8）
│   ├── capacitor.config.ts   # appId=cn.sudoku.game，webDir=www
│   ├── sync.mjs              # 把 web/ 同步到 app/www/
│   ├── scripts/patch-android-gradle.mjs  # 自动升级 AGP 并注入国内镜像
│   └── README.md             # App 打包详细指南（安卓 / iOS）
├── supabase/
│   ├── schema.sql            # 建表 + RLS + submit_global_score RPC（幂等，可重复执行）
│   └── SETUP_GUIDE.md        # Supabase 配置与部署步骤
├── tools/                    # 脚本与自检
│   ├── serve.mjs             # 零依赖静态服务器（npm run dev）
│   ├── gen_icons.py          # 生成 PWA / Tauri / App 图标
│   ├── sync-version.mjs      # 以 package.json 为准，同步版本到各产物
│   ├── release.mjs           # 交互式发布（选版本→自测→提交→打 tag→推送，CI 接手构建）
│   ├── deploy-schema.mjs     # 把 schema.sql 部署到 Supabase（读 .env 的 DB 连接串）
│   ├── extract-release-notes.mjs  # 从 git 历史提取发布说明
│   ├── test-engine.mjs       # 引擎自检（生成 / 唯一解 / 冲突，24 项）
│   ├── test-game.mjs         # 对局逻辑自检（状态机 / 胜利 / 笔记 / 复盘，13 项）
│   ├── test-dom.mjs          # DOM 交互冒烟（完整流程，84 项）
│   └── test-restore.mjs      # 刷新恢复专项（5 项）
├── .github/workflows/
│   └── release.yml           # 打 v* tag 触发：构建桌面 / 安卓并挂到 Release
│   └── deploy.yml.disabled   # Cloudflare Pages 部署（已暂停；Cloudflare 直连仓库，推送即更新）
├── wrangler.toml            # Cloudflare Pages 配置（输出目录 web）
├── package.json             # 根脚本（dev / test / deploy / release / tauri / app:*）
├── CHANGELOG.md             # 按版本倒序的变更记录
└── .gitignore
```

---

## 本地运行

```bash
npm install
npm run dev          # 启动零依赖静态服务器，默认 http://localhost:8137
```

直接用浏览器打开 `http://localhost:8137` 即可游玩（端口可在 `tools/serve.mjs` 用 `PORT` 环境变量覆盖）。`npm test` 等价于依次运行四个测试脚本（共 **126 项**断言）：

```bash
npm test
#   node tools/test-engine.mjs   # 生成 / 唯一解 / 冲突检测（24 项）
#   node tools/test-game.mjs     # 对局状态机 / 胜利 / 笔记 / 复盘（13 项）
#   node tools/test-dom.mjs      # 模拟 DOM 跑完整交互：通关/历史/复盘/续玩/主题/笔记转正/摸鱼小窗确认（84 项）
#   node tools/test-restore.mjs  # 刷新恢复专项（5 项）
```

---

## 构建与发布

### 桌面端（Tauri）

```bash
npm run tauri:dev      # 开发模式（带 Rust 热重载）
npm run tauri:build    # 产出 src-tauri/target/release/bundle/nsis/*.exe
```

需要本地装好 Rust 工具链；自动更新签名依赖仓库 Actions Secret `TAURI_SIGNING_PRIVATE_KEY`（与 `tauri.conf.json` 的 `plugins.updater.pubkey` 配对）。

### 移动端（Capacitor / 安卓）

```bash
npm run app:sync            # 把 web/ 同步到 app/www/
npm run app:add:android     # 首次：生成安卓工程并自动打 AGP 补丁（仅一次）
npm run app:open:android    # 用 Android Studio 打开，Build → APK(s)
```

AGP 版本由 `patch-android-gradle.mjs` 自动抬到 8.13.2 并注入国内镜像（CI 上 Ubuntu runner 无 Android Studio 时回退到该安全值）。详细见 `app/README.md`。

### 一键发布流程

```bash
npm run release
```

交互式流程（沿用你的偏好：版本用 **↑/↓ 箭头切换**、确认默认同意）：

1. 跑全套自测（`npm test`）；
2. 选择版本类型（patch / minor / major），自动 `npm version` + `tools/sync-version.mjs` 同步版本号到各产物；
3. 提交并打 `vX.Y.Z` tag，推送到 `origin`（含 `--follow-tags`）；
4. **GitHub Actions（release.yml）接管**：在 Windows runner 构建桌面 `.exe`、Ubuntu runner 构建安卓 `.apk`，并把产物挂到对应 GitHub Release；桌面端 `tauri-plugin-updater` 据此生成 `latest.json` 供自动更新。

> 本地 `npm run release` **不构建**任何二进制，构建全部交给 CI，保证产物可复现、签名密钥不落本地。

---

## 部署到 Cloudflare Pages

本项目是静态站点（`web/` 目录），无需构建步骤。推荐以下任一方式部署。

### 方式一：Dashboard 连接 GitHub（最省心，推荐）

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages** → **Create** → **Pages** → **连接到 Git**
2. 选择本仓库 `GuoSirius/sudoku`
3. 构建设置：**Framework preset** = `None`，**Build command** 留空，**Output directory** = `web`
4. 点击 **Save and Deploy**，之后每次 `git push` 到 `main` 自动重新部署

### 方式二：wrangler CLI

```bash
npx wrangler login        # 首次浏览器授权
npm run deploy            # 等价于 npx wrangler pages deploy web --project-name=sudoku
```

### 方式三：GitHub Actions（可选，当前已暂停）

仓库里有一份 `.github/workflows/deploy.yml`，原本用于 push `main` 自动部署。由于 Cloudflare 已直连 GitHub 仓库（推送即更新），该工作流**当前已被重命名为 `deploy.yml.disabled` 暂停**，避免重复部署。后续若需更复杂的部署逻辑，把它 `git mv` 改回 `.deploy.yml` 即可，并补充 Secrets：

- `CLOUDFLARE_API_TOKEN`：具有 `Cloudflare Pages` 编辑权限的 API Token
- `CLOUDFLARE_ACCOUNT_ID`：Cloudflare 账户 ID

---

## 安装为 App（PWA）

在支持的浏览器（Chrome / Edge / 安卓 Chrome / 桌面端）中打开站点后：

- 桌面：地址栏出现「安装」图标，或菜单 → **安装数独**
- 手机：浏览器菜单 → **添加到主屏幕**

安装后可像原生 App 一样全屏离线运行。桌面端 / 安卓原生安装包见上方「构建与发布」。

---

## Supabase（云同步 + 全球榜）

详细配置见 `supabase/SETUP_GUIDE.md`。要点：

- 在 Supabase 控制台 SQL Editor 执行 `supabase/schema.sql`（幂等，可重复执行，不会丢数据）。
- 前端连接信息写在 `web/js/config.js`（publishable key 可安全暴露）；数据库结构变更用 `npm run deploy:schema`（读取 `.env` 的 `SUPABASE_DB_URL`，走 **Session pooler** 端口 5432，避免直连 IPv6 解析失败）。
- 登录方式：`ENABLE_GITHUB`（默认开）、`ENABLE_PHONE`（默认关，付费）；邮箱走应用内 OTP 验证码，免密码、不依赖邮件链接。

---

## 数据说明

- **本地优先**：所有对局数据默认只存在当前浏览器 / App 的 `localStorage`，不上传任何服务器。清除浏览器数据或换设备后本地记录不互通（设计取舍，换来零后端、最稳部署）。
- **可选云端**：在应用内登录账号后，设置 / 历史 / 排行会防抖同步到 Supabase（每账号一行，RLS 隔离），换设备登录同一账号即可恢复；全球排行榜会在通关时上传**最佳成绩**（匿名的按设备、登录的并入账号）。未登录 / 离线 / 同步失败都不影响本地游玩。
- **清除数据**：设置页 → 「清除全部本地数据」一键删除当前对局、历史与排行榜（设置保留），操作不可恢复。
- 历史记录最多保留最近 200 局；个人排行榜展示各难度最佳成绩（前 10）。

---

## 可扩展方向

- 更多伪装技术栈（老板键）、更丰富的全球榜维度（连胜、周榜）。
- 桌面端 macOS / Linux 打包（当前仅 Windows NSIS）。
- iOS App 上架（需 Mac + 开发者账号，Capacitor 已就绪）。
- 云同步冲突的更细粒度合并（当前按整行 upsert + 按 id 取较新）。
