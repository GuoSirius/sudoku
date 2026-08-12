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
- 🌗 **明暗主题**：跟随系统 / 浅色 / 深色

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

# 运行自检
npm test
```

打开浏览器访问对应地址即可游玩。**注意**：PWA 安装与 Service Worker 需要以 `http://` 或 `https://` 访问（`file://` 直接打开不可用）。

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
├── icons/                  # 应用图标（SVG + PNG）
├── tools/                  # 自检脚本与本地服务器
├── wrangler.toml           # Cloudflare Pages 配置
└── .github/workflows/      # 自动部署
```

## 数据说明

所有对局数据均保存在你当前浏览器中，不会上传到任何服务器。清除浏览器数据或换设备后记录不互通（这是「本地个人榜」的设计取舍，换来零后端、最简单稳定的部署）。
