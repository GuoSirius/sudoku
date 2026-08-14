// 数独引擎：完整解生成、挖空保证唯一解、冲突检测、难度分级
// 纯函数，无 DOM 依赖，可在浏览器或 Node 中运行。

export const SIZE = 9;

// 难度由「双轴」共同决定，保证逐级均匀、体感明显：
//   · 技巧轴 level：解开本局所需的最难逻辑技巧层级（对应 grader.js 的技巧阶梯）。
//     自然随机盘的技巧评级集中在 0~4 与 9（需进阶链），故 level 映射到这些自然存在的层级。
//   · 空格轴 clues：给定数区间 [cluesMin, cluesMax]。clues 越小空格越多、搜索空间越大、越难；
//     用 clues 主轴把入门→极限均匀铺开（每档 clues 递减约 5），再叠加 level 封顶保证技巧仍逐级进阶。
// 入门(level 0) 特殊：用 digCap(0) 只保留唯一余数可解，产出的盘 grade 恰为 0、clues 自然偏多。
// hints 用于难度选择弹窗，告诉玩家这一档在练什么。
export const DIFFICULTIES = [
  { id: 'beginner', label: '入门', level: 0, cluesMin: 46, cluesMax: 54, hint: '仅唯一余数，最适合新手建立信心' },
  { id: 'easy', label: '简单', level: 1, cluesMin: 41, cluesMax: 46, hint: '唯一候选，稳定上手' },
  { id: 'medium', label: '中等', level: 2, cluesMin: 36, cluesMax: 40, hint: '数对（Naked/Hidden Pair）' },
  { id: 'hard', label: '困难', level: 3, cluesMin: 31, cluesMax: 35, hint: '隐性数对（Hidden Pair）' },
  { id: 'expert', label: '专家', level: 4, cluesMin: 27, cluesMax: 30, hint: '区块摒除与三数（Pointing/Triple）' },
  { id: 'master', label: '极限', level: 9, cluesMin: 21, cluesMax: 29, hint: 'XY-Wing 级进阶逻辑，硬核烧脑' },
];
export const DIFFICULTY_BY_ID = Object.fromEntries(DIFFICULTIES.map((d) => [d.id, d]));

export function emptyGrid() {
  return new Array(81).fill(0);
}

export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// 判断在 idx 处放 val 是否不与当前 grid 的行/列/宫冲突
export function canPlace(grid, idx, val) {
  const r = Math.floor(idx / 9);
  const c = idx % 9;
  for (let i = 0; i < 9; i++) {
    if (grid[r * 9 + i] === val) return false; // 行
    if (grid[i * 9 + c] === val) return false; // 列
  }
  const br = Math.floor(r / 3) * 3;
  const bc = Math.floor(c / 3) * 3;
  for (let dr = 0; dr < 3; dr++) {
    for (let dc = 0; dc < 3; dc++) {
      if (grid[(br + dr) * 9 + (bc + dc)] === val) return false; // 宫
    }
  }
  return true;
}

// 随机化回溯填满一个完整合法解
function fillGrid(grid) {
  const idx = grid.indexOf(0);
  if (idx === -1) return true;
  const candidates = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  for (const v of candidates) {
    if (canPlace(grid, idx, v)) {
      grid[idx] = v;
      if (fillGrid(grid)) return true;
      grid[idx] = 0;
    }
  }
  return false;
}

export function generateSolved() {
  const g = emptyGrid();
  fillGrid(g);
  return g;
}

// 统计解的数量，最多数到 limit（用于唯一性判定，limit=2 足够）
function countSolutions(grid, limit = 2) {
  let count = 0;
  const work = grid.slice();
  function solve() {
    if (count >= limit) return;
    const idx = work.indexOf(0);
    if (idx === -1) {
      count++;
      return;
    }
    for (let v = 1; v <= 9; v++) {
      if (canPlace(work, idx, v)) {
        work[idx] = v;
        solve();
        work[idx] = 0;
        if (count >= limit) return;
      }
    }
  }
  solve();
  return count;
}

export function hasUniqueSolution(grid) {
  return countSolutions(grid, 2) === 1;
}

// 根据难度生成谜题（双轴：clues 空格数 + level 技巧层级）。
//   · 入门(level 0)：digCap(0) 只保留唯一余数可解，grade 恰为 0、clues 自然偏多（不变）。
//   · 其余档：挖空目标改为「挖到目标 clues 区间」而非挖到最稀疏——随机顺序挖空中，
//     每挖一格都用 logicSolve(puzzle, level) 校验：一旦不可解(需 >level 技巧)就回退该格。
//     这样既保证最终盘面唯一解且 grade ≤ level，又让 clues 真正落入区间，产生平滑难度梯度。
//   多次尝试中：命中 g === level 直接采用（名副其实）；否则保留 ≤level 且最接近的最佳盘面。
// 返回 { puzzle, solution, grade, clues }：grade 为实际评级（≤level），clues 为给定数。
import { logicSolve, grade, MAX_LEVEL } from './grader.js';

// 挖到最稀疏且逻辑可解（仅用 ≤MAX_LEVEL 技巧仍可解）。
// 关键：logicSolve 落子全为强制技巧 ⇒ 可解即唯一解，免去昂贵的 countSolutions 回溯，
// 生成速度提升一个数量级，且最终盘面仍保证唯一解。
function maximalDig() {
  const solution = generateSolved();
  const puzzle = solution.slice();
  const order = shuffle([...Array(81).keys()]);
  for (const idx of order) {
    if (puzzle[idx] === 0) continue;
    const backup = puzzle[idx];
    puzzle[idx] = 0;
    if (!logicSolve(puzzle, MAX_LEVEL).solved) puzzle[idx] = backup;
  }
  return { puzzle, solution };
}
// 按技巧上限挖空：仅保留「用 ≤cap 技巧仍唯一可解」的挖法，用于入门档。
// floor 为「最少提示数」：挖到 clues ≤ floor 即停止，从而保留较多提示、看着就简单（不挖到最稀疏）。
function digCap(cap, floor = 0) {
  const solution = generateSolved();
  const puzzle = solution.slice();
  let clues = 81;
  const order = shuffle([...Array(81).keys()]);
  for (const idx of order) {
    if (clues <= floor) break; // 已保留足够多提示，停止挖空
    const backup = puzzle[idx];
    puzzle[idx] = 0;
    if (!logicSolve(puzzle, cap).solved) puzzle[idx] = backup;
    else clues--;
  }
  const g = grade(puzzle);
  return { puzzle, solution, grade: g, clues: puzzle.filter((v) => v !== 0).length };
}

export function makePuzzle(difficulty = 'medium') {
  const def = DIFFICULTY_BY_ID[difficulty] || DIFFICULTY_BY_ID.medium;
  const level = def.level;
  const { cluesMin, cluesMax } = def;
  if (level === 0) return digCap(0, def.cluesMin); // 入门：保证 grade 0、且保留较多提示（看着就简单）
  // 极限(level 9)：挖到最稀疏且逻辑可解(=唯一解) 的盘面；优先选「需 XY-Wing(grade 9)」的盘，
  // 命中即采用，否则取评级最高者。clues 由挖空自然决定（约 21~29）。
  if (level === 9) {
    let best = null;
    const TRIES = 40;
    for (let i = 0; i < TRIES; i++) {
      const { puzzle, solution } = maximalDig();
      const g = grade(puzzle);
      const clues = puzzle.filter((v) => v !== 0).length;
      if (g === 9) return { puzzle, solution, grade: g, clues };
      if (best === null || g > best.grade || (g === best.grade && clues < best.clues)) {
        best = { puzzle, solution, grade: g, clues };
      }
    }
    return best;
  }
  let best = null; // 最佳逼近：≤level 且最接近 level
  const MAX_ATTEMPTS = 80;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const solution = generateSolved();
    const puzzle = solution.slice();
    const target = cluesMin + Math.floor(Math.random() * (cluesMax - cluesMin + 1));
    let clues = 81;
    const order = shuffle([...Array(81).keys()]);
    for (const idx of order) {
      if (clues <= target) break;
      const backup = puzzle[idx];
      puzzle[idx] = 0;
      // 回退：挖掉后失去唯一解(需 >level 技巧才解得开) → 复原该格
      if (!logicSolve(puzzle, level).solved) {
        puzzle[idx] = backup;
      } else {
        clues--;
      }
    }
    const g = grade(puzzle);
    const finalClues = puzzle.filter((v) => v !== 0).length;
    if (g === level) {
      return { puzzle, solution, grade: g, clues: finalClues };
    }
    // 记录最接近 level(且 ≤level) 的盘面；同 level 时优先 clues 更贴近 target
    const better =
      best === null ||
      g > best.grade ||
      (g === best.grade && Math.abs(finalClues - target) < Math.abs(best.clues - target));
    if (g <= level && better) {
      best = { puzzle, solution, grade: g, clues: finalClues };
    }
  }
  // 兜底：返回最佳逼近；极端情况退化为 cap 挖空
  return best || digCap(level);
}

// 找出当前盘面上所有冲突格（同行/列/宫重复），返回冲突索引的 Set
export function findConflicts(grid) {
  const conflicts = new Set();
  const checkGroup = (indices) => {
    const seen = {};
    for (const i of indices) {
      const v = grid[i];
      if (v === 0) continue;
      if (seen[v] !== undefined) {
        conflicts.add(i);
        conflicts.add(seen[v]);
      } else {
        seen[v] = i;
      }
    }
  };
  for (let r = 0; r < 9; r++) {
    checkGroup([...Array(9)].map((_, c) => r * 9 + c));
  }
  for (let c = 0; c < 9; c++) {
    checkGroup([...Array(9)].map((_, r) => r * 9 + c));
  }
  for (let br = 0; br < 3; br++) {
    for (let bc = 0; bc < 3; bc++) {
      const g = [];
      for (let dr = 0; dr < 3; dr++) {
        for (let dc = 0; dc < 3; dc++) {
          g.push((br * 3 + dr) * 9 + (bc * 3 + dc));
        }
      }
      checkGroup(g);
    }
  }
  return conflicts;
}

export function isComplete(grid) {
  return grid.every((v) => v !== 0);
}

export function formatTime(ms) {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
