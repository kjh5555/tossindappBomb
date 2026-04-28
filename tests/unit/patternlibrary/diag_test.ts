import { PATTERNS } from '../../../src/core/patterns/PatternData';

function bfsCheck(cells: Array<{row:number,col:number}>): {ok:boolean, visited:number} {
  const GRID = 8;
  const gateSet = new Set(cells.map(c => c.row * GRID + c.col));
  let safeStart: {row:number,col:number}|null = null;
  outer: for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      if (!gateSet.has(r * GRID + c)) { safeStart = {row:r,col:c}; break outer; }
    }
  }
  if (!safeStart) return {ok:false, visited:0};
  const visited = new Set<number>();
  const queue: Array<{row:number,col:number}> = [safeStart];
  visited.add(safeStart.row * GRID + safeStart.col);
  const dirs: [number,number][] = [[-1,0],[1,0],[0,-1],[0,1]];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const [dr,dc] of dirs) {
      const nr=cur.row+dr, nc=cur.col+dc;
      if (nr<0||nr>=GRID||nc<0||nc>=GRID) continue;
      const idx=nr*GRID+nc;
      if (gateSet.has(idx)||visited.has(idx)) continue;
      visited.add(idx); queue.push({row:nr,col:nc});
    }
  }
  return {ok: visited.size===64-cells.length, visited:visited.size};
}

test('DIAG_find_failing_patterns', () => {
  const failures: string[] = [];
  for (const p of PATTERNS) {
    const {ok, visited} = bfsCheck(p.cells);
    if (!ok) failures.push(`${p.patternId}: gate=${p.cells.length} safe=${64-p.cells.length} bfs=${visited}`);
  }
  if (failures.length) console.log('FAILURES:\n' + failures.join('\n'));
  expect(failures).toHaveLength(0);
});
