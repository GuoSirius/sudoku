// 棋盘渲染与高亮计算（被对局界面与复盘界面共用）

// 计算与 idx 同行/列/宫的格子（不含自身）
export function computePeers(idx) {
  const r = Math.floor(idx / 9);
  const c = idx % 9;
  const set = new Set();
  for (let i = 0; i < 9; i++) {
    set.add(r * 9 + i);
    set.add(i * 9 + c);
  }
  const br = Math.floor(r / 3) * 3;
  const bc = Math.floor(c / 3) * 3;
  for (let dr = 0; dr < 3; dr++) {
    for (let dc = 0; dc < 3; dc++) {
      set.add((br + dr) * 9 + (bc + dc));
    }
  }
  set.delete(idx);
  return set;
}

// 计算与 idx 同值的格子
export function computeSameNum(cells, idx) {
  const v = cells[idx];
  const set = new Set();
  if (v === 0) return set;
  for (let i = 0; i < 81; i++) if (cells[i] === v) set.add(i);
  return set;
}

// 渲染 9x9 棋盘。state: { cells, notes, given[], selected, conflicts:Set, wrong:Set }
// onCellClick(idx) 可选，提供则格子可点击
// onNoteClick(idx, n) 可选，点击某格内的笔记小数字时触发（用于把笔记直接升级为正式值）
export function buildBoard(root, state, onCellClick, onNoteClick) {
  root.innerHTML = '';
  const { cells, notes, given, selected, conflicts, wrong } = state;
  const peers = selected != null ? computePeers(selected) : null;
  const sameNum = selected != null ? computeSameNum(cells, selected) : null;

  for (let i = 0; i < 81; i++) {
    const r = Math.floor(i / 9);
    const c = i % 9;
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'cell';
    if (c % 3 === 0) cell.classList.add('bl');
    if (r % 3 === 0) cell.classList.add('bt');
    if (c === 8) cell.classList.add('br');
    if (r === 8) cell.classList.add('bb');
    if (given[i]) cell.classList.add('given');
    if (selected === i) cell.classList.add('selected');
    if (peers && peers.has(i)) cell.classList.add('peer');
    if (sameNum && sameNum.has(i)) cell.classList.add('samenum');
    if (conflicts && conflicts.has(i)) cell.classList.add('conflict');
    if (wrong && wrong.has(i)) cell.classList.add('wrong');

    const val = cells[i];
    if (val !== 0) {
      cell.textContent = val;
    } else if (notes[i] && notes[i].length) {
      const note = document.createElement('div');
      note.className = 'notes';
      for (let n = 1; n <= 9; n++) {
        const span = document.createElement('span');
        if (notes[i].includes(n)) {
          span.textContent = n;
          if (onNoteClick) {
            span.addEventListener('click', (e) => {
              e.stopPropagation();
              onNoteClick(i, n);
            });
          }
        }
        note.appendChild(span);
      }
      cell.appendChild(note);
    }
    if (onCellClick) cell.addEventListener('click', () => onCellClick(i));
    root.appendChild(cell);
  }
}
