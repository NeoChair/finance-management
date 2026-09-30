import type { LegField, LegValues, ShipmentImport } from "./invoice";
import { getImportTarget, getImportValueKind, getInvoiceSections, type ImportValueKind } from "./invoiceColumns";

export type ImportCell = string | number | null;
/** One data row as read from the upload file: Excel row number + the non-empty cells by column key. */
export type UploadRow = { rowNo: number; cells: Record<string, ImportCell> };

// DB column lengths for the text fields (master and invoice-leg/cost field names don't overlap).
const TEXT_MAX_LEN: Record<string, number> = {
  suplFactNm: 50, sttsNm: 100, loadType: 20, hblNo: 50, mblNo: 50, contNo: 30, poNo: 50,
  subpoNo: 50, podNm: 50, currCd: 3, rmrk: 500, sndrNm: 50, rcvrNm: 50, invNo: 50,
};

function isValidYmd(y: number, m: number, d: number): boolean {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Accepts 20260515, 2026-05-15, 2026/05/15, 2026.05.15, 26.05.15, 5/15/26 and 5/15/2026.
 *  Returns YYYYMMDD, or undefined when the text isn't a date. */
function parseDate(raw: string): string | undefined {
  const s = raw.split(/\r?\n/)[0].trim();
  let y: number, m: number, d: number;
  let match = s.match(/^(\d{4})(\d{2})(\d{2})$/) ?? s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (match) {
    [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else if ((match = s.match(/^(\d{2})\.(\d{1,2})\.(\d{1,2})$/))) {
    [y, m, d] = [2000 + Number(match[1]), Number(match[2]), Number(match[3])];
  } else if ((match = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/))) {
    [m, d] = [Number(match[1]), Number(match[2])];
    y = match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3]);
  } else {
    return undefined;
  }
  if (!isValidYmd(y, m, d)) return undefined;
  return `${y}${String(m).padStart(2, "0")}${String(d).padStart(2, "0")}`;
}

function parseNumber(raw: string | number): number | null | undefined {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : undefined;
  const s = raw.replace(/[$,\s]/g, "");
  if (s === "" || s === "-" || s === "_") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

/** Returns the value to store (null = treat as blank), or an error message. */
function normalize(kind: ImportValueKind, field: string, raw: ImportCell): { value: string | number | null } | { error: string } {
  if (raw == null) return { value: null };

  if (kind === "date") {
    // Lookup formulas in the source sheets fall back to 0 for "no date yet".
    if (raw === 0 || String(raw).trim() === "0") return { value: null };
    const ymd = parseDate(String(raw));
    return ymd ? { value: ymd } : { error: `날짜 형식이 아닙니다: "${raw}"` };
  }

  if (kind === "number") {
    const n = parseNumber(raw);
    if (n === undefined) return { error: `숫자가 아닙니다: "${raw}"` };
    return { value: n === null ? null : Math.round(n * 1e4) / 1e4 };
  }

  const text = String(raw).trim();
  if (text === "") return { value: null };
  const max = TEXT_MAX_LEN[field];
  if (max && text.length > max) return { error: `${max}자를 넘습니다: "${text.slice(0, 20)}…"` };
  return { value: text };
}

/** Validates the uploaded rows against the product line's column layout and groups each row's
 *  cells by target table. The caller writes nothing if any error comes back. */
export function buildShipmentImports(prdLineCd: string, rows: UploadRow[]): { imports: ShipmentImport[]; errors: string[] } {
  const sections = getInvoiceSections(prdLineCd);
  const imports: ShipmentImport[] = [];
  const errors: string[] = [];
  const seenKeys = new Map<string, number>();

  for (const row of rows) {
    const item: ShipmentImport = { rowNo: row.rowNo, master: {}, parties: [], costs: [] };
    const legs = new Map<string, LegValues>();
    const leg = (key: string): LegValues => {
      let values = legs.get(key);
      if (!values) legs.set(key, (values = {}));
      return values;
    };

    for (const section of sections) {
      for (const col of section.columns) {
        const target = getImportTarget(col);
        if (!target) continue;
        const field: string = target.field ?? "amt";
        const result = normalize(getImportValueKind(col), field, row.cells[col.key] ?? null);
        if ("error" in result) {
          const label = section.groupLabel ? `${section.groupLabel.trim()} > ${col.label}` : col.label;
          errors.push(`${row.rowNo}행 [${label}] ${result.error}`);
          continue;
        }
        const value = result.value;
        if (value == null) continue;

        if (target.kind === "master") item.master[target.field] = value;
        else if (target.kind === "party") leg(`party:${target.invTpCd}`)[field as LegField] = value;
        else leg(`cost:${target.costTpCd}`)[field as LegField] = value;
      }
    }

    for (const [key, values] of legs) {
      const [kind, cd] = key.split(":");
      if (kind === "party") item.parties.push({ invTpCd: cd as "NEO" | "FACTORY", values });
      else item.costs.push({ costTpCd: cd, values });
    }

    if (item.master.contNo == null) {
      errors.push(`${row.rowNo}행: CONTAINER가 비어 있습니다.`);
      continue;
    }
    const key = [item.master.hblNo, item.master.mblNo, item.master.contNo].map((v) => String(v ?? "").toUpperCase()).join("|");
    const dupRow = seenKeys.get(key);
    if (dupRow != null) {
      errors.push(`${row.rowNo}행: ${dupRow}행과 H-BL/M-BL/CONTAINER가 같습니다.`);
      continue;
    }
    seenKeys.set(key, row.rowNo);
    imports.push(item);
  }

  return { imports, errors };
}
