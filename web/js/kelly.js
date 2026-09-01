// 凯利公式（Kelly Criterion）仓位计算
//   f* = (b·p − q) / b = p − q/b
//     b = 盈亏比（盈利 / 亏损），p = 胜率，q = 1 − p
//   f* 为「理论最优下注比例」；实际操作中通常取其分数（1/4、1/2、3/4）以压低波动。
// 两种输入模式：
//   · amount  金额：盈利/亏损填绝对金额，语义为「若把总资产全部投入的盈亏」，
//     据此换算成盈利率/亏损率，再走同一套公式。
//   · percent 百分比：直接填相对仓位的盈亏百分比。
// 纯函数、无 DOM 依赖，便于单测。

export const KELLY_TIERS = [
  { key: 'conservative', label: '保守', factor: 0.25, desc: '1/4 凯利 · 回撤极小' },
  { key: 'balanced', label: '平衡', factor: 0.5, desc: '1/2 凯利 · 增长与波动兼顾' },
  { key: 'aggressive', label: '进取', factor: 0.75, desc: '3/4 凯利 · 追求高增长' },
  { key: 'full', label: '满仓（全凯利）', factor: 1, desc: '100% 凯利 · 理论最优，波动极大' },
];

// 入参：profit/loss（金额或百分比，同单位）、winRate（百分数 0~100）、total（总资产）、mode
// 返回 { ok:false, reason } 或 { ok:true, ...结果 }
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
  const b = P / L; // 盈亏比

  // 相对仓位的盈利率 / 亏损率（%）
  const winPct = mode === 'percent' ? P : (P / T) * 100;
  const losePct = mode === 'percent' ? L : (L / T) * 100;

  const f = (b * p - q) / b; // 全凯利
  const breakevenPct = 100 / (1 + b); // 盈亏平衡所需胜率
  const edgePct = p * winPct - q * losePct; // 单次下注的期望收益率（相对仓位）
  // 用极小容差判定：胜率恰落在盈亏平衡点时 f 因浮点误差可能是 ±1e-17，一律视为「不建议下注」
  const negative = f <= 1e-12;

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

  return { ok: true, b, p, breakevenPct, f, fPct: f * 100, edgePct, negative, winPct, losePct, tiers };
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
