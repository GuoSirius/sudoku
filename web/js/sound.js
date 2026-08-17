// 音效模块：Web Audio API 实时合成短音，零音频文件、可离线运行。
// 默认开启，偏好持久化到 localStorage。
// 所有导出函数均做了环境守卫（无 AudioContext / 未启用 / 测试环境）与异常吞掉，
// 任何情况下都不会阻塞或影响游戏主流程。
//
// 关键稳定性处理（解决“声音时有时无 / 不清晰”）：
//   1) 单一 AudioContext + 主增益节点(master gain = 全局音量)：音量统一、可调、不削顶。
//   2) 全局手势预热：浏览器要求 AudioContext 必须在用户手势内 resume；在首个手势
//      （以及其后每次手势）里 resume，使后续所有声音（含定时器 / 复盘自动播放触发的）
//      都能可靠发声，避免“第一下没声 / 时有时无”。
//   3) 调度前瞻：每次调度都从 ac.currentTime + 前瞻量起算，避免上下文刚 resume 时
//      currentTime 仍处于冻结值(0) 导致音符被丢弃。

import { storage } from './storage.js';

const DEFAULT_VOLUME = 0.6; // 默认音量 60%
const DEFAULT_ON = true;
const SCHEDULE_AHEAD = 0.02; // 调度前瞻量(秒)，保证 suspended→running 切换期间的音不被丢

// 内存缓存（无 localStorage 环境下仍可用，保证偏好不丢失）
let enabled = DEFAULT_ON;
let volume = DEFAULT_VOLUME;
let ctx = null;
let master = null;
let warmed = false;

// 以 settings 为唯一真源：读取失败则用默认值，绝不抛错
function readPrefs() {
  let s = {};
  try {
    s = storage.getSettings() || {};
  } catch (e) {
    s = {};
  }
  if (typeof s.sound === 'boolean') enabled = s.sound;
  else enabled = DEFAULT_ON;
  if (typeof s.volume === 'number' && !isNaN(s.volume)) {
    volume = Math.min(1, Math.max(0, s.volume));
  } else {
    volume = DEFAULT_VOLUME;
  }
}

readPrefs();

// 把当前偏好写回 settings（随账号「同步」跨设备）
function persist() {
  try {
    storage.setSettings({ sound: enabled, volume });
  } catch (e) {}
}

// 云端「同步」拉取完成后由 main.js 调用：用最新 settings 覆盖内存偏好
export function reloadFromSettings() {
  readPrefs();
  if (master) master.gain.value = volume;
}

export function isSoundOn() {
  return enabled;
}

export function setSoundOn(on) {
  enabled = !!on;
  persist();
  if (enabled) resumeCtx(); // 打开时顺手唤醒，下一次发声更稳
}

// 音量：0~1 之间的数；设置后即时影响后续所有音效
export function getVolume() {
  return volume;
}

export function setVolume(v) {
  const n = parseFloat(v);
  if (isNaN(n)) return;
  volume = Math.min(1, Math.max(0, n));
  if (master) master.gain.value = volume; // 即时生效，无需等下一声
  persist();
}

// 惰性创建 AudioContext 与 master gain；无 AudioContext 环境（如 Node 测试）返回 null。
// 仅创建一次，后续复用同一上下文，避免反复 new 造成“有时没声”。
function ensureCtx() {
  if (ctx) return ctx;
  if (
    typeof AudioContext === 'undefined' &&
    typeof webkitAudioContext === 'undefined'
  )
    return null;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = volume; // 主增益 = 全局音量，统一掌控清晰度与上限
    master.connect(ctx.destination);
  } catch (e) {
    ctx = null;
    master = null;
  }
  return ctx;
}

// 恢复上下文（若被挂起）。返回可用的 ctx，失败返回 null。
function resumeCtx() {
  const ac = ensureCtx();
  if (!ac) return null;
  try {
    if (ac.state === 'suspended') ac.resume();
  } catch (e) {}
  return ac;
}

// 全局手势预热：在首个用户手势及之后每次手势里 resume 上下文。
// 这样即便落子之外的声音（复盘自动播放、定时反馈）不在直接手势中，上下文也已处于 running，
// 不会再“时有时无”。幂等，重复调用安全。
export function warmUpAudio() {
  const handler = () => {
    resumeCtx();
  };
  const events = ['pointerdown', 'keydown', 'touchstart', 'click'];
  for (const ev of events) {
    window.addEventListener(ev, handler, { passive: true });
  }
  warmed = true;
}

// 播放一个带包络的短音：
//   gainPeak 为“相对振幅”(0~1)，会经 master gain(=全局音量) 统一缩放，无需在此乘 volume。
//   attack 用极短线性抬升避免爆音咔哒；之后指数衰减，尾音干净、听感清晰。
function blip(type, freq, dur, gainPeak, when = 0, slideTo = null) {
  const ac = ensureCtx();
  if (!ac || !master) return;
  const run = () => {
    try {
      const peak = Math.max(0.0001, gainPeak);
      const t0 = ac.currentTime + Math.max(when, 0) + SCHEDULE_AHEAD;
      const osc = ac.createOscillator();
      const g = ac.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
      const attack = 0.006;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g).connect(master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.03);
    } catch (e) {}
  };
  if (ac.state === 'running') {
    // 已运行：直接按当前（活动）时钟调度，立即可靠发声
    run();
  } else {
    // 被挂起（首声响 / 后台切回 / 一段时间无音频后浏览器自动挂起）：
    // 必须先 resume，并**等其真正 running 之后**再按 currentTime 调度。
    // 否则按“冻结的 currentTime”调度，浏览器 resume 后常把时钟重置回 ~0，
    // 音符会被排到数秒后的“未来时刻”——表现为这声响没出来、下一声响又正常（即“时有时无”）。
    try {
      const p = ac.resume();
      if (p && typeof p.then === 'function') p.then(run).catch(run);
      else run();
    } catch (e) {
      run();
    }
  }
}

// 落子：清脆短“嗒”，三角波明亮、听感清楚
export function playPlace() {
  if (!enabled) return;
  blip('triangle', 760, 0.09, 0.5);
}

// 擦除：低沉下滑，正弦波柔和
export function playErase() {
  if (!enabled) return;
  blip('sine', 340, 0.10, 0.42, 0, 180);
}

// 填错：低沉双音“错误”提示（两个略错开的下行音，辨识度高）
export function playWrong() {
  if (!enabled) return;
  blip('sawtooth', 200, 0.13, 0.4);
  blip('sawtooth', 150, 0.20, 0.4, 0.1);
}

// 通关：上行琶音庆祝（C5-E5-G5-C6），明亮饱满
export function playWin() {
  if (!enabled) return;
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((f, i) => blip('triangle', f, 0.2, 0.45, i * 0.12));
}

// 提示：轻柔上扬双音（E5→A5），给人“帮你想到了”的轻微正反馈
export function playHint() {
  if (!enabled) return;
  blip('sine', 659.25, 0.12, 0.34);
  blip('sine', 880.0, 0.14, 0.34, 0.09);
}

// 检查：单音轻提示（G5 柔和长音），像“核对完成”的清脆一声
export function playCheck() {
  if (!enabled) return;
  blip('sine', 783.99, 0.17, 0.36);
}
