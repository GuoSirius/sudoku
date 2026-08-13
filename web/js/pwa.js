// PWA：注册 Service Worker，实现应用壳离线缓存
export function registerPWA() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('sw.js')
      .then(() => console.log('[PWA] service worker 已注册'))
      .catch((e) => console.warn('[PWA] 注册失败', e));
  });
}
