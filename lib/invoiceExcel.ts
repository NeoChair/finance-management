import ExcelJS from "exceljs";
import type { InvoiceRow, InvoiceSku } from "./invoice";
import {
  actualQtyIfDifferent,
  getImportTarget,
  getImportValueKind,
  getInvoiceSections,
  QTY_MISMATCH_BG,
  QTY_MISMATCH_FG,
  type InvoiceColumn,
  type InvoiceSection,
} from "./invoiceColumns";
import type { ImportCell, UploadRow } from "./invoiceImport";

// Download, template and upload all share one sheet layout, mirroring the on-screen table:
// row 1 = group labels, row 2 = column labels, data from row 3. Columns are matched by
// position (labels like "Amount" / "Payment Date" repeat across groups).
const HEADER_ROWS = 2;

const headerFill: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
const groupFill: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFE1E1" } };
const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FF9CA3AF" } },
  left: { style: "thin", color: { argb: "FF9CA3AF" } },
  bottom: { style: "thin", color: { argb: "FF9CA3AF" } },
  right: { style: "thin", color: { argb: "FF9CA3AF" } },
};

// The sheet has one line per SKU, so it carries an extra SKU-code column right after CONTAINER.
// It isn't uploadable (SKU lines are edited on screen), so upload just skips it.
const SKU_COL: InvoiceColumn = { key: "__skuCd", label: "SKU", getValue: () => null };

function withSkuColumn(sections: InvoiceSection[]): InvoiceSection[] {
  return sections.map((s) => ({
    ...s,
    columns: s.columns.flatMap((c) => (c.skuField === "sku" ? [c, SKU_COL] : [c])),
  }));
}

function cellForDownload(col: InvoiceColumn, row: InvoiceRow): string | number | null {
  const value = col.getValue(row);
  if (value == null || value === "") return null;
  if (getImportValueKind(col) === "date") {
    const s = String(value);
    return s.length === 8 ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : s;
  }
  return value;
}

// Shipment-level money (freight/duty/trucking… amounts): written on a shipment's first SKU line
// only, so summing the column in Excel doesn't count it once per SKU.
function isShipmentAmount(col: InvoiceColumn): boolean {
  const t = col.editTarget;
  return t !== undefined && t.kind !== "master" && !t.field;
}

/** One sheet line per SKU. QTY / CBM are that SKU's own values, amounts (the per-container
 *  product Amount included) sit on the first line only, and everything else repeats on every
 *  line so each line can be filtered/pivoted on its own. A shipment without SKUs gets a single line. */
function sheetLines(columns: InvoiceColumn[], row: InvoiceRow): (string | number | null)[][] {
  if (row.skuDetails.length === 0) return [columns.map((c) => cellForDownload(c, row))];
  return row.skuDetails.map((sku, i) =>
    columns.map((c) => {
      if (c === SKU_COL) return sku.skuCd;
      if (c.skuField === "qty") return sku.qty;
      if (c.skuField === "cbm") return sku.cbm;
      if (i > 0 && isShipmentAmount(c)) return null;
      return cellForDownload(c, row);
    })
  );
}

/** Builds the download file; with no rows it's the blank upload template.
 *  `detail` (Export Detail / template): one line per SKU, with the SKU and CBM columns.
 *  Otherwise (Export): one line per shipment, product QTY as the SKU total and no
 *  SKU/CBM columns — upload treats both as optional, so either file can be imported back. */
export async function buildInvoiceWorkbook(prdLineCd: string, rows: InvoiceRow[], detail: boolean): Promise<ExcelJS.Buffer> {
  const base = getInvoiceSections(prdLineCd);
  const sections = detail
    ? withSkuColumn(base)
    : base.map((s) => ({ ...s, columns: s.columns.filter((c) => c.skuField !== "cbm") })).filter((s) => s.columns.length > 0);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Sheet1", { views: [{ state: "frozen", ySplit: HEADER_ROWS }] });

  let colNo = 1;
  for (const section of sections) {
    const start = colNo;
    for (const col of section.columns) {
      // Ungrouped columns repeat their own label (or topLabel) in row 1, like the source sheets.
      if (section.groupLabel === null) sheet.getCell(1, colNo).value = col.topLabel ?? col.label;
      sheet.getCell(2, colNo).value = col.label;
      const kind = getImportValueKind(col);
      const column = sheet.getColumn(colNo);
      column.width = 16;
      if (kind === "number" && col.label !== "QTY") column.numFmt = "#,##0.00##";
      if (kind === "date" || kind === "text") column.numFmt = "@"; // keep typed dates/IDs as text
      colNo++;
    }
    if (section.groupLabel !== null) {
      sheet.getCell(1, start).value = section.groupLabel;
      if (colNo - 1 > start) sheet.mergeCells(1, start, 1, colNo - 1);
    }
  }

  for (let r = 1; r <= HEADER_ROWS; r++) {
    for (let c = 1; c < colNo; c++) {
      const cell = sheet.getCell(r, c);
      cell.font = { bold: true };
      cell.numFmt = "General";
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = thinBorder;
      cell.fill = headerFill;
    }
  }
  colNo = 1;
  for (const section of sections) {
    for (const col of section.columns) {
      if (section.groupLabel !== null) sheet.getCell(1, colNo).fill = groupFill;
      // Greyed header = not read on upload (product QTY / CBM come from the SKU lines).
      if (!getImportTarget(col)) sheet.getCell(2, colNo).font = { bold: true, italic: true, color: { argb: "FF9CA3AF" } };
      colNo++;
    }
  }

  const columns = sections.flatMap((s) => s.columns);
  const qtyColNo = columns.findIndex((c) => c.skuField === "qty") + 1;
  // Same marking as the screen: QTY stays the declared figure, coloured when the loaded quantity differs.
  const markQty = (line: ExcelJS.Row, mismatched: boolean) => {
    if (!mismatched || qtyColNo === 0) return;
    const cell = line.getCell(qtyColNo);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${QTY_MISMATCH_BG.slice(1)}` } };
    cell.font = { color: { argb: `FF${QTY_MISMATCH_FG.slice(1)}` } };
  };
  const mismatched = (sku: InvoiceSku) => actualQtyIfDifferent(sku, sku.qty) !== null;
  for (const row of rows) {
    if (!detail) markQty(sheet.addRow(columns.map((c) => cellForDownload(c, row))), row.skuDetails.some(mismatched));
    else sheetLines(columns, row).forEach((line, i) => markQty(sheet.addRow(line), !!row.skuDetails[i] && mismatched(row.skuDetails[i])));
  }

  return workbook.xlsx.writeBuffer();
}

function ymd(d: Date): string {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}

function readCell(cell: ExcelJS.Cell): ImportCell {
  let v: unknown = cell.value;
  if (v && typeof v === "object" && !(v instanceof Date)) {
    const o = v as { result?: unknown; richText?: { text: string }[]; text?: unknown; formula?: unknown; sharedFormula?: unknown };
    if (o.richText) v = o.richText.map((t) => t.text).join("");
    else if ("result" in o) v = o.result;
    else if ("formula" in o || "sharedFormula" in o) v = null; // formula with no cached result
    else if ("text" in o) v = o.text; // hyperlink
    else v = null;
    if (v && typeof v === "object" && !(v instanceof Date)) v = null; // formula error result
  }
  if (v == null) return null;
  if (v instanceof Date) return ymd(v);
  if (typeof v === "number") return v;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function headerText(cell: ExcelJS.Cell): string {
  return String(readCell(cell) ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

/** Reads an upload file's first sheet into rows keyed by column key. Throws (with a
 *  user-facing message) when the header doesn't match this product line's template. */
export async function parseInvoiceWorkbook(prdLineCd: string, data: ArrayBuffer): Promise<UploadRow[]> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(data);
  } catch {
    throw new Error("엑셀(.xlsx) 파일을 읽을 수 없습니다.");
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("시트가 없는 파일입니다.");

  // The SKU and CBM columns are newer than some files in circulation and are never read on
  // upload, so a file without them still matches: they're skipped when their header is absent.
  const sections = withSkuColumn(getInvoiceSections(prdLineCd));
  const isOptional = (col: InvoiceColumn) => col === SKU_COL || col.skuField === "cbm";

  const columns: { col: InvoiceColumn; colNo: number }[] = [];
  let colNo = 1;
  for (const section of sections) {
    for (const col of section.columns) {
      // Row 2 carries the column label; fall back to row 1 for files with those two rows merged.
      const actual = headerText(sheet.getCell(2, colNo)) || headerText(sheet.getCell(1, colNo));
      if (actual !== col.label.replace(/\s+/g, " ").trim().toLowerCase()) {
        if (isOptional(col)) continue;
        throw new Error(
          `양식이 다릅니다 (${sheet.getColumn(colNo).letter}열: "${col.label}" 자리에 "${actual}"). 양식을 다시 내려받아 작성해 주세요.`
        );
      }
      columns.push({ col, colNo });
      colNo++;
    }
  }

  const rows: UploadRow[] = [];
  for (let r = HEADER_ROWS + 1; r <= sheet.rowCount; r++) {
    const excelRow = sheet.getRow(r);
    const cells: UploadRow["cells"] = {};
    for (const { col, colNo: c } of columns) {
      const value = readCell(excelRow.getCell(c));
      if (value != null) cells[col.key] = value;
    }
    if (Object.keys(cells).length > 0) rows.push({ rowNo: r, cells });
  }
  return rows;
}
