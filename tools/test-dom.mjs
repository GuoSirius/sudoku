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
    // 凯利卡片用 style.setProperty 设置档位配色变量，桩需支持（无需真实样式生效）
    this.style = { setProperty() {}, removeProperty() {}, getPropertyValue: () => '' };
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
  click(extra = {}) {
    const ev = { stopPropagation() {}, ...extra };
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
  // 扁平桩无真实嵌套结构：按选择器查询一律返回空集合（调用方已做容错）
  querySelectorAll() {
    return [];
  },
  addEventListener(t, fn) {
    (docListeners[t] = docListeners[t] || []).push(fn);
  },
};
// 模拟 index.html <head> 同步脚本：本桩 matchMedia 全返回 false → 非触摸设备 → 桌面端 → 应加 .slack 类
globalThis.document.documentElement.classList.add('slack');
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
// 模拟人类点击间隔（>双击窗口 300ms），避免同步测试里「两次单击」被误判为双击
const tick = () => new Promise((r) => setTimeout(r, 420));

// 加载应用（init 会自执行）
await import('../web/js/main.js');
assert(true, 'init 无异常');

// 摸鱼小窗用 window.open 弹独立窗口；测试里打桩统计调用次数（默认 window 无 open）
let windowOpenCalls = 0;
globalThis.window.open = (...a) => {
  windowOpenCalls++;
  return {};
};

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
  elements['pad-numbers'].children[n - 1].click(); // 双击=填入（正确值，时间窗内第二次单击）
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

// 回归：续玩未完成记录并完成 -> 应原地更新原记录，不新增重复记录
const unfinBefore = hist().find((r) => r.id === 'unfin-1');
assert(unfinBefore && unfinBefore.won === false, '续玩前原记录 unfin-1 为未完成');
elements['btn-resume'].click(); // 回到游戏（当前仍是这局续玩）
let rg = cur();
for (let i = 0; i < 81; i++) {
  if (rg.cells[i] !== 0) continue;
  elements['board'].children[i].click();
  const n = rg.solution[i];
  elements['pad-numbers'].children[n - 1].click(); // 普通模式单击即填入
  if (cur() === null) break; // 已通关，避免重复点击再次触发 onWin
  elements['pad-numbers'].children[n - 1].click(); // 兜底（笔记模式双击）
}
const afterHist = hist();
assert(afterHist.length === 2, '续玩完成后历史仍只有 2 条（无重复新增）');
const updatedRec = afterHist.find((r) => r.id === 'unfin-1');
assert(updatedRec && updatedRec.won === true, '原记录 unfin-1 被原地更新为已完成');
assert(afterHist.find((r) => r.id === 'seed-won'), '另一条已完成记录不受影响');
assert(cur() === null, '通关后当前局已清空');
const backHome = findByText(elements['modal-root'], '返回首页');
if (backHome) backHome.click();

// 清理：本测试把历史恢复成了当前对局，移除它以免污染后续「新游戏」流程
localStorage.removeItem('sudoku:current');

// 笔记模式
elements['btn-new'].click();
findAll(elements['modal-root'], 'seg-btn').find((b) => b.textContent.startsWith('进阶')).click();
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

// 无论是否笔记模式，单击单元格候选都只是切换(取消)该候选，不再「笔记转正」
elements['btn-notes'].click(); // 关笔记模式
elements['btn-notes'].click(); // 开笔记模式（删候选时已选中 e0，无需再点格子）
elements['pad-numbers'].children[6].click(); // 记 7
elements['btn-notes'].click(); // 关笔记模式 -> 普通模式
await tick(); // 清掉 s4.click 留下的 lastNote，避免 s7.click 被误判为双击
const s7 = findNoteSpan(elements['board'].children[e0], 7);
assert(!!s7, '普通模式下仍渲染候选数字 7');
s7.click();
assert(!cur().notes[e0].includes(7), '普通模式单击候选同样只是切换(取消)该候选，不自动转正');

// 暂存续玩
elements['btn-exit-pause'].click();
assert(cur() && cur().status === 'paused', '保存并退出后状态为 paused');
elements['btn-resume'].click();
assert(cur() !== null, '续玩后当前局仍存在');

// 键盘输入：未选中格时按数字键应给出提示且不填入（避免误填）
// 新交互下单击候选只切换、不填值，故 e0 仍为空（cells[e0]===0）；selected 不持久化，续玩后为 null
assert(cur().cells[e0] === 0, '续玩局 e0 未因单击候选而被填值（单击只切换候选）');
const fe = cur().cells.findIndex((v) => v === 0); // 首个空格
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
await tick(); // 清掉前面候选交互留下的 lastNote，避免被误判为双击填入
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
await tick(); // 清掉前面交互留下的 lastNote/lastPad
elements['board'].children[we].click(); // 选中空格
const wpb = elements['pad-numbers'].children[wval - 1];
wpb.click(); // 普通模式单击=回填（填入确定错误的值）
elements['pad-numbers'].children[wval - 1].click(); // 双击窗口内再次点击=回填（幂等）
assert(!elements['board'].children[we]._classes.has('wrong'), '仅冲突模式下填错不标红（不泄题）');
assert(cur().mistakes === 0, '仅冲突模式下填错不自动计错');
elements['btn-check'].click(); // 手动「检查」
assert(elements['board'].children[we]._classes.has('wrong'), '点「检查」后标红错误');
const wrongCount = cur().cells.filter((v, i) => v !== 0 && v !== cur().solution[i]).length;
assert(
  cur().mistakes === wrongCount,
  `「检查」后错误数等于当前错误格数（${wrongCount}）`
);

// ===== 数字盘交互模型（PC：笔记模式 || 按住 Ctrl = 记候选；否则回填；双击强制回填）=====
await tick(); // 清掉前面交互留下的 lastNote/lastPad

// 1) 普通模式（未开笔记、未按 Ctrl）：单击数字盘 = 回填
const nm = cur().cells.findIndex((v) => v === 0);
elements['board'].children[nm].click(); // 选中空格
if (elements['btn-notes'].classList.contains('active')) elements['btn-notes'].click(); // 确保普通模式
elements['pad-numbers'].children[1].click(); // 普通模式单击 2 = 回填
assert(cur().cells[nm] === 2 && cur().notes[nm].length === 0, '普通模式单击数字盘=回填（非候选）');

// 2) 笔记模式：单击数字盘 = 记候选（有则删、无则加）；双击 = 强制回填
elements['btn-notes'].click(); // 开笔记
const bm = cur().cells.findIndex((v) => v === 0);
elements['board'].children[bm].click();
elements['pad-numbers'].children[3].click(); // 单击 4 = 记候选
assert(cur().notes[bm].includes(4) && cur().cells[bm] === 0, '笔记模式单击数字盘=记候选');
elements['pad-numbers'].children[3].click(); // 双击第二步（窗口内同数字）= 强制回填
assert(cur().cells[bm] === 4 && cur().notes[bm].length === 0, '笔记模式下双击数字盘=回填');

// 3) 普通模式 + 按住 Ctrl（鼠标 click 带 ctrlKey）：记候选（不回填）
await tick();
elements['btn-notes'].click(); // 关笔记 -> 普通模式
const cm = cur().cells.findIndex((v) => v === 0);
elements['board'].children[cm].click();
elements['pad-numbers'].children[6].click({ ctrlKey: true }); // Ctrl+单击 7
assert(cur().notes[cm].includes(7) && cur().cells[cm] === 0, '普通模式 Ctrl+单击数字盘=记候选（不回填）');

// 4) 键盘 Ctrl+数字键 = 记候选（不回填），供后续单元格候选用例使用
const ke = cur().cells.findIndex((v) => v === 0);
elements['board'].children[ke].click();
dispatchKey('8', { ctrl: true }); // 按住 Ctrl + 8
assert(cur().notes[ke].includes(8) && cur().cells[ke] === 0, 'Ctrl+数字键=记候选（不回填）');
elements['btn-notes'].click(); // 重新开笔记，供后续「单元格候选」用例（需 pad 单击记候选）

// 单元格候选：单击切换、双击填入（与数字盘逻辑一致）
const ci = (() => {
  const gg = cur();
  for (let i = 0; i < 81; i++) if (gg.puzzle[i] === 0 && gg.cells[i] === 0 && gg.notes[i].length === 0) return i;
  return -1;
})();
assert(ci >= 0, '找到可用于候选交互的空格');
await tick(); // 清掉前面交互留下的 lastNote/lastPad
elements['board'].children[ci].click(); // 选中
elements['pad-numbers'].children[4].click(); // 数字盘单击=给该格加候选 5
assert(cur().notes[ci].includes(5), '数字盘单击为空格加候选 5');
let sp5 = findNoteSpan(elements['board'].children[ci], 5);
assert(!!sp5, '单元格渲染出候选 5');
sp5.click(); // 单击候选 5 = 切换(取消)
assert(!cur().notes[ci].includes(5), '单击单元格内候选 5 -> 取消(切换)该候选');
// 等双击窗口过期，避免与下面的双击用例串扰（真实使用中两次操作间隔 >300ms）
await new Promise((r) => setTimeout(r, 350));
// 重新加候选 5，再双击（单击移除 + 点格子兜底填入）
elements['pad-numbers'].children[4].click();
sp5 = findNoteSpan(elements['board'].children[ci], 5);
assert(!!sp5, '重新加候选 5 成功');
sp5.click(); // 双击第一步：单击移除候选 5（记录 lastNote）
assert(!cur().notes[ci].includes(5), '双击第一步：单击移除候选 5');
elements['board'].children[ci].click(); // 双击第二步：落在格子 -> 选中并填入 5
assert(cur().cells[ci] === 5 && cur().notes[ci].length === 0, '双击候选 5 -> 选中并填入 5');

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

// 主题切换：类应挂在 <html>（根元素）上，且可通过设置页三态切换
const htmlEl = document.documentElement;
assert(
  htmlEl.classList.contains('theme-light') || htmlEl.classList.contains('theme-dark'),
  'init 后 <html> 已带主题类'
);
elements['btn-settings'].click();
const themeBtns = elements['set-theme'].querySelectorAll('.seg-btn');
const themeAuto = themeBtns.find((b) => b.dataset.v === 'auto');
const themeLight = themeBtns.find((b) => b.dataset.v === 'light');
const themeDark = themeBtns.find((b) => b.dataset.v === 'dark');
assert(themeAuto && themeLight && themeDark, '设置页渲染主题分段（3 档）');
themeAuto.click(); // -> auto(跟随系统: 浅)
assert(htmlEl.classList.contains('theme-light'), '跟随系统(浅色)切换生效');
themeLight.click(); // -> light(显式浅)
assert(htmlEl.classList.contains('theme-light'), '显式浅色切换生效');
themeDark.click(); // -> dark(显式深)
assert(
  htmlEl.classList.contains('theme-dark') && !htmlEl.classList.contains('theme-light'),
  '显式深色切换生效（背景随之变暗）'
);

// 设置页数据加载：进入设置应渲染难度与错误提示分段控件（验证刷新恢复时也能渲染）
elements['btn-settings'].click();
assert(elements['set-difficulty'].children.length === 6, '设置页渲染难度分段（6 档）');
assert(elements['set-mistake'].children.length === 3, '设置页渲染错误提示分段（3 档）');
elements['btn-settings-back'].click();

// 摸鱼小窗：点按钮先弹二次确认，确认后才打开独立窗口（避免误触弹窗）
elements['btn-mini'].click();
assert(elements['modal-root'].classList.contains('show'), '点「摸鱼小窗」弹出二次确认框');
assert(windowOpenCalls === 0, '未确认前不打开独立窗口（无弹窗误触）');
const openMiniBtn = findByText(elements['modal-root'], '打开小窗');
assert(!!openMiniBtn, '确认框含「打开小窗」按钮');
openMiniBtn.click(); // 关闭弹框 + openMiniWindow()
assert(windowOpenCalls === 1, '点「打开小窗」后才真正打开独立窗口');
assert(!elements['modal-root'].classList.contains('show'), '确认后弹窗关闭');
// 取消路径：再来一次，点「取消」不应打开窗口
elements['btn-mini'].click();
const cancelMiniBtn = findByText(elements['modal-root'], '取消');
assert(!!cancelMiniBtn, '确认框含「取消」按钮');
cancelMiniBtn.click();
assert(windowOpenCalls === 1, '点「取消」不打开独立窗口（调用次数仍为 1）');
assert(!elements['modal-root'].classList.contains('show'), '取消后弹窗关闭');

// 摸鱼小窗导航条：init 应为各页按钮绑定跳转（解决小窗内无法跳页的问题）
['game', 'home', 'history', 'leaderboard', 'settings', 'guide'].forEach((p) => {
  const b = elements['mn-' + p];
  assert(b && typeof b.onclick === 'function', `迷你导航「${p}」按钮已绑定跳转`);
});
// 跳转到设置页：应切换到设置屏（非 game），且其余屏隐藏
elements['mn-settings'].click();
assert(
  !elements['screen-settings'].classList.contains('hidden') &&
    elements['screen-history'].classList.contains('hidden'),
  '迷你导航跳设置页：切换到设置屏且离开历史屏'
);
// 跳回历史页
elements['mn-history'].click();
assert(
  !elements['screen-history'].classList.contains('hidden') &&
    elements['screen-settings'].classList.contains('hidden'),
  '迷你导航跳历史页：回到历史屏'
);
// 跳回首页（回归：mn-home 必须映射到 menu，不能把全部屏隐藏成空白「首页无内容」）
elements['mn-home'].click();
assert(
  !elements['screen-menu'].classList.contains('hidden') &&
    elements['screen-history'].classList.contains('hidden'),
  '迷你导航跳首页：显示首页屏（回归：不得全屏空白）'
);

// ---- 凯利仓位计算：进入页面 → 默认参数渲染 → 改胜率重算 → 清空静默 ----
elements['btn-kelly'].click();
assert(
  !elements['screen-kelly'].classList.contains('hidden') &&
    elements['screen-menu'].classList.contains('hidden'),
  '凯利：点击首页入口进入凯利页且离开首页'
);
// 默认参数：通用形式 + 每股盈亏，成本10 / 每股盈利4 / 每股亏损5 / 胜率60% / 总资产20万
//   盈利幅度 40% 亏损幅度 50% → f* = 0.6/0.5 − 0.4/0.4 = 0.2，四档 5/10/15/20%
assert(elements['kelly-summary'].children.length === 4, '凯利：汇总区渲染 4 项指标');
{
  const cards = findAll(elements['kelly-tiers'], 'kelly-tier');
  assert(cards.length === 4, `凯利：应渲染 4 档仓位卡片（实际 ${cards.length}）`);
  const pos = cards.map((c) => findAll(c, 'kelly-tier-pos')[0].textContent);
  assert(pos.join('|') === '5%|10%|15%|20%', `凯利·默认每股盈亏：四档应为 5/10/15/20%（实际 ${pos.join('|')}）`);
  const amt = cards.map((c) => findAll(c, 'kelly-tier-amt')[0].textContent);
  assert(amt[3] === '4 万', `凯利·默认每股盈亏：满仓档金额应为 4 万（实际 ${amt[3]}）`);
  assert(amt[0] === '1 万', `凯利·默认每股盈亏：保守档金额应为 1 万（实际 ${amt[0]}）`);
  // 通用形式：数值形式分组与成本价字段可见，标签为「每股」口径
  assert(!elements['kelly-vm-group'].classList.contains('hidden'), '凯利·默认：通用形式下数值形式分组应显示');
  assert(!elements['kelly-cost-field'].classList.contains('hidden'), '凯利·默认·每股盈亏：成本价字段应显示');
  assert(
    elements['kelly-profit-prefix'].textContent === '每股盈利',
    `凯利·默认：profit 前缀应为「每股盈利」（实际「${elements['kelly-profit-prefix'].textContent}」）`
  );
  assert(
    elements['kelly-loss-prefix'].textContent === '每股亏损',
    `凯利·默认：loss 前缀应为「每股亏损」（实际「${elements['kelly-loss-prefix'].textContent}」）`
  );
}
// 改胜率为 30%（低于盈亏平衡 33.33%）→ 期望为负，四档归零并出现警示条
elements['kelly-winrate'].value = '30';
elements['kelly-winrate'].click(); // 扁平桩：直接触发 input 监听
(elements['kelly-winrate']._listeners['input'] || []).forEach((f) => f({}));
{
  const cards = findAll(elements['kelly-tiers'], 'kelly-tier');
  const alerts = findAll(elements['kelly-tiers'], 'kelly-alert');
  assert(alerts.length === 1, '凯利：期望为负时应出现 1 条警示');
  const pos = cards.map((c) => findAll(c, 'kelly-tier-pos')[0].textContent);
  assert(pos.every((p) => p === '0%'), `凯利：期望为负时四档仓位应归零（实际 ${pos.join('|')}）`);
}
// 清空亏损 → 静默清空结果、不报错（不打扰用户重填）
elements['kelly-loss'].value = '';
(elements['kelly-loss']._listeners['input'] || []).forEach((f) => f({}));
assert(elements['kelly-summary'].classList.contains('hidden'), '凯利：输入未填全时隐藏汇总区');
assert(findAll(elements['kelly-tiers'], 'kelly-tier').length === 0, '凯利：输入未填全时清空档位卡片');
assert(elements['kelly-error'].classList.contains('hidden'), '凯利：输入未填全时不显示错误提示');
// 亏损填 0 → 非法，应给出明确错误原因
elements['kelly-loss'].value = '0';
(elements['kelly-loss']._listeners['input'] || []).forEach((f) => f({}));
assert(
  !elements['kelly-error'].classList.contains('hidden') &&
    elements['kelly-error'].textContent === '亏损必须大于 0',
  `凯利：亏损为 0 应提示「亏损必须大于 0」（实际「${elements['kelly-error'].textContent}」）`
);
// 切到金额模式：显式填 盈利10元/亏损5元/胜率55% → b=2, f=0.325 → 满仓 32.5%
const modeBtns = findAll(elements['kelly-mode'], 'seg-btn');
const amountBtn = modeBtns.find((b) => b.textContent === '金额');
assert(!!amountBtn, '凯利：模式分段控件应含「金额」按钮');
if (amountBtn) {
  amountBtn.click();
  elements['kelly-profit'].value = '10';
  elements['kelly-loss'].value = '5';
  elements['kelly-winrate'].value = '55';
  ['kelly-profit', 'kelly-loss', 'kelly-winrate'].forEach((id) => {
    (elements[id]._listeners['input'] || []).forEach((f) => f({}));
  });
  // 切换后分段控件会整体重建，需重新取按钮再断言激活态
  const curAmount = findAll(elements['kelly-mode'], 'seg-btn').find((b) => b.textContent === '金额');
  assert(
    curAmount && curAmount.classList.contains('active'),
    '凯利：点击「金额」后该按钮应激活'
  );
  const cards = findAll(elements['kelly-tiers'], 'kelly-tier');
  const pos = cards.map((c) => findAll(c, 'kelly-tier-pos')[0].textContent);
  assert(pos[3] === '32.5%', `凯利：金额模式满仓比例应为 32.5%（实际 ${pos[3]}）`);
}
// ---- 通用形式·数值形式=百分比：前缀变 盈利幅度/亏损幅度，填 30/20/55 并开杠杆 → 125% ----
{
  // 先切回通用形式（上一步在金额模式），再切数值形式为百分比
  const generalBtn = findAll(elements['kelly-mode'], 'seg-btn').find((b) => b.textContent === '通用形式（股票）');
  if (generalBtn) generalBtn.click();
  const pctBtn = findAll(elements['kelly-value-mode'], 'seg-btn').find((b) => b.textContent === '百分比');
  assert(!!pctBtn, '凯利·通用：数值形式应含「百分比」按钮');
  if (pctBtn) {
    pctBtn.click();
    assert(
      elements['kelly-profit-prefix'].textContent === '盈利幅度',
      `凯利·通用·百分比：profit 前缀应变「盈利幅度」（实际「${elements['kelly-profit-prefix'].textContent}」）`
    );
    assert(
      elements['kelly-loss-prefix'].textContent === '亏损幅度',
      `凯利·通用·百分比：loss 前缀应变「亏损幅度」（实际「${elements['kelly-loss-prefix'].textContent}」）`
    );
    assert(elements['kelly-cost-field'].classList.contains('hidden'), '凯利·通用·百分比：成本价字段应隐藏');
    // 经典股票场景：上涨 30% 胜率 55%，下跌 20% 胜率 45% → f* = 0.55/0.2 − 0.45/0.3 = 1.25
    elements['kelly-profit'].value = '30';
    elements['kelly-loss'].value = '20';
    elements['kelly-winrate'].value = '55';
    ['kelly-profit', 'kelly-loss', 'kelly-winrate'].forEach((id) => {
      (elements[id]._listeners['input'] || []).forEach((f) => f({}));
    });
    // 开启「允许杠杆」（默认不允许，仓位封顶 100%），才能看到 > 100% 的理论值与警示
    const levOnBtn2 = findAll(elements['kelly-lev'], 'seg-btn').find((b) => b.textContent === '允许');
    assert(!!levOnBtn2, '凯利·通用：杠杆控制应含「允许」按钮');
    if (levOnBtn2) levOnBtn2.click();
    const cards2 = findAll(elements['kelly-tiers'], 'kelly-tier');
    const pos2 = cards2.map((c) => findAll(c, 'kelly-tier-pos')[0].textContent);
    assert(pos2.join('|') === '31.25%|62.5%|93.75%|125%', `凯利·通用·百分比：四档应为 31.25/62.5/93.75/125%（实际 ${pos2.join('|')}）`);
    // 满仓档 > 100%，加杠杆警示
    assert(cards2[3].classList.contains('is-over'), '凯利·通用·百分比：满仓档应加 is-over 类');
    const warns = findAll(cards2[3], 'kelly-tier-warn');
    assert(warns.length === 1, `凯利·通用·百分比：满仓档应有 1 条杠杆警示（实际 ${warns.length}）`);
    // 其他档 < 100%，不应加 is-over
    assert(!cards2[0].classList.contains('is-over'), '凯利·通用·百分比：保守档 < 100% 不应加 is-over');
  }
}

// ---- 通用形式·数值形式=目标价：自动折算 + 成本价字段 ----
{
  // 仍在通用形式下，数值形式分组应可见
  assert(!elements['kelly-vm-group'].classList.contains('hidden'), '凯利·通用：数值形式分组应显示');
  const priceBtn = findAll(elements['kelly-value-mode'], 'seg-btn').find((b) => b.textContent === '目标价');
  assert(!!priceBtn, '凯利·通用：数值形式应含「目标价」按钮');
  if (priceBtn) {
    priceBtn.click();
    assert(!elements['kelly-cost-field'].classList.contains('hidden'), '凯利·通用·目标价：成本价字段应显示');
    assert(elements['kelly-profit-prefix'].textContent === '止盈价', `凯利·通用·目标价：盈利前缀应变「止盈价」（实际「${elements['kelly-profit-prefix'].textContent}」）`);
    assert(elements['kelly-loss-prefix'].textContent === '止损价', `凯利·通用·目标价：亏损前缀应变「止损价」（实际「${elements['kelly-loss-prefix'].textContent}」）`);
    // 成本价 10、止盈 13、止损 8、胜率 55 → 折算 30%/20% → f*=1.25（杠杆已开，封顶 200%）
    elements['kelly-cost'].value = '10';
    elements['kelly-profit'].value = '13';
    elements['kelly-loss'].value = '8';
    elements['kelly-winrate'].value = '55';
    ['kelly-cost', 'kelly-profit', 'kelly-loss', 'kelly-winrate'].forEach((id) => {
      (elements[id]._listeners['input'] || []).forEach((f) => f({}));
    });
    const cards = findAll(elements['kelly-tiers'], 'kelly-tier');
    const pos = cards.map((c) => findAll(c, 'kelly-tier-pos')[0].textContent);
    assert(pos.join('|') === '31.25%|62.5%|93.75%|125%', `凯利·通用·目标价：四档应为 31.25/62.5/93.75/125%（实际 ${pos.join('|')}）`);
    assert(cards[3].classList.contains('is-over'), '凯利·通用·目标价：满仓档 > 100% 应加 is-over');
    assert(!elements['kelly-lev-max-field'].classList.contains('hidden'), '凯利·通用·允许杠杆：上限输入应显示');
  }
}
// ---- 刷新恢复：离开并重新进入，应还原数值形式=目标价、杠杆=允许、总资产按万元显示 ----
{
  elements['kelly-total'].value = '50';
  (elements['kelly-total']._listeners['input'] || []).forEach((f) => f({}));
  elements['btn-kelly-back'].click();
  elements['btn-kelly'].click();
  const priceBtn = findAll(elements['kelly-value-mode'], 'seg-btn').find((b) => b.textContent === '目标价');
  assert(!!priceBtn && priceBtn.classList.contains('active'), '凯利·恢复：数值形式应保留「目标价」高亮');
  const levOnBtn = findAll(elements['kelly-lev'], 'seg-btn').find((b) => b.textContent === '允许');
  assert(!!levOnBtn && levOnBtn.classList.contains('active'), '凯利·恢复：杠杆应保留「允许」高亮');
  assert(String(elements['kelly-cost'].value) === '10', `凯利·恢复：成本价应还原为 10（实际 ${elements['kelly-cost'].value}）`);
  assert(String(elements['kelly-total'].value) === '50', `凯利·恢复：总资产应显示 50 万而非 50 万*10000（实际 ${elements['kelly-total'].value}）`);
}

console.log(`\nDOM 冒烟结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
