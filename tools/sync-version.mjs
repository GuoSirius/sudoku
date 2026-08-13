// 以根目录 package.json 的 version 为唯一来源，把版本号同步到所有产物/配置文件。
// 用法：node tools/sync-version.mjs [optional-version]
// 不传参数时自动读取 package.json。主要用于 release 脚本或本地手动同步。
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const version = process.argv[2]?.trim() || JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version;
const buildDate = new Date().toISOString().slice(0, 10);

let commit = '';
try {
  commit = execSync('git rev-parse --short HEAD', { cwd: root, encoding: 'utf8' }).trim();
} catch {
  commit = 'unknown';
}

console.log(`Syncing version ${version} (commit ${commit}, date ${buildDate})...`);

// 1. 前端运行时可直接引用的版本模块
const versionJs =
  `// 由 tools/sync-version.mjs 自动生成，请勿手动修改\n` +
  `export const VERSION = '${version}';\n` +
  `export const BUILD_DATE = '${buildDate}';\n` +
  `export const COMMIT = '${commit}';\n`;
await writeFile(join(root, 'web', 'js', 'version.js'), versionJs, 'utf8');

// 2. Tauri 桌面壳
const tauriConfPath = join(root, 'src-tauri', 'tauri.conf.json');
if (existsSync(tauriConfPath)) {
  const tauriConf = JSON.parse(await readFile(tauriConfPath, 'utf8'));
  tauriConf.version = version;
  tauriConf.productName = tauriConf.productName || 'Sudoku';
  await writeFile(tauriConfPath, JSON.stringify(tauriConf, null, 2) + '\n', 'utf8');
}

// 3. Capacitor App
const appPkgPath = join(root, 'app', 'package.json');
if (existsSync(appPkgPath)) {
  const appPkg = JSON.parse(await readFile(appPkgPath, 'utf8'));
  appPkg.version = version;
  await writeFile(appPkgPath, JSON.stringify(appPkg, null, 2) + '\n', 'utf8');
}

// 4. PWA manifest 自定义 version 字段（浏览器安装时不会显示，但便于调试和同步）
const manifestPath = join(root, 'web', 'manifest.webmanifest');
if (existsSync(manifestPath)) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.version = version;
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
}

console.log(`✓ 版本同步完成：${version}`);
