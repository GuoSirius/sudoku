// 音效模块自检：在 Node（无 AudioContext）环境下应安全 no-op，不抛错、可正常开关
import { isSoundOn, setSoundOn, getVolume, setVolume, playPlace, playErase, playWrong, playWin, playHint, playCheck } from '../web/js/sound.js';

let pass = 0;
let fail = 0;
const assert = (c, m) => (c ? pass++ : (fail++, console.error('  ✗', m)));

// 默认开启
assert(isSoundOn() === true, '音效默认应开启');
// 关闭 / 开启切换
setSoundOn(false);
assert(isSoundOn() === false, 'setSoundOn(false) 后应关闭');
setSoundOn(true);
assert(isSoundOn() === true, 'setSoundOn(true) 后应开启');
// 音量：默认 0.7，可设置并限制在 0~1
assert(Math.abs(getVolume() - 0.7) < 1e-9, '音量默认应为 0.7');
setVolume(0.3);
assert(Math.abs(getVolume() - 0.3) < 1e-9, 'setVolume(0.3) 后应生效');
setVolume(5);
assert(Math.abs(getVolume() - 1) < 1e-9, '音量超出上限应 clamp 到 1');
setVolume(-1);
assert(Math.abs(getVolume() - 0) < 1e-9, '音量低于下限应 clamp 到 0');
setVolume(0.7);
// 各播放函数在无 AudioContext 环境必须 no-op 且不抛错
let threw = false;
try {
  playPlace();
  playErase();
  playWrong();
  playWin();
  playHint();
  playCheck();
} catch (e) {
  threw = true;
}
assert(!threw, '播放函数在无音频环境下不应抛错');

console.log(`\n音效模块: ${pass} 通过, ${fail} 失败`);
if (fail > 0) process.exit(1);
