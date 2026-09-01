// 凯利公式计算模块单测
import { calcKelly, KELLY_TIERS, fmtMoney, fmtPct } from '../web/js/kelly.js';

let pass = 0;
let fail = 0;
function assert(cond, msg) {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.error('  ✗ ' + msg);
  }
}
function near(a, b, msg, eps = 1e-9) {
  assert(Math.abs(a - b) < eps, `${msg}（期望 ${b}，实际 ${a}）`);
}

// ---- 基准用例：百分比模式，盈亏比 2:1、胜率 55%、总资产 20 万 ----
// 经典凯利：f = (b·p − q)/b = (2×0.55 − 0.45)/2 = 0.325
{
  const r = calcKelly({ profit: 10, loss: 5, winRate: 55, total: 200000, mode: 'percent' });
  assert(r.ok, '基准用例应计算成功');
  near(r.b, 2, '盈亏比应为 2');
  near(r.f, 0.325, '全凯利 f 应为 0.325');
  near(r.breakevenPct, 100 / 3, '盈亏平衡胜率应为 33.33%');
  assert(r.negative === false, '正期望不应标记为负');
  // 四档：1/4、1/2、3/4、1
  near(r.tiers[0].posPct, 8.125, '保守仓位应为 8.125%');
  near(r.tiers[1].posPct, 16.25, '平衡仓位应为 16.25%');
  near(r.tiers[2].posPct, 24.375, '进取仓位应为 24.375%');
  near(r.tiers[3].posPct, 32.5, '满仓仓位应为 32.5%');
  near(r.tiers[3].amount, 65000, '满仓金额应为 65000');
  near(r.tiers[0].amount, 16250, '保守金额应为 16250');
  // 百分比模式：盈亏率直接取输入值
  near(r.winPct, 10, '盈利率应为 10%');
  near(r.losePct, 5, '亏损率应为 5%');
  near(r.edgePct, 0.55 * 10 - 0.45 * 5, '期望收益率应为 3.25%');
  // 每档盈亏金额 = 仓位金额 × 对应百分比
  near(r.tiers[1].winAmt, 32500 * 0.1, '平衡档预期盈利金额正确');
  near(r.tiers[1].loseAmt, 32500 * 0.05, '平衡档预期亏损金额正确');
}

// ---- 金额模式：盈利 5000 / 亏损 2000 / 总资产 20 万 ----
// b = 2.5，盈利率 = 5000/200000 = 2.5%，亏损率 = 1%
// f = (2.5×0.55 − 0.45)/2.5 = 0.37
{
  const r = calcKelly({ profit: 5000, loss: 2000, winRate: 55, total: 200000, mode: 'amount' });
  assert(r.ok, '金额模式应计算成功');
  near(r.b, 2.5, '盈亏比应为 2.5');
  near(r.winPct, 2.5, '盈利率应为 2.5%');
  near(r.losePct, 1, '亏损率应为 1%');
  near(r.f, 0.37, '全凯利 f 应为 0.37');
  near(r.breakevenPct, 100 / 3.5, '盈亏平衡胜率应为 28.57%');
  near(r.tiers[3].amount, 74000, '满仓金额应为 74000');
  near(r.tiers[0].amount, 18500, '保守金额应为 18500');
}

// ---- 期望为负：胜率低于盈亏平衡胜率 ----
{
  const r = calcKelly({ profit: 10, loss: 5, winRate: 30, total: 200000, mode: 'percent' });
  assert(r.ok, '负期望用例仍应返回结果');
  assert(r.negative === true, '胜率 30% < 平衡胜率 33.33% 时应标记为负期望');
  assert(r.f < 0, 'f 应为负值');
  assert(
    r.tiers.every((t) => t.amount === 0 && t.posPct === 0),
    '负期望时四档仓位都应归零'
  );
}

// ---- 恰好在盈亏平衡点 ----
{
  const r = calcKelly({ profit: 10, loss: 5, winRate: 100 / 3, total: 200000, mode: 'percent' });
  assert(Math.abs(r.f) < 1e-12, '胜率恰为平衡胜率时 f 应为 0');
  assert(r.negative === true, 'f=0 归入不建议下注');
}

// ---- 非法输入 ----
{
  assert(calcKelly({ profit: 10, loss: 0, winRate: 55, total: 200000 }).ok === false, '亏损为 0 应非法');
  assert(calcKelly({ profit: 0, loss: 5, winRate: 55, total: 200000 }).ok === false, '盈利为 0 应非法');
  assert(calcKelly({ profit: 10, loss: 5, winRate: 55, total: 0 }).ok === false, '总资产为 0 应非法');
  assert(calcKelly({ profit: 10, loss: 5, winRate: 0, total: 200000 }).ok === false, '胜率 0 应非法');
  assert(calcKelly({ profit: 10, loss: 5, winRate: 100, total: 200000 }).ok === false, '胜率 100 应非法');
  assert(calcKelly({ profit: 'a', loss: 5, winRate: 55, total: 200000 }).ok === false, '非数字应非法');
  assert(calcKelly({ profit: -10, loss: 5, winRate: 55, total: 200000 }).ok === false, '负盈利应非法');
}

// ---- 单调性：胜率越高，仓位越大 ----
{
  const low = calcKelly({ profit: 10, loss: 5, winRate: 40, total: 200000, mode: 'percent' });
  const high = calcKelly({ profit: 10, loss: 5, winRate: 70, total: 200000, mode: 'percent' });
  assert(high.f > low.f, '胜率越高 f 越大');
  assert(
    high.tiers.every((t, i) => t.amount > low.tiers[i].amount),
    '胜率越高各档金额越大'
  );
}

// ---- 档位系数：保守 < 平衡 < 进取 < 满仓 ----
{
  const r = calcKelly({ profit: 10, loss: 5, winRate: 60, total: 200000, mode: 'percent' });
  const amts = r.tiers.map((t) => t.amount);
  assert(
    amts[0] < amts[1] && amts[1] < amts[2] && amts[2] < amts[3],
    '四档金额应严格递增'
  );
  assert(KELLY_TIERS.map((t) => t.factor).join(',') === '0.25,0.5,0.75,1', '档位系数应为 1/4、1/2、3/4、1');
}

// ---- 格式化 ----
{
  assert(fmtMoney(65000) === '6.5 万', 'fmtMoney 万元格式化：65000 → 6.5 万');
  assert(fmtMoney(200000) === '20 万', 'fmtMoney 万元格式化：200000 → 20 万');
  assert(fmtMoney(18500) === '1.85 万', 'fmtMoney：18500 → 1.85 万');
  assert(fmtMoney(123.456) === '123.46', 'fmtMoney 小额保留两位');
  assert(fmtPct(8.125) === '8.13%', 'fmtPct 默认两位：8.125 → 8.13%');
  assert(fmtPct(32.5) === '32.5%', 'fmtPct 去尾零：32.5 → 32.5%');
  assert(fmtPct(0) === '0%', 'fmtPct 零值');
}

console.log(`\n凯利公式模块: ${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
