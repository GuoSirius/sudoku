// 交互式一键发布：自测 → 提交未提交改动 → 选择版本 → 同步版本号 → 生成 changelog → 提交 → 打 tag → 推送。
// 用法：npm run release
import { execSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import readline from 'node:readline';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function run(cmd, { inherit = true } = {}) {
  console.log(`> ${cmd}`);
  return execSync(cmd, { cwd: root, stdio: inherit ? 'inherit' : 'pipe', encoding: 'utf8' });
}

async function readPkg() {
  return JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
}

function bumpVersion(version, level) {
  const [major, minor, patch] = version.split('.').map(Number);
  if (level === 'major') return `${major + 1}.0.0`;
  if (level === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

function question(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) =>
    rl.question(q, (ans) => {
      rl.close();
      resolve(ans);
    })
  );
}

async function promptCommit() {
  const dirty = run('git status --porcelain', { inherit: false }).trim();
  if (!dirty) {
    console.log('✓ 工作区干净，无未提交改动。\n');
    return;
  }
  console.log('发现未提交改动：');
  console.log(dirty);
  const msg = await question('\n请输入提交信息（直接回车则跳过提交）：');
  if (msg.trim()) {
    run('git add -A');
    run(`git commit -m ${JSON.stringify(msg.trim())}`);
  }
}

async function selectVersion(current) {
  const options = [
    { label: 'patch', next: bumpVersion(current, 'patch') },
    { label: 'minor', next: bumpVersion(current, 'minor') },
    { label: 'major', next: bumpVersion(current, 'major') },
  ];
  let idx = 0;

  return new Promise((resolve, reject) => {
    const draw = () => {
      console.log('\x1b[2J\x1b[0;0H'); // 清屏
      console.log(`当前版本：${current}`);
      console.log('请选择发布类型（↑↓ 切换，Enter 确认，Esc/q 取消）：\n');
      options.forEach((o, i) => {
        const marker = i === idx ? '> ' : '  ';
        console.log(`${marker}${o.label.padEnd(6)} ${current} → ${o.next}`);
      });
    };

    const cleanup = () => {
      process.stdin.removeListener('keypress', onKey);
      process.stdin.setRawMode(false);
      console.log('');
    };

    const onKey = (str, key) => {
      if (!key) return;
      if (key.name === 'up') {
        idx = (idx - 1 + options.length) % options.length;
      } else if (key.name === 'down') {
        idx = (idx + 1) % options.length;
      } else if (key.name === 'return') {
        cleanup();
        resolve(options[idx].label);
        return;
      } else if (key.name === 'escape' || key.name === 'q') {
        cleanup();
        reject(new Error('用户取消了发布'));
        return;
      }
      draw();
    };

    process.stdin.setRawMode(true);
    readline.emitKeypressEvents(process.stdin);
    process.stdin.on('keypress', onKey);
    draw();
  });
}

async function confirmRelease(version) {
  const ans = await question(`确认发布 v${version}？（y/N）：`);
  return ans.trim().toLowerCase() === 'y';
}

async function appendChangelog(version) {
  let lastTag = '';
  try {
    lastTag = run('git describe --tags --abbrev=0', { inherit: false }).trim();
  } catch {
    lastTag = '';
  }
  const range = lastTag ? `${lastTag}..HEAD` : 'HEAD';
  let logs = '';
  try {
    logs = run(`git log ${range} --pretty=format:"- %s"`, { inherit: false }).trim();
  } catch {
    logs = '';
  }
  const date = new Date().toISOString().slice(0, 10);
  const section = `## [${version}] - ${date}\n\n${logs || '- chore(release): 版本发布'}\n`;

  const file = join(root, 'CHANGELOG.md');
  let content = '# Changelog\n\n';
  if (existsSync(file)) {
    content = await readFile(file, 'utf8');
  }
  const insertAt = content.indexOf('## ');
  if (insertAt >= 0) {
    content = content.slice(0, insertAt) + section + '\n' + content.slice(insertAt);
  } else {
    content = content.trimEnd() + '\n\n' + section + '\n';
  }
  await writeFile(file, content, 'utf8');
  return section;
}

async function main() {
  console.log('=== 数独 Sudoku 交互式发布 ===\n');

  console.log('① 运行自测...\n');
  run('npm test');

  await promptCommit();

  const pkg = await readPkg();
  const current = pkg.version;
  const level = await selectVersion(current);

  console.log(`\n② bump 版本号（${level}）...`);
  run(`npm version ${level} --no-git-tag-version`);
  const { version } = await readPkg();

  console.log('\n③ 同步版本号到各端...');
  run('node tools/sync-version.mjs');

  console.log(`\n④ 生成 v${version} 的 changelog...`);
  const section = await appendChangelog(version);
  console.log('\n--- 本次 changelog ---');
  console.log(section);
  console.log('----------------------\n');

  if (!(await confirmRelease(version))) {
    console.log('已取消发布。');
    process.exit(0);
  }

  console.log('\n⑤ 提交、打 tag、推送...');
  run('git add -A');
  run(`git commit -m "chore(release): v${version}"`);
  run(`git tag -a "v${version}" -m "v${version}"`);
  run('git push origin HEAD --follow-tags');

  console.log(`\n✓ 已发布 v${version} 并推送到 origin。`);
}

main().catch((e) => {
  console.error('\n✗ 发布失败：', e.message);
  process.exit(1);
});
