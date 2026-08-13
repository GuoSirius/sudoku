// Supabase 跨设备同步：邮箱魔法链接登录（默认）+ 可选 GitHub 登录
// 设计原则：
//  - 纯前端 PWA，通过 CDN 动态加载 supabase-js；加载失败则静默降级为纯本地。
//  - 登录成功后从云端拉取 settings/history/leaderboard，按 id 合并（去重、取较新）回写本地。
//  - 本地任何变动（历史/排行/设置）防抖 800ms 后整行回写云端（每用户一行，RLS 隔离）。
//  - 未登录 / 离线 / 推送失败都不影响本地游玩，下次变动或登录再同步。

import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, ENABLE_GITHUB } from './config.js';
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

function openModal(title, bodyEl, actions) {
  const root = document.getElementById('modal-root');
  if (!root) return;
  root.innerHTML = '';
  const m = document.createElement('div');
  m.className = 'modal';
  const h = document.createElement('h3');
  h.textContent = title;
  m.appendChild(h);
  if (bodyEl) m.appendChild(bodyEl);
  const act = document.createElement('div');
  act.className = 'modal-actions';
  (actions || []).forEach((a) => {
    const b = document.createElement('button');
    b.className = 'btn' + (a.primary ? ' btn-primary' : ' btn-ghost');
    b.textContent = a.label;
    b.onclick = () => a.onClick && a.onClick();
    act.appendChild(b);
  });
  if (actions && actions.length) m.appendChild(act);
  root.appendChild(m);
  root.classList.add('show');
  root.onclick = (e) => e.target === root && closeModal();
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
    btn.textContent = '🟢';
    btn.title = '已登录：' + email + '（点击管理）';
  } else {
    btn.textContent = '👤';
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
  body.style.display = 'flex';
  body.style.flexDirection = 'column';
  body.style.gap = '10px';
  const input = document.createElement('input');
  input.type = 'email';
  input.placeholder = '输入邮箱，发送登录链接';
  input.style.cssText =
    'padding:12px 14px;border:1px solid var(--border);border-radius:10px;background:var(--surface-2);color:var(--text);font-size:15px';
  body.appendChild(input);
  const hint = document.createElement('p');
  hint.className = 'setting-hint';
  hint.textContent = '我们会向该邮箱发送一封魔法链接，点开即可登录（免密码）。链接可能在垃圾邮件里。';
  body.appendChild(hint);

  const actions = [
    {
      label: '发送登录邮件',
      primary: true,
      onClick: async () => {
        const email = input.value.trim();
        if (!email) {
          notify('请先输入邮箱');
          return;
        }
        closeModal();
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { redirectTo: window.location.origin },
        });
        if (error) notify('发送失败：' + error.message);
        else notify('登录邮件已发送，请查收');
      },
    },
    { label: '取消', ghost: true, onClick: closeModal },
  ];
  if (ENABLE_GITHUB) {
    actions.unshift({
      label: '用 GitHub 登录',
      primary: false,
      onClick: async () => {
        closeModal();
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'github',
          options: { redirectTo: window.location.origin },
        });
        if (error) notify('GitHub 登录失败：' + error.message);
        // 成功会跳转 GitHub，授权后跳回 redirectTo
      },
    });
  }
  openModal('登录 / 同步', body, actions);
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
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
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
