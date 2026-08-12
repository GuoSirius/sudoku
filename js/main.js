// 应用主控制器：路由、菜单、对局交互、历史、复盘、排行榜、设置、PWA
import { Game } from './game.js';
import { storage } from './storage.js';
import { DIFFICULTIES, formatTime } from './sudoku.js';
import { buildBoard } from './ui.js';
import { registerPWA } from './pwa.js';

const $ = (id) => document.getElementById(id);
const SCREENS = ['menu', 'game', 'history', 'replay', 'leaderboard', 'settings'];

let game = null; // 当前 Game 实例
let noteMode = false;
let timerId = null;
let replayRec = null;
let replayStep = 0;
let replayPlayId = null;
let toastTimer = null;

const diffLabel = (id) => (DIFFICULTIES.find((d) => d.id === id) || {}).label || id;

// ---------------- 主题 ----------------
// 主题类挂在 <html>（documentElement）上：CSS 变量从根向下覆盖整个文档，
// 这样 body 整页背景（祖先元素）也能拿到 --bg/--text，避免深色模式外层仍白底。
function applyTheme(theme) {
  const root = document.documentElement;
  root.classList.remove('theme-light', 'theme-dark');
  if (theme === 'auto') {
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.classList.add(dark ? 'theme-dark' : 'theme-light');
  } else {
    root.classList.add(theme === 'dark' ? 'theme-dark' : 'theme-light');
  }
}

// ---------------- 路由 ----------------
function showScreen(name) {
  SCREENS.forEach((s) => $('screen-' + s).classList.toggle('hidden', s !== name));
  if (name !== 'game') stopTimerLoop();
  // 每个页面在切换/刷新恢复时都自己渲染数据，保证按钮进入与刷新恢复行为一致
  if (name === 'menu') renderMenu();
  else if (name === 'history') renderHistory();
  else if (name === 'leaderboard') renderLeaderboard();
  else if (name === 'settings') renderSettings();
  // 复盘是历史的子页，由 openReplay 负责渲染；持久化时记成 history
  const persist = name === 'replay' ? 'history' : name;
  if (['menu', 'game', 'history', 'leaderboard', 'settings'].includes(persist)) {
    try {
      localStorage.setItem('sudoku:screen', persist);
    } catch (e) {}
  }
}

// 刷新/重开时恢复到上次停留的页面（有进行中对局则一并恢复）
function restoreScreen() {
  renderMenu(); // 同步首页「继续」按钮与统计（即使当前不显示首页）
  let saved = null;
  try {
    saved = localStorage.getItem('sudoku:screen');
  } catch (e) {}
  const cur = storage.getCurrent();
  if (saved === 'game' && cur && cur.status !== 'won') {
    game = Game.fromJSON(cur);
    noteMode = false;
    $('btn-notes').classList.remove('active');
    if (game.status === 'paused') {
      $('pause-overlay').classList.remove('hidden');
      $('board').classList.add('paused');
      $('btn-pause').textContent = '▶';
      $('btn-pause').title = '继续';
    }
    enterGame();
    return;
  }
  if (saved === 'history' || saved === 'leaderboard' || saved === 'settings') {
    showScreen(saved);
    return;
  }
  showScreen('menu');
}

// ---------------- 弹窗 / Toast ----------------
function showModal({ title, body, actions = [], dismissable = true }) {
  const root = $('modal-root');
  root.innerHTML = '';
  const m = document.createElement('div');
  m.className = 'modal';
  const h = document.createElement('h3');
  h.textContent = title;
  m.appendChild(h);
  if (typeof body === 'string') {
    const p = document.createElement('p');
    p.innerHTML = body;
    m.appendChild(p);
  } else if (body) {
    m.appendChild(body);
  }
  const act = document.createElement('div');
  act.className = 'modal-actions';
  actions.forEach((a) => {
    const b = document.createElement('button');
    b.className =
      'btn' + (a.primary ? ' btn-primary' : a.danger ? ' btn-danger-ghost' : ' btn-ghost');
    b.textContent = a.label;
    b.onclick = () => a.onClick && a.onClick();
    act.appendChild(b);
  });
  if (actions.length) m.appendChild(act);
  root.appendChild(m);
  root.classList.add('show');
  if (dismissable) root.onclick = (e) => e.target === root && closeModal();
}
function closeModal() {
  const r = $('modal-root');
  r.classList.remove('show');
  r.innerHTML = '';
  r.onclick = null;
}
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 1600);
}

// ---------------- 首页 ----------------
function renderMenu() {
  const cur = storage.getCurrent();
  const has = cur && cur.status !== 'won';
  $('btn-resume').classList.toggle('hidden', !has);
  const h = storage.getHistory();
  const lb = storage.getLeaderboard().filter((r) => r.won);
  let stat = '';
  if (h.length) stat += `共 ${h.length} 局`;
  if (lb.length) {
    const best = Math.min(...lb.map((r) => r.durationMs));
    stat += (stat ? ' · ' : '') + `最佳 ${formatTime(best)}`;
  }
  $('menu-stat').textContent = stat;
}

// ---------------- 对局 ----------------
function saveCurrent() {
  if (game) storage.setCurrent(game.toJSON());
}
function startTimerLoop() {
  stopTimerLoop();
  timerId = setInterval(() => {
    if (game && game.status === 'playing') {
      $('game-timer').textContent = formatTime(game.currentElapsed());
    }
  }, 250);
}
function stopTimerLoop() {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
}
function enterGame() {
  showScreen('game');
  $('board').classList.remove('paused');
  $('btn-pause').textContent = '⏸';
  $('btn-pause').title = '暂停';
  game.startTimer();
  renderGame();
  startTimerLoop();
}
function renderGame() {
  const given = game.puzzle.map((v) => v !== 0);
  // 错误提示强度（设置）：off=无自动高亮；conflict=仅冲突；full=逐格比对答案
  const mode = storage.getSettings().mistakeMode || 'conflict';
  const conflicts = mode === 'off' ? new Set() : game.conflicts();
  const wrong = new Set();
  if (mode === 'full') {
    for (let i = 0; i < 81; i++) if (game.isWrong(i)) wrong.add(i);
  } else {
    // 非全量模式下，只有经「检查」揭示过的错误格才标红（避免泄题）
    for (const i of game.revealedWrong) if (game.isWrong(i)) wrong.add(i);
  }
  buildBoard(
    $('board'),
    { cells: game.cells, notes: game.notes, given, selected: game.selected, conflicts, wrong },
    onCellClick,
    onNoteClick
  );
  renderPad();
  $('game-difficulty').textContent = diffLabel(game.difficulty);
  $('game-timer').textContent = formatTime(game.currentElapsed());
  $('game-mistakes').textContent = game.mistakes;
  $('game-remaining').textContent = game.remaining();
}
function renderPad() {
  const wrap = $('pad-numbers');
  wrap.innerHTML = '';
  const rem = game.remainingByDigit();
  for (let n = 1; n <= 9; n++) {
    const b = document.createElement('button');
    b.className = 'num' + (rem[n] === 0 ? ' done' : '');
    b.innerHTML = `${n}<span class="remain">${rem[n]}</span>`;
    b.onclick = () => inputNumber(n);
    wrap.appendChild(b);
  }
}
function onCellClick(i) {
  game.selected = i;
  renderGame();
}
// 点击某格内的笔记小数字：
//  - 笔记模式下 -> 取消(删除)该候选
//  - 普通模式下 -> 把该候选直接升级为正式值（笔记转正）
function onNoteClick(i, n) {
  if (!game || game.status !== 'playing' || game.isGiven(i) || game.cells[i] !== 0) return;
  game.selected = i;
  const ok = noteMode ? game.setCell(i, n, true) : game.setCell(i, n, false);
  if (ok) afterMove();
}
function inputNumber(n) {
  if (!game || game.selected == null) {
    toast('请先选择一个格子');
    return;
  }
  if (game.setCell(game.selected, n, noteMode)) afterMove();
}
function eraseSelected() {
  if (!game || game.selected == null) return;
  if (game.eraseCell(game.selected)) afterMove();
}
function useHint() {
  if (!game || game.selected == null) {
    toast('请先选择一个空格');
    return;
  }
  if (game.hint(game.selected)) afterMove();
  else toast('该格无需提示');
}
// 手动「检查」：按需揭示错误并计错（游戏中零自动泄题，想核对时再核对）
function doCheck() {
  if (!game || game.status !== 'playing') return;
  const added = game.revealWrong();
  saveCurrent();
  renderGame();
  toast(added > 0 ? `发现 ${added} 处错误` : '没有发现错误');
}
function toggleNotes() {
  noteMode = !noteMode;
  $('btn-notes').classList.toggle('active', noteMode);
}
function afterMove() {
  // 错误计数：仅「全量核对」模式在落子时即时计入；其余模式靠「检查」按钮按需计入（避免泄题）
  const mode = storage.getSettings().mistakeMode || 'conflict';
  if (mode === 'full' && game.selected != null && game.isWrong(game.selected)) {
    if (!game.revealedWrong.has(game.selected)) {
      game.revealedWrong.add(game.selected);
      game.mistakes++;
    }
  }
  renderGame();
  saveCurrent();
  if (game.status === 'won') onWin();
}

function startNewGame(diff) {
  game = Game.newGame(diff);
  noteMode = false;
  $('btn-notes').classList.remove('active');
  saveCurrent();
  enterGame();
}
function resumeGame() {
  const cur = storage.getCurrent();
  if (!cur) {
    toast('没有可继续的对局');
    return;
  }
  game = Game.fromJSON(cur);
  noteMode = false;
  $('btn-notes').classList.remove('active');
  if (game.status === 'paused') game.resumeTimer();
  saveCurrent();
  $('pause-overlay').classList.add('hidden');
  $('board').classList.remove('paused');
  $('btn-pause').textContent = '⏸';
  $('btn-pause').title = '暂停';
  enterGame();
}
function archiveCurrent() {
  const cur = storage.getCurrent();
  if (!cur || cur.status === 'won') return;
  const g = Game.fromJSON(cur);
  storage.addHistory({
    id: g.id,
    difficulty: g.difficulty,
    durationMs: g.currentElapsed(),
    mistakes: g.mistakes,
    hintsUsed: g.hintsUsed,
    won: false,
    date: Date.now(),
    puzzle: g.puzzle,
    solution: g.solution,
    moves: g.moves,
  });
  storage.clearCurrent();
}
function newGameFlow() {
  const cur = storage.getCurrent();
  if (cur && cur.status !== 'won') {
    showModal({
      title: '开始新游戏',
      body: '<p>当前有一局进行中的游戏，开始新游戏将把当前这局归档为“未完成”历史。确定吗？</p>',
      actions: [
        { label: '取消', ghost: true, onClick: closeModal },
        {
          label: '开始新游戏',
          primary: true,
          onClick: () => {
            archiveCurrent();
            openDifficultyModal(startNewGame);
          },
        },
      ],
    });
  } else {
    openDifficultyModal(startNewGame);
  }
}
function openDifficultyModal(onPick) {
  const cur = storage.getSettings();
  const body = document.createElement('div');
  body.className = 'seg vertical';
  DIFFICULTIES.forEach((d) => {
    const b = document.createElement('button');
    b.className = 'seg-btn' + (d.id === cur.difficulty ? ' active' : '');
    b.textContent = `${d.label}（约 ${d.clues} 提示）`;
    b.onclick = () => {
      closeModal();
      onPick(d.id);
    };
    body.appendChild(b);
  });
  showModal({
    title: '选择难度',
    body,
    actions: [{ label: '取消', ghost: true, onClick: closeModal }],
  });
}
// 暂停：非阻塞——停在游戏界面，棋盘保留可见（仅变暗提示），计时停止，进度保留
function pauseGame() {
  if (!game || game.status !== 'playing') return;
  game.pauseTimer();
  game.status = 'paused';
  saveCurrent();
  $('pause-overlay').classList.remove('hidden');
  $('board').classList.add('paused');
  $('btn-pause').textContent = '▶';
  $('btn-pause').title = '继续';
  stopTimerLoop();
}
function resumeGamePlay() {
  if (!game) return;
  game.resumeTimer();
  saveCurrent();
  $('pause-overlay').classList.add('hidden');
  $('board').classList.remove('paused');
  $('btn-pause').textContent = '⏸';
  $('btn-pause').title = '暂停';
  startTimerLoop();
  renderGame();
}
// ⏸ 按钮：暂停/继续切换
function togglePause() {
  if (!game) return;
  if (game.status === 'paused') resumeGamePlay();
  else pauseGame();
}
function saveExit() {
  // 保存并退出到首页：保留 paused 状态与进度，可在首页「继续游戏」续玩
  if (!game) {
    showScreen('menu');
    return;
  }
  game.pauseTimer();
  game.status = 'paused';
  saveCurrent();
  $('pause-overlay').classList.add('hidden');
  $('board').classList.remove('paused');
  $('btn-pause').textContent = '⏸';
  $('btn-pause').title = '暂停';
  showScreen('menu');
}
function restartGame() {
  if (!game) return;
  showModal({
    title: '重开本局',
    body: '<p>将清空本局所有已填数字、笔记、错误与计时，使用同一道题目重新开始。</p>',
    actions: [
      { label: '取消', ghost: true, onClick: closeModal },
      {
        label: '重开',
        primary: true,
        onClick: () => {
          game.cells = game.puzzle.slice();
          game.notes = Array.from({ length: 81 }, () => []);
          game.mistakes = 0;
          game.revealedWrong = new Set();
          game.elapsedMs = 0;
          game._runningSince = null;
          game.status = 'playing';
          game.moves = [];
          game.hintsUsed = 0;
          game.selected = null;
          saveCurrent();
          closeModal();
          enterGame();
          toast('已重开');
        },
      },
    ],
  });
}

function onWin() {
  stopTimerLoop();
  const duration = game.currentElapsed();
  const rec = {
    id: game.id,
    difficulty: game.difficulty,
    durationMs: duration,
    mistakes: game.mistakes,
    hintsUsed: game.hintsUsed,
    won: true,
    date: Date.now(),
    puzzle: game.puzzle,
    solution: game.solution,
    moves: game.moves,
  };
  storage.addHistory(rec);
  storage.addLeaderboard({
    id: game.id,
    difficulty: game.difficulty,
    durationMs: duration,
    mistakes: game.mistakes,
    hintsUsed: game.hintsUsed,
    won: true,
    date: Date.now(),
  });
  storage.clearCurrent();
  showWinModal(rec);
}
function isNewBest(rec) {
  const lb = storage.getLeaderboard().filter((r) => r.won && r.difficulty === rec.difficulty);
  return lb.length === 1 || rec.durationMs <= Math.min(...lb.map((r) => r.durationMs));
}
function showWinModal(rec) {
  const body = document.createElement('div');
  body.innerHTML = `<div class="modal-stats">
      <div><div class="ms-val">${formatTime(rec.durationMs)}</div><div class="ms-label">用时</div></div>
      <div><div class="ms-val">${rec.mistakes}</div><div class="ms-label">错误</div></div>
      <div><div class="ms-val">${rec.hintsUsed || 0}</div><div class="ms-label">提示</div></div>
    </div>`;
  showModal({
    title: isNewBest(rec) ? '🎉 新纪录！' : '恭喜完成',
    body,
    actions: [
      { label: '查看复盘', ghost: true, onClick: () => { closeModal(); openReplay(rec); } },
      { label: '再来一局', primary: true, onClick: () => newGameFlow() },
    ],
  });
}

// ---------------- 历史 ----------------
function renderHistory() {
  const list = $('history-list');
  list.innerHTML = '';
  const h = storage.getHistory();
  if (!h.length) {
    list.innerHTML = '<div class="empty">暂无历史记录，去玩一局吧</div>';
    return;
  }
  h.forEach((rec) => {
    const row = document.createElement('div');
    row.className = 'row';
    const d = DIFFICULTIES.find((x) => x.id === rec.difficulty);
    row.innerHTML = `
      <div class="row-main">
        <div class="row-title">
          <span class="tag d-${rec.difficulty}">${d ? d.label : rec.difficulty}</span>
          <span class="tag ${rec.won ? 'win' : 'lose'}">${rec.won ? '完成' : '未完成'}</span>
        </div>
        <div class="row-sub">${new Date(rec.date).toLocaleString('zh-CN')} · 错误 ${rec.mistakes} · 提示 ${
      rec.hintsUsed || 0
    }</div>
      </div>
      <div class="row-right">${formatTime(rec.durationMs)}</div>`;
    row.onclick = () => openReplay(rec);
    list.appendChild(row);
  });
}
function confirmClear(kind) {
  showModal({
    title: '清空记录',
    body: '<p>确定要清空历史记录吗？此操作不可恢复。</p>',
    actions: [
      { label: '取消', ghost: true, onClick: closeModal },
      {
        label: '清空',
        danger: true,
        onClick: () => {
          storage.clearHistory();
          renderHistory();
          closeModal();
          toast('历史已清空');
        },
      },
    ],
  });
}

// ---------------- 复盘 ----------------
function replayBoardAt(step) {
  const cells = replayRec.puzzle.slice();
  const notes = Array.from({ length: 81 }, () => []);
  for (let i = 0; i < step; i++) {
    const m = replayRec.moves[i];
    if (m.kind === 'note') {
      const arr = notes[m.idx];
      const p = arr.indexOf(m.val);
      if (p >= 0) arr.splice(p, 1);
      else arr.push(m.val);
    } else {
      cells[m.idx] = m.val;
      notes[m.idx] = [];
    }
  }
  return { cells, notes };
}
function renderReplayInfo() {
  const d = DIFFICULTIES.find((x) => x.id === replayRec.difficulty);
  $('replay-info').textContent = `${d ? d.label : replayRec.difficulty} · 用时 ${formatTime(
    replayRec.durationMs
  )} · 错误 ${replayRec.mistakes} · ${replayRec.won ? '已完成' : '未完成'} · 共 ${
    replayRec.moves.length
  } 步`;
}
function renderReplayStep() {
  const { cells, notes } = replayBoardAt(replayStep);
  const given = replayRec.puzzle.map((v) => v !== 0);
  const wrong = new Set();
  for (let i = 0; i < 81; i++) {
    if (cells[i] !== 0 && cells[i] !== replayRec.solution[i]) wrong.add(i);
  }
  buildBoard(
    $('replay-board'),
    { cells, notes, given, selected: null, conflicts: new Set(), wrong },
    null
  );
  $('replay-step').textContent = `${replayStep} / ${replayRec.moves.length}`;
}
function openReplay(record) {
  replayRec = record;
  replayStep = 0;
  stopReplay();
  showScreen('replay');
  renderReplayInfo();
  renderReplayStep();
}
function stopReplay() {
  if (replayPlayId) {
    clearInterval(replayPlayId);
    replayPlayId = null;
  }
  const b = $('rp-play');
  if (b) b.textContent = '▶';
}

// ---------------- 排行榜 ----------------
function renderLeaderboard() {
  const body = $('leaderboard-body');
  body.innerHTML = '';
  const lb = storage.getLeaderboard().filter((r) => r.won);
  if (!lb.length) {
    body.innerHTML = '<div class="empty">还没有完成的对局，加油！</div>';
    return;
  }
  DIFFICULTIES.forEach((d) => {
    const rows = lb
      .filter((r) => r.difficulty === d.id)
      .sort((a, b) => a.durationMs - b.durationMs)
      .slice(0, 10);
    if (!rows.length) return;
    const sec = document.createElement('div');
    sec.className = 'lb-section';
    sec.innerHTML = `<h3><span class="tag d-${d.id}">${d.label}</span> 最佳成绩</h3>`;
    const table = document.createElement('table');
    table.className = 'lb-table';
    table.innerHTML =
      '<thead><tr><th>#</th><th>用时</th><th>错误</th><th>提示</th><th>日期</th></tr></thead>';
    const tb = document.createElement('tbody');
    rows.forEach((r, i) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td class="lb-rank ${i === 0 ? 'top' : ''}">${i + 1}</td>
        <td>${formatTime(r.durationMs)}</td>
        <td>${r.mistakes}</td>
        <td>${r.hintsUsed || 0}</td>
        <td>${new Date(r.date).toLocaleDateString('zh-CN')}</td>`;
      tb.appendChild(tr);
    });
    table.appendChild(tb);
    sec.appendChild(table);
    body.appendChild(sec);
  });
}

// ---------------- 设置 ----------------
function renderSettings() {
  const s = storage.getSettings();
  const dwrap = $('set-difficulty');
  dwrap.innerHTML = '';
  DIFFICULTIES.forEach((d) => {
    const b = document.createElement('button');
    b.className = 'seg-btn' + (d.id === s.difficulty ? ' active' : '');
    b.textContent = d.label;
    b.onclick = () => {
      storage.setSettings({ difficulty: d.id });
      renderSettings();
      toast('默认难度：' + d.label);
    };
    dwrap.appendChild(b);
  });
  [...$('set-theme').children].forEach((b) =>
    b.classList.toggle('active', b.dataset.v === s.theme)
  );
  // 错误提示强度：关闭 / 仅冲突 / 全量核对
  const mwrap = $('set-mistake');
  if (mwrap) {
    mwrap.innerHTML = '';
    [
      ['off', '关闭'],
      ['conflict', '仅冲突'],
      ['full', '全量核对'],
    ].forEach(([v, label]) => {
      const b = document.createElement('button');
      b.className = 'seg-btn' + (v === (s.mistakeMode || 'conflict') ? ' active' : '');
      b.textContent = label;
      b.onclick = () => {
        storage.setSettings({ mistakeMode: v });
        renderSettings();
        if (game) renderGame(); // 立即反映高亮变化
        toast('错误提示：' + label);
      };
      mwrap.appendChild(b);
    });
  }
}

// ---------------- 键盘 ----------------
function moveSelection(key) {
  if (game.selected == null) {
    game.selected = 40;
    renderGame();
    return;
  }
  let r = Math.floor(game.selected / 9);
  let c = game.selected % 9;
  if (key === 'ArrowUp') r = (r + 8) % 9;
  else if (key === 'ArrowDown') r = (r + 1) % 9;
  else if (key === 'ArrowLeft') c = (c + 8) % 9;
  else if (key === 'ArrowRight') c = (c + 1) % 9;
  game.selected = r * 9 + c;
  renderGame();
}
function onKey(e) {
  if ($('screen-game').classList.contains('hidden') || !game) return;
  if (e.key >= '1' && e.key <= '9') {
    inputNumber(parseInt(e.key, 10));
    e.preventDefault();
  } else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') {
    eraseSelected();
    e.preventDefault();
  } else if (e.key === 'n' || e.key === 'N') {
    toggleNotes();
  } else if (e.key.startsWith('Arrow')) {
    moveSelection(e.key);
    e.preventDefault();
  }
}

// ---------------- 初始化 ----------------
function init() {
  applyTheme(storage.getSettings().theme);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (storage.getSettings().theme === 'auto') applyTheme('auto');
  });

  $('btn-home').onclick = () => {
    // 游戏中返回首页：先暂停（停止计时、保留进度），避免计时偷偷继续
    if (game && game.status === 'playing') {
      game.pauseTimer();
      game.status = 'paused';
      saveCurrent();
    }
    if (game) {
      $('pause-overlay').classList.add('hidden');
      $('board').classList.remove('paused');
      $('btn-pause').textContent = '⏸';
      $('btn-pause').title = '暂停';
    }
    showScreen('menu');
  };
  $('btn-theme').onclick = () => {
    const order = ['auto', 'light', 'dark'];
    const cur = storage.getSettings().theme;
    const next = order[(order.indexOf(cur) + 1) % 3];
    storage.setSettings({ theme: next });
    applyTheme(next);
    toast('主题：' + (next === 'auto' ? '跟随系统' : next === 'light' ? '浅色' : '深色'));
  };

  $('btn-resume').onclick = resumeGame;
  $('btn-new').onclick = newGameFlow;
  $('btn-history').onclick = () => showScreen('history');
  $('btn-leaderboard').onclick = () => showScreen('leaderboard');
  $('btn-settings').onclick = () => showScreen('settings');

  $('btn-pause').onclick = togglePause;
  $('btn-resume-game').onclick = resumeGamePlay;
  $('btn-exit-pause').onclick = saveExit;
  $('btn-notes').onclick = toggleNotes;
  $('btn-erase').onclick = eraseSelected;
  $('btn-hint').onclick = useHint;
  $('btn-check').onclick = doCheck;
  $('btn-restart').onclick = restartGame;
  $('btn-new2').onclick = newGameFlow;

  $('btn-clear-history').onclick = () => confirmClear('history');
  $('btn-replay-back').onclick = () => {
    stopReplay();
    showScreen('history');
  };
  $('btn-leaderboard-back').onclick = () => showScreen('menu');
  $('btn-settings-back').onclick = () => showScreen('menu');

  $('rp-first').onclick = () => {
    stopReplay();
    replayStep = 0;
    renderReplayStep();
  };
  $('rp-prev').onclick = () => {
    stopReplay();
    replayStep = Math.max(0, replayStep - 1);
    renderReplayStep();
  };
  $('rp-next').onclick = () => {
    stopReplay();
    replayStep = Math.min(replayRec.moves.length, replayStep + 1);
    renderReplayStep();
  };
  $('rp-last').onclick = () => {
    stopReplay();
    replayStep = replayRec.moves.length;
    renderReplayStep();
  };
  $('rp-play').onclick = () => {
    if (replayPlayId) {
      stopReplay();
      return;
    }
    if (replayStep >= replayRec.moves.length) replayStep = 0;
    $('rp-play').textContent = '⏸';
    replayPlayId = setInterval(() => {
      if (replayStep >= replayRec.moves.length) {
        stopReplay();
        return;
      }
      replayStep++;
      renderReplayStep();
    }, 600);
  };

  $('set-theme')
    .querySelectorAll('.seg-btn')
    .forEach((b) => {
      b.onclick = () => {
        storage.setSettings({ theme: b.dataset.v });
        applyTheme(b.dataset.v);
        renderSettings();
      };
    });

  $('btn-clear-data').onclick = () => {
    showModal({
      title: '清除全部本地数据',
      body: '<p>将删除当前对局、历史记录与排行榜（设置保留）。确定继续？</p>',
      actions: [
        { label: '取消', ghost: true, onClick: closeModal },
        {
          label: '清除',
          danger: true,
          onClick: () => {
            storage.clearAll();
            storage.setSettings(storage.getSettings());
            game = null;
            closeModal();
            showScreen('menu');
            toast('已清除');
          },
        },
      ],
    });
  };

  document.addEventListener('keydown', onKey);
  window.addEventListener('beforeunload', () => {
    if (game && game.status === 'playing') {
      game.pauseTimer();
      saveCurrent();
    }
  });

  registerPWA();
  restoreScreen();
}

init();
