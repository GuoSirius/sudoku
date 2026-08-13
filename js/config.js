// Supabase 接入配置（由用户从控制台提供）
// Publishable key 等同旧版 anon key，可安全放在前端。
export const SUPABASE_URL = 'https://oafefnbyzajzdejelhsw.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY =
  'sb_publishable_DwNlGJI9IOZWcs27Qm5TXw_zeYuFO_L';

// 登录方式：邮箱（魔法链接）默认开启；GitHub 为可选入口。
// 仅当 Supabase 后台已启用 GitHub provider 时才显示 GitHub 按钮，未启用也不影响邮箱登录。
export const ENABLE_GITHUB = true;
