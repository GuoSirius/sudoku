// 本地存储封装：设置、当前局（可续玩）、历史记录、排行榜
// 全部基于 localStorage，零后端。所有读写带异常兜底。

const KEYS = {
  settings: 'sudoku:settings',
  current: 'sudoku:current',
  history: 'sudoku:history',
  leaderboard: 'sudoku:leaderboard',
};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch (e) {
    // 存储满或隐私模式：静默失败，避免阻断游戏
    console.warn('存储写入失败', key, e);
  }
}

export const storage = {
  // 设置：{ difficulty, theme, mistakeMode }
  // mistakeMode: 错误提示强度 —— off(关闭) / conflict(仅冲突) / full(全量核对，比对答案)
  getSettings() {
    return read(KEYS.settings, { difficulty: 'medium', theme: 'dark', mistakeMode: 'conflict' });
  },
  setSettings(s) {
    write(KEYS.settings, { ...this.getSettings(), ...s });
  },

  // 当前进行中的对局（可被“继续游戏”恢复）
  getCurrent() {
    return read(KEYS.current, null);
  },
  setCurrent(game) {
    write(KEYS.current, game);
  },
  clearCurrent() {
    try {
      localStorage.removeItem(KEYS.current);
    } catch {}
  },

  // 历史记录：最近 200 局，含复盘所需数据
  getHistory() {
    return read(KEYS.history, []);
  },
  addHistory(rec) {
    const h = read(KEYS.history, []);
    h.unshift(rec);
    write(KEYS.history, h.slice(0, 200));
  },
  // 按 id 更新已有记录，不存在则置顶新增；用于「续玩后完成」原地更新原记录，避免重复
  upsertHistory(rec) {
    const h = read(KEYS.history, []);
    const idx = h.findIndex((r) => r.id === rec.id);
    if (idx >= 0) {
      h[idx] = rec; // 原地更新（保留原位置）
    } else {
      h.unshift(rec);
    }
    write(KEYS.history, h.slice(0, 200));
  },

  // 排行榜：所有完成对局的成绩
  getLeaderboard() {
    return read(KEYS.leaderboard, []);
  },
  addLeaderboard(rec) {
    const lb = read(KEYS.leaderboard, []);
    lb.push(rec);
    write(KEYS.leaderboard, lb);
  },

  clearHistory() {
    try {
      localStorage.removeItem(KEYS.history);
    } catch {}
  },
  clearLeaderboard() {
    try {
      localStorage.removeItem(KEYS.leaderboard);
    } catch {}
  },

  // 清理个人数据（设置保留）
  clearAll() {
    Object.values(KEYS).forEach((k) => {
      try {
        localStorage.removeItem(k);
      } catch {}
    });
  },
};
