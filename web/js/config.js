// Supabase 接入配置（由用户从控制台提供）
// Publishable key 等同旧版 anon key，可安全放在前端。
export const SUPABASE_URL = 'https://oafefnbyzajzdejelhsw.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY =
  'sb_publishable_DwNlGJI9IOZWcs27Qm5TXw_zeYuFO_L';

// 登录方式：邮箱 走应用内 OTP 验证码（免密码、不依赖邮件链接，PWA/原生通用）；GitHub 为可选入口（PKCE）。
// - 邮箱：SignInWithOtp + verifyOtp，全程在应用内完成，规避 iOS PWA 点链接丢会话的问题。
// - GitHub：signInWithOAuth（flowType: pkce），授权后回跳 redirectTo，三端共用。
// 仅当 Supabase 后台已启用对应 provider 才显示对应按钮，未启用不影响其它登录方式。
export const ENABLE_GITHUB = true;
// 手机号登录：默认关闭。开启需在 Supabase 后台启用 Phone Auth 并接入 SMS 服务商（Twilio 等，按条计费）。
// 因付费暂不使用，代码保留但休眠；后续如需可改为 true 并配置 SMS 服务商即可启用。
export const ENABLE_PHONE = false;

// 邮箱验证码位数，需与 Supabase 后台 Authentication → Email → Email OTP length 保持一致（默认 6）。
export const OTP_LENGTH = 6;
