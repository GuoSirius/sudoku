# 数独 Sudoku · 可安装网页版

一个纯前端、可离线安装的网页数独游戏。支持**计时、个人排行榜、历史查看、复盘回放、中途暂存续玩**，四档难度，界面美观且适配移动端。

> 数据全部保存在浏览器本地（localStorage），**零后端、零数据库**，因此可部署到任意静态托管平台。

## 功能特性

- ⏱ **计时**：实时计时，暂停/退出自动保留已用时长
- 🏆 **个人排行榜**：按难度记录最佳成绩（用时 / 错误 / 提示）
- 📜 **历史查看**：每局结果、用时、错误数、日期一目了然
- 🎬 **复盘回放**：按落子顺序逐步重演整局，支持上一步/下一步/自动播放
- 💾 **暂存续玩**：关闭或刷新后可「继续游戏」；支持「重开本局」「新游戏」
- 🎚 **四档难度**：简单 / 中等 / 困难 / 专家（按提示数自动生成并保证唯一解）
- 📱 **PWA**：可「添加到主屏幕」当作 App 安装，离线可用
- 🌗 **明暗主题**：默认深色，可在设置中切换「跟随系统 / 浅色 / 深色」

## 操作与快捷键

| 操作 | 鼠标 / 触摸 | 键盘 |
| --- | --- | --- |
| 选中格子 | 点击格子 | 方向键移动选中 |
| 填入数字 | 点数字盘 1–9 | 数字键 `1`–`9`（未选格时自动选中首个空格填入） |
| 擦除 | 点「擦除」 | `Backspace` / `Delete` / `0` |
| 笔记模式 | 点「笔记」切换 | 按 `N` 切换 |
| 提示（填正确值） | 点「提示」 | — |
| 暂停 / 继续 | 顶栏 ⏸ / 暂停页「继续」 | — |

- **笔记（候选数）**：开启笔记后填入的是「候选数」（小字），同一格可记多个。
- **取消单个笔记**：在**笔记模式**下，点一下格子里的笔记小数字即可删除该候选；或用数字盘再点同一数字切换取消；「擦除」键会清空整格笔记。
- **笔记转正**：切到**普通模式**后，直接**点击某格里的笔记小数字**，即可把它升级为正式填入值（清空该格其余笔记），无需重填 —— 转正若填错仍按错误计。
- **提示**会判定为「使用提示一次」，并计入复盘与排行榜的提示数。
- 选中某格后，同行 / 同列 / 同宫与相同数字会高亮，冲突与错误标红。

## 技术说明

- 纯静态站点，**原生 HTML + CSS + ES Module JavaScript，零框架、零构建**
- 数独引擎：随机回溯生成完整解 → 逐步挖空并保证唯一解（回溯计数判定）
- 存储：`localStorage`（设置 / 当前局 / 历史 / 排行榜）
- PWA：`manifest.webmanifest` + `sw.js`（应用壳缓存，导航请求网络优先、静态资源缓存优先）

## 本地运行

```bash
# 方式一：Node 零依赖静态服务器
npm run dev          # 默认 http://localhost:8137

# 方式二：Python
python -m http.server 8137
```

打开浏览器访问对应地址即可游玩。**注意**：PWA 安装与 Service Worker 需要以 `http://` 或 `https://` 访问（`file://` 直接打开不可用）。

### 脚本

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 启动本地零依赖静态服务器（默认 8137 端口） |
| `npm test` | 运行三套自检：引擎 / 对局逻辑 / DOM 交互（全绿即代表可用） |
| `npm run deploy` | 用 wrangler 部署到 Cloudflare Pages（`npx wrangler pages deploy .`） |
| `npm run gen:icons` | （可选）用 Python 重新生成 PWA 图标到 `icons/` |

### 自检说明

```bash
npm test
# 等价于依次运行：
#   node tools/test-engine.mjs   # 生成 / 唯一解 / 冲突检测（24 项）
#   node tools/test-game.mjs     # 对局状态机 / 胜利 / 笔记 / 复盘（11 项）
#   node tools/test-dom.mjs      # 模拟 DOM 跑完整交互：通关/历史/复盘/续玩/主题/笔记转正（20 项）
```

## 部署到 Cloudflare Pages

本项目是静态站点，无需构建步骤。推荐以下任一方式部署。

### 方式一：Dashboard 连接 GitHub（最省心，推荐）

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages** → **Create** → **Pages** → **连接到 Git**
2. 选择本仓库 `GuoSirius/sudoku`
3. 构建设置：
   - **Framework preset**：`None`
   - **Build command**：留空
   - **Output directory**：`.`（点号，表示仓库根目录）
4. 点击 **Save and Deploy**
5. 之后每次 `git push` 到 `main` 自动重新部署

### 方式二：wrangler CLI

```bash
# 首次需登录（浏览器授权）
npx wrangler login

# 部署（上传当前目录）
npm run deploy
# 等价于：npx wrangler pages deploy . --project-name=sudoku
```

部署完成后终端会输出 `*.pages.dev` 在线地址。

### 方式三：GitHub Actions 自动部署

仓库已包含 `.github/workflows/deploy.yml`，推送 `main` 即自动部署。需在仓库
**Settings → Secrets and variables → Actions** 中添加两个密钥：

- `CLOUDFLARE_API_TOKEN`：具有 `Cloudflare Pages` 编辑权限的 API Token
  （在 [API Tokens](https://dash.cloudflare.com/profile/api-tokens) 创建，权限选 `Account > Cloudflare Pages > Edit`）
- `CLOUDFLARE_ACCOUNT_ID`：Cloudflare 账户 ID（Dashboard 右侧栏获取）

## 安装为 App（PWA）

在支持的浏览器（Chrome / Edge / 安卓 Chrome / 桌面端）中打开站点后：

- 桌面：地址栏出现「安装」图标，或菜单 → **安装数独**
- 手机：浏览器菜单 → **添加到主屏幕**

安装后可像原生 App 一样全屏离线运行。

## 目录结构

```
sudoku/
├── index.html              # 页面骨架与各界面
├── css/styles.css          # 样式（明暗主题、响应式棋盘）
├── js/
│   ├── sudoku.js           # 数独引擎（生成/唯一解/冲突）
│   ├── storage.js          # localStorage 封装
│   ├── game.js             # 对局状态机与计时
│   ├── ui.js               # 棋盘渲染与高亮
│   ├── main.js             # 主控制器（路由/交互/历史/复盘/排行/设置）
│   └── pwa.js              # Service Worker 注册
├── manifest.webmanifest    # PWA 清单
├── sw.js                   # Service Worker（离线缓存）
├── icons/                  # 应用图标（SVG + PNG，由 tools/gen_icons.py 生成）
├── tools/                  # 自检脚本与本地服务器
│   ├── serve.mjs           # 零依赖静态服务器（npm run dev）
│   ├── gen_icons.py        # 生成 PWA 图标
│   ├── test-engine.mjs     # 引擎自检
│   ├── test-game.mjs       # 对局逻辑自检
│   └── test-dom.mjs        # DOM 交互冒烟测试
├── package.json            # 脚本（dev/test/deploy/gen:icons）
├── wrangler.toml           # Cloudflare Pages 配置
├── .github/workflows/      # 自动部署
└── .gitignore
```

## 数据说明

所有对局数据均保存在你当前浏览器中，不会上传到任何服务器。清除浏览器数据或换设备后记录不互通（这是「本地个人榜」的设计取舍，换来零后端、最简单稳定的部署）。

- **清除数据**：设置页 → 「清除全部本地数据」可一键删除当前对局、历史与排行榜（设置保留），操作不可恢复。
- 历史记录最多保留最近 200 局；排行榜展示各难度最佳成绩（前 10）。

## 可扩展方向

- **全球共享排行榜**：当前为本地个人榜。若需跨设备/跨玩家共享，可引入 Cloudflare D1 + Workers（同平台一体化，不增加额外服务商）。
- 每日挑战、错题本、提示次数限制等可在现有状态机与存储上直接扩展。
