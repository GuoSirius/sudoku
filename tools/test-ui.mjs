// 棋盘状态单元测试：验证 buildBoard 输出的 class 集合与「状态表」逐格一致，
// 并校验 styles.css 中存在每个状态对应的规则（JS ↔ CSS 配套）。
// 不依赖 main.js，直接 import 纯函数模块 ui.js。

import { readFileSync } from 'node:fs';

// ---- 极简 DOM 桩（仅需 document.createElement，buildBoard 不在顶层访问 DOM 全局）----
class El {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this._classes = new Set();
    this._text = '';
    this.dataset = {};
  }
  get classList() {
    const s = this._classes;
    return {
      add: (...c) => c.forEach((x) => s.add(x)),
      remove: (...c) => c.forEach((x) => s.delete(x)),
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
    this.children = [];
    this._html = String(v);
  }
  get innerHTML() {
    return this._html;
  }
  appendChild(c) {
    this.children.push(c);
    c.parent = this;
    return c;
  }
  addEventListener() {}
}
globalThis.document = {
  createElement: (tag) => new El(tag),
};
globalThis.window = { matchMedia: () => ({ matches: false }) };

let pass = 0;
let fail = 0;
const assert = (c, m) => (c ? pass++ : (fail++, console.error('  ✗', m)));

const { buildBoard, computePeers, computeSameNum } = await import('../web/js/ui.js');

// 取某格的 class 集合
function clsOf(root, i) {
  return root.children[i]._classes;
}
function has(root, i, c) {
  return clsOf(root, i).has(c);
}

// 构造一个受控对局（只为验证 class 输出，不要求可解）
function build(overrides = {}) {
  const cells = new Array(81).fill(0);
  const given = new Array(81).fill(false);
  const notes = new Array(81).fill(null).map(() => []);
  // 固有格：列 0 全为给定（值 1..9）
  for (let r = 0; r < 9; r++) {
    given[r * 9] = true;
    cells[r * 9] = (r % 9) + 1;
  }
  const base = {
    cells,
    given,
    notes,
    selected: null,
    conflicts: new Set(),
    wrong: new Set(),
  };
  return { ...base, ...overrides };
}

const root = document.createElement('div');
const cls = (i) => clsOf(root, i);

// ============ 1. 基础状态: given / filled / empty / notes ============
{
  // 边框类计数（bl/bt/br/bb）
  function borderCount(i) {
    const r = Math.floor(i / 9);
    const c = i % 9;
    let n = 0;
    if (c % 3 === 0) n++;
    if (r % 3 === 0) n++;
    if (c === 8) n++;
    if (r === 8) n++;
    return n;
  }
  const cells = new Array(81).fill(0);
  const given = new Array(81).fill(false);
  const notes = new Array(81).fill(null).map(() => []);
  given[0] = true;
  cells[0] = 7; // 固有格
  cells[1] = 4; // 可填格
  notes[2] = [1, 2, 3]; // 候选数
  buildBoard(root, { cells, given, notes, selected: null, conflicts: new Set(), wrong: new Set() });

  // 固有格 class 集合 = base(cell) + given + 边框
  assert(has(root, 0, 'given') && cls(0).size === 2 + borderCount(0), '固有格: 仅 given(+边框，不含其他状态)');
  assert(!has(root, 1, 'given') && root.children[1].textContent === '4', '可填格: 无 given 且显示值 4');
  assert(root.children[2].textContent === '' && root.children[2].children.some((c) => c._classes.has('notes')), '空格+候选: 渲染 .notes 子节点、无文本');
  assert(root.children[40].textContent === '' && root.children[40].children.length === 0, '纯空格: 无文本、无 .notes');

  assert(has(root, 0, 'bl') && has(root, 0, 'bt'), '左上角格带 bl/bt 边框类');
  assert(has(root, 80, 'br') && has(root, 80, 'bb'), '右下角格带 br/bb 边框类');
}

// ============ 2. 选中 → 焦点 / 同行列宫(peer) / 同值(samenum) ============
{
  const cells = new Array(81).fill(0);
  const given = new Array(81).fill(false);
  const notes = new Array(81).fill(null).map(() => []);
  given[0] = true;
  cells[0] = 5; // 固有 5（samenum，但非 40 的 peer）
  cells[8] = 5; // 可填 5（samenum，非 peer）
  cells[40] = 5; // 选中格 5（samenum + selected）
  given[30] = true;
  cells[30] = 2; // 固有格，且在 40 的宫(3-5,3-5)内 → 是 peer
  cells[41] = 0; // 40 同行的空格 → peer（空）
  cells[42] = 7; // 40 同行 → peer（filled）
  buildBoard(root, { cells, given, notes, selected: 40, conflicts: new Set(), wrong: new Set() });

  assert(has(root, 40, 'selected'), '选中格: selected');
  assert(has(root, 40, 'samenum'), '选中格: 同值也标 samenum');
  assert(!has(root, 40, 'peer'), '选中格自身不标 peer（computePeers 已删自身）');

  assert(has(root, 0, 'samenum') && has(root, 0, 'given'), '固有 5: 同时 given + samenum（JS 不区分，CSS 用描边分支区分）');
  assert(!has(root, 0, 'peer'), '固有 5 非 40 的 peer');
  assert(has(root, 8, 'samenum') && !has(root, 8, 'given'), '可填 5: samenum 且无 given');
  assert(!has(root, 8, 'peer'), '可填 5 非 40 的 peer');

  assert(has(root, 30, 'peer') && has(root, 30, 'given'), '40 同宫的固有格: 同时 peer + given（JS 给 peer，CSS 用 :not(.given) 抑制其视觉）');
  assert(has(root, 41, 'peer') && root.children[41].textContent === '', '40 同行的空格: peer 且无文本');
  assert(has(root, 42, 'peer') && !has(root, 42, 'samenum'), '40 同行的可填格: peer 且非 samenum（值不同）');
}

// ============ 3. 冲突(conflict) 与 错误(wrong) ============
{
  const cells = new Array(81).fill(0);
  const given = new Array(81).fill(false);
  const notes = new Array(81).fill(null).map(() => []);
  cells[41] = 5; // 与同行的 40 重复 → conflict（peer 也成立）
  cells[9] = 3; // 错误格
  buildBoard(root, {
    cells,
    given,
    notes,
    selected: 40,
    conflicts: new Set([41]),
    wrong: new Set([9]),
  });

  assert(has(root, 41, 'conflict'), '冲突格: conflict');
  assert(has(root, 41, 'peer'), '冲突格同时是 peer（JS 两 class 都加，CSS 用 :not(.conflict) 抑制 peer 视觉）');
  assert(has(root, 9, 'wrong'), '错误格: wrong');
  assert(!has(root, 9, 'peer'), '错误格非 peer');
}

// ============ 4. 选中 + 错误 / 冲突 组合（焦点下仍提醒错误）============
{
  const cells = new Array(81).fill(0);
  const given = new Array(81).fill(false);
  const notes = new Array(81).fill(null).map(() => []);
  cells[9] = 3; // 错误且被选中
  cells[42] = 7; // 冲突且被选中
  buildBoard(root, {
    cells,
    given,
    notes,
    selected: 9,
    conflicts: new Set([42]),
    wrong: new Set([9]),
  });
  assert(has(root, 9, 'selected') && has(root, 9, 'wrong'), '选中且错误的格: 同时 selected + wrong（class 都在，CSS .cell.selected.wrong 锁红底）');
  buildBoard(root, {
    cells,
    given,
    notes,
    selected: 42,
    conflicts: new Set([42]),
    wrong: new Set(),
  });
  assert(has(root, 42, 'selected') && has(root, 42, 'conflict'), '选中且冲突的格: 同时 selected + conflict（CSS .cell.selected.conflict 锁红底）');
}

// ============ 5. 纯函数: computePeers / computeSameNum ============
{
  const peers = computePeers(40);
  assert(peers instanceof Set && peers.size === 20 && !peers.has(40), 'computePeers(40) 返回 20 格集合且不含自身');
  const same = computeSameNum([5, 0, 5, 0, 5], 0);
  assert(same.size === 3 && same.has(0) && same.has(2) && same.has(4), 'computeSameNum 收集全部同值索引(含自身)');
  const sameZero = computeSameNum([0, 1, 2], 0);
  assert(sameZero.size === 0, 'computeSameNum 对空格(值 0)返回空集');
}

// ============ 6. CSS ↔ JS 配套: 每个状态都有对应规则 ============
{
  const css = readFileSync(new URL('../web/css/styles.css', import.meta.url), 'utf8');
  const need = [
    ['.cell.given {', '固有格 given 规则'],
    ['.cell.selected {', '焦点 selected 规则'],
    ['.cell.samenum', '同值 samenum 规则'],
    ['.cell.peer', '同行列宫 peer 规则'],
    ['.cell.conflict', '冲突 conflict 规则'],
    ['.cell.wrong', '错误 wrong 规则'],
    ['.cell.given.samenum', '固有格同值分支(描边)'],
    ['.cell.selected.wrong', '选中+错误 锁红底规则(Task1)'],
    ['.cell.selected.conflict', '选中+冲突 锁红底规则(Task1)'],
  ];
  for (const [sel, desc] of need) {
    assert(css.includes(sel), `CSS 配套: 存在「${desc}」(${sel})`);
  }
  // 守卫: peer / samenum 必须带 :not(.wrong):not(.conflict) 守卫，确保辅助高亮不压错误提示
  assert(/\.cell\.peer[^{]*:not\(\.wrong\):not\(\.conflict\)/.test(css), 'CSS 守卫: .cell.peer 带 :not(.wrong):not(.conflict)');
  assert(/\.cell\.samenum[^{]*:not\(\.selected\):not\(\.wrong\):not\(\.conflict\)/.test(css), 'CSS 守卫: .cell.samenum 带 :not(.selected):not(.wrong):not(.conflict)');
}

console.log(`\nUI 状态单测结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
