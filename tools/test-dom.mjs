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
  dblclick() {
    const ev = { stopPropagation() {} };
    (this._listeners['dblclick'] || []).forEach((f) => f(ev));
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
function findByText(root, text) {
  if (root.textContent === text) return root;
  for (const c of root.children) {
    const found = findByText(c, text);
    if (found) return found;
  }
  return null;
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

// 预置：上次停留在「历史」页，并预置一条历史记录，用于验证刷新恢复时数据已渲染
store['sudoku:history'] = JSON.stringify([
  {
    id: 'seed-1',
    difficulty: 'easy',
    durationMs: 123000,
    mistakes: 2,
    hintsUsed: 0,
    won: true,
    date: Date.now(),
    puzzle: [],
    solution: [],
    moves: [],
  },
]);
store['sudoku:screen'] = 'history';

let pass = 0;
let fail = 0;
const assert = (c, m) => (c ? pass++ : (fail++, console.error('  ✗', m)));

// 模拟向 document 派发 keydown（复用 main.js 注册的监听器）
function dispatchKey(key, opts = {}) {
  const ev = { key, ctrlKey: !!opts.ctrl, preventDefault() {} };
  (docListeners['keydown'] || []).forEach((f) => f(ev));
}

// 加载应用（init 会自执行）
await import('../js/main.js');
assert(true, 'init 无异常');

// 刷新恢复：预置停留在历史页，应恢复历史页而非首页
assert(
  !elements['screen-history'].classList.contains('hidden') &&
    elements['screen-menu'].classList.contains('hidden'),
  '刷新恢复：曾停留在历史页则恢复历史页（非首页）'
);
assert(
  elements['history-list'].children.length >= 1,
  '刷新恢复历史页时历史列表已渲染（含记录，非空白）'
);

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
  const pb = elements['pad-numbers'].children[n - 1];
  pb.click(); // 单击=记候选
  pb.dblclick(); // 双击=填入（正确值）
}
assert(hist().some((r) => r.won), '通关后写入历史（won）');
assert(cur() === null, '通关后当前局已清空');

// 通关弹窗：点「查看复盘」应关闭弹窗并进入复盘
const replayBtn = findByText(elements['modal-root'], '查看复盘');
assert(!!replayBtn, '通关弹窗有「查看复盘」按钮');
replayBtn.click();
assert(!elements['modal-root'].classList.contains('show'), '点查看复盘后弹窗关闭');
assert(!elements['screen-replay'].classList.contains('hidden'), '点查看复盘后进入复盘页');
assert(elements['replay-step'].textContent.startsWith('0 /'), '复盘初始步数正确');
elements['btn-replay-back'].click(); // 返回历史，继续后续历史列表测试
assert(!elements['screen-history'].classList.contains('hidden'), '从复盘返回历史页');

// 历史 -> 复盘
elements['btn-history'].click();
const rows = elements['history-list'].children;
assert(rows.length >= 1, '历史列表有记录');
findByText(rows[0], '复盘').click(); // 点行内「复盘」按钮打开复盘
assert(elements['replay-step'].textContent.startsWith('0 /'), '复盘初始步数正确');
elements['rp-next'].click();
assert(elements['replay-step'].textContent.startsWith('1 /'), '复盘下一步生效');
elements['rp-last'].click();
assert(elements['replay-step'].textContent.startsWith(String(hist()[0].moves.length) + ' /'), '复盘跳到结尾');

// 未完成记录：继续 / 复盘 区分
const SOL = [5,3,4,6,7,8,9,1,2, 6,7,2,1,9,5,3,4,8, 1,9,8,3,4,2,5,6,7, 8,5,9,7,6,1,4,2,3, 4,2,6,8,5,3,7,9,1, 7,1,3,9,2,4,8,5,6, 9,6,1,5,3,7,2,8,4, 2,8,7,4,1,9,6,3,5, 3,4,5,2,8,6,1,7,9];
const PZ = SOL.slice();
PZ[0] = 0;
PZ[5] = 0;
store['sudoku:history'] = JSON.stringify([
  { id: 'seed-won', difficulty: 'easy', durationMs: 123000, mistakes: 2, hintsUsed: 0, won: true, date: Date.now(), puzzle: [], solution: [], moves: [] },
  { id: 'unfin-1', difficulty: 'medium', durationMs: 456000, mistakes: 1, hintsUsed: 0, won: false, date: Date.now(), puzzle: PZ, solution: SOL, moves: [{ idx: 5, val: SOL[5], kind: 'set', t: 1000 }] },
]);
elements['btn-history'].click(); // 重新渲染历史列表
const allRows = elements['history-list'].children;
assert(allRows.length === 2, '历史列表含 2 条记录');
const wonRowT = [...allRows].find((r) => findByText(r, '完成'));
assert(wonRowT && !findByText(wonRowT, '继续'), '已完成记录仅「复盘」、无「继续」');
const unfinRowT = [...allRows].find((r) => findByText(r, '未完成'));
assert(unfinRowT && findByText(unfinRowT, '继续'), '未完成记录有「继续」按钮');
findByText(unfinRowT, '继续').click();
assert(!elements['screen-game'].classList.contains('hidden'), '点「继续」进入游戏界面');
const cg = cur();
assert(cg && cg.status === 'playing' && cg.cells[5] === SOL[5], '继续：恢复当前局并重放走子（cells[5]=解）');
elements['btn-history'].click();
const unfinRowT2 = [...elements['history-list'].children].find((r) => findByText(r, '未完成'));
findByText(unfinRowT2, '复盘').click();
assert(!elements['screen-replay'].classList.contains('hidden'), '未完成记录点「复盘」进入复盘页');
elements['btn-replay-back'].click();
// 清理：本测试把历史恢复成了当前对局，移除它以免污染后续「新游戏」流程
localStorage.removeItem('sudoku:current');

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
elements['btn-exit-pause'].click();
assert(cur() && cur().status === 'paused', '保存并退出后状态为 paused');
elements['btn-resume'].click();
assert(cur() !== null, '续玩后当前局仍存在');

// 键盘输入：未选中格时按数字键应给出提示且不填入（避免误填）
// 当前续玩局里 e0 已通过「笔记转正」填为 7；selected 不持久化，故续玩后为 null
assert(cur().cells[e0] === 7, '续玩局 e0 仍为笔记转正后的值 7');
const fe = cur().cells.findIndex((v) => v === 0); // 首个空格（e0 已填 7）
const before = cur().cells[fe];
dispatchKey('3'); // 未选格 -> 仅提示，不填入
assert(cur().cells[fe] === before, '未选中格按数字键不填入（避免误填）');
assert(elements['toast'].textContent === '请先选择一个格子', '未选中格按数字键给出提示');
dispatchKey('Backspace'); // 同样不擦除
assert(cur().cells[fe] === before, '未选中格按 Backspace 不擦除');

// 暂停优化：非阻塞、可退出首页保留进度、计时停止、回来可继续
assert(cur().status === 'playing', '续玩后状态为 playing（暂停测试前置）');
elements['btn-pause'].click(); // ⏸ 暂停
assert(cur().status === 'paused', '点击⏸后状态变为 paused');
assert(!elements['pause-overlay'].classList.contains('hidden'), '暂停后显示暂停横幅（非全屏遮挡）');
assert(elements['btn-pause'].textContent === '▶', '⏸按钮切换为「继续」图标');
const pe = cur().cells.findIndex((v) => v === 0);
const beforePause = cur().cells[pe];
elements['board'].children[pe].click(); // 选中空格
elements['pad-numbers'].children[5].click(); // 暂停态试填 6 -> 应被拦截
assert(cur().cells[pe] === beforePause, '暂停态下点击数字盘不落子（落子被状态拦截）');
elements['btn-home'].click(); // 暂停态点☰返回首页
assert(!elements['screen-menu'].classList.contains('hidden'), '暂停态点☰返回首页');
assert(cur() && cur().status === 'paused', '返回首页后游戏仍为 paused（进度保留，计时不偷跑）');
assert(!elements['btn-resume'].classList.contains('hidden'), '首页显示「继续游戏」（可回来续玩）');
elements['btn-resume'].click(); // 从首页继续
assert(cur().status === 'playing', '从首页继续后状态恢复 playing');
assert(elements['pause-overlay'].classList.contains('hidden'), '继续后暂停横幅隐藏');

// 错误提示：默认「仅冲突」模式不逐格比对答案（不泄题），「检查」按钮按需揭示
const mset = (JSON.parse(localStorage.getItem('sudoku:settings') || '{}').mistakeMode) || 'conflict';
assert(mset === 'conflict', '默认错误提示为「仅冲突」');
const we = cur().cells.findIndex((v) => v === 0);
const wval = [1, 2, 3, 4, 5, 6, 7, 8, 9].find((n) => n !== cur().solution[we]);
elements['board'].children[we].click(); // 选中空格
const wpb = elements['pad-numbers'].children[wval - 1];
wpb.click(); // 单击=记候选
wpb.dblclick(); // 双击=填入（确定错误的值）
assert(!elements['board'].children[we]._classes.has('wrong'), '仅冲突模式下填错不标红（不泄题）');
assert(cur().mistakes === 0, '仅冲突模式下填错不自动计错');
elements['btn-check'].click(); // 手动「检查」
assert(elements['board'].children[we]._classes.has('wrong'), '点「检查」后标红错误');
const wrongCount = cur().cells.filter((v, i) => v !== 0 && v !== cur().solution[i]).length;
assert(
  cur().mistakes === wrongCount,
  `「检查」后错误数等于当前错误格数（${wrongCount}）`
);

// 数字盘交互：单击记候选 / 双击填入
const ne = cur().cells.findIndex((v) => v === 0);
elements['board'].children[ne].click(); // 选中空格
const nBefore = cur().cells[ne];
elements['pad-numbers'].children[2].click(); // 单击 3 = 记候选
assert(cur().cells[ne] === nBefore && cur().notes[ne].includes(3), '单击数字盘=记候选（不填入）');
const pb3 = elements['pad-numbers'].children[2];
pb3.dblclick(); // 双击 3 = 填入（撤销单击的候选并写入正式值）
assert(cur().cells[ne] === 3 && cur().notes[ne].length === 0, '双击数字盘=填入并清空该格候选');
// PC 组合键：Ctrl+数字键 = 记候选（笔记模式），不填入
const ce = cur().cells.findIndex((v) => v === 0);
elements['board'].children[ce].click();
dispatchKey('8', { ctrl: true }); // 按住 Ctrl + 8
assert(cur().notes[ce].includes(8), 'Ctrl+数字键=记候选（笔记模式）');
assert(cur().cells[ce] === 0, 'Ctrl+数字键不填入正式值');

// 切页持久化：进入排行榜应记录当前页（供刷新恢复）
elements['btn-leaderboard'].click();
assert(
  localStorage.getItem('sudoku:screen') === 'leaderboard',
  '切到排行榜页面会持久化该页面'
);
assert(
  elements['leaderboard-body'].children.length >= 1,
  '进入排行榜时数据已渲染（非空）'
);

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

// 设置页数据加载：进入设置应渲染难度与错误提示分段控件（验证刷新恢复时也能渲染）
elements['btn-settings'].click();
assert(elements['set-difficulty'].children.length === 4, '设置页渲染难度分段（4 档）');
assert(elements['set-mistake'].children.length === 3, '设置页渲染错误提示分段（3 档）');
elements['btn-settings-back'].click();

console.log(`\nDOM 冒烟结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
