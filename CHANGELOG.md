# Changelog

所有版本的变更都按时间倒序记录于此，每个版本下按提交类型分组展示。

## [1.0.2] - 2026-08-13

### Features

- 通关弹框点×默认跳转排行榜 ([b0277eb])
- 弹框/Toast 视觉重做、个人战绩统计、新增全球排行榜 ([03cd2cc])
- **release:** 分类 changelog + 自动更新 + 本地回落提示 + 多项修复 ([87f188a])

### Bug Fixes

- 弹框改为仅按钮/叉叉关闭，移除遮罩点击关闭 ([ad2da3d])
- 修复 Android 缺 www 与 Tauri MSI 构建，新增排行榜难度分/综合分排名 ([7302571])

## [1.0.1] - 2026-08-13

### Features

- **release:** 通关看排行 + 设置开小窗 + Tauri 线上优先 + 交互式发布 + GitHub Actions ([4cc9ce3])
- 老板伪装改 Vue 栈 + 版本号同步 + 摸鱼小窗美化 + 修复 Cloudflare 部署路径 ([2c520bc])
- Add Tauri desktop shell + restructure web assets into web/ ([af7c776])
- **stealth:** 摸鱼伪装可选前端/PHP/Java/Python，伪装层升级为真实 IDE 外观 ([944a4f1])
- **stealth:** 摸鱼模式——迷你小窗 + 老板键一键伪装 ([ad0fb1a])
- **app:** 接入 Capacitor App 打包，关闭手机号，前端 OTP 位数对齐 Supabase 配置 ([548fd42])
- **auth:** 邮箱/手机改为应用内 OTP 验证码，GitHub 改 PKCE，支持多方式切换 ([80405c2])
- **deploy:** 支持从 .env 读取 SUPABASE_DB_URL，新增 .env.example 模板 ([11ac7de])
- **deploy:** 建表后自动登录自检；npm run deploy 串联先建表再发站点 ([e5db3f2])
- **tool:** 新增 Supabase 表结构一键部署脚本 deploy:schema（pg 直连）([94111c0])
- **sync:** 接入 Supabase 跨设备同步（邮箱为主+可选GitHub）([6f34cb5])

### Bug Fixes

- **tauri:** clone online_url before move into spawn_blocking closure ([925190e])
- Default boss lang to frontend, replace broken emoji with svg icon ([f76c97a])
- **board:** 固有格在所有高亮态(同行/列/宫/选中)下始终可识别 ([cdb3d72])
- **auth:** 邮件模板改为显示验证码，重设计登录/OTP弹窗，清理项目遗留信息 ([548fd42])

### UI

- **game:** 主题切换移到游戏顶栏，对局中无需暂停即可切换；移除暂停菜单重复按钮 ([21136c2])
- **header:** 简化顶栏：移除主题按钮、改透明图标、标题加网格logo；主题切换统一在设置页动态渲染 ([3b0b57b])
- **account:** 账号图标换 SVG + 登录态绿点；登录弹窗补 GitHub 邮箱公开提示 ([b8185ff])

### Styles

- **board:** 重审并强化九宫格/底部输入行的状态配色与对比 ([3b0b57b])
- **board:** 移除固有格角标标记，保持灰底+深色粗体的简洁区分 ([40b80bd])
- **board:** 修复移动端笔记溢出，优化固有/填入数字区分与视觉体验 ([21136c2])
- **theme:** 增强明暗主题下单元格状态对比度 ([d089838])
- **replay:** 统一复盘左右步骤箭头为单箭头 ([fd251d4])

### Documentation

- **supabase:** 补充自定义 SMTP 完整填表指南 ([3d5465d])
- **supabase:** 简化 SETUP_GUIDE；ui(game): 暂停菜单增加一键切换主题 ([21136c2])
- **supabase:** 修正账号关联说明，补充自动合并与 GitHub 邮箱隐私坑 ([a24048b])
- **supabase:** 补充 Redirect URLs 已加 localhost 仍跳线上的 GitHub 配置排查 ([05c2354])
- **supabase:** 修正本地端口 5173→8137（tools/serve.mjs 默认 8137）([b5109b])
- **supabase:** 补充 GitHub 从 localhost 登录跳回线上地址的排错 ([8d9280c])
- **supabase:** 补充代码已就绪后的验证步骤 ([8e4aa75])
- **supabase:** 说明 localhost 与线上地址区别，示例改为 pages.dev ([699d5ae])
- **supabase:** 澄清 Project URL 与回调地址的获取方式 ([590df46])
- **supabase:** 更新操作指南匹配新版 API Keys 控制台 ([c53519f])
- **supabase:** 补认证方式对比（邮箱 vs GitHub）与邮箱为主/GitHub 可选方案 ([6a4f626])
- **supabase:** 新增建表 SQL 与 Supabase 接入操作指南（分支隔离，未改业务代码）([04deadd])

### Chores

- **auth:** 关闭手机号登录（付费，暂不需要），更新 SETUP_GUIDE 为 OTP+PKCE 流程 ([80405c2])
- **sync:** 移除 GitHub 登录诊断日志，恢复干净代码 ([ae6b951])

### Other

- **debug:** 为 GitHub 登录加诊断日志（origin + OAuth URL）以定位跳线上问题 ([05c2354])

## [1.0.0] - 2026-08-13

### Features

- **input:** 统一输入模型 wantNote=笔记模式||Ctrl，数字盘单击按模式决定回填/记候选 ([59105b7])
- **input:** 单元格候选单击切换、双击填入（与数字盘一致）([7a6ce4d])
- **input:** 数字盘单击记候选、双击填入；PC 端 Ctrl 组合键记候选 ([abecd70])
- **history:** 未完成记录支持「继续」续玩 + 「复盘」区分 ([94eec04])
- 错误提示改为不泄题设计（仅冲突高亮 + 手动检查 + 设置开关）([a24048b])
- 暂停改为非阻塞，可后台保留进度 ([37ae2ad])
- 刷新/重开时恢复上次停留页面（含进行中对局恢复，暂停态保持暂停）；切页持久化 ([e5db3f2])
- 点击笔记小数字直接升级为正式填入值（笔记转正），免去切模式重填；补 DOM 断言（20 项）([75fd3db])
- 默认暗黑主题（存储默认值+首屏预渲染同步）；确认无对局时隐藏「继续」按钮并补断言 ([699d5ae])
- PWA 支持（manifest + service worker 离线缓存 + 图标）([94111c0])
- 界面与交互（页面骨架/样式/棋盘渲染/主控制器/历史/复盘/排行/设置）([6f34cb5])
- 游戏状态机与计时（新建/落子/笔记/提示/胜负/复盘序列）([f90bed3])
- 本地存储模块（设置/当前局/历史/排行榜，localStorage 封装）([6a4f626])
- 数独引擎（生成/唯一解/冲突检测/四档难度）+ 自检脚本 ([04deadd])

### Bug Fixes

- **history:** 续玩未完成记录完成后原地更新，不再生成重复记录 ([6f1bf6d])
- 游戏底部工具栏因新增「检查」按钮导致 4 个按钮挤在 3 列网格里 ([b9ef636])
- 刷新恢复时历史/排行榜/设置页数据不渲染 ([6f21d99])
- 通关弹窗点「查看复盘」时关闭弹框 ([d089838])
- 移除指向不存在元素 btn-save-exit 的 onclick 绑定（init 崩溃根因）([b8185ff])
- sw.js 静态资源改网络优先（在线始终拉最新代码），升级缓存版本号，修复旧 SW 卡死旧 main.js 导致新功能不生效；补刷新恢复专项测试（5 项）([5f0d500])
- 撤销自动填入——未选格按数字键仅提示「请先选择一个格子」不填入，避免误填 ([11ac7de])
- 未选中格子时按数字键自动选中首个空格并填入，消除 PC 键盘「无反应」死角；键盘行为锁入 DOM 测试（25 项）([8e4aa75])
- 笔记删除交互改为模式感知（笔记模式点候选=删除，普通模式点候选=转正）；补充双模式断言（22 项）([fb2174e])
- 笔记数字改成居中九宫格样式，字号调大加粗并强制居中对齐 ([590df46])
- 主题类改挂根元素<html>，修复深色模式整页背景/外层仍白底的错乱；加<head>预渲染脚本消除刷新闪烁；补主题切换断言 ([a0d1336])
- 补接游戏内「保存并退出」按钮事件；新增 DOM 交互冒烟测试（通关/历史/复盘/笔记/续玩）([c53519f])

### Documentation

- README 补键盘「未选格自动选首个空格填入」说明 ([8d9280c])
- 完善 .gitignore（补充 Python/构建/部署缓存/密钥/日志；修正行内注释导致规则失效）与 README（快捷键、脚本表、清除数据、目录结构、可扩展方向）；npm test 纳入 DOM 测试 ([5b5109b])
- Cloudflare Pages 部署流程与脚本（Dashboard/wrangler/GitHub Actions）([fd251d4])

### Chores

- 移除误提交的临时提交信息文件 ([05c2354])
