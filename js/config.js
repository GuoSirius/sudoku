// Supabase 接入配置（由用户从控制台提供）
// Publishable key 等同旧版 anon key，可安全放在前端。
export const SUPABASE_URL = 'https://oafefnbyzajzdejelhsw.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY =
  'sb_publishable_DwNlGJI9IOZWcs27Qm5TXw_zeYuFO_L';

// 登录方式：邮箱 / 手机 走应用内 OTP 验证码（免密码、不依赖邮件链接，PWA/原生通用）；GitHub 为可选入口（PKCE）。
// - 邮箱 / 手机：SignInWithOtp + verifyOtp，全程在应用内完成，规避 iOS PWA 点链接丢会话的问题。
// - GitHub：signInWithOAuth（flowType: pkce），授权后回跳 redirectTo，三端共用。
// 仅当 Supabase 后台已启用对应 provider 才显示对应按钮，未启用不影响其它登录方式。
export const ENABLE_GITHUB = true;
// 手机号登录：需在 Supabase 后台开启 Phone Auth 并接入 SMS 服务商（Twilio 等，按条计费）。未配置时发送会报错，不影响邮箱/GitHub。
export const ENABLE_PHONE = true;
