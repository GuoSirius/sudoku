// 游戏状态机：单局会话的全部状态与逻辑（落子、笔记、计时、胜负、复盘记录）
// 不含任何 DOM 操作，便于在浏览器与 Node 中复用/测试。

import { makePuzzle, findConflicts } from './sudoku.js';

export class Game {
  constructor(data) {
    this.id = data.id;
    this.resumeId = data.resumeId || null; // 续玩自某条历史记录时，记录其原 id（用于完成后原地更新，避免重复）
    this.puzzle = data.puzzle; // 81，0 表示空格（题目给定）
    this.solution = data.solution; // 81，完整解（用于校验/错误/复盘）
    this.cells = data.cells; // 81，当前盘面
    this.notes = data.notes; // 81 个数组，记录每格的铅笔标记
    this.difficulty = data.difficulty;
    this.grade = data.grade ?? null; // 本局实际技巧评级（0..9），由生成器给出
    this.clues = data.clues ?? null; // 本局给定数（展示用）
    this.elapsedMs = data.elapsedMs || 0; // 已累计（暂停态）时长
    this._runningSince = null; // 计时起点（仅运行中非空）
    this.mistakes = data.mistakes || 0;
    this.revealedWrong =
      data.revealedWrong instanceof Set
        ? data.revealedWrong
        : new Set(data.revealedWrong || []);
    this.status = data.status || 'playing'; // playing | paused | won
    this.createdAt = data.createdAt;
    this.moves = data.moves || []; // 复盘用落子序列
    this.hintsUsed = data.hintsUsed || 0;
    this.selected = null;
  }

  static newGame(difficulty) {
    const { puzzle, solution, grade, clues } = makePuzzle(difficulty);
    return new Game({
      id: 'g' + Date.now() + Math.random().toString(36).slice(2, 7),
      puzzle,
      solution,
      cells: puzzle.slice(),
      notes: Array.from({ length: 81 }, () => []),
      difficulty,
      grade,
      clues,
      elapsedMs: 0,
      mistakes: 0,
      status: 'playing',
      createdAt: Date.now(),
      moves: [],
    });
  }

  static fromJSON(obj) {
    return new Game(obj);
  }

  toJSON() {
    return {
      id: this.id,
      resumeId: this.resumeId,
      puzzle: this.puzzle,
      solution: this.solution,
      cells: this.cells,
      notes: this.notes,
      difficulty: this.difficulty,
      grade: this.grade,
      clues: this.clues,
      elapsedMs: this.elapsedMs,
      mistakes: this.mistakes,
      revealedWrong: [...this.revealedWrong],
      status: this.status,
      createdAt: this.createdAt,
      moves: this.moves,
      hintsUsed: this.hintsUsed,
    };
  }

  // ---- 计时 ----
  startTimer() {
    if (this.status === 'playing' && this._runningSince == null) {
      this._runningSince = Date.now();
    }
  }
  pauseTimer() {
    if (this._runningSince != null) {
      this.elapsedMs += Date.now() - this._runningSince;
      this._runningSince = null;
    }
  }
  resumeTimer() {
    if (this.status === 'paused') this.status = 'playing';
    this.startTimer();
  }
  currentElapsed() {
    return this.elapsedMs + (this._runningSince != null ? Date.now() - this._runningSince : 0);
  }

  isGiven(idx) {
    return this.puzzle[idx] !== 0;
  }
  isWrong(idx) {
    return this.cells[idx] !== 0 && this.cells[idx] !== this.solution[idx];
  }
  conflicts() {
    return findConflicts(this.cells);
  }

  // 当前盘面上仍未修正的错误总数（已填、非题目给定、与答案不符）。
  // 用于「检查」反馈：任意时刻的真实错误数，而非「自上次检查以来新增」，
  // 否则第二次检查会误报“没问题”（revealedWrong 已装满导致新增为 0）。
  // 注：同行/列/宫的重复（冲突）必然包含至少一个非给定的错格，故计入此处。
  currentWrongCount() {
    let n = 0;
    for (let i = 0; i < 81; i++) {
      if (!this.isGiven(i) && this.cells[i] !== 0 && this.cells[i] !== this.solution[i]) n++;
    }
    return n;
  }

  // 手动「检查」：揭示当前所有填错的格子并计入错误数（每个错误格只计一次）
  // 返回本次新揭示的错误数
  revealWrong() {
    let added = 0;
    for (let i = 0; i < 81; i++) {
      const wrong = this.cells[i] !== 0 && this.cells[i] !== this.solution[i];
      if (wrong && !this.revealedWrong.has(i)) {
        this.revealedWrong.add(i);
        this.mistakes++;
        added++;
      }
    }
    return added;
  }

  // ---- 落子 ----
  // noteMode: true 时写入/清除铅笔标记
  setCell(idx, val, noteMode) {
    if (this.status !== 'playing' || this.isGiven(idx)) return false;

    if (noteMode) {
      if (val === 0) return false;
      const arr = this.notes[idx];
      const p = arr.indexOf(val);
      if (p >= 0) arr.splice(p, 1);
      else arr.push(val);
      this.moves.push({ idx, val, kind: 'note', t: this.currentElapsed() });
      return true;
    }

    if (this.cells[idx] === val) return false;
    this.cells[idx] = val;
    // 注意：错误计数不再在落子时自动累加（会泄题）。
    // 计数由上层按 mistakeMode 决定：full 模式即时计入；其余靠「检查」按钮按需计入。
    this.notes[idx] = []; // 填入数字后清空该格笔记
    if (val !== 0) this.clearPeerNotes(idx, val); // 并移除同行/列/宫中其他格的相同候选
    this.moves.push({ idx, val, kind: val === 0 ? 'erase' : 'set', t: this.currentElapsed() });
    this.checkWin();
    return true;
  }

  // 在某格填入确定数字 val 后，移除其同行/列/宫中其他格的相同候选（铅笔标记）
  clearPeerNotes(idx, val) {
    if (val === 0) return;
    const r = Math.floor(idx / 9);
    const c = idx % 9;
    const br = Math.floor(r / 3) * 3;
    const bc = Math.floor(c / 3) * 3;
    const peers = new Set();
    for (let i = 0; i < 9; i++) {
      peers.add(r * 9 + i); // 行
      peers.add(i * 9 + c); // 列
    }
    for (let dr = 0; dr < 3; dr++) {
      for (let dc = 0; dc < 3; dc++) {
        peers.add((br + dr) * 9 + (bc + dc)); // 宫
      }
    }
    peers.delete(idx);
    for (const p of peers) {
      const arr = this.notes[p];
      const k = arr.indexOf(val);
      if (k >= 0) arr.splice(k, 1);
    }
  }

  eraseCell(idx) {
    if (this.status !== 'playing' || this.isGiven(idx)) return false;
    if (this.cells[idx] === 0 && this.notes[idx].length === 0) return false;
    this.cells[idx] = 0;
    this.notes[idx] = [];
    this.moves.push({ idx, val: 0, kind: 'erase', t: this.currentElapsed() });
    return true;
  }

  // 提示：把选中空格填入正确解（不计入错误，但计入 hintsUsed）
  hint(idx) {
    if (this.status !== 'playing' || this.isGiven(idx) || this.cells[idx] === this.solution[idx]) {
      return false;
    }
    this.cells[idx] = this.solution[idx];
    this.notes[idx] = [];
    this.clearPeerNotes(idx, this.solution[idx]);
    this.hintsUsed++;
    this.moves.push({ idx, val: this.solution[idx], kind: 'hint', t: this.currentElapsed() });
    this.checkWin();
    return true;
  }

  checkWin() {
    if (this.cells.every((v, i) => v === this.solution[i])) {
      this.status = 'won';
      this.pauseTimer();
      return true;
    }
    return false;
  }

  // 剩余空格数
  remaining() {
    return this.cells.filter((v) => v === 0).length;
  }

  // 每个数字（1-9）还剩多少未填（用于数字盘上显示余量）
  remainingByDigit() {
    const counts = new Array(10).fill(0);
    for (const v of this.cells) if (v !== 0) counts[v]++;
    const res = {};
    for (let d = 1; d <= 9; d++) res[d] = 9 - counts[d];
    return res;
  }
}
