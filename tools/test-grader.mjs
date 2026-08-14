// 评级器单元测试（第一部分：求解器正确性 + 技巧层级）
// 独立于 Web 运行，直接 import 纯函数模块 grader.js / sudoku.js。
// 关键安全网：用独立暴力求解器验证 logicSolve 落子结果 100% 正确（绝不落错子）。

import { grade, logicSolve, MAX_LEVEL, techniqueName } from '../web/js/grader.js';
import { generateSolved, hasUniqueSolution, canPlace } from '../web/js/sudoku.js';

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) passed++;
  else {
    failed++;
    console.error('  ✗ ' + msg);
  }
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function bruteForce(grid) {
  const g = grid.slice();
  function solve() {
    const idx = g.indexOf(0);
    if (idx === -1) return true;
    for (let v = 1; v <= 9; v++) {
      if (canPlace(g, idx, v)) {
        g[idx] = v;
        if (solve()) return true;
        g[idx] = 0;
      }
    }
    return false;
  }
  return solve() ? g : null;
}
function digKeepingUnique(solution, removals) {
  const p = solution.slice();
  const order = shuffle([...Array(81).keys()]);
  let n = 0;
  for (const idx of order) {
    if (n >= removals) break;
    const b = p[idx];
    p[idx] = 0;
    if (!hasUniqueSolution(p)) p[idx] = b;
    else n++;
  }
  return p;
}

// 1) 满盘 grade === 0
{
  const sol = generateSolved();
  assert(grade(sol) === 0, '满盘（无空格）应评级 0');
}

// 2) 仅 1 个空格 → 唯一余数即可解出，grade === 0
{
  const sol = generateSolved();
  const p = sol.slice();
  const empty = Math.floor(Math.random() * 81);
  p[empty] = 0;
  assert(grade(p) === 0, '单空格应评级 0（唯一余数）');
}

// 3) 求解器正确性：随机浅挖的盘面，logicSolve 落子结果必等于暴力解（不落错子）
{
  let solvedCount = 0;
  let mismatch = 0;
  const N = 200;
  for (let t = 0; t < N; t++) {
    const sol = generateSolved();
    const p = digKeepingUnique(sol, 12 + Math.floor(Math.random() * 14)); // 挖 12~25 格
    const res = logicSolve(p, MAX_LEVEL);
    if (res.solved) {
      solvedCount++;
      // 逻辑解必须唯一且等于原始解
      const bf = bruteForce(p);
      if (!bf || bf.join('') !== res.grid.join('')) mismatch++;
    }
  }
  assert(mismatch === 0, `logicSolve 落子与暴力解完全一致（错配 ${mismatch}）`);
  assert(solvedCount > N * 0.8, `浅挖盘面多数可被逻辑解覆盖（实际 ${solvedCount}/${N}）`);
  console.log(`  · 浅挖样本：逻辑可解 ${solvedCount}/${N}，错配 ${mismatch}`);
}

// 4) 各技巧层级命名存在且覆盖实现范围
{
  assert(techniqueName(0).includes('Naked Single'), 'L0 命名含 Naked Single');
  assert(techniqueName(MAX_LEVEL).length > 0, `L${MAX_LEVEL} 命名非空`);
  assert(techniqueName(MAX_LEVEL + 1).includes('试数'), '超出范围命名提示需试数');
}

console.log(`\n评级器求解正确性：${passed} 通过 / ${failed} 失败`);

// 5) 生成契约：每个难度生成的盘面都满足 grade ≤ 目标层级、唯一解、且与暴力解一致
import { makePuzzle, DIFFICULTIES } from '../web/js/sudoku.js';

{
  const PER = 8;
  const maxGrade = {};
  for (const d of DIFFICULTIES) {
    const dist = {};
    let okAll = true;
    for (let t = 0; t < PER; t++) {
      const { puzzle, solution, grade: g } = makePuzzle(d.id);
      const uniq = hasUniqueSolution(puzzle);
      const bf = bruteForce(puzzle);
      const match = bf && bf.join('') === solution.join('');
      if (!(g <= d.level && uniq && match)) okAll = false;
      dist[g] = (dist[g] || 0) + 1;
      maxGrade[d.id] = Math.max(maxGrade[d.id] || 0, g);
    }
    assert(okAll, `${d.label}：每局都应 grade≤${d.level} 且唯一解且与暴力解一致`);
    console.log(`  · ${d.label} 评级分布(样本${PER}):`, JSON.stringify(dist));
  }
  // 正向信号：高档位应确实用到对应技巧（拒绝采样生效）
  assert(maxGrade.easy >= 1, `简单档应出现需「唯一候选」的盘（观测 ${maxGrade.easy}）`);
  assert(maxGrade.expert >= 4, `专家档应出现需「区块/三数」的盘（观测 ${maxGrade.expert}）`);
  assert(maxGrade.master >= 9, `极限档应出现需「XY-Wing」的盘（观测 ${maxGrade.master}）`);
}

console.log(`\n评级器 + 生成契约：${passed} 通过 / ${failed} 失败`);
if (failed > 0) process.exit(1);

