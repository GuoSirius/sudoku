// 音效模块自检：偏好（开关 + 音量）应持久化进 storage.settings（随账号「同步」跨设备）
// 同时验证无存储 / 无 AudioContext 环境下安全 no-op、不抛错。

// 注入最小 localStorage mock，使 storage 读写真实生效（验证"音量纳入同步"）
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};

const { storage } = await import('../web/js/storage.js');
const sound = await import('../web/js/sound.js');

let pass = 0;
let fail = 0;
const assert = (c, m) => (c ? pass++ : (fail++, console.error('  ✗', m)));

// 默认：开启、音量 60%
assert(sound.isSoundOn() === true, '音效默认应开启');
assert(sound.getVolume() === 0.6, '音量默认应为 60%(0.6)，实际 ' + sound.getVolume());

// 开关切换并写入 settings（可同步）
sound.setSoundOn(false);
assert(sound.isSoundOn() === false, 'setSoundOn(false) 后应关闭');
assert(storage.getSettings().sound === false, '关闭状态应写入 settings（可同步）');
sound.setSoundOn(true);
assert(sound.isSoundOn() === true, 'setSoundOn(true) 后应开启');

// 音量设置 + 写入 settings（即纳入账号同步）
sound.setVolume(0.3);
assert(sound.getVolume() === 0.3, 'setVolume(0.3) 后应为 0.3');
assert(storage.getSettings().volume === 0.3, '音量应写入 settings（可同步）');
// clamp 边界
sound.setVolume(999);
assert(sound.getVolume() === 1, '超过 1 应被 clamp 到 1');
sound.setVolume(-5);
assert(sound.getVolume() === 0, '负数应被 clamp 到 0');

// 从 settings 重载（模拟云端「同步」拉取后）
sound.setVolume(0.8);
assert(storage.getSettings().volume === 0.8, 'setVolume 后 settings.volume 应为 0.8');
storage.setSettings({ volume: 0.2 });
sound.reloadFromSettings();
assert(sound.getVolume() === 0.2, 'reloadFromSettings 应从 settings 读取最新音量');

// 播放函数在无 AudioContext 环境必须 no-op 且不抛错
let threw = false;
try {
  sound.playPlace();
  sound.playErase();
  sound.playWrong();
  sound.playWin();
  sound.playHint();
  sound.playCheck();
} catch (e) {
  threw = true;
}
assert(!threw, '播放函数在无音频环境下不应抛错');

console.log(`\n音效模块: ${pass} 通过, ${fail} 失败`);
if (fail > 0) process.exit(1);
