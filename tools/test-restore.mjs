// 刷新恢复专项：预置「进行中对局 + 停留在游戏页」，验证 init 后能恢复到游戏页
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
      toggle: (c, f) => {
        if (f === undefined) s.has(c) ? s.delete(c) : s.add(c);
        else f ? s.add(c) : s.delete(c);
        return s.has(c);
      },
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

const { makePuzzle } = await import('../web/js/sudoku.js');
const { puzzle, solution } = makePuzzle('easy');
const cur = {
  id: 'g-restore',
  puzzle,
  solution,
  cells: puzzle.slice(),
  notes: Array.from({ length: 81 }, () => []),
  difficulty: 'easy',
  elapsedMs: 5000,
  mistakes: 0,
  status: 'paused',
  createdAt: Date.now(),
  moves: [],
  hintsUsed: 0,
};
store['sudoku:current'] = JSON.stringify(cur);
store['sudoku:screen'] = 'game'; // 上次停留在游戏页

let pass = 0, fail = 0;
const assert = (c, m) => (c ? pass++ : (fail++, console.error('  ✗', m)));

await import('../web/js/main.js');

assert(!elements['screen-game'].classList.contains('hidden'), '刷新后停留在游戏页');
assert(elements['screen-menu'].classList.contains('hidden'), '刷新后不在首页');
assert(elements['board'].children.length === 81, '游戏棋盘已渲染（81 格）');
assert(!elements['pause-overlay'].classList.contains('hidden'), '暂停态刷新后保留暂停遮罩');
assert(elements['game-difficulty'].textContent === '简单', '恢复的对局难度正确');

console.log(`\n刷新恢复专项: ${pass} 通过, ${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
