// 音效模块：Web Audio API 实时合成短音，零音频文件、可离线运行。
// 默认开启，偏好持久化到 localStorage。
// 所有导出函数均做了环境守卫（无 AudioContext / 未启用 / 测试环境）与异常吞掉，
// 任何情况下都不会阻塞或影响游戏主流程。

import { storage } from './storage.js';

const DEFAULT_VOLUME = 0.6; // 默认音量 60%
const DEFAULT_ON = true;

// 内存缓存（无 localStorage 环境下仍可用，保证偏好不丢失）
let enabled = DEFAULT_ON;
let volume = DEFAULT_VOLUME;
let ctx = null;

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
}

export function isSoundOn() {
  return enabled;
}

export function setSoundOn(on) {
  enabled = !!on;
  persist();
}

// 音量：0~1 之间的数；设置后即时影响后续所有音效
export function getVolume() {
  return volume;
}

export function setVolume(v) {
  const n = parseFloat(v);
  if (isNaN(n)) return;
  volume = Math.min(1, Math.max(0, n));
  persist();
}

// 惰性创建 AudioContext；浏览器要求其在用户手势内创建/恢复，而调用方（落子/擦除等）
// 均在用户手势中，因此此处 resume 是安全的。无 AudioContext 环境（如 Node 测试）返回 null。
function getCtx() {
  if (typeof AudioContext === 'undefined' && typeof webkitAudioContext === 'undefined') return null;
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch (e) {
    return null;
  }
}

// 播放一个带包络的短音（gainPeak 会乘以全局音量）
function blip(type, freq, dur, gainPeak, when = 0, slideTo = null) {
  const ac = getCtx();
  if (!ac) return;
  try {
    const peak = Math.max(0.0001, gainPeak * volume);
    const t0 = ac.currentTime + when;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  } catch (e) {}
}

// 落子：清脆短“嗒”
export function playPlace() {
  if (!enabled) return;
  blip('triangle', 660, 0.09, 0.16);
}

// 擦除：低沉下滑
export function playErase() {
  if (!enabled) return;
  blip('sine', 320, 0.09, 0.13, 0, 190);
}

// 填错：低沉双音“错误”提示
export function playWrong() {
  if (!enabled) return;
  blip('sawtooth', 180, 0.12, 0.14);
  blip('sawtooth', 130, 0.18, 0.14, 0.1);
}

// 通关：上行琶音庆祝（C5-E5-G5-C6）
export function playWin() {
  if (!enabled) return;
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((f, i) => blip('triangle', f, 0.18, 0.2, i * 0.12));
}

// 提示：轻柔上扬双音（E5→A5），给人“帮你想到了”的轻微正反馈
export function playHint() {
  if (!enabled) return;
  blip('sine', 659.25, 0.11, 0.07);
  blip('sine', 880.0, 0.13, 0.07, 0.09);
}

// 检查：单音轻提示（G5 柔和长音），像“核对完成”的清脆一声
export function playCheck() {
  if (!enabled) return;
  blip('sine', 783.99, 0.16, 0.08);
}
