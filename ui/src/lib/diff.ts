export type DiffOp = { type: 'same' | 'add' | 'del'; text: string };

/** Split into words while keeping whitespace attached so output re-joins cleanly. */
export function tokenize(s: string): string[] {
  return s.match(/\s*\S+/g) ?? [];
}

/**
 * Word-level diff via longest common subsequence. `del` = only in `a`,
 * `add` = only in `b`. Comparison ignores case and surrounding whitespace.
 */
export function wordDiff(a: string, b: string): DiffOp[] {
  const A = tokenize(a);
  const B = tokenize(b);
  const n = A.length;
  const m = B.length;
  const key = (t: string) => t.trim().toLowerCase();
  // (n+1)*(m+1) table; answers are capped at 4000 chars so this stays small.
  const dp: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    const row = dp[i]!;
    const next = dp[i + 1]!;
    for (let j = m - 1; j >= 0; j--) {
      row[j] = key(A[i]!) === key(B[j]!) ? next[j + 1]! + 1 : Math.max(next[j]!, row[j + 1]!);
    }
  }
  const out: DiffOp[] = [];
  const push = (type: DiffOp['type'], text: string) => {
    const last = out[out.length - 1];
    if (last && last.type === type) last.text += text;
    else out.push({ type, text });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (key(A[i]!) === key(B[j]!)) {
      push('same', B[j]!);
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      push('del', A[i]!);
      i++;
    } else {
      push('add', B[j]!);
      j++;
    }
  }
  while (i < n) push('del', A[i++]!);
  while (j < m) push('add', B[j++]!);
  return out;
}

export function diffStats(ops: DiffOp[]) {
  let same = 0;
  let add = 0;
  let del = 0;
  for (const o of ops) {
    const c = tokenize(o.text).length;
    if (o.type === 'same') same += c;
    else if (o.type === 'add') add += c;
    else del += c;
  }
  const total = same + Math.max(add, del);
  return { same, add, del, similarity: total ? same / total : 1 };
}
