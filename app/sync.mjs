// 同步脚本：把仓库根目录的静态 PWA 资源复制到 Capacitor 的 webDir（app/www/）。
// 前端只有这一份源文件，App / Web / Cloudflare 三端共用；改完前端只需重跑 `npm run sync`。
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..', 'web');
const www = resolve(__dirname, 'www');

if (existsSync(www)) rmSync(www, { recursive: true, force: true });
mkdirSync(www, { recursive: true });

// 需要同步进 App 的目录/文件（纯静态 PWA 的全部资源）
const items = ['index.html', 'css', 'js', 'icons', 'manifest.webmanifest', 'sw.js'];

for (const item of items) {
  const src = resolve(root, item);
  if (!existsSync(src)) {
    console.warn('skip missing:', item);
    continue;
  }
  cpSync(src, resolve(www, item), { recursive: true, force: true });
}

console.log('synced:', items.join(', '), '-> app/www/');
