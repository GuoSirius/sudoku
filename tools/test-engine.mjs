// 引擎自检：验证各难度谜题的生成、唯一解、技巧评级与可解性
import {
  makePuzzle,
  hasUniqueSolution,
  findConflicts,
  DIFFICULTIES,
  isComplete,
  DIFFICULTY_BY_ID,
} from '../web/js/sudoku.js';
import { grade, techniqueName } from '../web/js/grader.js';

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
  console.log(`测试难度: ${d.label} (技巧层级 ${d.level} = ${techniqueName(d.level)})`);
  const t0 = Date.now();
  const { puzzle, solution, grade: g, clues } = makePuzzle(d.id);
  const dt = Date.now() - t0;

  assert(g <= d.level, `实际评级 ${g} 应 ≤ 目标层级 ${d.level}`);
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
  // grade 字段应与独立评级一致
  assert(g === grade(puzzle), '返回的 grade 应与独立评级一致');
  // 给定数合理性（不应为空盘或满盘）
  assert(clues > 17 && clues < 81, `给定数 ${clues} 应在合法区间`);
  console.log(`  ✓ 耗时 ${dt}ms, 实际提示数 ${clues}, 实际评级 ${g} (${techniqueName(g)})`);
}

// 向后兼容：旧难度 id 仍存在于映射中
for (const id of ['easy', 'medium', 'hard', 'expert']) {
  assert(DIFFICULTY_BY_ID[id], `旧难度 id "${id}" 仍应存在`);
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0) process.exit(1);

