import type { SheetBody, SheetCell, CellFormat } from "@/lib/docs/schema";
import { expandRange, isRef } from "./refs";

/**
 * A compact formula evaluator for the sheet surface.
 *
 * It is deliberately kept *out* of the op reducer: reducers only ever write raw
 * cell strings, and displayed values are derived here at render time — the same
 * split the canvas uses between its stored scene graph and `lib/canvas/render`.
 * That keeps every op exactly invertible while formulas still recompute live.
 *
 * A cell whose raw value starts with `=` is a formula. Supported: `+ - * / ^`,
 * parentheses, comparisons (`= <> < > <= >=`), cell refs (`A1`), ranges
 * (`A1:B3`, only as function arguments), and the functions SUM, AVERAGE/AVG,
 * MIN, MAX, COUNT, IF, ROUND, ABS and CONCAT. Errors surface as `#CYCLE`,
 * `#DIV/0!`, `#NAME?`, `#REF!` or `#ERR`.
 */

export type Scalar = number | string | boolean;
type EvalValue = Scalar | { readonly range: Scalar[] };

export interface CellResult {
  /** Text to render in the cell. */
  display: string;
  /** Error code (e.g. "#CYCLE") when the cell could not be computed. */
  error: string | null;
  /** The computed scalar, when there is one — used for right-aligning numbers. */
  value: Scalar | null;
  /** Coarse kind, for styling. */
  kind: "number" | "text" | "boolean" | "error" | "empty";
}

class FormulaError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

/**
 * Evaluate every non-empty cell in the sheet. Returns a map from A1 ref to the
 * computed result; refs absent from the map are empty cells.
 */
export function evaluateSheet(body: SheetBody): Map<string, CellResult> {
  const memo = new Map<string, CellResult>();
  const visiting = new Set<string>();

  const compute = (ref: string): CellResult => {
    const cached = memo.get(ref);
    if (cached) return cached;

    const cell = body.cells[ref];
    if (!cell || cell.value.trim() === "") {
      const empty: CellResult = { display: "", error: null, value: null, kind: "empty" };
      memo.set(ref, empty);
      return empty;
    }

    if (visiting.has(ref)) throw new FormulaError("#CYCLE");
    visiting.add(ref);
    let result: CellResult;
    try {
      result = evaluateCell(cell, ref, resolveScalar);
    } catch (err) {
      const code = err instanceof FormulaError ? err.code : "#ERR";
      result = { display: code, error: code, value: null, kind: "error" };
    } finally {
      visiting.delete(ref);
    }
    memo.set(ref, result);
    return result;
  };

  // Resolve a reference to a scalar for use inside a formula, propagating the
  // referenced cell's error (so a cell that points at `#CYCLE` is an error too).
  function resolveScalar(ref: string): Scalar {
    const res = compute(ref);
    if (res.error) throw new FormulaError(res.error);
    if (res.kind === "empty" || res.value === null) return 0;
    return res.value;
  }

  for (const ref of Object.keys(body.cells)) {
    if (isRef(ref)) compute(ref);
  }
  return memo;
}

/**
 * Evaluate a single cell against a resolver for the values of other cells.
 * Exposed for unit testing; `evaluateSheet` supplies a memoising, cycle-aware
 * resolver.
 */
export function evaluateCell(
  cell: SheetCell,
  _ref: string,
  resolve: (ref: string) => Scalar,
): CellResult {
  const raw = cell.value;
  if (!raw.startsWith("=")) {
    const trimmed = raw.trim();
    if (trimmed !== "" && isNumeric(trimmed)) {
      const value = Number(trimmed);
      return { display: formatNumber(value, cell.format), error: null, value, kind: "number" };
    }
    return { display: raw, error: null, value: raw, kind: raw.trim() === "" ? "empty" : "text" };
  }

  const value = new Parser(raw.slice(1), resolve).parse();
  if (typeof value === "object") throw new FormulaError("#ERR"); // a bare range
  if (typeof value === "number") {
    return { display: formatNumber(value, cell.format), error: null, value, kind: "number" };
  }
  if (typeof value === "boolean") {
    return { display: value ? "TRUE" : "FALSE", error: null, value, kind: "boolean" };
  }
  return { display: value, error: null, value, kind: "text" };
}

/* ------------------------------------------------------------------ *
 * Parser — recursive descent over a small expression grammar
 * ------------------------------------------------------------------ */

type Tok =
  | { t: "num"; v: number }
  | { t: "str"; v: string }
  | { t: "ident"; v: string }
  | { t: "op"; v: string }
  | { t: "("; }
  | { t: ")"; }
  | { t: ","; };

class Parser {
  private toks: Tok[];
  private i = 0;

  constructor(
    src: string,
    private resolve: (ref: string) => Scalar,
  ) {
    this.toks = tokenize(src);
  }

  parse(): EvalValue {
    const v = this.comparison();
    if (this.i < this.toks.length) throw new FormulaError("#ERR");
    return v;
  }

  private peek(): Tok | undefined {
    return this.toks[this.i];
  }

  private comparison(): EvalValue {
    const left = this.addSub();
    const tok = this.peek();
    if (tok?.t === "op" && ["=", "<>", "<", ">", "<=", ">="].includes(tok.v)) {
      this.i++;
      const right = this.addSub();
      return compare(tok.v, scalar(left), scalar(right));
    }
    return left;
  }

  private addSub(): EvalValue {
    let left = this.mulDiv();
    for (let tok = this.peek(); tok?.t === "op" && (tok.v === "+" || tok.v === "-"); tok = this.peek()) {
      this.i++;
      const right = num(this.mulDiv());
      left = tok.v === "+" ? num(left) + right : num(left) - right;
    }
    return left;
  }

  private mulDiv(): EvalValue {
    let left = this.power();
    for (let tok = this.peek(); tok?.t === "op" && (tok.v === "*" || tok.v === "/"); tok = this.peek()) {
      this.i++;
      const right = num(this.power());
      if (tok.v === "/") {
        if (right === 0) throw new FormulaError("#DIV/0!");
        left = num(left) / right;
      } else {
        left = num(left) * right;
      }
    }
    return left;
  }

  private power(): EvalValue {
    const base = this.unary();
    const tok = this.peek();
    if (tok?.t === "op" && tok.v === "^") {
      this.i++;
      return Math.pow(num(base), num(this.power()));
    }
    return base;
  }

  private unary(): EvalValue {
    const tok = this.peek();
    if (tok?.t === "op" && (tok.v === "-" || tok.v === "+")) {
      this.i++;
      const v = num(this.unary());
      return tok.v === "-" ? -v : v;
    }
    return this.primary();
  }

  private primary(): EvalValue {
    const tok = this.peek();
    if (!tok) throw new FormulaError("#ERR");

    if (tok.t === "num") {
      this.i++;
      return tok.v;
    }
    if (tok.t === "str") {
      this.i++;
      return tok.v;
    }
    if (tok.t === "(") {
      this.i++;
      const v = this.comparison();
      if (this.peek()?.t !== ")") throw new FormulaError("#ERR");
      this.i++;
      return v;
    }
    if (tok.t === "ident") {
      this.i++;
      // Function call?
      if (this.peek()?.t === "(") {
        return this.call(tok.v.toUpperCase());
      }
      // A range like A1:B3 (tokenizer emits the whole range as one ident)?
      const range = tok.v.toUpperCase();
      if (range.includes(":")) {
        const refs = expandRange(range);
        if (!refs) throw new FormulaError("#REF!");
        return { range: refs.map((r) => this.resolve(r)) };
      }
      if (isRef(range)) return this.resolve(range);
      throw new FormulaError("#NAME?");
    }
    throw new FormulaError("#ERR");
  }

  private call(name: string): EvalValue {
    this.i++; // consume "("
    const args: EvalValue[] = [];
    if (this.peek()?.t !== ")") {
      args.push(this.comparison());
      while (this.peek()?.t === ",") {
        this.i++;
        args.push(this.comparison());
      }
    }
    if (this.peek()?.t !== ")") throw new FormulaError("#ERR");
    this.i++;
    return callFunction(name, args);
  }
}

function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === " " || ch === "\t" || ch === "\n") {
      i++;
      continue;
    }
    if (ch === '"') {
      let j = i + 1;
      let s = "";
      while (j < src.length && src[j] !== '"') {
        s += src[j];
        j++;
      }
      if (j >= src.length) throw new FormulaError("#ERR");
      toks.push({ t: "str", v: s });
      i = j + 1;
      continue;
    }
    if (ch === "(") {
      toks.push({ t: "(" });
      i++;
      continue;
    }
    if (ch === ")") {
      toks.push({ t: ")" });
      i++;
      continue;
    }
    if (ch === ",") {
      toks.push({ t: "," });
      i++;
      continue;
    }
    // Two-char comparison operators.
    const two = src.slice(i, i + 2);
    if (two === "<>" || two === "<=" || two === ">=") {
      toks.push({ t: "op", v: two });
      i += 2;
      continue;
    }
    if ("+-*/^=<>".includes(ch)) {
      toks.push({ t: "op", v: ch });
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      const n = Number(src.slice(i, j));
      if (!Number.isFinite(n)) throw new FormulaError("#ERR");
      toks.push({ t: "num", v: n });
      i = j;
      continue;
    }
    if (/[A-Za-z]/.test(ch)) {
      // A name (function), a ref, or a range: letters, digits and a single ':'.
      let j = i;
      while (j < src.length && /[A-Za-z0-9:]/.test(src[j])) j++;
      toks.push({ t: "ident", v: src.slice(i, j) });
      i = j;
      continue;
    }
    throw new FormulaError("#ERR");
  }
  return toks;
}

/* ------------------------------------------------------------------ *
 * Functions and coercion
 * ------------------------------------------------------------------ */

function callFunction(name: string, args: EvalValue[]): EvalValue {
  switch (name) {
    case "SUM":
      return flatten(args).reduce((acc: number, v) => acc + (numeric(v) ?? 0), 0);
    case "AVERAGE":
    case "AVG": {
      const nums = flatten(args).map(numeric).filter((n): n is number => n !== null);
      if (nums.length === 0) throw new FormulaError("#DIV/0!");
      return nums.reduce((a, b) => a + b, 0) / nums.length;
    }
    case "MIN": {
      const nums = flatten(args).map(numeric).filter((n): n is number => n !== null);
      return nums.length ? Math.min(...nums) : 0;
    }
    case "MAX": {
      const nums = flatten(args).map(numeric).filter((n): n is number => n !== null);
      return nums.length ? Math.max(...nums) : 0;
    }
    case "COUNT":
      return flatten(args).filter((v) => numeric(v) !== null).length;
    case "IF": {
      if (args.length < 2) throw new FormulaError("#ERR");
      return truthy(scalar(args[0])) ? scalar(args[1]) : args.length > 2 ? scalar(args[2]) : false;
    }
    case "ROUND": {
      const x = num(args[0]);
      const digits = args.length > 1 ? num(args[1]) : 0;
      const f = Math.pow(10, digits);
      return Math.round(x * f) / f;
    }
    case "ABS":
      return Math.abs(num(args[0]));
    case "CONCAT":
      return flatten(args).map(stringify).join("");
    default:
      throw new FormulaError("#NAME?");
  }
}

/** Flatten function args, expanding ranges into their scalar cell values. */
function flatten(args: EvalValue[]): Scalar[] {
  const out: Scalar[] = [];
  for (const arg of args) {
    if (typeof arg === "object") out.push(...arg.range);
    else out.push(arg);
  }
  return out;
}

/** Coerce an eval value to a scalar, rejecting a bare range. */
function scalar(v: EvalValue): Scalar {
  if (typeof v === "object") throw new FormulaError("#ERR");
  return v;
}

/** Coerce to a number for arithmetic; empty → 0, numeric strings parse. */
function num(v: EvalValue): number {
  const s = scalar(v);
  if (typeof s === "number") return s;
  if (typeof s === "boolean") return s ? 1 : 0;
  const t = s.trim();
  if (t === "") return 0;
  if (isNumeric(t)) return Number(t);
  throw new FormulaError("#ERR");
}

/** Number if the value is (or parses as) one, else null — for aggregates. */
function numeric(v: Scalar): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  const t = v.trim();
  return t !== "" && isNumeric(t) ? Number(t) : null;
}

function truthy(v: Scalar): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  return v.trim() !== "" && v.trim() !== "0";
}

function compare(op: string, a: Scalar, b: Scalar): boolean {
  // Numeric comparison when both sides look numeric, else string comparison.
  const an = numeric(a);
  const bn = numeric(b);
  let cmp: number;
  if (an !== null && bn !== null) cmp = an === bn ? 0 : an < bn ? -1 : 1;
  else {
    const as = stringify(a);
    const bs = stringify(b);
    cmp = as === bs ? 0 : as < bs ? -1 : 1;
  }
  switch (op) {
    case "=":
      return cmp === 0;
    case "<>":
      return cmp !== 0;
    case "<":
      return cmp < 0;
    case ">":
      return cmp > 0;
    case "<=":
      return cmp <= 0;
    case ">=":
      return cmp >= 0;
    default:
      throw new FormulaError("#ERR");
  }
}

function stringify(v: Scalar): string {
  if (typeof v === "number") return numberToString(v);
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  return v;
}

function isNumeric(s: string): boolean {
  return /^[+-]?(\d+\.?\d*|\.\d+)$/.test(s);
}

/* ------------------------------------------------------------------ *
 * Display formatting
 * ------------------------------------------------------------------ */

export function formatNumber(value: number, format: CellFormat): string {
  switch (format) {
    case "currency":
      return `$${(Math.round(value * 100) / 100).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
    case "percent":
      return `${numberToString(Math.round(value * 10000) / 100)}%`;
    case "text":
      return numberToString(value);
    case "number":
    case "auto":
    default:
      return numberToString(value);
  }
}

/** Render a float without accumulated binary noise, integers untouched. */
function numberToString(value: number): string {
  if (!Number.isFinite(value)) return "#ERR";
  if (Number.isInteger(value)) return String(value);
  return String(Number(value.toPrecision(12)));
}
