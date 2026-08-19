/**
 * A1-notation helpers for the sheet surface.
 *
 * A cell reference is a column letter run (A, B, …, Z, AA, …) followed by a
 * 1-based row number: "A1", "B3", "AA10". Internally we work in 0-based
 * `{ row, col }` coordinates; these functions are the single place the two
 * representations are converted, so the reducer, the formula evaluator and the
 * surface all agree on what "B3" means.
 */

export interface Coord {
  /** 0-based row index. */
  row: number;
  /** 0-based column index. */
  col: number;
}

const REF_RE = /^([A-Z]+)([1-9][0-9]*)$/;
const RANGE_RE = /^([A-Z]+[1-9][0-9]*):([A-Z]+[1-9][0-9]*)$/;

/** 0-based column index → letters. 0 → "A", 25 → "Z", 26 → "AA". */
export function indexToCol(index: number): string {
  if (!Number.isInteger(index) || index < 0) {
    throw new RangeError(`column index out of range: ${index}`);
  }
  let n = index;
  let out = "";
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

/** Letters → 0-based column index. "A" → 0, "Z" → 25, "AA" → 26. */
export function colToIndex(letters: string): number {
  if (!/^[A-Z]+$/.test(letters)) {
    throw new RangeError(`not a column: ${letters}`);
  }
  let n = 0;
  for (const ch of letters) {
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n - 1;
}

/** True if the string is a well-formed single-cell reference. */
export function isRef(ref: string): boolean {
  return REF_RE.test(ref);
}

/** Parse "B3" → { row: 2, col: 1 }, or null if malformed. */
export function parseRef(ref: string): Coord | null {
  const m = REF_RE.exec(ref);
  if (!m) return null;
  return { row: Number(m[2]) - 1, col: colToIndex(m[1]) };
}

/** { row: 2, col: 1 } → "B3". */
export function toRef(coord: Coord): string {
  return `${indexToCol(coord.col)}${coord.row + 1}`;
}

/**
 * Expand a range like "A1:B3" into the list of refs it covers, row-major. A
 * single ref ("A1") expands to itself. Returns null if either endpoint is
 * malformed. The endpoints may be given in any order.
 */
export function expandRange(range: string): string[] | null {
  const m = RANGE_RE.exec(range);
  if (!m) {
    return isRef(range) ? [range] : null;
  }
  const a = parseRef(m[1]);
  const b = parseRef(m[2]);
  if (!a || !b) return null;

  const r0 = Math.min(a.row, b.row);
  const r1 = Math.max(a.row, b.row);
  const c0 = Math.min(a.col, b.col);
  const c1 = Math.max(a.col, b.col);

  const refs: string[] = [];
  for (let row = r0; row <= r1; row++) {
    for (let col = c0; col <= c1; col++) {
      refs.push(toRef({ row, col }));
    }
  }
  return refs;
}
