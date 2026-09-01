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

// ---- 通用形式：股票场景，A=20%（止损 20%），B=30%（上涨 30%），W=55% ----
// f* = W/A − (1−W)/B = 0.55/0.2 − 0.45/0.3 = 2.75 − 1.5 = 1.25（125% · 需加杠杆）
{
  const r = calcKelly({ profit: 30, loss: 20, winRate: 55, total: 200000, mode: 'general', leverageOn: true });
  assert(r.ok, '通用形式应计算成功');
  near(r.b, 1.5, '盈亏比 B/A 应为 1.5');
  near(r.f, 1.25, '通用形式 f* 应为 1.25（125%，需加杠杆）');
  assert(r.leverage === true, 'f > 1 时应标记为含杠杆');
  assert(r.negative === false, '正期望不应标记为负');
  near(r.breakevenPct, (20 / 50) * 100, '盈亏平衡胜率应为 40%');
  near(r.winPct, 30, '盈利率应为 30%');
  near(r.losePct, 20, '亏损率应为 20%');
  near(r.edgePct, 0.55 * 30 - 0.45 * 20, '期望收益率应为 7.5%');
  // 四档：1/4=31.25% / 1/2=62.5% / 3/4=93.75% / 1=125%
  near(r.tiers[0].posPct, 31.25, '通用·保守档仓位应为 31.25%');
  near(r.tiers[3].posPct, 125, '通用·满仓档仓位应为 125%');
  near(r.tiers[3].amount, 250000, '通用·满仓档金额应超出总资产（250000）');
  // 每档盈亏金额 = 仓位金额 × 对应幅度
  near(r.tiers[1].winAmt, 125000 * 0.3, '通用·平衡档预期盈利金额正确');
  near(r.tiers[1].loseAmt, 125000 * 0.2, '通用·平衡档预期亏损金额正确');
}

// ---- 通用形式：f < 1 的常见股票参数（上涨 10% 胜率 55%，下跌 5% 胜率 45%） ----
// f* = 0.55/0.05 − 0.45/0.10 = 11 − 4.5 = 6.5（650%，极高杠杆）
// 这反映「盈亏不对称但比例都很小」时凯利建议加大量杠杆——这是数学事实
{
  const r = calcKelly({ profit: 10, loss: 5, winRate: 55, total: 200000, mode: 'general' });
  near(r.f, 6.5, '通用·小幅度参数下 f 应极大（650%·需大幅加杠杆）');
  assert(r.leverage === true, '通用·小幅度下应标记含杠杆');
}

// ---- 通用形式：f<1 场景（A=40% 大止损、B=20%、胜率 70% 高胜率） ----
// f* = 0.7/0.4 − 0.3/0.2 = 1.75 − 1.5 = 0.25（25%）
{
  const r = calcKelly({ profit: 20, loss: 40, winRate: 70, total: 100000, mode: 'general' });
  near(r.f, 0.25, '通用·稳健场景 f* 应为 0.25');
  assert(r.leverage === false, 'f < 1 不应标记含杠杆');
  near(r.tiers[3].amount, 25000, '通用·满仓金额 25% × 10 万 = 2.5 万');
}

// ---- 通用形式：与经典 amount/percent 的退化等价（A=100%、B=b） ----
// 当 general 模式填 A=100%、B=2、W=55%，f = 0.55/1 − 0.45/2 = 0.325（与 percent 模式 10/5 一致）
{
  const r1 = calcKelly({ profit: 10, loss: 5, winRate: 55, total: 200000, mode: 'percent' });
  const r2 = calcKelly({ profit: 200, loss: 100, winRate: 55, total: 200000, mode: 'general' });
  near(r1.f, r2.f, 'A=100%、B=200% 的通用形式应与 percent 模式 10%/5% 数学等价');
}

// ---- 通用形式：负期望 ----
{
  const r = calcKelly({ profit: 10, loss: 20, winRate: 40, total: 200000, mode: 'general' });
  // f = 0.4/0.2 − 0.6/0.1 = 2 − 6 = −4
  near(r.f, -4, '通用·负期望 f 应为负');
  assert(r.negative === true, '通用·负期望应标记');
  assert(r.leverage === false, '通用·f<1 不应标记杠杆');
  assert(r.tiers.every((t) => t.amount === 0), '通用·负期望四档归零');
}

// ---- 通用形式：非法输入 ----
{
  // 通用模式中 0 也会触发前面统一的 ≤0 校验
  assert(calcKelly({ profit: 0, loss: 20, winRate: 55, total: 200000, mode: 'general' }).ok === false, '通用·盈利为 0 应非法');
  assert(calcKelly({ profit: 30, loss: 0, winRate: 55, total: 200000, mode: 'general' }).ok === false, '通用·亏损为 0 应非法');
}

// ---- 通用形式·数值形式=目标价（止盈价/止损价 + 成本价） ----
// 成本价 10，止盈价 13 → 盈利率 30%；止损价 8 → 亏损率 20%；W=55% → f*=1.25（与幅度%等价）
{
  const r = calcKelly({ profit: 13, loss: 8, winRate: 55, total: 200000, mode: 'general', valueMode: 'price', cost: 10 });
  assert(r.ok, '通用·目标价模式应计算成功');
  near(r.winPct, 30, '目标价模式盈利率应为 30%');
  near(r.losePct, 20, '目标价模式亏损率应为 20%');
  near(r.f, 1.25, '目标价模式 f* 应与幅度%模式等价（1.25）');
}
// ---- 通用形式·数值形式=每股盈亏（每股盈利/亏损 + 成本价） ----
// 成本价 10，每股盈利 3 → 盈利率 30%；每股亏损 2 → 亏损率 20%；W=55% → f*=1.25
{
  const r = calcKelly({ profit: 3, loss: 2, winRate: 55, total: 200000, mode: 'general', valueMode: 'perShare', cost: 10 });
  assert(r.ok, '通用·每股盈亏模式应计算成功');
  near(r.winPct, 30, '每股盈亏模式盈利率应为 30%');
  near(r.losePct, 20, '每股盈亏模式亏损率应为 20%');
  near(r.f, 1.25, '每股盈亏模式 f* 应与幅度%模式等价（1.25）');
}
// ---- 通用形式·目标价/每股盈亏 的非法输入 ----
{
  assert(calcKelly({ profit: 13, loss: 8, winRate: 55, total: 200000, mode: 'general', valueMode: 'price', cost: '' }).ok === false, '目标价模式成本价为空应非法');
  assert(calcKelly({ profit: 10, loss: 8, winRate: 55, total: 200000, mode: 'general', valueMode: 'price', cost: 10 }).ok === false, '目标价模式止盈价=成本价应非法');
  assert(calcKelly({ profit: 13, loss: 10, winRate: 55, total: 200000, mode: 'general', valueMode: 'price', cost: 10 }).ok === false, '目标价模式止损价=成本价应非法');
  assert(calcKelly({ profit: 3, loss: 12, winRate: 55, total: 200000, mode: 'general', valueMode: 'perShare', cost: 10 }).ok === false, '每股盈亏模式每股亏损>成本价应非法');
  assert(calcKelly({ profit: 3, loss: 2, winRate: 55, total: 200000, mode: 'general', valueMode: 'perShare', cost: 0 }).ok === false, '每股盈亏模式成本价为 0 应非法');
}
// ---- 杠杆封顶：不允许杠杆（默认）封顶 100% ----
{
  const r = calcKelly({ profit: 30, loss: 20, winRate: 55, total: 200000, mode: 'general', leverageOn: false });
  near(r.capPct, 100, '不允许杠杆时仓位上限应为 100%');
  assert(r.capped === true, '理论值 125% 超过 100% 应被截断（capped）');
  near(r.tiers[3].posPct, 100, '满仓档应被截断到 100%');
  near(r.tiers[3].rawPct, 125, '满仓档应记录理论值 125%');
  assert(r.tiers[3].capped === true, '满仓档应标注 capped');
}
// ---- 杠杆封顶：允许杠杆且上限 2 倍 → 125% 不超上限 ----
{
  const r = calcKelly({ profit: 30, loss: 20, winRate: 55, total: 200000, mode: 'general', leverageOn: true, leverageMax: 2 });
  near(r.capPct, 200, '允许杠杆且上限 2 倍时仓位上限应为 200%');
  assert(r.capped === false, '125% < 200% 不应被截断');
  near(r.tiers[3].posPct, 125, '满仓档应为理论值 125%');
  near(r.tiers[3].rawPct, 125, '满仓档理论值应为 125%');
}
// ---- 杠杆封顶：允许杠杆但上限 1 倍 → 仍封顶 100% ----
{
  const r = calcKelly({ profit: 30, loss: 20, winRate: 55, total: 200000, mode: 'general', leverageOn: true, leverageMax: 1 });
  near(r.capPct, 100, '上限 1 倍时仓位上限应为 100%');
  assert(r.capped === true, '125% > 100% 应被截断');
  near(r.tiers[3].posPct, 100, '满仓档应截断到 100%');
}

console.log(`\n凯利公式模块: ${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
