// 数独引擎：完整解生成、挖空保证唯一解、冲突检测、难度分级
// 纯函数，无 DOM 依赖，可在浏览器或 Node 中运行。

export const SIZE = 9;

// 各难度对应的“提示数”（剩余格子数）。越少越难。
export const DIFFICULTY_CLUES = {
  easy: 45,
  medium: 34,
  hard: 30,
  expert: 26,
};

export const DIFFICULTIES = [
  { id: 'easy', label: '简单', clues: 45 },
  { id: 'medium', label: '中等', clues: 34 },
  { id: 'hard', label: '困难', clues: 30 },
  { id: 'expert', label: '专家', clues: 26 },
];

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

// 根据难度生成谜题：保留 solution 用于校验/错误计数/复盘
export function makePuzzle(difficulty = 'medium') {
  const solution = generateSolved();
  const puzzle = solution.slice();
  const target = DIFFICULTY_CLUES[difficulty] ?? 34;
  const cells = shuffle([...Array(81).keys()]);
  let givens = 81;
  for (const idx of cells) {
    if (givens <= target) break;
    const backup = puzzle[idx];
    if (backup === 0) continue;
    puzzle[idx] = 0;
    if (countSolutions(puzzle, 2) !== 1) {
      puzzle[idx] = backup; // 破坏唯一解，撤销挖空
    } else {
      givens--;
    }
  }
  return { puzzle, solution };
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
