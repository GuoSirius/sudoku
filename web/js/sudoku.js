// 数独引擎：完整解生成、挖空保证唯一解、冲突检测、难度分级
// 纯函数，无 DOM 依赖，可在浏览器或 Node 中运行。

export const SIZE = 9;

// 难度由「解开本局所需的最难逻辑技巧」决定（不是给定数）。
// level 对应 grader.js 的技巧层级；自然随机盘的技巧评级集中在 0~4 与 9（需进阶链），
// 故难度档映射到这些自然存在的层级，保证每档都能稳定产出、逐级递增。
// hints 用于难度选择弹窗，告诉玩家这一档在练什么。
export const DIFFICULTIES = [
  { id: 'beginner', label: '入门', level: 0, hint: '仅唯一余数，最适合新手建立信心' },
  { id: 'easy', label: '简单', level: 1, hint: '唯一候选，稳定上手' },
  { id: 'medium', label: '中等', level: 2, hint: '数对（Naked/Hidden Pair）' },
  { id: 'hard', label: '困难', level: 3, hint: '隐性数对（Hidden Pair）' },
  { id: 'expert', label: '专家', level: 4, hint: '区块摒除与三数（Pointing/Triple）' },
  { id: 'master', label: '极限', level: 9, hint: 'XY-Wing 级进阶逻辑，硬核烧脑' },
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

// 根据难度生成谜题：难度 = 解开本局所需的最难逻辑技巧层级（见 grader.js）。
// 自然随机盘的技巧评级集中在 0~4 与 9（需进阶链）；故采用「拒绝采样 + 最佳逼近」：
//   1) 回溯出完整解 → 随机顺序挖到最稀疏且唯一解（不限制技巧），得到该局可达的最高难度；
//   2) 计算实际评级 g：若 g === 目标层级，直接采用（名副其实）；
//      否则在多次尝试中保留「≤目标层级且最接近目标」的最佳盘面（保证不超档、尽量贴档）。
//   3) 入门档(level 0)特殊：用 cap 挖空（仅唯一余数可解）保证产出的盘 grade 恰为 0。
// 返回 { puzzle, solution, grade, clues }：grade 为实际评级（≤level），clues 为给定数（仅展示）。
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
// 按技巧上限挖空：仅保留「用 ≤cap 技巧仍唯一可解」的挖法，用于入门档
function digCap(cap) {
  const solution = generateSolved();
  const puzzle = solution.slice();
  const order = shuffle([...Array(81).keys()]);
  for (const idx of order) {
    if (puzzle[idx] === 0) continue;
    const backup = puzzle[idx];
    puzzle[idx] = 0;
    if (!logicSolve(puzzle, cap).solved) puzzle[idx] = backup;
  }
  const g = grade(puzzle);
  return { puzzle, solution, grade: g, clues: puzzle.filter((v) => v !== 0).length };
}

export function makePuzzle(difficulty = 'medium') {
  const def = DIFFICULTY_BY_ID[difficulty] || DIFFICULTY_BY_ID.medium;
  const level = def.level;
  if (level === 0) return digCap(0); // 入门：保证 grade 0
  let best = null; // 最佳逼近：≤level 且最接近 level
  const MAX_ATTEMPTS = 60;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const { puzzle, solution } = maximalDig();
    const g = grade(puzzle);
    if (g === level) {
      return { puzzle, solution, grade: g, clues: puzzle.filter((v) => v !== 0).length };
    }
    if (g < level && (best === null || g > best.grade)) {
      best = { puzzle, solution, grade: g, clues: puzzle.filter((v) => v !== 0).length };
    }
  }
  // 兜底：返回最佳逼近（grade<level，最高者）；极端情况退化为 cap 挖空
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
