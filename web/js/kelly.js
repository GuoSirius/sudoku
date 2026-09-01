// 凯利公式（Kelly Criterion）仓位计算
//   经典伯努利凯利（每注 1 元，盈 b 元亏 1 元）：
//     f* = (b·p − q) / b    （b = 盈亏比，p = 胜率，q = 1 − p）
//   通用形式（每仓位独立盈亏幅度，亏损不一定是 100%，更贴近股票）：
//     f* = W / A − (1 − W) / B
//       W = 胜率，A = 亏损幅度（仓位比例），B = 盈利幅度（仓位比例）
//   两种表达在 b = B/A 时数学等价（A=1, B=b 即退化为经典）。
//
// 三种输入模式：
//   · amount  金额：填「总资产全押时的盈亏金额」，内部换算成盈利率/亏损率。
//   · percent 百分比：直接填相对仓位的盈亏百分比（隐含 b=P/L 经典伯努利凯利）。
//   · general 通用形式：填每仓位独立盈亏幅度（亏损不一定是 100%）；f 可能 > 1（加杠杆）。
//
// 纯函数、无 DOM 依赖，便于单测。

export const KELLY_TIERS = [
  { key: 'conservative', label: '保守', factor: 0.25, desc: '1/4 凯利 · 回撤极小' },
  { key: 'balanced', label: '平衡', factor: 0.5, desc: '1/2 凯利 · 增长与波动兼顾' },
  { key: 'aggressive', label: '进取', factor: 0.75, desc: '3/4 凯利 · 追求高增长' },
  { key: 'full', label: '满仓（全凯利）', factor: 1, desc: '100% 凯利 · 理论最优，波动极大' },
];

// 入参：profit/loss（金额或百分比，同单位）、winRate（百分数 0~100）、total（总资产）、mode
// 返回 { ok:false, reason } 或 { ok:true, b, p, breakevenPct, f, fPct, edgePct, negative, leverage, winPct, losePct, tiers }
export function calcKelly({ profit, loss, winRate, total, mode = 'amount' }) {
  const P = Number(profit);
  const L = Number(loss);
  const T = Number(total);
  const pRaw = Number(winRate);

  if (![P, L, T, pRaw].every(Number.isFinite)) {
    return { ok: false, reason: '请填写有效的数字' };
  }
  if (L <= 0) return { ok: false, reason: '亏损必须大于 0' };
  if (P <= 0) return { ok: false, reason: '盈利必须大于 0' };
  if (T <= 0) return { ok: false, reason: '总资产必须大于 0' };
  if (pRaw <= 0 || pRaw >= 100) return { ok: false, reason: '胜率需在 0% ~ 100% 之间' };

  const p = pRaw / 100;
  const q = 1 - p;
  const b = P / L; // 盈亏比（amount/percent 模式直接用，general 仅供展示）

  let f, winPct, losePct, breakevenPct;

  if (mode === 'general') {
    // 通用形式：A = 亏损幅度（小数）、B = 盈利幅度（小数）
    const A = L / 100;
    const B = P / 100;
    if (A <= 0 || B <= 0) return { ok: false, reason: '盈亏幅度必须大于 0' };
    f = p / A - q / B; // f* = W/A − (1−W)/B
    winPct = B * 100; // 用户填的百分比直接作为「盈利率」
    losePct = A * 100;
    // 盈亏平衡胜率：A/(A+B) × 100，与 amount/percent 的 100/(1+b) 数学等价
    breakevenPct = (A / (A + B)) * 100;
  } else {
    // 经典伯努利凯利：f* = (bW − q)/b
    f = (b * p - q) / b;
    winPct = mode === 'percent' ? P : (P / T) * 100;
    losePct = mode === 'percent' ? L : (L / T) * 100;
    breakevenPct = 100 / (1 + b);
  }

  const edgePct = p * winPct - q * losePct; // 单次期望收益率（相对仓位，%）
  // 用极小容差判定：胜率恰落在盈亏平衡点时 f 因浮点误差可能是 ±1e-17，一律视为「不建议下注」
  const negative = f <= 1e-12;
  // 仅通用形式可能 f>1（需要加杠杆）；amount/percent 模式数学上 f<1
  const leverage = f > 1 + 1e-12;

  const tiers = KELLY_TIERS.map((t) => {
    const pos = negative ? 0 : f * t.factor;
    const amount = T * pos;
    return {
      ...t,
      posPct: pos * 100,
      amount,
      winAmt: (amount * winPct) / 100,
      loseAmt: (amount * losePct) / 100,
    };
  });

  return { ok: true, b, p, breakevenPct, f, fPct: f * 100, edgePct, negative, leverage, winPct, losePct, tiers };
}

// 金额格式化：万元以上的大额用「万」为单位，便于快速读
export function fmtMoney(v) {
  const n = Number(v) || 0;
  const abs = Math.abs(n);
  if (abs >= 10000) return (n / 10000).toFixed(2).replace(/\.?0+$/, '') + ' 万';
  return n.toFixed(2).replace(/\.?0+$/, '');
}

export function fmtPct(v, digits = 2) {
  const n = Number(v) || 0;
  return n.toFixed(digits).replace(/\.?0+$/, '') + '%';
}