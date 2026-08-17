// 数独引擎：完整解生成、挖空保证唯一解、冲突检测、难度分级
// 纯函数，无 DOM 依赖，可在浏览器或 Node 中运行。

export const SIZE = 9;

// 难度由「双轴」共同决定，保证逐级均匀、体感明显：
//   · 空格轴 clues（主轴）：给定数区间 [cluesMin, cluesMax]。clues 越小空格越多、越难；
//     用 clues 主轴把入门→极限单调铺开（每档约递减 5），是档间梯度的主要来源，也保留存（入门看着就空得少）。
//   · 技巧轴 grade：本局实际最难逻辑技巧层级（对应 grader.js 技巧阶梯），由盘面自然浮动、不写死、不封顶；
//     自然随机盘评级集中在 0~4 与 9，进阶技巧（区块/X-Wing/XY-Wing）主要靠「稀疏奖励」偶发触达。
//   · 各档 level 字段仅作分流：level 0 → digCap 保留多提示（入门恒最简单、技巧组合 [0]）；
//     level 9 → maximalDig 挖到最稀疏并优先取 XY-Wing(g9) 盘（极限硬核）；中间档忽略 level，只挖到目标 clues。
// hints 用于难度选择弹窗，描述这一档常见练法（因每局实际技巧随盘面浮动，措辞为「常见组合」而非固定）。
export const DIFFICULTIES = [
  { id: 'beginner', label: '入门', level: 0, cluesMin: 46, cluesMax: 54, hint: '仅唯一余数，最适合新手建立信心' },
  { id: 'easy', label: '简单', level: 1, cluesMin: 41, cluesMax: 46, hint: '唯一余数与候选，轻松上手' },
  { id: 'medium', label: '中等', level: 2, cluesMin: 33, cluesMax: 37, hint: '每局技巧组合不同，含数对 / 区块 / 区块摒除，常有变化' },
  { id: 'hard', label: '困难', level: 3, cluesMin: 28, cluesMax: 32, hint: '每局不同，常出现 X-Wing / XY-Wing 进阶' },
  { id: 'expert', label: '专家', level: 4, cluesMin: 24, cluesMax: 27, hint: '区块摒除 / 三数 / X-Wing，硬核进阶' },
  { id: 'master', label: '极限', level: 9, cluesMin: 20, cluesMax: 26, hint: 'XY-Wing 级进阶逻辑，硬核烧脑' },
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

// 根据难度生成谜题：难度由「空格数区间 clues」定义（保证梯度、保留存），
// 而「本局实际用到的最难技巧 grade」随盘面自然浮动、不写死——
// 同一档每局锻炼的技巧组合都不同，中等/困难偶发更稀疏可触达 X-Wing / XY-Wing。
//   · 入门(level 0)：digCap(0) 保留较多提示、明显最简单。
//   · 极限(level 9)：maximalDig 挖到最稀疏且唯一解，优先选需 XY-Wing(grade 9) 的盘。
//   · 中间档：挖到目标 clues 区间（gate 用 logicSolve(.,MAX_LEVEL) 保证唯一解），
//     中等/困难加 18% 稀疏奖励。
// 返回 { puzzle, solution, grade, clues }。
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
  // 入门(level 0)：保留较多提示、明显最简单，技巧组合恒为 [0]
  if (level === 0) {
    const r = digCap(0, def.cluesMin);
    return { puzzle: r.puzzle, solution: r.solution, grade: r.grade, clues: r.clues };
  }
  // 极限(level 9)：挖到最稀疏且逻辑可解(=唯一解)；优先选需 XY-Wing(grade 9) 的盘，命中即采用
  if (level === 9) {
    let best = null;
    const TRIES = 56; // 加大尝试次数，更稳地命中高评级盘，使「极限」名副其实地最难
    for (let i = 0; i < TRIES; i++) {
      const { puzzle, solution } = maximalDig();
      const res = logicSolve(puzzle, MAX_LEVEL);
      const g = res.usedLevel;
      const clues = puzzle.filter((v) => v !== 0).length;
      if (g === 9) return { puzzle, solution, grade: g, clues };
      if (best === null || g > best.grade || (g === best.grade && clues < best.clues)) {
        best = { puzzle, solution, grade: g, clues };
      }
    }
    return best;
  }
  // 中间档(简单/中等/困难/专家)：挖空目标改为「挖到目标 clues 区间」，gate 用 logicSolve(.,MAX_LEVEL)
  // 保证唯一解；grade 由实际求解决定、不封顶——同一档每局技巧组合自然不同。
  // 中等/困难 加 18%「稀疏奖励」：偶发挖到 26 提示数(≈55 空)，可触达 区块摒除 / X-Wing / XY-Wing 等进阶技巧，
  // 从而「中等甚至能用 X/XY」、每局解法组合不写死。
  let target = cluesMin + Math.floor(Math.random() * (cluesMax - cluesMin + 1));
  // 困难档保留 18%「稀疏奖励」：偶发降到 26 提示数，可触达 X-Wing / XY-Wing 等进阶技巧，增添变化；
  // 中等档不再享受该奖励，保证稳定落在 33~37 区间、与「中等」标签一致。
  if (difficulty === 'hard' && Math.random() < 0.18) {
    target = 26;
  }
  return digToTarget(target);
}

// 挖到目标 clues 数（clues 降到 target 即停），用 logicSolve(.,MAX_LEVEL) 逐格校验保证最终盘面唯一解。
// 返回 { puzzle, solution, grade, clues }：grade 为本局最难技巧。
function digToTarget(targetClues) {
  const solution = generateSolved();
  const puzzle = solution.slice();
  let clues = 81;
  const order = shuffle([...Array(81).keys()]);
  for (const idx of order) {
    if (clues <= targetClues) break;
    const backup = puzzle[idx];
    puzzle[idx] = 0;
    if (!logicSolve(puzzle, MAX_LEVEL).solved) puzzle[idx] = backup; // 失去唯一解 → 复原该格
    else clues--;
  }
  const res = logicSolve(puzzle, MAX_LEVEL);
  return {
    puzzle,
    solution,
    grade: res.usedLevel,
    clues: puzzle.filter((v) => v !== 0).length,
  };
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
