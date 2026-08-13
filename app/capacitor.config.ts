import { CapacitorConfig } from '@capacitor/cli';

// 数独 App 的 Capacitor 配置
// - webDir: 由 sync.mjs 从仓库根目录同步而来（单一来源，避免双份维护）
// - androidScheme: 'https'：让安卓 WebView 源为 https://localhost，便于跨域 CORS 命中
const config: CapacitorConfig = {
  appId: 'cn.sudoku.game',
  appName: '数独',
  webDir: 'www',
  server: {
    androidScheme: 'https',
  },
};

export default config;
