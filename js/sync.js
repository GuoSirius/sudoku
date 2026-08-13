// Supabase 跨设备同步：邮箱/手机 应用内 OTP 验证码登录（免密码，PWA 通用）+ 可选 GitHub PKCE 登录
// 设计原则：
//  - 纯前端 PWA，通过 CDN 动态加载 supabase-js；加载失败则静默降级为纯本地。
//  - 登录成功后从云端拉取 settings/history/leaderboard，按 id 合并（去重、取较新）回写本地。
//  - 本地任何变动（历史/排行/设置）防抖 800ms 后整行回写云端（每用户一行，RLS 隔离）。
//  - 未登录 / 离线 / 推送失败都不影响本地游玩，下次变动或登录再同步。

import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, ENABLE_GITHUB, ENABLE_PHONE } from './config.js';
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

  let method = 'email'; // 'email' | 'phone'

  // 方式切换：邮箱 / 手机
  const tabs = document.createElement('div');
  tabs.className = 'seg';
  const tabEmail = document.createElement('button');
  tabEmail.className = 'seg-btn';
  tabEmail.textContent = '邮箱';
  const tabPhone = ENABLE_PHONE
    ? (() => {
        const b = document.createElement('button');
        b.className = 'seg-btn';
        b.textContent = '手机';
        return b;
      })()
    : null;
  const updateTabs = () => {
    tabEmail.classList.toggle('active', method === 'email');
    if (tabPhone) tabPhone.classList.toggle('active', method === 'phone');
  };
  tabEmail.onclick = () => {
    method = 'email';
    updateTabs();
    syncInput();
    input.focus();
  };
  if (tabPhone)
    tabPhone.onclick = () => {
      method = 'phone';
      updateTabs();
      syncInput();
      input.focus();
    };
  tabs.appendChild(tabEmail);
  if (tabPhone) tabs.appendChild(tabPhone);
  body.appendChild(tabs);

  const input = document.createElement('input');
  input.style.cssText =
    'padding:12px 14px;border:1px solid var(--border);border-radius:10px;background:var(--surface-2);color:var(--text);font-size:15px';
  body.appendChild(input);

  const hint = document.createElement('p');
  hint.className = 'setting-hint';
  body.appendChild(hint);
  const syncInput = () => {
    if (method === 'email') {
      input.type = 'email';
      input.placeholder = '输入邮箱，发送验证码';
      hint.textContent = '我们会向该邮箱发送 6 位验证码，在应用内输入即可登录（免密码，不点链接）。';
    } else {
      input.type = 'tel';
      input.placeholder = '手机号，如 +86 13800000000';
      hint.textContent =
        '我们会向该手机号发送短信验证码，在应用内输入即可登录。需 Supabase 已开启 Phone Auth 并接入 SMS 服务商。';
    }
  };
  updateTabs();
  syncInput();

  if (ENABLE_GITHUB) {
    const ghHint = document.createElement('p');
    ghHint.className = 'setting-hint';
    ghHint.style.marginTop = '4px';
    ghHint.innerHTML =
      '用 GitHub 登录会与邮箱账号自动合并为同一人（需同一邮箱且已验证）。请确保 GitHub 邮箱已公开：GitHub → Settings → Emails → 取消勾选「Keep my email addresses private」。';
    body.appendChild(ghHint);
  }

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

  const actions = [
    { label: '发送验证码', primary: true, onClick: sendCode },
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
      },
    });
  }
  openModal('登录 / 同步', body, actions);
}

// 验证码输入步骤：应用内完成，不依赖邮件链接，PWA / 原生通用
function openOtpModal(method, identifier) {
  const body = document.createElement('div');
  body.style.display = 'flex';
  body.style.flexDirection = 'column';
  body.style.gap = '10px';

  const tip = document.createElement('p');
  tip.className = 'setting-hint';
  tip.textContent = '验证码已发送至 ' + identifier + '，请在应用内输入 6 位码完成登录。';
  body.appendChild(tip);

  const code = document.createElement('input');
  code.type = 'text';
  code.inputMode = 'numeric';
  code.maxLength = 8;
  code.placeholder = '6 位验证码';
  code.style.cssText =
    'padding:12px 14px;border:1px solid var(--border);border-radius:10px;background:var(--surface-2);color:var(--text);font-size:20px;letter-spacing:6px;text-align:center';
  body.appendChild(code);

  const verify = async () => {
    const token = code.value.trim();
    if (!/^\d{4,8}$/.test(token)) {
      notify('请输入正确的验证码');
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

  const actions = [
    { label: '登录', primary: true, onClick: verify },
    {
      label: '重新发送',
      ghost: true,
      onClick: async () => {
        const payload = method === 'email' ? { email: identifier } : { phone: identifier };
        const { error } = await supabase.auth.signInWithOtp(payload);
        if (error) notify('发送失败：' + error.message);
        else notify('验证码已重新发送');
      },
    },
    { label: '返回', ghost: true, onClick: openAccountModal },
  ];
  openModal('输入验证码', body, actions);
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
