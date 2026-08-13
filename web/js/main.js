// 应用主控制器：路由、菜单、对局交互、历史、复盘、排行榜、设置、PWA
import { Game } from './game.js';
import { storage } from './storage.js';
import { DIFFICULTIES, formatTime } from './sudoku.js';
import { buildBoard } from './ui.js';
import { registerPWA } from './pwa.js';
import { initSync, submitGlobalScore, fetchGlobalLeaderboard } from './sync.js';
import { VERSION, BUILD_DATE, COMMIT } from './version.js';

const $ = (id) => document.getElementById(id);
const SCREENS = ['menu', 'game', 'history', 'replay', 'leaderboard', 'settings'];

let game = null; // 当前 Game 实例
let noteMode = false;
let ctrlHeld = false; // PC 组合键：按住 Ctrl 默认笔记模式（单击候选数=记候选）
let timerId = null;
let replayRec = null;
let replayStep = 0;
let replayPlayId = null;
let toastTimer = null;

const diffLabel = (id) => (DIFFICULTIES.find((d) => d.id === id) || {}).label || id;

// 摸鱼（小窗 + 老板键）：仅桌面端有意义。判定矩阵：
//  - 桌面应用(Tauri)：永远需要（isTauri，即使触屏平板模式也有全局快捷键）
//  - 原生 App(Capacitor)：永远不需要（isCapacitor，App 即本体，无需伪装/小窗）
//  - 触摸手持设备（手机/平板，横竖屏，浏览器或 PWA）：不需要（无独立窗口、无实体老板键）
//  - 桌面浏览器 / 桌面 PWA：需要
// 已开启的迷你窗(?mini=1)与伪装屏(.boss)仍照常生效，不回退。
const IS_TOUCH_DEVICE =
  window.matchMedia('(pointer: coarse)').matches && window.matchMedia('(hover: none)').matches;
const SLACK_ENABLED = isTauri() || (!IS_TOUCH_DEVICE && !isCapacitor());

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

// 摸鱼：打开一个独立的小窗口（?mini=1），可拖到屏幕角落，强制暗色、只显示棋盘+数字盘
function openMiniWindow() {
  if (!SLACK_ENABLED) return; // 移动端/原生 App 无独立可拖拽窗口，屏蔽入口
  const base = typeof location !== 'undefined' ? location.pathname : '/';
  const qs = typeof location !== 'undefined' && location.search ? location.search + '&' : '?';
  const url = base + qs + 'mini=1';
  const w = window.open(
    url,
    'sudoku_mini',
    'width=380,height=680,menubar=no,toolbar=no,location=no,status=no,resizable=yes'
  );
  if (!w) toast('弹窗被拦截，请允许本站点弹出窗口');
}
// 点击「摸鱼小窗」按钮时先二次确认，避免误触弹出独立窗口
function confirmOpenMini() {
  if (!SLACK_ENABLED) return; // 移动端/原生 App 入口已被隐藏，双重保险
  showModal({
    title: '打开摸鱼小窗',
    body: '<p>将打开一个独立的摸鱼小窗（只显示棋盘、强制暗色），可拖到屏幕角落。确定打开吗？</p>',
    actions: [
      { label: '取消', ghost: true, onClick: closeModal },
      {
        label: '打开小窗',
        primary: true,
        onClick: () => {
          closeModal();
          openMiniWindow();
        },
      },
    ],
  });
}

// 老板键：在游戏与「伪装工作界面」之间瞬间切换
// 伪装成哪种开发可在「设置 → 摸鱼伪装」里选，画面会跟随技术栈渲染对应代码
const BOSS_LANGS = {
  frontend: {
    file: 'pages/dashboard.vue',
    html:
      `<span class="boss-tag">&lt;script setup&gt;</span>\n` +
      `<span class="boss-kw">import</span> { ref, computed } <span class="boss-kw">from</span> <span class="boss-st">'vue'</span>\n` +
      `<span class="boss-kw">import</span> type { Order } <span class="boss-kw">from</span> <span class="boss-st">'~/types/order'</span>\n\n` +
      `<span class="boss-kw">const</span> { data: orders, pending } = <span class="boss-kw">await</span> <span class="boss-fn">useFetch</span>&lt;Order[]&gt;(<span class="boss-st">'/api/orders'</span>)\n` +
      `<span class="boss-kw">const</span> keyword = <span class="boss-fn">ref</span>(<span class="boss-st">''</span>)\n\n` +
      `<span class="boss-kw">const</span> filtered = <span class="boss-fn">computed</span>(() =&gt;\n` +
      `  orders.value?.<span class="boss-fn">filter</span>((o) =&gt; o.id.<span class="boss-fn">includes</span>(keyword.value)) ?? []\n` +
      `)\n\n` +
      `<span class="boss-kw">const</span> total = <span class="boss-fn">computed</span>(() =&gt; filtered.value.<span class="boss-fn">reduce</span>((sum, o) =&gt; sum + o.amount, <span class="boss-num">0</span>))\n<span class="boss-tag">&lt;/script&gt;</span>\n\n` +
      `<span class="boss-tag">&lt;template&gt;</span>\n` +
      `  <span class="boss-tag">&lt;main</span> <span class="boss-at">class</span>=<span class="boss-st">"min-h-screen bg-gray-950 p-6 text-gray-200"</span><span class="boss-tag">&gt;</span>\n` +
      `    <span class="boss-tag">&lt;section</span> <span class="boss-at">class</span>=<span class="boss-st">"mb-4 flex items-center justify-between"</span><span class="boss-tag">&gt;</span>\n` +
      `      <span class="boss-tag">&lt;h1</span> <span class="boss-at">class</span>=<span class="boss-st">"text-xl font-bold"</span><span class="boss-tag">&gt;</span>订单概览<span class="boss-tag">&lt;/h1&gt;</span>\n` +
      `      <span class="boss-tag">&lt;input</span> <span class="boss-at">v-model</span>=<span class="boss-st">"keyword"</span> <span class="boss-at">placeholder</span>=<span class="boss-st">"搜索订单号"</span>\n` +
      `             <span class="boss-at">class</span>=<span class="boss-st">"rounded bg-gray-800 px-3 py-1 outline-none"</span> <span class="boss-tag">/&gt;</span>\n` +
      `    <span class="boss-tag">&lt;/section&gt;</span>\n` +
      `    <span class="boss-tag">&lt;div</span> <span class="boss-at">v-if</span>=<span class="boss-st">"pending"</span> <span class="boss-at">class</span>=<span class="boss-st">"text-center text-gray-500"</span><span class="boss-tag">&gt;</span>加载中...<span class="boss-tag">&lt;/div&gt;</span>\n` +
      `    <span class="boss-tag">&lt;table</span> <span class="boss-at">v-else</span> <span class="boss-at">class</span>=<span class="boss-st">"w-full border-collapse text-sm"</span><span class="boss-tag">&gt;</span>\n` +
      `      <span class="boss-tag">&lt;thead</span> <span class="boss-at">class</span>=<span class="boss-st">"text-left text-gray-400"</span><span class="boss-tag">&gt;&lt;tr&gt;</span><span class="boss-tag">&lt;th&gt;</span>订单号<span class="boss-tag">&lt;/th&gt;&lt;th&gt;</span>金额<span class="boss-tag">&lt;/th&gt;&lt;/tr&gt;&lt;/thead&gt;</span>\n` +
      `      <span class="boss-tag">&lt;tbody&gt;</span>\n` +
      `        <span class="boss-tag">&lt;tr</span> <span class="boss-at">v-for</span>=<span class="boss-st">"o in filtered"</span> <span class="boss-at">:key</span>=<span class="boss-st">"o.id"</span> <span class="boss-at">class</span>=<span class="boss-st">"border-b border-gray-800"</span><span class="boss-tag">&gt;</span>\n` +
      `          <span class="boss-tag">&lt;td&gt;</span>{{ o.id }}<span class="boss-tag">&lt;/td&gt;</span> <span class="boss-tag">&lt;td&gt;</span>¥{{ o.amount.toFixed(<span class="boss-num">2</span>) }}<span class="boss-tag">&lt;/td&gt;</span>\n` +
      `        <span class="boss-tag">&lt;/tr&gt;</span>\n` +
      `      <span class="boss-tag">&lt;/tbody&gt;</span>\n` +
      `    <span class="boss-tag">&lt;/table&gt;</span>\n` +
      `    <span class="boss-tag">&lt;p</span> <span class="boss-at">class</span>=<span class="boss-st">"mt-4 text-right text-gray-400"</span><span class="boss-tag">&gt;</span>合计：¥{{ total.toFixed(<span class="boss-num">2</span>) }}<span class="boss-tag">&lt;/p&gt;</span>\n` +
      `  <span class="boss-tag">&lt;/main&gt;</span>\n` +
      `<span class="boss-tag">&lt;/template&gt;</span>\n\n` +
      `<span class="boss-cm">&lt;!-- TODO: 接入 UnoCSS 后把硬编码 class 换成 @apply --&gt;</span>`,
  },
  php: {
    file: 'api.php',
    html:
      `<span class="boss-tag">&lt;?php</span>\n` +
      `<span class="boss-kw">require_once</span> <span class="boss-st">'../bootstrap.php'</span>;\n\n` +
      `<span class="boss-kw">use</span> App\\Service\\OrderService;\n\n` +
      `<span class="boss-fn">$service</span> = <span class="boss-kw">new</span> <span class="boss-fn">OrderService</span>();\n` +
      `<span class="boss-fn">$page</span> = <span class="boss-fn">$_GET</span>[<span class="boss-st">'page'</span>] ?? <span class="boss-num">1</span>;\n` +
      `<span class="boss-fn">$list</span> = <span class="boss-fn">$service</span>-&gt;<span class="boss-fn">paginate</span>(<span class="boss-fn">$page</span>, <span class="boss-num">20</span>);\n\n` +
      `<span class="boss-kw">header</span>(<span class="boss-st">'Content-Type: application/json'</span>);\n` +
      `<span class="boss-kw">echo</span> <span class="boss-fn">json_encode</span>([\n` +
      `  <span class="boss-st">'total'</span> =&gt; <span class="boss-fn">$list</span>-&gt;total,\n` +
      `  <span class="boss-st">'items'</span> =&gt; <span class="boss-fn">$list</span>-&gt;items,\n` +
      `]);\n\n` +
      `<span class="boss-cm">// TODO: 加一层缓存，降低数据库压力</span>`,
  },
  java: {
    file: 'ReportService.java',
    html:
      `<span class="boss-kw">package</span> com.acme.report;\n\n` +
      `<span class="boss-kw">import</span> java.util.List;\n` +
      `<span class="boss-kw">import</span> org.springframework.stereotype.Service;\n\n` +
      `<span class="boss-kw">@Service</span>\n` +
      `<span class="boss-kw">public class</span> <span class="boss-fn">ReportService</span> {\n` +
      `  <span class="boss-kw">private final</span> OrderRepository repo;\n\n` +
      `  <span class="boss-kw">public</span> <span class="boss-fn">ReportService</span>(OrderRepository repo) {\n` +
      `    <span class="boss-kw">this</span>.repo = repo;\n` +
      `  }\n\n` +
      `  <span class="boss-kw">public</span> Report <span class="boss-fn">build</span>(String quarter) {\n` +
      `    List&lt;Order&gt; orders = repo.<span class="boss-fn">findByQuarter</span>(quarter);\n` +
      `    <span class="boss-kw">double</span> total = orders.<span class="boss-fn">stream</span>()\n` +
      `        .<span class="boss-fn">mapToDouble</span>(Order::getAmount)\n` +
      `        .<span class="boss-fn">sum</span>();\n` +
      `    <span class="boss-kw">return new</span> <span class="boss-fn">Report</span>(quarter, total, orders.<span class="boss-fn">size</span>());\n` +
      `  }\n` +
      `}`,
  },
  python: {
    file: 'analysis.py',
    html:
      `<span class="boss-kw">import</span> pandas <span class="boss-kw">as</span> pd\n` +
      `<span class="boss-kw">from</span> datetime <span class="boss-kw">import</span> date\n\n` +
      `df = pd.<span class="boss-fn">read_csv</span>(<span class="boss-st">"sales_q3.csv"</span>)\n` +
      `df[<span class="boss-st">"month"</span>] = pd.to_datetime(df[<span class="boss-st">"date"</span>]).dt.month\n` +
      `pivot = df.<span class="boss-fn">pivot_table</span>(index=<span class="boss-st">"region"</span>, values=<span class="boss-st">"amount"</span>, aggfunc=<span class="boss-st">"sum"</span>)\n\n` +
      `<span class="boss-cm"># 按金额降序取 Top 10 区域</span>\n` +
      `top = pivot.<span class="boss-fn">sort_values</span>(<span class="boss-st">"amount"</span>, ascending=<span class="boss-kw">False</span>).<span class="boss-fn">head</span>(<span class="boss-num">10</span>)\n` +
      `<span class="boss-kw">print</span>(top)\n\n` +
      `<span class="boss-cm"># TODO: 核对 9 月异常波动，下周例会同步</span>`,
  },
};
function renderBoss() {
  const lang = (storage.getSettings().bossLang || 'frontend');
  const c = BOSS_LANGS[lang] || BOSS_LANGS.frontend;
  const code = document.querySelector('#boss-screen .boss-code code');
  const file = document.querySelector('#boss-screen .boss-file');
  if (code) code.innerHTML = c.html + '<span class="boss-cursor"></span>';
  if (file) file.textContent = c.file;
  const items = document.querySelectorAll('#boss-screen .boss-file-i');
  items.forEach((el) => {
    el.classList.toggle('boss-active', el.dataset.lang === lang);
  });
}
function toggleBoss() {
  const turningOn = !document.body.classList.contains('boss');
  if (turningOn) renderBoss();
  document.body.classList.toggle('boss');
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
function showModal({ title, body, actions = [], dismissable = true, actionsClass = '', onClose = null }) {
  const root = $('modal-root');
  root.innerHTML = '';
  const m = document.createElement('div');
  m.className = 'modal';
  // 头部：标题 + 右上角关闭按钮（所有弹框统一由按钮或叉叉关闭，不再点遮罩关闭）
  const head = document.createElement('div');
  head.className = 'modal-head';
  const h = document.createElement('h3');
  h.textContent = title;
  head.appendChild(h);
  const xBtn = document.createElement('button');
  xBtn.type = 'button';
  xBtn.className = 'modal-close';
  xBtn.textContent = '×';
  xBtn.onclick = () => (onClose ? onClose() : closeModal());
  head.appendChild(xBtn);
  m.appendChild(head);
  if (typeof body === 'string') {
    const p = document.createElement('p');
    p.innerHTML = body;
    m.appendChild(p);
  } else if (body) {
    m.appendChild(body);
  }
  const act = document.createElement('div');
  act.className = 'modal-actions' + (actionsClass ? ' ' + actionsClass : '');
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
  lastPad = null;
  lastNote = null;
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
// 双击判定窗口（基于时间，不依赖原生 dblclick，避免棋盘/数字盘重建后失效）
const DOUBLE_CLICK_MS = 300;
let lastPad = null; // { n, t } 数字盘双击检测
let lastNote = null; // { i, n, t } 单元格候选双击检测
// 记录一次单击，并安排自动过期，避免残留状态在之后被误判为双击
function setLastPad(n) {
  const snap = { n, t: Date.now() };
  lastPad = snap;
  setTimeout(() => {
    if (lastPad === snap) lastPad = null;
  }, DOUBLE_CLICK_MS + 60);
}
function setLastNote(i, n) {
  const snap = { i, n, t: Date.now() };
  lastNote = snap;
  setTimeout(() => {
    if (lastNote === snap) lastNote = null;
  }, DOUBLE_CLICK_MS + 60);
}
function renderPad() {
  const wrap = $('pad-numbers');
  wrap.innerHTML = '';
  const rem = game.remainingByDigit();
  const selVal = game.selected != null ? game.cells[game.selected] : 0;
  for (let n = 1; n <= 9; n++) {
    const b = document.createElement('button');
    b.className = 'num' + (rem[n] === 0 ? ' done' : '') + (n === selVal ? ' num-active' : '');
    b.innerHTML = `${n}<span class="remain">${rem[n]}</span>`;
    b.addEventListener('click', (e) => {
      if (!game || game.selected == null) {
        toast('请先选择一个格子');
        return;
      }
      const now = Date.now();
      // 双击：同一数字在窗口内再次点击 -> 选中并填入（先还原刚才的候选切换）
      if (lastPad && lastPad.n === n && now - lastPad.t < DOUBLE_CLICK_MS) {
        game.setCell(game.selected, n, true); // 还原候选（撤销单击切换）
        if (game.setCell(game.selected, n, false)) afterMove(); // 填入正式值
        lastPad = null;
        return;
      }
      setLastPad(n);
      // 单击：wantNote = 笔记模式 || 按住 Ctrl -> 记候选(切换：有删无加)；否则回填
      const wantNote = noteMode || (e && e.ctrlKey) || ctrlHeld;
      if (game.setCell(game.selected, n, wantNote)) afterMove();
    });
    wrap.appendChild(b);
  }
}
function onCellClick(i) {
  const now = Date.now();
  // 双击候选的第二次点击可能落在格子上（候选已被移除）-> 视为「选中填入」该候选
  if (lastNote && lastNote.i === i && now - lastNote.t < DOUBLE_CLICK_MS) {
    const n = lastNote.n;
    lastNote = null;
    game.selected = i;
    game.setCell(i, n, true); // 还原候选（撤销第一次单击的切换）
    if (game.setCell(i, n, false)) afterMove(); // 填入正式值
    return;
  }
  game.selected = i;
  renderGame();
}
// 单元格内候选数字交互（无论是否处于笔记模式）：
//  - 单击 = 切换该候选（添加/取消）
//  - 双击 = 选中并填入该候选数字
function onNoteClick(i, n) {
  if (!game || game.status !== 'playing' || game.isGiven(i) || game.cells[i] !== 0) return;
  const now = Date.now();
  game.selected = i;
  // 双击候选的第二次点击（可能落在同格别的候选或格子上）-> 选中并填入
  if (lastNote && lastNote.i === i && now - lastNote.t < DOUBLE_CLICK_MS) {
    const fillN = lastNote.n;
    lastNote = null;
    game.setCell(i, fillN, true); // 还原候选（撤销第一次单击的切换）
    if (game.setCell(i, fillN, false)) afterMove(); // 填入正式值
    return;
  }
  setLastNote(i, n);
  // 单击 = 切换候选（添加/取消），无论是否处于笔记模式
  if (game.setCell(i, n, true)) afterMove();
}
function inputNumber(n, forceNote = false) {
  if (!game || game.selected == null) {
    toast('请先选择一个格子');
    return;
  }
  // 键盘：默认填入；笔记模式或按住 Ctrl 时记候选（与数字盘单击一致）
  if (game.setCell(game.selected, n, noteMode || forceNote)) afterMove();
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
  game.revealWrong(); // 累计揭示（计错 + 持续标红）
  saveCurrent();
  renderGame();
  // 反馈当前盘面错误总数（非本次新增），避免二次检查误报“没问题”
  const total = game.currentWrongCount();
  toast(total > 0 ? `发现 ${total} 处错误` : '没有发现错误');
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
  storage.upsertHistory({
    id: g.resumeId || g.id, // 续玩局归档时更新原记录，而非新增一条
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
    id: game.resumeId || game.id, // 续玩局：沿用原记录 id，原地更新
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
  storage.upsertHistory(rec);
  storage.addLeaderboard({
    id: game.resumeId || game.id,
    difficulty: game.difficulty,
    durationMs: duration,
    mistakes: game.mistakes,
    hintsUsed: game.hintsUsed,
    won: true,
    date: Date.now(),
  });
  // 异步上传全球榜（失败静默）
  submitGlobalScore({ ...rec, score: compositeScore(rec) });
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
    actionsClass: 'win-actions',
    // 点右上角 × 关闭时，默认跳转到排行榜
    onClose: () => { closeModal(); showScreen('leaderboard'); },
    actions: [
      { label: '再来一局', primary: true, onClick: () => newGameFlow() },
      { label: '查看复盘', ghost: true, onClick: () => { closeModal(); openReplay(rec); } },
      { label: '查看排行榜', ghost: true, onClick: () => { closeModal(); showScreen('leaderboard'); } },
    ],
  });
}

// 从复盘走子序列重建当前盘面与笔记（用于「继续」未完成对局）
function rebuildFromMoves(puzzle, moves) {
  const cells = puzzle.slice();
  const notes = Array.from({ length: 81 }, () => []);
  for (const m of moves || []) {
    if (m.kind === 'note') {
      const arr = notes[m.idx];
      const p = arr.indexOf(m.val);
      if (p >= 0) arr.splice(p, 1);
      else arr.push(m.val);
    } else {
      cells[m.idx] = m.val; // set / erase / hint
      notes[m.idx] = [];
    }
  }
  return { cells, notes };
}

// 把一条「未完成」历史恢复为当前对局并进入游戏继续玩
function resumeFromHistory(rec) {
  const { cells, notes } = rebuildFromMoves(rec.puzzle, rec.moves);
  // 已错误格先计入 revealedWrong，避免后续「检查」重复计数（不额外泄题）
  const revealedWrong = new Set();
  for (let i = 0; i < 81; i++) {
    if (cells[i] !== 0 && cells[i] !== rec.solution[i]) revealedWrong.add(i);
  }
  // 避免丢失正在进行的另一局：先将其归档为历史
  const cur = storage.getCurrent();
  if (cur && cur.status !== 'won' && cur.id !== rec.id) archiveCurrent();

  game = Game.fromJSON({
    id: 'g' + Date.now() + Math.random().toString(36).slice(2, 7),
    resumeId: rec.id, // 标记续玩自哪条记录，完成后原地更新它
    puzzle: rec.puzzle.slice(),
    solution: rec.solution.slice(),
    cells,
    notes,
    difficulty: rec.difficulty,
    elapsedMs: rec.durationMs || 0,
    mistakes: rec.mistakes || 0,
    revealedWrong,
    status: 'playing',
    createdAt: rec.date,
    moves: (rec.moves || []).slice(),
    hintsUsed: rec.hintsUsed || 0,
  });
  noteMode = false;
  $('btn-notes').classList.remove('active');
  saveCurrent();
  $('pause-overlay').classList.add('hidden');
  $('board').classList.remove('paused');
  $('btn-pause').textContent = '⏸';
  $('btn-pause').title = '暂停';
  enterGame();
  toast('已载入未完成的这局，继续加油！');
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

    const main = document.createElement('div');
    main.className = 'row-main';
    const title = document.createElement('div');
    title.className = 'row-title';
    const d = DIFFICULTIES.find((x) => x.id === rec.difficulty);
    const tagDiff = document.createElement('span');
    tagDiff.className = 'tag d-' + rec.difficulty;
    tagDiff.textContent = d ? d.label : rec.difficulty;
    const tagWin = document.createElement('span');
    tagWin.className = 'tag ' + (rec.won ? 'win' : 'lose');
    tagWin.textContent = rec.won ? '完成' : '未完成';
    title.appendChild(tagDiff);
    title.appendChild(tagWin);
    const sub = document.createElement('div');
    sub.className = 'row-sub';
    sub.textContent =
      new Date(rec.date).toLocaleString('zh-CN') + ' · 错误 ' + rec.mistakes + ' · 提示 ' + (rec.hintsUsed || 0);
    main.appendChild(title);
    main.appendChild(sub);

    const right = document.createElement('div');
    right.className = 'row-right';
    right.textContent = formatTime(rec.durationMs);

    const actions = document.createElement('div');
    actions.className = 'row-actions';
    if (!rec.won) {
      const resumeBtn = document.createElement('button');
      resumeBtn.className = 'btn btn-primary btn-sm';
      resumeBtn.textContent = '继续';
      resumeBtn.onclick = (e) => {
        e.stopPropagation();
        resumeFromHistory(rec);
      };
      actions.appendChild(resumeBtn);
    }
    const replayBtn = document.createElement('button');
    replayBtn.className = 'btn btn-ghost btn-sm';
    replayBtn.textContent = '复盘';
    replayBtn.onclick = (e) => {
      e.stopPropagation();
      openReplay(rec);
    };
    actions.appendChild(replayBtn);

    row.appendChild(main);
    row.appendChild(right);
    row.appendChild(actions);
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
// 难度基础分：难度越高完成得分越高（与 DIFFICULTY_CLUES 反向对应：提示越少越难）
const DIFF_SCORE = { easy: 100, medium: 200, hard: 350, expert: 500 };
// 各难度“标准用时”（秒）：用于时间因子归一化，使不同难度的成绩可横向比较
const DIFF_PAR = { easy: 240, medium: 480, hard: 720, expert: 960 };
function difficultyScore(rec) {
  return DIFF_SCORE[rec.difficulty] || 100;
}
// 综合分：难度分 × 时间因子 × 准确率因子，跨难度可比较（越快/越少错/越少提示越高）
function compositeScore(rec) {
  const base = difficultyScore(rec);
  const durSec = Math.max(rec.durationMs / 1000, 1);
  const par = DIFF_PAR[rec.difficulty] || 600;
  const timeFactor = Math.min(1.6, Math.max(0.4, par / durSec));
  const accuracyFactor = 1 / (1 + 0.05 * (rec.mistakes || 0) + 0.1 * (rec.hintsUsed || 0));
  return Math.round(base * timeFactor * accuracyFactor);
}

let lbMode = 'fast'; // 'fast' 每难度最快 | 'score' 难度分 | 'composite' 综合分 | 'global' 全球榜
let lbGlobalDiff = ''; // '' 全难度，或难度 id

function computePersonalStats(lb, history) {
  const won = lb.length;
  const total = history.length || won;
  const winRate = total ? Math.round((won / total) * 100) : 0;
  const bestMs = won ? Math.min(...lb.map((r) => r.durationMs)) : 0;
  const avgMs = won ? Math.round(lb.reduce((s, r) => s + r.durationMs, 0) / won) : 0;
  const avgMistakes = won ? (lb.reduce((s, r) => s + r.mistakes, 0) / won).toFixed(1) : '0';
  const avgHints = won ? (lb.reduce((s, r) => s + (r.hintsUsed || 0), 0) / won).toFixed(1) : '0';
  const bestByDiff = {};
  DIFFICULTIES.forEach((d) => {
    const rows = lb.filter((r) => r.difficulty === d.id);
    if (rows.length) bestByDiff[d.id] = Math.min(...rows.map((r) => r.durationMs));
  });
  const streak = (() => {
    let max = 0;
    let cur = 0;
    for (const r of history.slice().reverse()) {
      if (r.won) {
        cur++;
        max = Math.max(max, cur);
      } else {
        cur = 0;
      }
    }
    return max;
  })();
  return { won, total, winRate, bestMs, avgMs, avgMistakes, avgHints, bestByDiff, streak };
}

function renderPersonalStats(lb, history) {
  const s = computePersonalStats(lb, history);
  const wrap = document.createElement('div');
  wrap.className = 'lb-section';
  wrap.innerHTML = `<h3>个人战绩</h3>`;
  const grid = document.createElement('div');
  grid.className = 'lb-stats-grid';
  grid.innerHTML = `
    <div class="lb-stat-card"><div class="lb-stat-val">${s.total}</div><div class="lb-stat-label">总局数</div></div>
    <div class="lb-stat-card"><div class="lb-stat-val">${s.winRate}%</div><div class="lb-stat-label">胜率</div></div>
    <div class="lb-stat-card"><div class="lb-stat-val">${s.won}</div><div class="lb-stat-label">完成局</div></div>
    <div class="lb-stat-card"><div class="lb-stat-val">${s.bestMs ? formatTime(s.bestMs) : '-'}</div><div class="lb-stat-label">最快用时</div></div>
    <div class="lb-stat-card"><div class="lb-stat-val">${s.avgMs ? formatTime(s.avgMs) : '-'}</div><div class="lb-stat-label">平均用时</div></div>
    <div class="lb-stat-card"><div class="lb-stat-val">${s.streak}</div><div class="lb-stat-label">连胜纪录</div></div>
  `;
  const diffRow = document.createElement('div');
  diffRow.className = 'lb-best-row';
  diffRow.innerHTML = DIFFICULTIES.map((d) => {
    const t = s.bestByDiff[d.id];
    return `<div class="lb-best-item"><span class="tag d-${d.id}">${d.label}</span><span class="lb-best-time">${t ? formatTime(t) : '-'}</span></div>`;
  }).join('');
  wrap.appendChild(grid);
  wrap.appendChild(diffRow);
  return wrap;
}

// 排行榜行卡片：移动端友好。排名徽标 + 主信息(名称/难度 + 次级指标) + 主指标，flex 自适应。
// 比 <table> 在窄屏更不易错乱拥挤。
// 前十名徽标配色：1-3 金/银/铜，4-10 鲜明区分的色相；实色底+白字，深浅主题均直接可读。
const RANK_COLORS = [
  '#f59e0b', '#8a94a6', '#c17a3a', '#ef4444', '#16a34a',
  '#2563eb', '#7c3aed', '#db2777', '#0d9488', '#ea580c',
];
function lbRow({ rank, nameHtml, tagHtml = '', metaHtml, primaryLabel, primaryVal, top = false }) {
  const color = rank >= 1 && rank <= 10 ? RANK_COLORS[rank - 1] : '';
  const row = document.createElement('div');
  row.className = 'lb-row' + (color ? ' accent' : '');
  if (color) row.style.setProperty('--rank-color', color);
  const badgeStyle = color ? ` style="background:${color};color:#fff"` : '';
  row.innerHTML = `
    <div class="lb-rank"${badgeStyle}>${rank}</div>
    <div class="lb-main">
      <div class="lb-name">${nameHtml}${tagHtml}</div>
      <div class="lb-meta">${metaHtml}</div>
    </div>
    <div class="lb-primary"><span class="lb-primary-label">${primaryLabel}</span><b>${primaryVal}</b></div>`;
  return row;
}

async function renderLeaderboard() {
  // 排名维度切换
  const tabs = $('lb-tabs');
  if (tabs) {
    tabs.innerHTML = '';
    [
      ['fast', '最快用时'],
      ['score', '难度分'],
      ['composite', '综合分'],
      ['global', '全球榜'],
    ].forEach(([m, label]) => {
      const b = document.createElement('button');
      b.className = 'seg-btn' + (m === lbMode ? ' active' : '');
      b.textContent = label;
      b.onclick = () => {
        lbMode = m;
        renderLeaderboard();
      };
      tabs.appendChild(b);
    });
  }

  const body = $('leaderboard-body');
  body.innerHTML = '';

  // 全球榜：异步拉取，与个人本地数据无关
  if (lbMode === 'global') {
    body.innerHTML = '<div class="empty">正在加载全球榜…</div>';
    const list = await fetchGlobalLeaderboard({ difficulty: lbGlobalDiff, limit: 50 });
    body.innerHTML = '';

    // 难度筛选
    const diffSeg = document.createElement('div');
    diffSeg.className = 'seg lb-diff-seg';
    const allBtn = document.createElement('button');
    allBtn.className = 'seg-btn' + (lbGlobalDiff === '' ? ' active' : '');
    allBtn.textContent = '全部';
    allBtn.onclick = () => { lbGlobalDiff = ''; renderLeaderboard(); };
    diffSeg.appendChild(allBtn);
    DIFFICULTIES.forEach((d) => {
      const b = document.createElement('button');
      b.className = 'seg-btn' + (lbGlobalDiff === d.id ? ' active' : '');
      b.textContent = d.label;
      b.onclick = () => { lbGlobalDiff = d.id; renderLeaderboard(); };
      diffSeg.appendChild(b);
    });
    const sec = document.createElement('div');
    sec.className = 'lb-section';
    sec.appendChild(diffSeg);

    if (!list || !list.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = '暂无全球榜数据，完成一局即可上榜';
      sec.appendChild(empty);
      body.appendChild(sec);
      return;
    }

    const title = document.createElement('h3');
    title.textContent = '全球榜 · ' + (lbGlobalDiff ? (DIFFICULTIES.find((x) => x.id === lbGlobalDiff) || {}).label || lbGlobalDiff : '全难度综合');
    sec.appendChild(title);
    const listEl = document.createElement('div');
    listEl.className = 'lb-list';
    list.forEach((r, i) => {
      const d = DIFFICULTIES.find((x) => x.id === r.difficulty) || {};
      const tagHtml = `<span class="tag d-${r.difficulty}">${d.label || r.difficulty}</span>`;
      const metaHtml = `用时 ${formatTime(r.duration_ms)} · 错误 ${r.mistakes || 0} · 提示 ${r.hints_used || 0}`;
      listEl.appendChild(
        lbRow({
          rank: i + 1,
          nameHtml: `<span class="lb-nick-text">${escapeHtml(r.nickname || '匿名玩家')}</span>`,
          tagHtml,
          metaHtml,
          primaryLabel: '综合分',
          primaryVal: r.score,
          top: i === 0,
        })
      );
    });
    sec.appendChild(listEl);
    body.appendChild(sec);
    return;
  }

  const lb = storage.getLeaderboard().filter((r) => r.won);
  if (!lb.length) {
    body.innerHTML = '<div class="empty">还没有完成的对局，加油！</div>';
    return;
  }

  // 模式一：每难度最快用时 Top10（原行为）+ 顶部个人统计
  if (lbMode === 'fast') {
    body.appendChild(renderPersonalStats(lb, storage.getHistory()));
    DIFFICULTIES.forEach((d) => {
      const rows = lb
        .filter((r) => r.difficulty === d.id)
        .sort((a, b) => a.durationMs - b.durationMs)
        .slice(0, 10);
      if (!rows.length) return;
      const sec = document.createElement('div');
      sec.className = 'lb-section';
      sec.innerHTML = `<h3><span class="tag d-${d.id}">${d.label}</span> 最佳成绩</h3>`;
      const listEl = document.createElement('div');
      listEl.className = 'lb-list';
      rows.forEach((r, i) => {
        const metaHtml = `错误 ${r.mistakes} · 提示 ${r.hintsUsed || 0} · ${new Date(r.date).toLocaleDateString('zh-CN')}`;
        listEl.appendChild(
          lbRow({
            rank: i + 1,
            nameHtml: `<span class="lb-nick-text">完成记录</span>`,
            metaHtml,
            primaryLabel: '用时',
            primaryVal: formatTime(r.durationMs),
            top: i === 0,
          })
        );
      });
      sec.appendChild(listEl);
      body.appendChild(sec);
    });
    return;
  }

  // 模式二/三：难度分 / 综合分 —— 跨难度统一排名（全部人员综合排名）
  const isScore = lbMode === 'score';
  const scored = lb
    .map((r) => ({ rec: r, diff: difficultyScore(r), comp: compositeScore(r) }))
    .sort(
      (a, b) =>
        (isScore ? b.diff - a.diff : b.comp - a.comp) || a.rec.durationMs - b.rec.durationMs
    )
    .slice(0, 20);

  const label = isScore ? '难度分' : '综合分';
  const sec = document.createElement('div');
  sec.className = 'lb-section';
  sec.innerHTML = `<h3>${label}榜 · 全部难度综合排名</h3>`;
  const listEl = document.createElement('div');
  listEl.className = 'lb-list';
  scored.forEach((s, i) => {
    const r = s.rec;
    const d = DIFFICULTIES.find((x) => x.id === r.difficulty) || {};
    const tagHtml = `<span class="tag d-${r.difficulty}">${d.label || r.difficulty}</span>`;
    const metaHtml = `用时 ${formatTime(r.durationMs)} · 错误 ${r.mistakes} · 提示 ${r.hintsUsed || 0} · ${new Date(r.date).toLocaleDateString('zh-CN')}`;
    listEl.appendChild(
      lbRow({
        rank: i + 1,
        nameHtml: `<span class="lb-nick-text">完成记录</span>`,
        tagHtml,
        metaHtml,
        primaryLabel: label,
        primaryVal: isScore ? s.diff : s.comp,
        top: i === 0,
      })
    );
  });
  sec.appendChild(listEl);
  body.appendChild(sec);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
  // 主题：跟随系统 / 浅色 / 深色
  const twrap = $('set-theme');
  twrap.innerHTML = '';
  [
    ['auto', '跟随系统'],
    ['light', '浅色'],
    ['dark', '深色'],
  ].forEach(([v, label]) => {
    const b = document.createElement('button');
    b.className = 'seg-btn' + (v === s.theme ? ' active' : '');
    b.textContent = label;
    b.dataset.v = v;
    b.onclick = () => {
      storage.setSettings({ theme: v });
      applyTheme(v);
      renderSettings();
    };
    twrap.appendChild(b);
  });
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
  // 摸鱼伪装语言：前端 / PHP / Java / Python（仅桌面端有意义，移动端/PWA 隐藏整组）
  const bwrap = $('set-bosslang');
  if (bwrap) {
    const langGroup = bwrap.closest?.('.setting-group');
    if (!SLACK_ENABLED && langGroup) langGroup.style.display = 'none';
    else {
    bwrap.innerHTML = '';
    [
      ['frontend', 'Vue'],
      ['php', 'PHP'],
      ['java', 'Java'],
      ['python', 'Python'],
    ].forEach(([v, label]) => {
      const b = document.createElement('button');
      b.className = 'seg-btn' + (v === (s.bossLang || 'frontend') ? ' active' : '');
      b.textContent = label;
      b.onclick = () => {
        storage.setSettings({ bossLang: v });
        renderBoss();
        renderSettings();
        toast('摸鱼伪装：' + label);
      };
      bwrap.appendChild(b);
    });
    }
  }
  // 更新检测：启动时自动 / 手动 / 关闭
  const uwrap = $('set-update-check');
  if (uwrap) {
    uwrap.innerHTML = '';
    const modes = [
      ['startup', '启动时自动'],
      ['manual', '手动检查'],
      ['off', '关闭'],
    ];
    modes.forEach(([v, label]) => {
      const b = document.createElement('button');
      b.className = 'seg-btn' + (v === (s.updateCheck || 'startup') ? ' active' : '');
      b.textContent = label;
      b.dataset.v = v;
      b.onclick = () => {
        storage.setSettings({ updateCheck: v });
        renderSettings();
        toast('更新检测：' + label);
      };
      uwrap.appendChild(b);
    });
    const hint = $('set-update-hint');
    if (hint) {
      if (s.updateCheck === 'off') hint.textContent = '已关闭自动检测，可点击下方按钮手动检查更新。';
      else if (s.updateCheck === 'manual') hint.textContent = '仅在你点击「检查更新」时检测新版本。';
      else hint.textContent = '每次启动时自动检测是否有新版本；发现更新会提示你，由你决定是否下载安装。';
    }
    const btn = $('btn-check-update');
    if (btn) btn.onclick = () => checkForUpdate({ silent: false });
  }

  // 关于：版本号 / 构建日期 / 提交哈希（自动同步自 package.json）
  const verEl = $('set-version');
  const buildEl = $('set-build');
  if (verEl) verEl.textContent = 'v' + VERSION;
  if (buildEl) {
    buildEl.textContent = `构建日期 ${BUILD_DATE} · 提交 ${COMMIT}`;
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
  const b = typeof document !== 'undefined' ? document.body : null;
  if (b && b.classList.contains('boss')) return;
  if ($('screen-game').classList.contains('hidden') || !game) return;
  if (e.key >= '1' && e.key <= '9') {
    inputNumber(parseInt(e.key, 10), e.ctrlKey || ctrlHeld);
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
  $('btn-resume').onclick = resumeGame;
  $('btn-new').onclick = newGameFlow;
  $('btn-history').onclick = () => showScreen('history');
  $('btn-leaderboard').onclick = () => showScreen('leaderboard');
  $('btn-settings').onclick = () => showScreen('settings');

  $('btn-pause').onclick = togglePause;
  $('btn-resume-game').onclick = resumeGamePlay;
  $('btn-exit-pause').onclick = saveExit;
  $('btn-theme').onclick = () => {
    const cur = storage.getSettings().theme;
    const next = cur === 'dark' ? 'light' : 'dark';
    storage.setSettings({ theme: next });
    applyTheme(next);
  };
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
  // 摸鱼小窗仅桌面端有意义：移动端/PWA 隐藏入口（已开启的迷你窗仍照常渲染）
  if (SLACK_ENABLED) {
    $('btn-mini').onclick = confirmOpenMini;
    $('btn-settings-mini').onclick = confirmOpenMini;
  } else {
    const bm = $('btn-mini');
    if (bm) bm.style.display = 'none';
    const bsm = $('btn-settings-mini');
    if (bsm) {
      bsm.style.display = 'none';
      const group = bsm.closest?.('.setting-group');
      if (group) group.style.display = 'none'; // 整组（标题+按钮）一并隐藏更干净
    }
  }

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
  // 老板键：按 ` 键在「游戏」与「伪装工作界面」间瞬间切换（仅桌面端，移动端/PWA 无实体键且入口已屏蔽）
  if (SLACK_ENABLED) {
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Backquote' || e.key === '`') {
        e.preventDefault();
        toggleBoss();
      }
    });
  }
  // PC 组合键：按住 Ctrl 默认笔记模式（松开复位）
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Control') ctrlHeld = true;
  });
  document.addEventListener('keyup', (e) => {
    if (e.key === 'Control') ctrlHeld = false;
  });
  window.addEventListener('beforeunload', () => {
    if (game && game.status === 'playing') {
      game.pauseTimer();
      saveCurrent();
    }
  });

  registerPWA();
  initSync(); // 异步：非浏览器/离线时自动降级为纯本地，不阻塞游戏
  restoreScreen();
  // 摸鱼迷你模式：?mini=1 时强制暗色、只留棋盘+数字盘，并自动进入对局
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams('');
  if (q.get('mini') === '1') {
    document.body.classList.add('mini');
    applyTheme('dark');
    if ($('screen-game').classList.contains('hidden')) {
      startNewGame(storage.getSettings().difficulty || 'easy');
    }
    toast('摸鱼模式：按 ` 键一键隐藏 / 恢复');
  }
  // Tauri 桌面壳桥接：托盘菜单 / 全局快捷键（Alt+` 老板键、Alt+S 显隐）由 Rust 后端派发事件
  initTauriBridge();

  // 桌面端自动更新检测（浏览器/PWA 跳过）
  const updateMode = storage.getSettings().updateCheck || 'startup';
  if (updateMode === 'startup' && isTauri()) {
    setTimeout(() => checkForUpdate({ silent: true }), 2500);
  }
}

// 仅在 Tauri 运行时挂载：监听后端派发的老板键 / 迷你模式事件，浏览器/PWA 中静默跳过
async function initTauriBridge() {
  if (typeof window === 'undefined' || !window.__TAURI_INTERNALS__) return;
  try {
    const { listen } = await import('@tauri-apps/api/event');
    await listen('boss-toggle', () => toggleBoss());
    await listen('offline-mode', (e) => toast(e.payload));
    await listen('mini-toggle', () => {
      const on = document.body.classList.toggle('mini');
      if (on) {
        applyTheme('dark');
        if (typeof $('screen-game') !== 'undefined' && $('screen-game').classList.contains('hidden')) {
          startNewGame(storage.getSettings().difficulty || 'easy');
        }
        toast('已切换摸鱼迷你模式');
      }
    });
    // 提示用户可用全局快捷键（即使窗口失焦也能触发）
    console.info('[Tauri] 老板键桥接已挂载：Alt+` 切伪装 / Alt+S 显隐');
  } catch (e) {
    console.warn('[Tauri] 桥接初始化失败', e);
  }
}

function isTauri() {
  return typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__;
}

function isCapacitor() {
  return typeof window !== 'undefined' && !!window.Capacitor?.isNativePlatform && window.Capacitor.isNativePlatform();
}

// 桌面壳/App 自动更新：启动时/手动检测，发现新版本由用户决定是否下载安装
async function checkForUpdate({ silent = false } = {}) {
  if (isCapacitor()) {
    if (!silent) {
      toast('App 更新请前往 GitHub Release 页面下载最新 APK');
      try { window.open('https://github.com/GuoSirius/sudoku/releases/latest', '_blank'); } catch {}
    }
    return;
  }
  if (!isTauri()) {
    if (!silent) toast('浏览器/PWA 端无需手动检测，刷新页面即可获取最新版本');
    return;
  }
  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    const update = await check();
    if (update) {
      const body = `发现新版本 <strong>v${update.version}</strong>（当前 v${update.currentVersion}），是否立即下载并安装？`;
      showModal({
        title: '发现更新',
        body,
        dismissable: false,
        actions: [
          { label: '稍后再说', ghost: true, onClick: () => closeModal() },
          {
            label: '立即更新',
            primary: true,
            onClick: async () => {
              closeModal();
              toast('正在下载更新，请稍候…');
              try {
                await update.downloadAndInstall((event) => {
                  if (event.event === 'Finished') {
                    toast('更新已下载，请重启应用');
                  }
                });
                toast('更新已下载，请重启应用');
              } catch (err) {
                console.error('[updater] 下载安装失败', err);
                toast('更新下载失败：' + (err.message || '未知错误'));
              }
            },
          },
        ],
      });
    } else if (!silent) {
      toast('当前已是最新版本');
    }
  } catch (e) {
    console.error('[updater] 检查更新失败', e);
    if (!silent) toast('检查更新失败：' + (e.message || '未知错误'));
  }
}

init();
