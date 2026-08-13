# Changelog

所有版本的变更都按时间倒序记录于此。

## [1.0.0] - 2026-08-13

- feat: 老板伪装改 Vue 栈 + 版本号同步 + 摸鱼小窗美化 + 修复 Cloudflare 部署路径
- feat: add Tauri desktop shell + restructure web assets into web/
- fix: default boss lang to frontend, replace broken emoji with svg icon
- feat(stealth): 摸鱼伪装可选前端/PHP/Java/Python，伪装层升级为真实 IDE 外观
- feat(stealth): 摸鱼模式——迷你小窗 + 老板键一键伪装
- style(board): 重审并强化九宫格/底部输入行的状态配色与对比
- style(board): 移除固有格角标标记，保持灰底+深色粗体的简洁区分
- fix(board): 固有格在所有高亮态(同行/列/宫/选中)下始终可识别
- style(board): 修复移动端笔记溢出，优化固有/填入数字区分与视觉体验
- docs(supabase): 补充自定义 SMTP 完整填表指南
- fix(auth): 邮件模板改为显示验证码，重设计登录/OTP弹窗，清理项目遗留信息
- feat(app): 接入 Capacitor App 打包，关闭手机号，前端 OTP 位数对齐 Supabase 配置
- chore(auth): 关闭手机号登录（付费，暂不需要），更新 SETUP_GUIDE 为 OTP+PKCE 流程
- feat(auth): 邮箱/手机改为应用内 OTP 验证码，GitHub 改 PKCE，支持多方式切换
- ui(game): 主题切换移到游戏顶栏，对局中无需暂停即可切换；移除暂停菜单重复按钮
- docs(supabase): 简化 SETUP_GUIDE；ui(game): 暂停菜单增加一键切换主题
- ui(header): 简化顶栏：移除主题按钮、改透明图标、标题加网格logo；主题切换统一在设置页动态渲染
- feat(deploy): 支持从 .env 读取 SUPABASE_DB_URL，新增 .env.example 模板
- feat(deploy): 建表后自动登录自检；npm run deploy 串联先建表再发站点
- feat(tool): 新增 Supabase 表结构一键部署脚本 deploy:schema（pg 直连）
- chore(sync): 移除 GitHub 登录诊断日志，恢复干净代码
- debug(sync): 为 GitHub 登录加诊断日志（origin + OAuth URL）以定位跳线上问题
- ui(account): 账号图标换 SVG + 登录态绿点；登录弹窗补 GitHub 邮箱公开提示
- docs(supabase): 修正账号关联说明，补充自动合并与 GitHub 邮箱隐私坑
- docs(supabase): 补充 Redirect URLs 已加 localhost 仍跳线上的 GitHub 配置排查
- docs(supabase): 修正本地端口 5173→8137（tools/serve.mjs 默认 8137）
- docs(supabase): 补充 GitHub 从 localhost 登录跳回线上地址的排错
- docs(supabase): 补充代码已就绪后的验证步骤
- feat(sync): 接入 Supabase 跨设备同步（邮箱为主+可选GitHub）
- docs(supabase): 说明 localhost 与线上地址区别，示例改为 pages.dev
- docs(supabase): 澄清 Project URL 与回调地址的获取方式
- docs(supabase): 更新操作指南匹配新版 API Keys 控制台
- style(theme): 增强明暗主题下单元格状态对比度
- style(replay): 统一复盘左右步骤箭头为单箭头
- docs(supabase): 补认证方式对比（邮箱 vs GitHub）与邮箱为主/GitHub 可选方案
- docs(supabase): 新增建表 SQL 与 Supabase 接入操作指南（分支隔离，未改业务代码）
