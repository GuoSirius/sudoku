// 刷新后页面停留专项：覆盖 玩法指南 / 复盘 / 从游戏进指南刷新后返回 三种场景
// 由于 main.js 在 import 时即自执行 init（加载即恢复），每个场景需独立进程，故用子进程分发。
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const SCENARIOS = ['guide', 'replay', 'guide-from-game'];

// 非 worker：作为调度器，逐场景派生子进程运行本文件（WORKER=1）
if (!process.env.WORKER) {
  let fail = 0;
  for (const sc of SCENARIOS) {
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
      env: { ...process.env, WORKER: '1', SCENARIO: sc },
      cwd: root,
      encoding: 'utf8',
    });
    const out = (r.stdout || '').toString().trim();
    const err = (r.stderr || '').toString().trim();
    if (r.status !== 0) {
      console.error(`✗ 场景「${sc}」失败 (exit ${r.status})\n${err || out}`);
      fail++;
    } else {
      console.log(out);
    }
  }
  console.log(fail ? `\n页面停留测试：存在失败` : `\n页面停留测试：${SCENARIOS.length} 场景全部通过`);
  process.exit(fail > 0 ? 1 : 0);
}

// ---------------- worker：搭建 DOM/localStorage mock 并验证单个场景 ----------------
class El {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this._listeners = {};
    this._classes = new Set();
    this._text = '';
    this._html = '';
    this.dataset = {};
    this._onclick = null;
  }
  get classList() {
    const s = this._classes;
    return {
      add: (...c) => c.forEach((x) => s.add(x)),
      remove: (...c) => c.forEach((x) => s.delete(x)),
      toggle: (c, f) => { if (f === undefined) s.has(c) ? s.delete(c) : s.add(c); else f ? s.add(c) : s.delete(c); return s.has(c); },
      contains: (c) => s.has(c),
    };
  }
  set className(v) { this._classes = new Set(String(v).split(/\s+/).filter(Boolean)); }
  get className() { return [...this._classes].join(' '); }
  set textContent(v) { this._text = String(v); this.children = []; }
  get textContent() { return this._text; }
  set innerHTML(v) { this._html = String(v); this.children = []; }
  get innerHTML() { return this._html; }
  appendChild(c) { this.children.push(c); c.parent = this; return c; }
  addEventListener(t, fn) { (this._listeners[t] = this._listeners[t] || []).push(fn); }
  set onclick(fn) { this._onclick = fn; }
  get onclick() { return this._onclick; }
  click() { const ev = { stopPropagation() {} }; (this._listeners['click'] || []).forEach((f) => f(ev)); if (this._onclick) this._onclick(ev); }
  querySelectorAll(sel) { if (sel === '.seg-btn') return findAll(this, 'seg-btn'); return []; }
}
function findAll(root, cls, out = []) {
  for (const c of root.children) { if (c._classes.has(cls)) out.push(c); findAll(c, cls, out); }
  return out;
}
const elements = {};
const docListeners = {};
globalThis.document = {
  documentElement: new El('html'),
  getElementById(id) { return elements[id] || (elements[id] = new El('div')); },
  createElement(tag) { return new El(tag); },
  addEventListener(t, fn) { (docListeners[t] = docListeners[t] || []).push(fn); },
};
const store = {};
globalThis.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};
globalThis.window = { matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }), addEventListener() {}, location: {} };
globalThis.location = { search: '' };

const scenario = process.env.SCENARIO;
const { makePuzzle } = await import('../web/js/sudoku.js');

if (scenario === 'guide') {
  store['sudoku:screen'] = 'guide';
  store['sudoku:guideReturn'] = 'menu';
} else if (scenario === 'guide-from-game') {
  const { puzzle, solution } = makePuzzle('easy');
  const cur = {
    id: 'g-guide', puzzle, solution, cells: puzzle.slice(),
    notes: Array.from({ length: 81 }, () => []),
    difficulty: 'easy', elapsedMs: 8000, mistakes: 0, status: 'playing',
    createdAt: Date.now(), moves: [], hintsUsed: 0,
  };
  store['sudoku:current'] = JSON.stringify(cur);
  store['sudoku:screen'] = 'guide';
  store['sudoku:guideReturn'] = 'game';
} else if (scenario === 'replay') {
  const { puzzle, solution } = makePuzzle('easy');
  const rec = {
    id: 'seed-1', difficulty: 'easy', durationMs: 123000, mistakes: 0,
    hintsUsed: 0, won: true, date: Date.now(), puzzle, solution, moves: [],
  };
  store['sudoku:history'] = JSON.stringify([rec]);
  store['sudoku:screen'] = 'replay';
  store['sudoku:replayId'] = 'seed-1';
}

let pass = 0, fail = 0;
const assert = (c, m) => (c ? pass++ : (fail++, console.error('  ✗', m)));

try {
  await import('../web/js/main.js');
} catch (e) {
  console.error(`  ✗ 加载 main.js 抛出异常:`, e);
  process.exit(1);
}

if (scenario === 'guide' || scenario === 'guide-from-game') {
  assert(!elements['screen-guide'].classList.contains('hidden'), '刷新后停留在玩法指南页');
  assert(elements['screen-menu'].classList.contains('hidden'), '刷新后不在首页');
  assert(elements['guide-tech-list'].children.length === 10, '指南已渲染 10 张技巧卡（L0–L9）');
}
if (scenario === 'guide-from-game') {
  // 从指南返回应回到游戏并恢复棋盘（验证进行中对局上下文已载入）
  elements['btn-guide-back'].click();
  assert(!elements['screen-game'].classList.contains('hidden'), '从指南返回后停留在游戏页');
  assert(elements['board'].children.length === 81, '返回游戏后棋盘已恢复（81 格）');
}
if (scenario === 'replay') {
  assert(!elements['screen-replay'].classList.contains('hidden'), '刷新后停留在复盘页');
  assert(elements['screen-menu'].classList.contains('hidden'), '刷新后不在首页');
  assert(elements['replay-board'].children.length === 81, '复盘棋盘已渲染（81 格）');
  assert(/0 \//.test(elements['replay-step'].textContent), '复盘进度文本已渲染');
}

console.log(`场景「${scenario}」: ${pass} 通过, ${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
