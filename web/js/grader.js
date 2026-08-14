// 数独技巧评级器：用「纯逻辑推理」求解盘面，并记录解开本局所需的最难技巧层级。
// 纯函数，无 DOM 依赖，可在浏览器或 Node 中运行。
//
// 设计要点：
//  - 所有「落子」只由强制技巧（naked single / hidden single）产生，绝不猜测，
//    因此只要 logicSolve 返回 solved，其解必为唯一正确解（可逻辑完备 ⇒ 唯一解）。
//  - 高级技巧（数对/区块/三数/X-Wing/剑鱼）只做候选数消减，不改变盘面数字，
//    即使实现有偏差也只会「低估」难度（把本可解的盘判为不可解），不会落错子。
//  - grade(puzzle) = 能解开本局所需的最难技巧最小层级；超出实现范围返回 MAX_LEVEL+1（需试数）。

// ---------------- 基础工具 ----------------
const BIT = (d) => 1 << d; // d ∈ 1..9
const ALL = 0b1111111110; // bits 1..9 全置位
function popcount(m) {
  let n = 0;
  while (m) {
    n += m & 1;
    m >>= 1;
  }
  return n;
}
function digitsOf(m) {
  const a = [];
  for (let d = 1; d <= 9; d++) if (m & BIT(d)) a.push(d);
  return a;
}

// ---------------- 单元（行/列/宫）与同区(peers) ----------------
const ROWS = [];
const COLS = [];
const BOXES = [];
for (let i = 0; i < 9; i++) {
  const row = [];
  const col = [];
  for (let j = 0; j < 9; j++) {
    row.push(i * 9 + j);
    col.push(j * 9 + i);
  }
  ROWS.push(row);
  COLS.push(col);
}
for (let b = 0; b < 9; b++) {
  const br = Math.floor(b / 3) * 3;
  const bc = (b % 3) * 3;
  const cells = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) cells.push((br + r) * 9 + (bc + c));
  BOXES.push(cells);
}
const UNITS = [...ROWS, ...COLS, ...BOXES];

const boxIndexOf = (i) => Math.floor(i / 9 / 3) * 3 + Math.floor((i % 9) / 3);

const PEERS = [];
for (let i = 0; i < 81; i++) {
  const s = new Set();
  for (const u of UNITS) {
    if (u.includes(i)) for (const j of u) if (j !== i) s.add(j);
  }
  PEERS.push([...s]);
}

// ---------------- 候选数与落子 ----------------
function computeCands(grid) {
  const cands = new Array(81).fill(0);
  for (let i = 0; i < 81; i++) {
    if (grid[i] !== 0) {
      cands[i] = 0;
      continue;
    }
    let m = ALL;
    for (const p of PEERS[i]) if (grid[p] !== 0) m &= ~BIT(grid[p]);
    cands[i] = m;
  }
  return cands;
}
function place(grid, cands, idx, d) {
  grid[idx] = d;
  cands[idx] = 0;
  const bit = BIT(d);
  for (const p of PEERS[idx]) if (grid[p] === 0) cands[p] &= ~bit;
}
function isFull(grid) {
  return grid.every((v) => v !== 0);
}

// ---------------- 各级技巧（index = 技巧层级）----------------
// 每个函数尝试在 (grid,cands) 上应用一步；成功返回 true（并就地修改）。

// L0 唯一余数：某空格仅剩 1 个候选 → 落子
function tNakedSingle(grid, cands) {
  for (let i = 0; i < 81; i++) {
    if (grid[i] === 0 && popcount(cands[i]) === 1) {
      place(grid, cands, i, digitsOf(cands[i])[0]);
      return true;
    }
  }
  return false;
}

// L1 唯一候选：某单元内某数字仅在一个空格出现 → 落子
function tHiddenSingle(grid, cands) {
  for (const u of UNITS) {
    for (let d = 1; d <= 9; d++) {
      const bit = BIT(d);
      let cnt = 0;
      let cell = -1;
      for (const i of u) {
        if (grid[i] === 0 && cands[i] & bit) {
          cnt++;
          cell = i;
          if (cnt > 1) break;
        }
      }
      if (cnt === 1) {
        place(grid, cands, cell, d);
        return true;
      }
    }
  }
  return false;
}

// L2 显性数对：单元内两格候选数完全相同（恰好 2 个）→ 该单元其余格消去这两个数字
function tNakedPair(grid, cands) {
  for (const u of UNITS) {
    for (let a = 0; a < u.length; a++) {
      for (let b = a + 1; b < u.length; b++) {
        const i = u[a];
        const j = u[b];
        if (grid[i] !== 0 || grid[j] !== 0) continue;
        if (cands[i] !== 0 && cands[i] === cands[j] && popcount(cands[i]) === 2) {
          const pair = cands[i];
          let changed = false;
          for (const k of u) {
            if (k !== i && k !== j && grid[k] === 0 && cands[k] & pair) {
              cands[k] &= ~pair;
              changed = true;
            }
          }
          if (changed) return true;
        }
      }
    }
  }
  return false;
}

// L3 隐性数对：单元内两数字仅共同出现在相同的两格 → 这两格候选数限制为这两个数字
function tHiddenPair(grid, cands) {
  for (const u of UNITS) {
    for (let a = 1; a <= 9; a++) {
      for (let b = a + 1; b <= 9; b++) {
        const ba = BIT(a);
        const bb = BIT(b);
        const cells = [];
        for (const i of u) if (grid[i] === 0 && (cands[i] & ba) && (cands[i] & bb)) cells.push(i);
        if (cells.length !== 2) continue;
        let ca = 0;
        let cb = 0;
        for (const i of u) {
          if (grid[i] === 0) {
            if (cands[i] & ba) ca++;
            if (cands[i] & bb) cb++;
          }
        }
        if (ca !== 2 || cb !== 2) continue;
        const mask = ba | bb;
        let changed = false;
        for (const i of cells) if (cands[i] !== mask) { cands[i] = mask; changed = true; }
        if (changed) return true;
      }
    }
  }
  return false;
}

// L4 区块摒除（pointing + claiming）：候选数被锁在一条线/一个宫内
function tLocked(grid, cands) {
  // 宫内候选锁定到一行/一列 → 消除该行/列其余宫格的该数
  for (const box of BOXES) {
    for (let d = 1; d <= 9; d++) {
      const bit = BIT(d);
      const cells = box.filter((i) => grid[i] === 0 && cands[i] & bit);
      if (cells.length < 2) continue;
      const rows = new Set(cells.map((i) => Math.floor(i / 9)));
      const cols = new Set(cells.map((i) => i % 9));
      if (rows.size === 1) {
        const r = [...rows][0];
        let ch = false;
        for (let c = 0; c < 9; c++) {
          const i = r * 9 + c;
          if (!box.includes(i) && grid[i] === 0 && cands[i] & bit) { cands[i] &= ~bit; ch = true; }
        }
        if (ch) return true;
      }
      if (cols.size === 1) {
        const c = [...cols][0];
        let ch = false;
        for (let r = 0; r < 9; r++) {
          const i = r * 9 + c;
          if (!box.includes(i) && grid[i] === 0 && cands[i] & bit) { cands[i] &= ~bit; ch = true; }
        }
        if (ch) return true;
      }
    }
  }
  // 行内候选锁定到一个宫 → 消除该宫其余行的该数
  for (const row of ROWS) {
    for (let d = 1; d <= 9; d++) {
      const bit = BIT(d);
      const cells = row.filter((i) => grid[i] === 0 && cands[i] & bit);
      if (cells.length < 2) continue;
      const boxes = new Set(cells.map((i) => boxIndexOf(i)));
      if (boxes.size !== 1) continue;
      const b = [...boxes][0];
      let ch = false;
      for (const i of BOXES[b]) {
        if (!row.includes(i) && grid[i] === 0 && cands[i] & bit) { cands[i] &= ~bit; ch = true; }
      }
      if (ch) return true;
    }
  }
  // 列内候选锁定到一个宫
  for (const col of COLS) {
    for (let d = 1; d <= 9; d++) {
      const bit = BIT(d);
      const cells = col.filter((i) => grid[i] === 0 && cands[i] & bit);
      if (cells.length < 2) continue;
      const boxes = new Set(cells.map((i) => boxIndexOf(i)));
      if (boxes.size !== 1) continue;
      const b = [...boxes][0];
      let ch = false;
      for (const i of BOXES[b]) {
        if (!col.includes(i) && grid[i] === 0 && cands[i] & bit) { cands[i] &= ~bit; ch = true; }
      }
      if (ch) return true;
    }
  }
  return false;
}

// L5 显性三数：单元内三格候选并集恰好 3 个数字且各格候选均为其子集 → 其余格消去这 3 个数字
function tNakedTriple(grid, cands) {
  for (const u of UNITS) {
    const empties = u.filter((i) => grid[i] === 0 && popcount(cands[i]) >= 2 && popcount(cands[i]) <= 3);
    for (let a = 0; a < empties.length; a++) {
      for (let b = a + 1; b < empties.length; b++) {
        for (let c = b + 1; c < empties.length; c++) {
          const i = empties[a];
          const j = empties[b];
          const k = empties[c];
          const union = cands[i] | cands[j] | cands[k];
          if (popcount(union) !== 3) continue;
          if ((cands[i] & union) !== cands[i]) continue;
          if ((cands[j] & union) !== cands[j]) continue;
          if ((cands[k] & union) !== cands[k]) continue;
          let changed = false;
          for (const x of u) {
            if (x !== i && x !== j && x !== k && grid[x] === 0 && cands[x] & union) {
              cands[x] &= ~union;
              changed = true;
            }
          }
          if (changed) return true;
        }
      }
    }
  }
  return false;
}

// L6 隐性三数：单元内三数字仅共同出现在相同的三格 → 这三格候选限制为这三个数字
function tHiddenTriple(grid, cands) {
  for (const u of UNITS) {
    for (let a = 1; a <= 9; a++) {
      for (let b = a + 1; b <= 9; b++) {
        for (let c = b + 1; c <= 9; c++) {
          const mask = BIT(a) | BIT(b) | BIT(c);
          const cells = u.filter((i) => grid[i] === 0 && cands[i] & mask);
          if (cells.length !== 3) continue;
          let ca = 0;
          let cb = 0;
          let cc = 0;
          for (const i of u) {
            if (grid[i] === 0) {
              if (cands[i] & BIT(a)) ca++;
              if (cands[i] & BIT(b)) cb++;
              if (cands[i] & BIT(c)) cc++;
            }
          }
          if (ca !== 3 || cb !== 3 || cc !== 3) continue;
          let changed = false;
          for (const i of cells) if (cands[i] !== mask) { cands[i] = mask; changed = true; }
          if (changed) return true;
        }
      }
    }
  }
  return false;
}

// L7 X-Wing：某数字在两行（列）的候选列（行）恰好成 2×2 矩形 → 消除这两列（行）其余行的该数
function tXWing(grid, cands) {
  for (let d = 1; d <= 9; d++) {
    const bit = BIT(d);
    // rowCols[r] = 行 r 中候选含 d 的列号列表；colRows[c] = 列 c 中候选含 d 的行号列表
    const rowCols = ROWS.map((row) => row.filter((i) => grid[i] === 0 && cands[i] & bit).map((i) => i % 9));
    for (let r1 = 0; r1 < 9; r1++) {
      for (let r2 = r1 + 1; r2 < 9; r2++) {
        if (rowCols[r1].length !== 2 || rowCols[r2].length !== 2) continue;
        if (rowCols[r1][0] !== rowCols[r2][0] || rowCols[r1][1] !== rowCols[r2][1]) continue;
        const [c1, c2] = rowCols[r1];
        let ch = false;
        for (let r = 0; r < 9; r++) {
          if (r === r1 || r === r2) continue;
          for (const c of [c1, c2]) {
            const i = r * 9 + c;
            if (grid[i] === 0 && cands[i] & bit) { cands[i] &= ~bit; ch = true; }
          }
        }
        if (ch) return true;
      }
    }
    const colRows = COLS.map((col) => col.filter((i) => grid[i] === 0 && cands[i] & bit).map((i) => Math.floor(i / 9)));
    for (let c1 = 0; c1 < 9; c1++) {
      for (let c2 = c1 + 1; c2 < 9; c2++) {
        if (colRows[c1].length !== 2 || colRows[c2].length !== 2) continue;
        if (colRows[c1][0] !== colRows[c2][0] || colRows[c1][1] !== colRows[c2][1]) continue;
        const [r1, r2] = colRows[c1];
        let ch = false;
        for (let c = 0; c < 9; c++) {
          if (c === c1 || c === c2) continue;
          for (const r of [r1, r2]) {
            const i = r * 9 + c;
            if (grid[i] === 0 && cands[i] & bit) { cands[i] &= ~bit; ch = true; }
          }
        }
        if (ch) return true;
      }
    }
  }
  return false;
}

// L8 剑鱼：X-Wing 推广到 3 条线（3 行×3 列或 3 列×3 行闭合环）→ 消除这 3 列其余行的该数
function tSwordfish(grid, cands) {
  for (let d = 1; d <= 9; d++) {
    const bit = BIT(d);
    // rowCols[r] = 列号列表；colRows[c] = 行号列表
    const rowCols = ROWS.map((row) => row.filter((i) => grid[i] === 0 && cands[i] & bit).map((i) => i % 9));
    const colRows = COLS.map((col) => col.filter((i) => grid[i] === 0 && cands[i] & bit).map((i) => Math.floor(i / 9)));
    // 行视角：选 3 行，其候选列并集恰为 3 列，且这 3 列各自候选行都包含在这 3 行内
    const tryLines = (lineCols, perpRows) => {
      const lines = lineCols; // lines[s] = 候选列/行号列表
      const perp = perpRows; // perp[x] = 候选行/列号列表（与 lines 互补）
      for (let a = 0; a < 9; a++) {
        for (let b = a + 1; b < 9; b++) {
          for (let c = b + 1; c < 9; c++) {
            const S = [a, b, c];
            const T = new Set();
            for (const s of S) for (const x of lines[s]) T.add(x);
            if (T.size !== 3) continue;
            let ok = true;
            for (const x of T) {
              const others = perp[x];
              if (others.length < 2 || others.length > 3) { ok = false; break; }
              for (const y of others) if (!S.includes(y)) { ok = false; break; }
              if (!ok) break;
            }
            if (!ok) continue;
            let ch = false;
            for (const x of T) {
              for (let y = 0; y < 9; y++) {
                if (S.includes(y)) continue;
                const i = lines === rowCols ? y * 9 + x : x * 9 + y; // 行视角 x=列,y=行；列视角 x=行,y=列
                if (grid[i] === 0 && cands[i] & bit) { cands[i] &= ~bit; ch = true; }
              }
            }
            if (ch) return true;
          }
        }
      }
      return false;
    };
    if (tryLines(rowCols, colRows)) return true;
    if (tryLines(colRows, rowCols)) return true;
  }
  return false;
}

// L9 XY-Wing：三个双值格构成的翼。支点 P{a,b}，两翼 X{b,c}、Y{a,c} 均看到 P 且互不看见；
// 则同时看到 X 与 Y 的格不可能为 c → 消去 c。
function tXYWing(grid, cands) {
  for (let p = 0; p < 81; p++) {
    if (grid[p] !== 0 || popcount(cands[p]) !== 2) continue;
    const pv = digitsOf(cands[p]);
    const a = pv[0];
    const b = pv[1];
    for (let x = 0; x < 81; x++) {
      if (x === p || grid[x] !== 0 || popcount(cands[x]) !== 2) continue;
      const xv = digitsOf(cands[x]);
      if (!(xv.includes(b) && !xv.includes(a))) continue; // 翼 X 必含 b 且不含 a，另一候选为 c
      const c = xv.find((v) => v !== b);
      if (c === a) continue;
      if (!PEERS[p].includes(x)) continue; // X 须看到支点
      for (let y = 0; y < 81; y++) {
        if (y === p || y === x || grid[y] !== 0 || popcount(cands[y]) !== 2) continue;
        const yv = digitsOf(cands[y]);
        if (!(yv.includes(a) && !yv.includes(b))) continue; // 翼 Y 必含 a 且不含 b，另一候选为 c
        const c2 = yv.find((v) => v !== a);
        if (c2 !== c) continue;
        if (!PEERS[p].includes(y)) continue; // Y 须看到支点
        if (PEERS[x].includes(y)) continue; // 两翼互不可见（否则退化）
        let changed = false;
        for (let z = 0; z < 81; z++) {
          if (z === p || z === x || z === y || grid[z] !== 0) continue;
          if (!(cands[z] & BIT(c))) continue;
          if (PEERS[x].includes(z) && PEERS[y].includes(z)) {
            cands[z] &= ~BIT(c);
            changed = true;
          }
        }
        if (changed) return true;
      }
    }
  }
  return false;
}

// 技巧函数数组，下标即为层级
const TECH_FNS = [
  tNakedSingle, // 0
  tHiddenSingle, // 1
  tNakedPair, // 2
  tHiddenPair, // 3
  tLocked, // 4 区块摒除（Pointing/Claiming）
  tNakedTriple, // 5
  tHiddenTriple, // 6
  tXWing, // 7
  tSwordfish, // 8
  tXYWing, // 9
];
export const MAX_LEVEL = TECH_FNS.length - 1; // 9

// 技巧层级 → 中文名（用于 UI 展示「本局锻炼的技巧」）
// 下标必须与 TECH_FNS 一一对应。
export const TECHNIQUE_NAMES = [
  '唯一余数（Naked Single）',
  '唯一候选（Hidden Single）',
  '数对（Naked/Hidden Pair）',
  '隐性数对（Hidden Pair）',
  '区块摒除（Pointing/Claiming）',
  '三数（Naked Triple）',
  '隐性三数（Hidden Triple）',
  'X-Wing',
  '剑鱼（Swordfish）',
  'XY-Wing',
];
// 实现覆盖到 XY-Wing(L9)。自然随机盘的技巧评级集中在 0~4 与 9（需进阶链），
// 5~8 级（三数/X-Wing/剑鱼）极少被随机盘直接需要；难度档据此映射到 0/1/2/3/4/9。

// 简短技巧名（≤3 字），用于界面徽章，与难度标签组合后整体 ≤6 字
export const TECH_SHORT_NAMES = [
  '余数', // 0 唯一余数
  '候选', // 1 唯一候选
  '数对', // 2 数罪对
  '隐对', // 3 隐性数对
  '区块', // 4 区块摒除
  '三数', // 5 三数
  '隐三', // 6 隐性三数
  'X翼', // 7 X-Wing
  '剑鱼', // 8 剑鱼
  'XY翼', // 9 XY-Wing
];

// 返回极简短技巧名（用于标题徽章）；level 越界时回退为空串
export function techniqueShort(level) {
  if (level == null || level < 0 || level >= TECH_SHORT_NAMES.length) return '';
  return TECH_SHORT_NAMES[level];
}

// ---------------- 求解与评级 ----------------
// 仅用层级 0..maxLevel 的技巧尝试求解；返回是否解出、最难用到层级、最终盘面
export function logicSolve(puzzle, maxLevel) {
  const grid = puzzle.slice();
  const cands = computeCands(grid);
  let used = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let acted = false;
    for (let t = 0; t <= maxLevel; t++) {
      if (TECH_FNS[t](grid, cands)) {
        acted = true;
        if (t > used) used = t;
        break;
      }
    }
    if (!acted) break;
    if (isFull(grid)) return { solved: true, usedLevel: used, grid };
  }
  return { solved: isFull(grid), usedLevel: used, grid };
}

// 解开本局所需的最难技巧最小层级；超出实现范围返回 MAX_LEVEL+1（需试数/猜测）
export function grade(puzzle) {
  for (let L = 0; L <= MAX_LEVEL; L++) {
    if (logicSolve(puzzle, L).solved) return L;
  }
  return MAX_LEVEL + 1;
}

export function techniqueName(level) {
  return TECHNIQUE_NAMES[level] || '需试数 / 复杂链';
}
