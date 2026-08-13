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

// 全局复用的 readline 接口 + 行队列：避免「每次提问新建/关闭接口」导致 stdin 暂停、
// 以及缓冲输入在下一题监听器注册前被丢弃而中断流程的问题。
let _rl = null;
let _lineQueue = [];
let _lineWaiter = null;

function ensureRl() {
  if (_rl) return _rl;
  _rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  _rl.on('line', (l) => {
    if (_lineWaiter) {
      const w = _lineWaiter;
      _lineWaiter = null;
      w(l);
    } else {
      _lineQueue.push(l);
    }
  });
  // stdin 结束（EOF / 管道关闭）时，若仍在等待输入则放行，避免静默挂起
  _rl.on('close', () => {
    if (_lineWaiter) {
      const w = _lineWaiter;
      _lineWaiter = null;
      w('');
    }
  });
  return _rl;
}

function question(q) {
  ensureRl();
  process.stdout.write(q);
  return new Promise((resolve) => {
    if (_lineQueue.length) {
      resolve(_lineQueue.shift());
    } else {
      _lineWaiter = resolve;
    }
  });
}

function closeRl() {
  if (_rl) {
    _rl.close();
    _rl = null;
  }
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
  console.log(`\n当前版本：${current}`);

  // 非交互终端（管道 / CI）降级为编号输入，避免 raw mode 不可用导致卡死
  if (!process.stdin.isTTY) {
    console.log('请选择发布类型：');
    options.forEach((o, i) => {
      console.log(`  ${i + 1}) ${o.label.padEnd(6)} ${current} → ${o.next}`);
    });
    const ans = (await question('输入 1/2/3（直接回车默认 1=patch）：'))
      .trim()
      .toLowerCase();
    if (ans === '2' || ans === 'minor') return 'minor';
    if (ans === '3' || ans === 'major') return 'major';
    return 'patch';
  }

  // 交互终端：↑/↓ 切换，Enter 确认（raw mode 监听按键）
  console.log('请选择发布类型（↑/↓ 切换，Enter 确认）：');
  for (let i = 0; i < options.length; i++) {
    process.stdout.write(`  ${options[i].label.padEnd(6)} ${current} → ${options[i].next}\n`);
  }
  let idx = 0;
  function draw() {
    process.stdout.write('\x1B[3A'); // 上移 3 行回到选项区
    for (let i = 0; i < options.length; i++) {
      process.stdout.write('\x1B[K'); // 清除整行
      const sel = i === idx;
      const arrow = sel ? '\x1B[36m▶ \x1B[0m' : '  ';
      const tag = sel ? '\x1B[1m' : '';
      const reset = sel ? '\x1B[0m' : '';
      process.stdout.write(`${arrow}${tag}${options[i].label.padEnd(6)}${reset} ${current} → ${options[i].next}\n`);
    }
  }
  draw();
  return new Promise((resolve) => {
    function cleanup() {
      process.stdin.setRawMode(false);
      process.stdin.off('data', onKey);
      process.stdin.pause();
    }
    function onKey(buf) {
      const s = buf.toString();
      if (s === '\x1B[A') {
        idx = (idx - 1 + options.length) % options.length;
        draw();
      } else if (s === '\x1B[B') {
        idx = (idx + 1) % options.length;
        draw();
      } else if (s === '\r' || s === '\n') {
        cleanup();
        resolve(options[idx].label);
      } else if (s === '\x03') {
        cleanup();
        process.exit(0);
      }
    }
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', onKey);
  });
}

async function confirmRelease(version) {
  const ans = await question(`确认发布 v${version}？（Y/n，直接回车即发布）：`);
  return ans.trim().toLowerCase() !== 'n';
}

const TYPE_ORDER = [
  { key: 'feat', title: 'Features' },
  { key: 'fix', title: 'Bug Fixes' },
  { key: 'ui', title: 'UI' },
  { key: 'perf', title: 'Performance Improvements' },
  { key: 'refactor', title: 'Code Refactoring' },
  { key: 'style', title: 'Styles' },
  { key: 'test', title: 'Tests' },
  { key: 'build', title: 'Build System' },
  { key: 'ci', title: 'CI/CD' },
  { key: 'chore', title: 'Chores' },
  { key: 'docs', title: 'Documentation' },
];

function parseCommit(line) {
  const hash = line.slice(0, 7);
  const subject = line.slice(8).trim();
  const match = subject.match(/^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/);
  if (!match) {
    return { type: 'other', scope: '', subject, hash, breaking: false };
  }
  const type = match[1].toLowerCase();
  const scope = match[2] || '';
  const breaking = match[3] === '!';
  return { type, scope, subject: match[4], hash, breaking };
}

function groupCommits(lines) {
  const groups = {};
  const other = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const c = parseCommit(line);
    if (c.type === 'other') {
      other.push(c);
      continue;
    }
    groups[c.type] = groups[c.type] || [];
    groups[c.type].push(c);
  }
  return { groups, other };
}

function formatCommit(c) {
  const scope = c.scope ? `**${c.scope}:** ` : '';
  const marker = c.breaking ? '⚠️ ' : '';
  return `- ${marker}${scope}${c.subject} ([${c.hash}])`;
}

function buildSection(version, date, rawLines) {
  const { groups, other } = groupCommits(rawLines);
  let md = `## [${version}] - ${date}\n\n`;

  const ordered = TYPE_ORDER.filter((t) => groups[t.key] && groups[t.key].length);
  for (const t of ordered) {
    md += `### ${t.title}\n\n`;
    for (const c of groups[t.key]) {
      md += formatCommit(c) + '\n';
    }
    md += '\n';
  }

  if (other.length) {
    md += '### Other\n\n';
    for (const c of other) {
      md += formatCommit(c) + '\n';
    }
    md += '\n';
  }

  return md.trimEnd() + '\n';
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
    logs = run(`git log ${range} --pretty=format:"%h %s"`, { inherit: false }).trim();
  } catch {
    logs = '';
  }
  const date = new Date().toISOString().slice(0, 10);
  const lines = logs ? logs.split('\n') : [];
  if (!lines.length) {
    lines.push(`${'0'.repeat(7)} chore(release): 版本发布`);
  }
  const section = buildSection(version, date, lines);

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
  try {
    console.log('=== 数独 Sudoku 交互式发布 ===\n');

    console.log('① 运行自测...\n');
    run('npm test');

    // 先选版本（raw mode 箭头切换），再跑 readline 提问，避免两种 stdin 模式互相打架导致流程中断
    const pkg = await readPkg();
    const current = pkg.version;
    const level = await selectVersion(current);

    await promptCommit();

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
      return;
    }

    console.log('\n⑤ 提交、打 tag、推送...');
    run('git add -A');
    run(`git commit -m "chore(release): v${version}"`);
    run(`git tag -a "v${version}" -m "v${version}"`);
    run('git push origin HEAD --follow-tags');

    console.log(`\n✓ 已发布 v${version} 并推送到 origin。`);
  } finally {
    closeRl();
  }
}

main().catch((e) => {
  console.error('\n✗ 发布失败：', e.message);
  process.exit(1);
});
