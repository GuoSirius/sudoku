// 音效模块自检：在 Node（无 AudioContext）环境下应安全 no-op，不抛错、可正常开关
import { isSoundOn, setSoundOn, playPlace, playErase, playWrong, playWin } from '../web/js/sound.js';

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
// 各播放函数在无 AudioContext 环境必须 no-op 且不抛错
let threw = false;
try {
  playPlace();
  playErase();
  playWrong();
  playWin();
} catch (e) {
  threw = true;
}
assert(!threw, '播放函数在无音频环境下不应抛错');

console.log(`\n音效模块: ${pass} 通过, ${fail} 失败`);
if (fail > 0) process.exit(1);
