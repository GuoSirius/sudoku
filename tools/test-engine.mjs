// 引擎自检：验证各难度谜题的生成、唯一解、可解性
import {
  makePuzzle,
  hasUniqueSolution,
  findConflicts,
  DIFFICULTIES,
  isComplete,
} from '../web/js/sudoku.js';

let pass = 0;
let fail = 0;

function assert(cond, msg) {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.error('  ✗ FAIL:', msg);
  }
}

for (const d of DIFFICULTIES) {
  console.log(`测试难度: ${d.label} (目标提示数 ${d.clues})`);
  const t0 = Date.now();
  const { puzzle, solution } = makePuzzle(d.id);
  const dt = Date.now() - t0;
  const givens = puzzle.filter((v) => v !== 0).length;

  assert(givens >= d.clues - 2, `提示数 ${givens} 应接近目标 ${d.clues}`);
  assert(hasUniqueSolution(puzzle), '谜题应有唯一解');
  assert(isComplete(solution), '完整解应填满');
  assert(findConflicts(solution).size === 0, '完整解应无冲突');
  // 初始谜面不应有冲突
  assert(findConflicts(puzzle).size === 0, '初始谜面不应有冲突');
  // 解的提示位置与谜面一致
  let consistent = true;
  for (let i = 0; i < 81; i++) {
    if (puzzle[i] !== 0 && puzzle[i] !== solution[i]) consistent = false;
  }
  assert(consistent, '谜面提示必须与解一致');
  console.log(`  ✓ 耗时 ${dt}ms, 实际提示数 ${givens}`);
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0) process.exit(1);
