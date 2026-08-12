// DOM 冒烟测试：用极简 DOM 模拟在 Node 中真实运行 main.js 的完整交互流程
// 验证：初始化无异常、UI 落子可通关、历史记录、复盘、笔记、暂存续玩

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
  set className(v) {
    this._classes = new Set(String(v).split(/\s+/).filter(Boolean));
  }
  get className() {
    return [...this._classes].join(' ');
  }
  set textContent(v) {
    this._text = String(v);
    this.children = [];
  }
  get textContent() {
    return this._text;
  }
  set innerHTML(v) {
    this._html = String(v);
    this.children = [];
  }
  get innerHTML() {
    return this._html;
  }
  appendChild(c) {
    this.children.push(c);
    c.parent = this;
    return c;
  }
  addEventListener(t, fn) {
    (this._listeners[t] = this._listeners[t] || []).push(fn);
  }
  set onclick(fn) {
    this._onclick = fn;
  }
  get onclick() {
    return this._onclick;
  }
  click() {
    const ev = { stopPropagation() {} };
    (this._listeners['click'] || []).forEach((f) => f(ev));
    if (this._onclick) this._onclick(ev);
  }
  querySelectorAll(sel) {
    if (sel === '.seg-btn') return findAll(this, 'seg-btn');
    return [];
  }
}

function findAll(root, cls, out = []) {
  for (const c of root.children) {
    if (c._classes.has(cls)) out.push(c);
    findAll(c, cls, out);
  }
  return out;
}

const elements = {};
const docListeners = {};
globalThis.document = {
  documentElement: new El('html'),
  getElementById(id) {
    return elements[id] || (elements[id] = new El('div'));
  },
  createElement(tag) {
    return new El(tag);
  },
  addEventListener(t, fn) {
    (docListeners[t] = docListeners[t] || []).push(fn);
  },
};
const store = {};
globalThis.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => {
    store[k] = String(v);
  },
  removeItem: (k) => {
    delete store[k];
  },
};
globalThis.window = {
  matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
  addEventListener() {},
  location: {},
};

let pass = 0;
let fail = 0;
const assert = (c, m) => (c ? pass++ : (fail++, console.error('  ✗', m)));

// 模拟向 document 派发 keydown（复用 main.js 注册的监听器）
function dispatchKey(key) {
  const ev = { key, preventDefault() {} };
  (docListeners['keydown'] || []).forEach((f) => f(ev));
}

// 加载应用（init 会自执行）
await import('../js/main.js');
assert(true, 'init 无异常');

// 默认应为暗黑主题
assert(
  document.documentElement.classList.contains('theme-dark'),
  '默认主题为暗黑（<html> 带 theme-dark）'
);
// 无进行中对局时，「继续游戏」按钮应默认隐藏
assert(
  elements['btn-resume'].classList.contains('hidden'),
  '无进行中对局时「继续游戏」按钮隐藏'
);

const cur = () => JSON.parse(localStorage.getItem('sudoku:current') || 'null');
const hist = () => JSON.parse(localStorage.getItem('sudoku:history') || '[]');

// 新游戏 -> 选难度
elements['btn-new'].click();
const segs = findAll(elements['modal-root'], 'seg-btn');
const easy = segs.find((b) => b.textContent.startsWith('简单'));
assert(!!easy, '难度弹窗出现');
easy.click();

let g = cur();
assert(g && g.difficulty === 'easy', '已创建简单局并保存');

// 完整落子通关
const empties = [];
for (let i = 0; i < 81; i++) if (g.puzzle[i] === 0) empties.push(i);
for (const i of empties) {
  elements['board'].children[i].click(); // 选中
  const n = g.solution[i];
  elements['pad-numbers'].children[n - 1].click(); // 填正确值
}
assert(hist().some((r) => r.won), '通关后写入历史（won）');
assert(cur() === null, '通关后当前局已清空');

// 历史 -> 复盘
elements['btn-history'].click();
const rows = elements['history-list'].children;
assert(rows.length >= 1, '历史列表有记录');
rows[0].click(); // 打开复盘
assert(elements['replay-step'].textContent.startsWith('0 /'), '复盘初始步数正确');
elements['rp-next'].click();
assert(elements['replay-step'].textContent.startsWith('1 /'), '复盘下一步生效');
elements['rp-last'].click();
assert(elements['replay-step'].textContent.startsWith(String(hist()[0].moves.length) + ' /'), '复盘跳到结尾');

// 笔记模式
elements['btn-new'].click();
findAll(elements['modal-root'], 'seg-btn').find((b) => b.textContent.startsWith('中等')).click();
g = cur();
const e0 = g.puzzle.findIndex((v) => v === 0);
elements['board'].children[e0].click();
elements['btn-notes'].click(); // 开启笔记
elements['pad-numbers'].children[3].click(); // 记 4（笔记模式）
assert(cur().notes[e0].includes(4), '笔记模式写入候选数');

const findNoteSpan = (cell, n) => {
  const ne = cell.children.find((c) => c._classes.has('notes'));
  return ne ? ne.children.find((s) => s.textContent === String(n)) : null;
};

// 笔记模式：点击已有候选 -> 取消(删除)该候选
const s4 = findNoteSpan(elements['board'].children[e0], 4);
assert(!!s4, '笔记格渲染出可点击的候选数字');
s4.click();
assert(!cur().notes[e0].includes(4), '笔记模式下点击笔记数字 -> 取消(删除)该候选');

// 普通模式：点击候选 -> 升级为正式值（笔记转正）
elements['btn-notes'].click(); // 关笔记模式
elements['board'].children[e0].click(); // 选中
elements['btn-notes'].click(); // 开笔记模式
elements['pad-numbers'].children[6].click(); // 记 7
elements['btn-notes'].click(); // 关笔记模式 -> 普通模式
const s7 = findNoteSpan(elements['board'].children[e0], 7);
assert(!!s7, '普通模式下仍渲染候选数字 7');
s7.click();
const afterNote = cur();
assert(
  afterNote.cells[e0] === 7 && afterNote.notes[e0].length === 0,
  '普通模式点击笔记数字 -> 升级为正式值并清空该格笔记'
);

// 暂存续玩
elements['btn-save-exit'].click();
assert(cur() && cur().status === 'paused', '保存并退出后状态为 paused');
elements['btn-resume'].click();
assert(cur() !== null, '续玩后当前局仍存在');

// 键盘输入：未选中格时按数字键应自动选中首个空格并填入（PC 友好）
// 当前续玩局里 e0 已通过「笔记转正」填为 7；selected 不持久化，故续玩后为 null
assert(cur().cells[e0] === 7, '续玩局 e0 仍为笔记转正后的值 7');
const fe = cur().cells.findIndex((v) => v === 0); // 首个空格（e0 已填 7）
dispatchKey('3'); // 自动选中首个空格并填 3
assert(cur().cells[fe] === 3, '键盘数字键自动选中首个空格并填入 3');
dispatchKey('Backspace'); // 擦除该格
assert(cur().cells[fe] === 0, '键盘 Backspace 擦除该格');

// 主题切换：类应挂在 <html>（根元素）上，且可在三态间循环
const htmlEl = document.documentElement;
assert(
  htmlEl.classList.contains('theme-light') || htmlEl.classList.contains('theme-dark'),
  'init 后 <html> 已带主题类'
);
elements['btn-theme'].click(); // dark -> auto(跟随系统: 浅)
assert(htmlEl.classList.contains('theme-light'), '跟随系统(浅色)切换生效');
elements['btn-theme'].click(); // -> light(显式浅)
assert(htmlEl.classList.contains('theme-light'), '显式浅色切换生效');
elements['btn-theme'].click(); // -> dark(显式深)
assert(
  htmlEl.classList.contains('theme-dark') && !htmlEl.classList.contains('theme-light'),
  '显式深色切换生效（背景随之变暗）'
);

console.log(`\nDOM 冒烟结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
