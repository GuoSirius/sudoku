// 对局逻辑自检：胜利判定、错误计数、笔记、复盘重建
import { Game } from '../web/js/game.js';

let pass = 0;
let fail = 0;
const assert = (c, m) => (c ? pass++ : (fail++, console.error('  ✗', m)));

// 1) 完整正确解 -> 胜利、零错误
{
  const g = Game.newGame('easy');
  for (let i = 0; i < 81; i++) {
    if (g.cells[i] === 0) g.setCell(i, g.solution[i], false);
  }
  assert(g.status === 'won', '全部正确填入应判胜');
  assert(g.mistakes === 0, '全对时错误数应为 0');
  assert(g.remaining() === 0, '胜利时剩余 0');
}

// 2) 填错不再自动计错（避免泄题），需经「检查」才计入
{
  const g = Game.newGame('medium');
  const empty = g.cells.findIndex((v, i) => v === 0);
  const wrong = g.solution[empty] === 9 ? 1 : 9; // 一个确定的错误值
  g.setCell(empty, wrong, false);
  assert(g.mistakes === 0, '填错不应自动计错（计数交由模式/检查决定）');
  assert(g.isWrong(empty), '该格应标记为错误');
  assert(g.revealWrong() === 1, '「检查」应揭示 1 处错误并计 1 次');
  assert(g.mistakes === 1, '检查后错误数应为 1');
  // 改回正确
  g.setCell(empty, g.solution[empty], false);
  assert(g.isWrong(empty) === false, '改回正确后应非错误');
  assert(g.mistakes === 1, '错误次数不回填（累计）');
}

// 3) 笔记模式不影响盘面，仅记录候选
{
  const g = Game.newGame('easy');
  const empty = g.cells.findIndex((v) => v === 0);
  g.setCell(empty, 5, true);
  assert(g.cells[empty] === 0, '笔记模式不应改变盘面值');
  assert(g.notes[empty].includes(5), '笔记应记录 5');
  g.setCell(empty, 5, true); // 再点一次取消
  assert(!g.notes[empty].includes(5), '再次点击应取消笔记');
}

// 4) 复盘重建：puzzle + moves 应能还原到终盘
{
  const g = Game.newGame('hard');
  for (let i = 0; i < 81; i++) if (g.cells[i] === 0) g.setCell(i, g.solution[i], false);
  const cells = g.puzzle.slice();
  for (const m of g.moves) if (m.kind !== 'note') cells[m.idx] = m.val;
  assert(cells.every((v, i) => v === g.solution[i]), '复盘重建应等于完整解');
}

// 5) 「检查」反馈应反映当前盘面错误总数，而非仅本次新增（修复二次检查误报“没问题”）
{
  const g = Game.newGame('hard');
  const empties = [];
  for (let i = 0; i < 81; i++) if (g.cells[i] === 0) empties.push(i);
  const wrongIdx = empties.slice(0, 12); // 造 12 处错误（非给定格）
  wrongIdx.forEach((i) => g.setCell(i, g.solution[i] === 9 ? 1 : 9, false));
  assert(g.currentWrongCount() === 12, '初始应有 12 处错误');
  assert(g.revealWrong() === 12, '首次检查应揭示 12 处并计 12 次');
  // 随意改动其中一个已揭示的错格（仍是错误值），制造新重复
  const i0 = wrongIdx[0];
  const newVal = g.solution[i0] === 5 ? 6 : 5; // 必为错误值且与原值(1/9)不同
  g.setCell(i0, newVal, false);
  assert(g.revealWrong() === 0, '已揭示过的错格再次检查应计 0 新增');
  // 关键断言：盘面仍有 12 处错误，反馈应为总数 12，而非“没问题”
  assert(g.currentWrongCount() === 12, '盘面仍有 12 处错误，反馈须为总数而非 0（避免误报没问题）');
  // 修正其中 3 格后，总数应同步下降
  wrongIdx.slice(1, 4).forEach((i) => g.setCell(i, g.solution[i], false));
  assert(g.currentWrongCount() === 9, '修正 3 格后错误总数应降为 9');
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0) process.exit(1);
