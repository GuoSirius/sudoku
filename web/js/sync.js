// Supabase 跨设备同步：邮箱/手机 应用内 OTP 验证码登录（免密码，PWA 通用）+ 可选 GitHub PKCE 登录
// 设计原则：
//  - 纯前端 PWA，通过 CDN 动态加载 supabase-js；加载失败则静默降级为纯本地。
//  - 登录成功后从云端拉取 settings/history/leaderboard，按 id 合并（去重、取较新）回写本地。
//  - 本地任何变动（历史/排行/设置）防抖 800ms 后整行回写云端（每用户一行，RLS 隔离）。
//  - 未登录 / 离线 / 推送失败都不影响本地游玩，下次变动或登录再同步。

import {
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  ENABLE_GITHUB,
  ENABLE_PHONE,
  OTP_LENGTH,
} from './config.js';
import { storage } from './storage.js';

let supabase = null;
let session = null;
let ready = false;
let pushTimer = null;

// ---------------- 轻量 UI 辅助 ----------------
function notify(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(notify._t);
  notify._t = setTimeout(() => t.classList.add('hidden'), 1800);
}

function openModal(title, bodyEl, actions, opts = {}) {
  const root = document.getElementById('modal-root');
  if (!root) return;
  root.innerHTML = '';
  const m = document.createElement('div');
  m.className = 'modal' + (opts.className ? ' ' + opts.className : '');
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
  xBtn.onclick = () => closeModal();
  head.appendChild(xBtn);
  m.appendChild(head);
  if (bodyEl) m.appendChild(bodyEl);
  if (actions && actions.length) {
    const act = document.createElement('div');
    act.className = 'modal-actions' + (opts.actionClass ? ' ' + opts.actionClass : '');
    actions.forEach((a) => {
      const b = document.createElement('button');
      b.className = 'btn' + (a.primary ? ' btn-primary' : a.danger ? ' btn-danger-ghost' : ' btn-ghost');
      if (a.className) b.className += ' ' + a.className;
      b.textContent = a.label;
      b.onclick = () => a.onClick && a.onClick();
      act.appendChild(b);
    });
    m.appendChild(act);
  }
  root.appendChild(m);
  root.classList.add('show');
}
function closeModal() {
  const r = document.getElementById('modal-root');
  if (!r) return;
  r.classList.remove('show');
  r.innerHTML = '';
  r.onclick = null;
}

function updateAccountButton() {
  const btn = document.getElementById('btn-account');
  if (!btn) return;
  if (session && session.user) {
    const email = session.user.email || '已登录';
    btn.classList.add('logged-in');
    btn.title = '已登录：' + email + '（点击管理 / 退出登录）';
  } else {
    btn.classList.remove('logged-in');
    btn.title = '登录 / 同步账号';
  }
}

// ---------------- 合并逻辑 ----------------
function unionByKey(localArr, cloudArr, key) {
  const map = new Map();
  // 本地先入，云端后入（同 id 时云端覆盖，保证跨设备取到较新数据）
  for (const r of localArr || []) if (r && r[key] != null) map.set(r[key], r);
  for (const r of cloudArr || []) {
    if (!r || r[key] == null) continue;
    const prev = map.get(r[key]);
    // 同 id 保留 date 较大（较新）的一条
    if (!prev || (r.date || 0) >= (prev.date || 0)) map.set(r[key], r);
    else map.set(r[key], prev);
  }
  return [...map.values()];
}

function mergeCloud(cloud) {
  const local = {
    settings: storage.getSettings(),
    history: storage.getHistory(),
    leaderboard: storage.getLeaderboard(),
  };
  if (!cloud) return local; // 云端无数据：以本地为准，后续整行上传
  return {
    settings: { ...local.settings, ...(cloud.settings || {}) },
    history: unionByKey(local.history, cloud.history || [], 'id'),
    leaderboard: unionByKey(local.leaderboard, cloud.leaderboard || [], 'id'),
  };
}

// ---------------- 云端读写 ----------------
async function pullAndMerge() {
  if (!session || !supabase) return;
  const { data, error } = await supabase
    .from('user_data')
    .select('settings, history, leaderboard')
    .eq('user_id', session.user.id)
    .maybeSingle();
  if (error) {
    console.warn('云端拉取失败', error);
    return;
  }
  const merged = mergeCloud(data);
  storage.setSettings(merged.settings);
  storage.setHistory(merged.history);
  storage.setLeaderboard(merged.leaderboard);
  // 通知各模块用最新 settings 刷新本地偏好（音效开关/音量随之跨设备生效）
  try { window.dispatchEvent(new Event('sudoku:settings-synced')); } catch (e) {}
  // 合并结果回写云端，保证多端最终一致
  schedulePush();
  notify('已同步云端数据');
}

function schedulePush() {
  if (!session || !supabase) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(pushNow, 800);
}
async function pushNow() {
  if (!session || !supabase) return;
  const payload = {
    user_id: session.user.id,
    settings: storage.getSettings(),
    history: storage.getHistory(),
    leaderboard: storage.getLeaderboard(),
  };
  const { error } = await supabase.from('user_data').upsert(payload);
  if (error) console.warn('云端同步失败', error);
}

// ---------------- 全球排行榜 ----------------
function getNickname() {
  const s = storage.getSettings();
  if (s.nickname) return s.nickname;
  if (session && session.user) {
    const email = session.user.email || '';
    const name = email.split('@')[0];
    return name || '玩家' + (session.user.id || '').slice(0, 4);
  }
  return '匿名玩家' + storage.getDeviceId().slice(-4);
}

// 上传一条完成记录到全球榜（仅当 supabase 已就绪）。失败静默，不影响本地游玩。
export async function submitGlobalScore(rec) {
  if (!supabase) return;
  const deviceId = storage.getDeviceId();
  const userId = session && session.user ? session.user.id : null;
  const score = (rec && rec.score) || 0;
  try {
    const { error } = await supabase.rpc('submit_global_score', {
      p_device_id: deviceId,
      p_user_id: userId,
      p_nickname: getNickname(),
      p_difficulty: rec.difficulty,
      p_duration_ms: Math.round(rec.durationMs),
      p_mistakes: rec.mistakes || 0,
      p_hints_used: rec.hintsUsed || 0,
      p_score: Math.round(score),
    });
    if (error) console.warn('上传全球榜失败', error);
  } catch (e) {
    console.warn('上传全球榜异常', e);
  }
}

// 拉取全球榜；difficulty 为空字符串表示全难度综合。缓存 60 秒避免频繁请求。
export async function fetchGlobalLeaderboard({ difficulty = '', limit = 50 } = {}) {
  const cached = storage.getGlobalLeaderboard();
  if (cached && cached.cachedAt > Date.now() - 60000) {
    const list = filterGlobalByDifficulty(cached.list, difficulty);
    if (list.length) return list;
  }
  if (!supabase) return [];
  try {
    let query = supabase
      .from('global_leaderboard')
      .select('nickname, difficulty, duration_ms, mistakes, hints_used, score, played_at')
      .order('score', { ascending: false })
      .limit(limit * 4);
    if (difficulty) query = query.eq('difficulty', difficulty);
    const { data, error } = await query;
    if (error) {
      console.warn('拉取全球榜失败', error);
      return filterGlobalByDifficulty(cached.list || [], difficulty);
    }
    // 按 device_id/user_id 去重，取每个人每难度的最好成绩
    const map = new Map();
    for (const r of data || []) {
      const key = (r.user_id || r.device_id || '') + ':' + r.difficulty;
      const prev = map.get(key);
      if (!prev || r.score > prev.score || (r.score === prev.score && r.duration_ms < prev.duration_ms)) {
        map.set(key, r);
      }
    }
    const list = [...map.values()].sort((a, b) => b.score - a.score || a.duration_ms - b.duration_ms).slice(0, limit);
    storage.setGlobalLeaderboard(list);
    return list;
  } catch (e) {
    console.warn('拉取全球榜异常', e);
    return filterGlobalByDifficulty(cached.list || [], difficulty);
  }
}

function filterGlobalByDifficulty(list, difficulty) {
  if (!difficulty) return list || [];
  return (list || []).filter((r) => r.difficulty === difficulty);
}

// 包装本地写操作，触发防抖回写（登录后才真正推送）
function wrapStorage() {
  const wrap = (name) => {
    const orig = storage[name].bind(storage);
    storage[name] = (...args) => {
      const r = orig(...args);
      schedulePush();
      return r;
    };
  };
  ['upsertHistory', 'addLeaderboard', 'setSettings', 'clearHistory', 'clearLeaderboard'].forEach(
    wrap
  );
}

// ---------------- 登录态 ----------------
function onSignedIn() {
  updateAccountButton();
  pullAndMerge();
}
function onSignedOut() {
  session = null;
  updateAccountButton();
}

// ---------------- 登录 UI ----------------
function openAccountModal() {
  if (!ready) {
    notify('同步组件未就绪（可能离线）');
    return;
  }
  if (session && session.user) {
    const body = document.createElement('div');
    body.innerHTML = `<p>当前账号：<b>${session.user.email || '已登录'}</b></p>
      <p class="setting-hint">数据会在本机变动后自动同步到云端；换设备登录同一账号即可查看。</p>`;
    openModal('账号', body, [
      { label: '立即同步', primary: true, onClick: () => { closeModal(); pullAndMerge(); schedulePush(); } },
      { label: '退出登录', danger: true, onClick: async () => {
          closeModal();
          await supabase.auth.signOut();
          notify('已退出登录');
        } },
    ]);
    return;
  }
  const body = document.createElement('div');
  body.className = 'auth-form';

  let method = 'email'; // 'email' | 'phone'

  // 若同时开启手机，显示分段切换；当前手机关闭，只保留 email 模式，界面更干净
  if (ENABLE_PHONE) {
    const tabs = document.createElement('div');
    tabs.className = 'seg auth-seg';
    const makeTab = (label, m) => {
      const b = document.createElement('button');
      b.className = 'seg-btn' + (method === m ? ' active' : '');
      b.textContent = label;
      b.onclick = () => {
        method = m;
        Array.from(tabs.children).forEach((c) => c.classList.toggle('active', c === b));
        syncInput();
        input.focus();
      };
      return b;
    };
    tabs.appendChild(makeTab('邮箱', 'email'));
    tabs.appendChild(makeTab('手机', 'phone'));
    body.appendChild(tabs);
  }

  const field = document.createElement('label');
  field.className = 'auth-field';
  const fieldLabel = document.createElement('span');
  fieldLabel.className = 'auth-label';
  fieldLabel.textContent = '邮箱';
  const input = document.createElement('input');
  input.className = 'auth-input';
  input.type = 'email';
  input.placeholder = 'your@email.com';
  input.addEventListener('keydown', (e) => e.key === 'Enter' && sendCode());
  field.appendChild(fieldLabel);
  field.appendChild(input);
  body.appendChild(field);

  const hint = document.createElement('p');
  hint.className = 'auth-hint';
  body.appendChild(hint);
  const syncInput = () => {
    if (method === 'email') {
      fieldLabel.textContent = '邮箱';
      input.type = 'email';
      input.placeholder = 'your@email.com';
      hint.textContent = '验证码会发到这个邮箱，在应用内输入即可登录。';
    } else {
      fieldLabel.textContent = '手机号';
      input.type = 'tel';
      input.placeholder = '+86 13800000000';
      hint.textContent = '短信验证码会发到这个手机号。';
    }
  };
  syncInput();

  const sendCode = async () => {
    const val = input.value.trim();
    if (!val) {
      notify('请先输入' + (method === 'email' ? '邮箱' : '手机号'));
      return;
    }
    closeModal();
    const payload = method === 'email' ? { email: val } : { phone: val };
    const { error } = await supabase.auth.signInWithOtp(payload);
    if (error) {
      notify('发送失败：' + error.message);
      return;
    }
    notify('验证码已发送，请查收');
    openOtpModal(method, val);
  };

  const actions = document.createElement('div');
  actions.className = 'auth-actions';

  const btnSend = document.createElement('button');
  btnSend.className = 'btn btn-primary btn-block';
  btnSend.textContent = '发送验证码';
  btnSend.onclick = sendCode;
  actions.appendChild(btnSend);

  if (ENABLE_GITHUB) {
    const btnGh = document.createElement('button');
    btnGh.className = 'btn btn-ghost btn-block';
    btnGh.textContent = '用 GitHub 登录';
    btnGh.onclick = async () => {
      closeModal();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'github',
        options: { redirectTo: window.location.origin },
      });
      if (error) notify('GitHub 登录失败：' + error.message);
    };
    actions.appendChild(btnGh);

    const ghHint = document.createElement('p');
    ghHint.className = 'auth-hint auth-hint-center';
    ghHint.innerHTML =
      'GitHub 邮箱需与上方邮箱一致且已公开，才会自动合并为同一账号。';
    actions.appendChild(ghHint);
  }

  const btnCancel = document.createElement('button');
  btnCancel.className = 'auth-link';
  btnCancel.textContent = '取消';
  btnCancel.onclick = closeModal;
  actions.appendChild(btnCancel);

  body.appendChild(actions);
  openModal('登录 / 同步', body, [], { className: 'auth-modal' });
}

// 验证码输入步骤：应用内完成，不依赖邮件链接，PWA / 原生通用
function openOtpModal(method, identifier) {
  const body = document.createElement('div');
  body.className = 'auth-form';

  const subtitle = document.createElement('p');
  subtitle.className = 'auth-subtitle';
  subtitle.textContent = '已发送至 ' + identifier;
  body.appendChild(subtitle);

  const codeWrap = document.createElement('div');
  codeWrap.className = 'auth-otp-wrap';
  const code = document.createElement('input');
  code.className = 'auth-otp-input';
  code.type = 'text';
  code.inputMode = 'numeric';
  code.maxLength = OTP_LENGTH;
  code.placeholder = '0'.repeat(OTP_LENGTH);
  code.addEventListener('keydown', (e) => e.key === 'Enter' && verify());
  codeWrap.appendChild(code);
  body.appendChild(codeWrap);

  const verify = async () => {
    const token = code.value.trim();
    if (!new RegExp('^\\d{' + OTP_LENGTH + '}$').test(token)) {
      notify('请输入 ' + OTP_LENGTH + ' 位数字验证码');
      return;
    }
    closeModal();
    const payload =
      method === 'email'
        ? { email: identifier, token, type: 'email' }
        : { phone: identifier, token, type: 'sms' };
    const { error } = await supabase.auth.verifyOtp(payload);
    if (error) notify('验证失败：' + error.message);
  };

  const actions = document.createElement('div');
  actions.className = 'auth-actions';

  const btnLogin = document.createElement('button');
  btnLogin.className = 'btn btn-primary btn-block';
  btnLogin.textContent = '登录';
  btnLogin.onclick = verify;
  actions.appendChild(btnLogin);

  const links = document.createElement('div');
  links.className = 'auth-links';

  const btnResend = document.createElement('button');
  btnResend.className = 'auth-link';
  btnResend.textContent = '重新发送';
  btnResend.onclick = async () => {
    const payload = method === 'email' ? { email: identifier } : { phone: identifier };
    const { error } = await supabase.auth.signInWithOtp(payload);
    if (error) notify('发送失败：' + error.message);
    else notify('验证码已重新发送');
  };
  links.appendChild(btnResend);

  const btnBack = document.createElement('button');
  btnBack.className = 'auth-link';
  btnBack.textContent = '返回';
  btnBack.onclick = openAccountModal;
  links.appendChild(btnBack);

  actions.appendChild(links);
  body.appendChild(actions);
  openModal('输入验证码', body, [], { className: 'auth-modal' });

  // 自动聚焦验证码输入框
  setTimeout(() => code.focus(), 50);
}

// ---------------- 初始化 ----------------
export async function initSync() {
  // 非浏览器 / 测试环境（无真实 origin）直接跳过，避免无谓的远程加载
  if (typeof window === 'undefined' || !window.location || !window.location.origin) return;
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) return;

  let mod;
  try {
    // 通过 CDN 动态加载 supabase-js（国内可达的 jsdelivr 镜像）；失败则降级纯本地
    mod = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  } catch (e) {
    console.warn('Supabase 库加载失败，降级为纯本地模式', e);
    return;
  }
  supabase = mod.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
  });

  wrapStorage();

  supabase.auth.onAuthStateChange((_event, s) => {
    session = s;
    if (s) onSignedIn();
    else onSignedOut();
  });

  const { data } = await supabase.auth.getSession();
  session = data.session;
  ready = true;
  updateAccountButton();

  const btn = document.getElementById('btn-account');
  if (btn) btn.onclick = openAccountModal;

  if (session) onSignedIn();
}

export { openAccountModal, updateAccountButton };
