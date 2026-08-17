// 音效模块：Web Audio API 实时合成短音，零音频文件、可离线运行。
// 默认开启，偏好持久化到 localStorage。
// 所有导出函数均做了环境守卫（无 AudioContext / 未启用 / 测试环境）与异常吞掉，
// 任何情况下都不会阻塞或影响游戏主流程。

const KEY = 'sudoku:sound';

function loadEnabled() {
  try {
    const v = localStorage.getItem(KEY);
    if (v === null) return true; // 默认开启
    return v !== '0' && v !== 'false';
  } catch (e) {
    return true;
  }
}

function saveEnabled() {
  try {
    localStorage.setItem(KEY, enabled ? '1' : '0');
  } catch (e) {}
}

let enabled = loadEnabled();
let ctx = null;

export function isSoundOn() {
  return enabled;
}

export function setSoundOn(on) {
  enabled = !!on;
  saveEnabled();
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

// 播放一个带包络的短音
function blip(type, freq, dur, gainPeak, when = 0, slideTo = null) {
  const ac = getCtx();
  if (!ac) return;
  try {
    const t0 = ac.currentTime + when;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gainPeak, t0 + 0.008);
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
