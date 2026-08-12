// 游戏状态机：单局会话的全部状态与逻辑（落子、笔记、计时、胜负、复盘记录）
// 不含任何 DOM 操作，便于在浏览器与 Node 中复用/测试。

import { makePuzzle, findConflicts } from './sudoku.js';

export class Game {
  constructor(data) {
    this.id = data.id;
    this.puzzle = data.puzzle; // 81，0 表示空格（题目给定）
    this.solution = data.solution; // 81，完整解（用于校验/错误/复盘）
    this.cells = data.cells; // 81，当前盘面
    this.notes = data.notes; // 81 个数组，记录每格的铅笔标记
    this.difficulty = data.difficulty;
    this.elapsedMs = data.elapsedMs || 0; // 已累计（暂停态）时长
    this._runningSince = null; // 计时起点（仅运行中非空）
    this.mistakes = data.mistakes || 0;
    this.status = data.status || 'playing'; // playing | paused | won
    this.createdAt = data.createdAt;
    this.moves = data.moves || []; // 复盘用落子序列
    this.hintsUsed = data.hintsUsed || 0;
    this.selected = null;
  }

  static newGame(difficulty) {
    const { puzzle, solution } = makePuzzle(difficulty);
    return new Game({
      id: 'g' + Date.now() + Math.random().toString(36).slice(2, 7),
      puzzle,
      solution,
      cells: puzzle.slice(),
      notes: Array.from({ length: 81 }, () => []),
      difficulty,
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
      puzzle: this.puzzle,
      solution: this.solution,
      cells: this.cells,
      notes: this.notes,
      difficulty: this.difficulty,
      elapsedMs: this.elapsedMs,
      mistakes: this.mistakes,
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
    if (val !== 0 && val !== this.solution[idx]) {
      this.mistakes++;
    }
    this.notes[idx] = []; // 填入数字后清空该格笔记
    this.moves.push({ idx, val, kind: val === 0 ? 'erase' : 'set', t: this.currentElapsed() });
    this.checkWin();
    return true;
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
