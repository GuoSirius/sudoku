// 一键发布：自动 bump 版本号、同步到各端、提交、打 tag、推送。
// 用法：node tools/release.mjs [patch|minor|major]
// 默认 patch。执行前请确保 git 工作区干净且能正常 push。
import { execSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const level = process.argv[2] || 'patch';
if (!['patch', 'minor', 'major'].includes(level)) {
  console.error('Usage: node tools/release.mjs [patch|minor|major]');
  process.exit(1);
}

function run(cmd) {
  console.log(`> ${cmd}`);
  return execSync(cmd, { cwd: root, stdio: 'inherit' });
}

// 1. bump 根目录 package.json，但不自动打 tag（我们要等同步完再提交）
run(`npm version ${level} --no-git-tag-version`);

// 2. 读取新版本
const version = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version;
console.log(`\nReleasing v${version}...\n`);

// 3. 同步版本到所有产物
run('node tools/sync-version.mjs');

// 4. 提交并打 tag
run(`git add -A && git commit -m "chore(release): v${version}"`);
run(`git tag -a "v${version}" -m "v${version}"`);

// 5. 推送（分支 + tags）
run('git push origin HEAD --follow-tags');

console.log(`\n✓ 已发布 v${version} 并推送到 origin。`);
