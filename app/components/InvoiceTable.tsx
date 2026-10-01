"use client";

import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import type { InvoiceRow, InvoiceSku } from "@/lib/invoice";
import { buildInvoiceWorkbook, parseInvoiceWorkbook } from "@/lib/invoiceExcel";
import ColumnFilterMenu from "./ColumnFilterMenu";
import { getInvoiceSections, optionKey, type EditTarget, type InvoiceColumn } from "@/lib/invoiceColumns";

function formatDate(v: string | null): string {
  if (!v || v.length !== 8) return "";
  return `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
}

// Whether an edited value matches the original — blank and null count as the same, and numbers
// compare numerically so "10" vs 10.00 isn't treated as a change.
function sameValue(a: string | number | null, b: string | number | null): boolean {
  const sa = a == null ? "" : String(a);
  const sb = b == null ? "" : String(b);
  if (sa === sb) return true;
  return sa !== "" && sb !== "" && !isNaN(Number(sa)) && !isNaN(Number(sb)) && Number(sa) === Number(sb);
}

// Partial numbers allowed while typing ("-", "1.", ".5"); commitEdit converts with Number().
const NUMERIC_DRAFT = /^-?\d*\.?\d*$/;

type MoveDir ="next" | "prev" | "up" | "down" | "left" | "right";

// Which cell to move to for a key pressed inside an inline editor, or null to let the key act
// normally. Enter goes down (Shift+Enter up). Left/Right leave a text field while its whole text
// is still selected (as it is right after opening) or the caret is at that edge, so once you
// click into the text they move the caret; date fields keep Left/Right for their own segments.
function navDir(e: KeyboardEvent<HTMLInputElement | HTMLSelectElement>): MoveDir | null {
  if (e.key === "Tab") return e.shiftKey ? "prev" : "next";
  if (e.altKey || e.ctrlKey || e.metaKey) return null;
  if (e.key === "Enter") return e.shiftKey ? "up" : "down";
  if (e.key === "ArrowUp") return "up";
  if (e.key === "ArrowDown") return "down";
  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return null;
  const el = e.currentTarget;
  if (el instanceof HTMLSelectElement) return e.key === "ArrowLeft" ? "left" : "right";
  const dir = e.key === "ArrowLeft" ? "left" : "right";
  const start = el.selectionStart ?? 0;
  const end = el.selectionEnd ?? 0;
  if (start === 0 && end === el.value.length) return dir;
  if (start !== end) return null;
  return (dir === "left" ? start === 0 : end === el.value.length) ? dir : null;
}

// Opening an editor selects its text, so typing replaces it and Delete/Backspace clears it.
function selectAll(e: { currentTarget: HTMLInputElement }) {
  e.currentTarget.select();
}

// Dates are stored as YYYYMMDD (shown as yyyy-mm-dd); also rejects impossible ones like 20240231.
function isValidYmd(v: string): boolean {
  if (!/^\d{8}$/.test(v)) return false;
  const y = Number(v.slice(0, 4));
  const m = Number(v.slice(4, 6));
  const d = Number(v.slice(6, 8));
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

// Date cells (typed freely as yyyy-mm-dd) holding something that isn't a real date, whether
// typed here or already bad in the DB — highlighted and blocked on save.
function isInvalidDate(col: InvoiceColumn | undefined, value: string | number | null): boolean {
  return col?.format === "date" && value != null && value !== "" && !isValidYmd(String(value));
}

function formatCell(col: InvoiceColumn, value: string | number | null): string {
  if (value == null || value === "") return "";
  if (col.format === "date") {
    const s = String(value);
    return s.length === 8 ? formatDate(s) : s; // show malformed values as-is rather than blank
  }
  if (col.label === "QTY" || col.label === "USD") return String(value);
  if (col.align === "right") return Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return String(value);
}

function isNumericEdit(col: InvoiceColumn): boolean {
  if (!col.editTarget) return false;
  if (col.editTarget.kind === "master") return col.editTarget.field === "usdExchRt";
  return !col.editTarget.field; // party/cost: the amount unless a name field is targeted
}

const HEADER_ROW_H = 36;
const FILTER_ROW_H = 32;
const SUM_ROW_TOP = HEADER_ROW_H * 2 + FILTER_ROW_H;
const thBase = "sticky z-10 px-3 font-semibold whitespace-nowrap text-left text-[13px] text-gray-600 bg-gray-100";
const thSortable = `${thBase} group cursor-pointer select-none hover:bg-gray-200/70`;
// Opaque (= #ff4b4b at 15% on white): these cells are sticky, so rows scroll underneath them.
const thGroup = "sticky top-0 z-10 h-9 px-3 text-center text-[13px] font-semibold text-gray-700 bg-[#ffe4e4]";
const tdBase = "px-2.5 py-1.5 whitespace-nowrap text-[13px] text-gray-700";
const thSum = "sticky z-10 px-2.5 py-1.5 whitespace-nowrap text-left text-[13px] font-semibold text-gray-700 bg-gray-50";
const checkboxCls = "h-4 w-4 cursor-pointer rounded border-gray-300 accent-[#ff4b4b]";
// Toolbar buttons share one look: outlined, Font Awesome icon + label, brand colour on hover.
const toolbarBtnCls =
  "inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3.5 text-sm text-gray-600 hover:border-[#ff4b4b] hover:text-[#ff4b4b]";
// Unsaved-edit indicator — always an inline dot placed right before the value, never
// absolutely positioned, so it can never sit on top of other content (e.g. a delete button)
// regardless of which cell it appears in.
const pendingDot = <span className="mr-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400 align-middle" />;
// Header cells get a solid grid; body cells get a lighter dotted grid — both drawn as
// right+bottom borders only (not left/top), so adjacent cells don't double up the line, and
// no outer frame appears around the first column / top edge.
const thBorder = { borderRight: "1px solid #9ca3af", borderBottom: "1px solid #9ca3af" };
const tdBorder = { borderRight: "1px dotted #9ca3af", borderBottom: "1px dotted #9ca3af" };
// Inline-edit inputs must render at the exact same box size as the display text they replace —
// no border/padding/fixed-height of their own — otherwise the cell (and whole row) visibly
// jumps in height the moment you click into it.
const inlineEditCls = "w-full min-w-[60px] border-0 bg-transparent p-0 text-[13px] text-gray-800 outline-none";
const inlineEditShadow = { boxShadow: "inset 0 -2px 0 0 #ff4b4b" };
// The select is laid over the cell's (hidden) text instead of replacing it, so opening it never
// changes the column width or row height. Only the option list reads larger (15px).
const selectEditCls =
  "absolute inset-0 h-full w-full border-0 bg-transparent p-0 text-[13px] text-gray-800 outline-none cursor-pointer [&>option]:text-[15px]";

type EditingCell = { shpmId: number; colKey: string };
type SkuField = "skuCd" | "qty" | "unitPrc" | "amt";
type EditingSku = { shpmDtlId: number; field: SkuField };
type PendingCellEdit = { shpmId: number; editTarget: EditTarget; value: string | number | null };
type PendingSkuEdit = { shpmId: number; shpmDtlId: number; field: SkuField; value: string | number | null };

function formatSkuAmt(v: number | null): string {
  return v != null ? v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "";
}

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
const MANUAL_ENTRY = "__manual__";

export default function InvoiceTable({
  apiUrl,
  fileName,
  prdLineCd,
}: {
  apiUrl: string;
  fileName: string;
  prdLineCd: string;
}) {
  const [rows, setRows] = useState<InvoiceRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingSku, setEditingSku] = useState<EditingSku | null>(null);
  const [skuDraft, setSkuDraft] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [pendingCellEdits, setPendingCellEdits] = useState<Record<string, PendingCellEdit>>({});
  const [pendingSkuEdits, setPendingSkuEdits] = useState<Record<string, PendingSkuEdit>>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc" | null>(null);
  // Excel-style filters: the display values each column may show; a missing key = no filter.
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({});
  const [filterMenu, setFilterMenu] = useState<{ colKey: string; anchor: DOMRect } | null>(null);
  const closeFilterMenu = useCallback(() => setFilterMenu(null), []);
  // Dropdown values for the Shipper/Sender/Receiver/Buyer/Seller columns: whatever is already
  // stored in that same DB column (see getPartyOptions), keyed by optionKey(editTarget).
  const [partyOptions, setPartyOptions] = useState<Record<string, string[]>>({});
  // The select's "직접 입력" choice swaps the cell to a plain text input for a new name.
  const [manualEntry, setManualEntry] = useState(false);
  // Mirrors manualEntry synchronously: the select's blur can fire in the same tick it's swapped
  // out for the text input, before the state update is visible to that handler.
  const manualEntryRef = useRef(false);
  // "shpmId:colKey" / "shpmDtlId:field" of the editor that's open right now, updated
  // synchronously so a stale blur from an editor we already moved away from can be ignored.
  const editingKeyRef = useRef<string | null>(null);
  const editingSkuKeyRef = useRef<string | null>(null);
  // The draft each editor opened with — Ctrl+Z only undoes the table while it's unchanged.
  const draftStartRef = useRef("");
  const skuDraftStartRef = useRef("");
  const historyRef = useRef<{ cell: Record<string, PendingCellEdit>; sku: Record<string, PendingSkuEdit> }[]>([]);
  const undoRef = useRef<() => void>(() => {});
  const [uploadMenuOpen, setUploadMenuOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadPartyOptions = useCallback(() => {
    fetch("/api/invoice/options")
      .then((res) => (res.ok ? res.json() : { options: {} }))
      .then((data) => setPartyOptions(data.options ?? {}))
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadPartyOptions();
  }, [loadPartyOptions]);

  function toggleExpanded(shpmId: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(shpmId)) next.delete(shpmId);
      else next.add(shpmId);
      return next;
    });
  }

  const load = useCallback(() => {
    return fetch(apiUrl)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.message ?? "조회 실패");
        setRows(data.rows);
        setError(null);
      })
      .catch((err) => {
        setError(err.message ?? "조회 실패");
      });
  }, [apiUrl]);

  useEffect(() => {
    load();
  }, [load]);

  // Ctrl+Z with no editor focused undoes the last unsaved cell change. Inside filter inputs and
  // the like, the browser's own text undo is left alone.
  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.key.toLowerCase() !== "z") return;
      const t = e.target as HTMLElement | null;
      const isTextField = t instanceof HTMLInputElement ? t.type !== "checkbox" : t?.tagName === "TEXTAREA" || t?.tagName === "SELECT" || !!t?.isContentEditable;
      if (isTextField) return;
      e.preventDefault();
      undoRef.current();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function getEffectiveValue(col: InvoiceColumn, row: InvoiceRow): string | number | null {
    const pending = pendingCellEdits[`${row.shpmId}:${col.key}`];
    return pending ? pending.value : col.getValue(row);
  }

  function getEffectiveSkuValue(sku: InvoiceSku, field: SkuField): string | number | null {
    const pending = pendingSkuEdits[`${sku.shpmDtlId}:${field}`];
    if (pending) return pending.value;
    return field === "skuCd" ? sku.skuCd : field === "qty" ? sku.qty : field === "unitPrc" ? sku.unitPrc : sku.amt;
  }

  // Snapshot of both pending maps before each change, for Ctrl+Z. Cleared on save / row delete,
  // since restoring edits for rows that no longer exist (or were already saved) would be wrong.
  function recordHistory() {
    historyRef.current.push({ cell: pendingCellEdits, sku: pendingSkuEdits });
    if (historyRef.current.length > 100) historyRef.current.shift();
  }

  function undo() {
    const prev = historyRef.current.pop();
    if (!prev) return;
    cancelEdit();
    cancelEditSku();
    setPendingCellEdits(prev.cell);
    setPendingSkuEdits(prev.sku);
  }
  useEffect(() => {
    undoRef.current = undo;
  });

  // Ctrl+Z inside an editor undoes the table only when nothing has been typed in it yet —
  // otherwise the browser's own text undo applies.
  function isTableUndo(e: KeyboardEvent<HTMLInputElement | HTMLSelectElement>, untouched: boolean) {
    return (e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z" && untouched;
  }

  function startEdit(col: InvoiceColumn, row: InvoiceRow) {
    if (!col.editTarget) return;
    manualEntryRef.current = false;
    setManualEntry(false);
    editingKeyRef.current = `${row.shpmId}:${col.key}`;
    setEditingCell({ shpmId: row.shpmId, colKey: col.key });
    const raw = getEffectiveValue(col, row);
    // Dates open as yyyy-mm-dd; a malformed stored value opens as-is so it can be fixed in place.
    const initial = raw == null ? "" : col.format === "date" ? formatCell(col, raw) : String(raw);
    draftStartRef.current = initial;
    setDraft(initial);
  }

  function cancelEdit() {
    editingKeyRef.current = null;
    setEditingCell(null);
  }

  // `picked` is passed by the dropdown, which commits on change rather than on blur.
  function commitEdit(col: InvoiceColumn, row: InvoiceRow, picked?: string) {
    const target = col.editTarget;
    // A blur that arrives after Tab/Enter/arrows already committed and moved on (or after Esc
    // cancelled) belongs to an editor that's gone — ignore it.
    if (editingKeyRef.current !== `${row.shpmId}:${col.key}`) return;
    cancelEdit();
    if (!target) return;

    let value: string | number | null;
    if (picked !== undefined) {
      value = picked === "" ? null : picked;
    } else if (col.format === "date") {
      // "2024-01-05" → "20240105"; anything else is kept as typed and flagged by isInvalidDate.
      value = draft.trim() ? draft.trim().replaceAll("-", "") : null;
    } else if (isNumericEdit(col)) {
      if (draft !== "" && isNaN(Number(draft))) return; // half-typed like "-" → keep the old value
      value = draft === "" ? null : Number(draft);
    } else {
      value = draft === "" ? null : draft;
    }

    const key = `${row.shpmId}:${col.key}`;
    // Back to the original value → drop the pending edit instead of marking it changed.
    if (sameValue(value, col.getValue(row))) {
      if (!(key in pendingCellEdits)) return;
      recordHistory();
      const next = { ...pendingCellEdits };
      delete next[key];
      setPendingCellEdits(next);
      return;
    }
    if (key in pendingCellEdits && sameValue(pendingCellEdits[key].value, value)) return;
    recordHistory();
    setPendingCellEdits({ ...pendingCellEdits, [key]: { shpmId: row.shpmId, editTarget: target, value } });
  }

  // Spreadsheet-style navigation between editable cells. Tab / Shift+Tab ("next"/"prev") wrap to
  // the neighbouring row at the ends; arrow keys stop at the table edge.
  function moveEdit(col: InvoiceColumn, row: InvoiceRow, dir: MoveDir) {
    if (!pagedRows) return;
    const editable = allColumns.filter((c) => c.editTarget);
    let ci = editable.findIndex((c) => c.key === col.key);
    let ri = pagedRows.findIndex((r) => r.shpmId === row.shpmId);
    if (ci < 0 || ri < 0) return;
    if (dir === "up") ri--;
    else if (dir === "down") ri++;
    else ci += dir === "prev" || dir === "left" ? -1 : 1;
    if (ci >= editable.length || ci < 0) {
      if (dir !== "next" && dir !== "prev") return;
      ci = ci < 0 ? editable.length - 1 : 0;
      ri += dir === "prev" ? -1 : 1;
    }
    if (ri < 0 || ri >= pagedRows.length) return;
    startEdit(editable[ci], pagedRows[ri]);
  }

  async function handleAddRow() {
    // (HBL_NO, MBL_NO, CONT_NO) has a UNIQUE constraint in the DB, and SQL Server treats
    // NULL as equal to NULL there — so a blank container would collide after the first new
    // row. Seed it with a throwaway unique placeholder the user overwrites via double-click.
    const blank = {
      suplFactNm: null, sttsNm: null, loadType: null, hblNo: null, mblNo: null,
      contNo: `NEW-${Date.now()}`,
      poNo: null, subpoNo: null, podNm: null, etd: null, eta: null, wrhsArrvDe: null,
      usdExchRt: null, invNo: null, invDe: null, currCd: "USD", rmrk: null,
    };
    setSaving(true);
    try {
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(blank),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.message ?? "추가에 실패했습니다.");
        return;
      }
      await load();
    } finally {
      setSaving(false);
    }
  }

  function clearPendingForShpmIds(ids: Set<number>) {
    historyRef.current = [];
    setPendingCellEdits((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) if (ids.has(next[key].shpmId)) delete next[key];
      return next;
    });
    setPendingSkuEdits((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) if (ids.has(next[key].shpmId)) delete next[key];
      return next;
    });
  }

  function toggleSelect(shpmId: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(shpmId)) next.delete(shpmId);
      else next.add(shpmId);
      return next;
    });
  }

  function toggleSelectAll(pageIds: number[]) {
    setSelectedIds((prev) => {
      const allOnPage = pageIds.length > 0 && pageIds.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allOnPage) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) {
      alert("삭제할 항목을 선택하세요.");
      return;
    }
    if (!confirm(`선택한 ${selectedIds.size}건을 삭제할까요?`)) return;
    setSaving(true);
    try {
      await Promise.all(Array.from(selectedIds).map((id) => fetch(`${apiUrl}/${id}`, { method: "DELETE" })));
      clearPendingForShpmIds(selectedIds);
      setSelectedIds(new Set());
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveAll() {
    const cellEdits = Object.values(pendingCellEdits);
    const skuEdits = Object.values(pendingSkuEdits);
    if (cellEdits.length === 0 && skuEdits.length === 0) {
      alert("저장할 변경사항이 없습니다.");
      return;
    }
    const badDates = Object.entries(pendingCellEdits).filter(([key, e]) =>
      isInvalidDate(allColumns.find((c) => c.key === key.slice(key.indexOf(":") + 1)), e.value)
    );
    if (badDates.length > 0) {
      alert(`유효하지 않은 날짜 형식이 ${badDates.length}건 있습니다.\nyyyy-mm-dd 형식으로 수정한 뒤 다시 저장해 주세요.`);
      return;
    }
    setSaving(true);
    try {
      const cellReqs = cellEdits.map((e) => {
        const target = e.editTarget;
        const body =
          target.kind === "master"
            ? { kind: "master", field: target.field, value: e.value }
            : target.kind === "party"
              ? { kind: "party", invTpCd: target.invTpCd, field: target.field, value: e.value }
              : { kind: "cost", costTpCd: target.costTpCd, field: target.field, value: e.value };
        return fetch(`${apiUrl}/${e.shpmId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      });
      const skuReqs = skuEdits.map((e) =>
        fetch(`${apiUrl}/${e.shpmId}/sku/${e.shpmDtlId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ field: e.field, value: e.value }),
        })
      );
      const results = await Promise.all([...cellReqs, ...skuReqs]);
      const failed = results.filter((r) => !r.ok);
      if (failed.length > 0) alert(`${failed.length}건 저장에 실패했습니다.`);
      setPendingCellEdits({});
      setPendingSkuEdits({});
      historyRef.current = [];
      await load();
      loadPartyOptions(); // a newly typed name becomes a choice from now on
    } finally {
      setSaving(false);
    }
  }

  function openSkuEditor(shpmDtlId: number, field: SkuField, initial: string) {
    editingSkuKeyRef.current = `${shpmDtlId}:${field}`;
    setEditingSku({ shpmDtlId, field });
    skuDraftStartRef.current = initial;
    setSkuDraft(initial);
  }

  function startEditSku(sku: InvoiceSku, field: SkuField) {
    const raw = getEffectiveSkuValue(sku, field);
    openSkuEditor(sku.shpmDtlId, field, raw == null ? "" : String(raw));
  }

  function cancelEditSku() {
    editingSkuKeyRef.current = null;
    setEditingSku(null);
  }

  function commitEditSku(shpmId: number, shpmDtlId: number, field: SkuField) {
    const key = `${shpmDtlId}:${field}`;
    if (editingSkuKeyRef.current !== key) return; // stale blur, see commitEdit
    cancelEditSku();
    if (field !== "skuCd" && skuDraft !== "" && isNaN(Number(skuDraft))) return; // half-typed number
    const value: string | number | null = skuDraft === "" ? null : field === "skuCd" ? skuDraft : Number(skuDraft);
    const sku = rows?.find((r) => r.shpmId === shpmId)?.skuDetails.find((s) => s.shpmDtlId === shpmDtlId);
    const original = !sku ? undefined : field === "skuCd" ? sku.skuCd : field === "qty" ? sku.qty : field === "unitPrc" ? sku.unitPrc : sku.amt;
    if (original !== undefined && sameValue(value, original)) {
      if (!(key in pendingSkuEdits)) return;
      recordHistory();
      const next = { ...pendingSkuEdits };
      delete next[key];
      setPendingSkuEdits(next);
      return;
    }
    if (key in pendingSkuEdits && sameValue(pendingSkuEdits[key].value, value)) return;
    recordHistory();
    setPendingSkuEdits({ ...pendingSkuEdits, [key]: { shpmId, shpmDtlId, field, value } });
  }

  // Same navigation as moveEdit, within one shipment's SKU rows (SKU code / QTY / Amount columns).
  function moveEditSku(shpmId: number, shpmDtlId: number, field: SkuField, dir: MoveDir) {
    const skus = rows?.find((r) => r.shpmId === shpmId)?.skuDetails;
    if (!skus) return;
    const fields = allColumns.flatMap((c): SkuField[] =>
      c.skuField === "sku" ? ["skuCd"] : c.skuField === "qty" || c.skuField === "amt" ? [c.skuField] : []
    );
    let ci = fields.indexOf(field);
    let ri = skus.findIndex((s) => s.shpmDtlId === shpmDtlId);
    if (ci < 0 || ri < 0) return;
    if (dir === "up") ri--;
    else if (dir === "down") ri++;
    else ci += dir === "prev" || dir === "left" ? -1 : 1;
    if (ci >= fields.length || ci < 0) {
      if (dir !== "next" && dir !== "prev") return;
      ci = ci < 0 ? fields.length - 1 : 0;
      ri += dir === "prev" ? -1 : 1;
    }
    if (ri < 0 || ri >= skus.length) return;
    startEditSku(skus[ri], fields[ci]);
  }

  async function handleAddSku(shpmId: number) {
    setSaving(true);
    try {
      const res = await fetch(`${apiUrl}/${shpmId}/sku`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.message ?? "SKU 추가에 실패했습니다.");
        return;
      }
      await load();
      if (typeof data.shpmDtlId === "number") {
        openSkuEditor(data.shpmDtlId, "skuCd", "");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteSku(shpmId: number, sku: InvoiceSku) {
    if (!confirm(`SKU ${sku.skuCd} 항목을 삭제할까요?`)) return;
    const res = await fetch(`${apiUrl}/${shpmId}/sku/${sku.shpmDtlId}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.message ?? "삭제 실패");
      return;
    }
    historyRef.current = [];
    setPendingSkuEdits((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) if (next[key].shpmDtlId === sku.shpmDtlId) delete next[key];
      return next;
    });
    await load();
  }

  const sections = getInvoiceSections(prdLineCd);
  const allColumns = sections.flatMap((s) => s.columns);
  const totalCols = 1 + sections.reduce((sum, s) => sum + s.columns.length, 0); // +1 checkbox col

  // Frozen panes: the checkbox column plus the first `frozenCount` columns stay pinned while
  // scrolling sideways. The default is the leading ungrouped section (SHIPPER … USD); the pin
  // button on a column header moves the boundary, remembered per product line in this browser.
  // Column widths are content-sized, so each pinned column's `left` offset is measured from the
  // DOM (index 0 = checkbox, i + 1 = i-th frozen column).
  const frozenStorageKey = `invoiceFrozenCount:${prdLineCd}`;
  const [frozenSetting, setFrozenSetting] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const saved = window.localStorage.getItem(frozenStorageKey);
      return saved === null || Number.isNaN(Number(saved)) ? null : Number(saved);
    } catch {
      return null;
    }
  });
  const defaultFrozenCount = sections[0]?.groupLabel === null ? sections[0].columns.length : 0;
  const frozenCount = Math.min(frozenSetting ?? defaultFrozenCount, allColumns.length);
  const frozenCols = allColumns.slice(0, frozenCount);

  function setFrozenThrough(count: number) {
    setFrozenSetting(count);
    try {
      window.localStorage.setItem(frozenStorageKey, String(count));
    } catch {
      // storage unavailable — the choice just won't persist
    }
  }

  // Header row 1 cells: a grouped section is one cell spanning its columns; ungrouped columns
  // show their topLabel (or repeat their label) with equal neighbours ("실" over ETD/ETA) merged.
  // A cell never straddles the frozen boundary — it is split there so each half can be pinned
  // (or not) on its own.
  const topCells: { key: string; label: string; span: number; grouped: boolean; colKey: string }[] = [];
  {
    let idx = 0;
    for (const s of sections) {
      for (const c of s.columns) {
        const label = s.groupLabel ?? c.topLabel ?? c.label;
        const prev = topCells[topCells.length - 1];
        const sameRun = prev && prev.label === label && prev.grouped === (s.groupLabel !== null) && c !== s.columns[0];
        if (sameRun && idx !== frozenCount) prev.span++;
        else topCells.push({ key: c.key, label, span: 1, grouped: s.groupLabel !== null, colKey: c.key });
        idx++;
      }
    }
  }

  const frozenPos = new Map(frozenCols.map((c, i) => [c.key, i + 1]));
  const frozenCellRefs = useRef<(HTMLTableCellElement | null)[]>([]);
  const [frozenLeft, setFrozenLeft] = useState<number[]>([]);
  const tableReady = rows !== null;

  useLayoutEffect(() => {
    if (!tableReady) return;
    const cells = frozenCellRefs.current.slice(0, frozenCount + 1);
    const measure = () => {
      const lefts: number[] = [];
      let x = 0;
      for (const cell of cells) {
        lefts.push(x);
        x += cell?.getBoundingClientRect().width ?? 0;
      }
      setFrozenLeft((prev) => (prev.length === lefts.length && prev.every((v, i) => Math.abs(v - lefts[i]) < 0.5) ? prev : lefts));
    };
    measure();
    const observer = new ResizeObserver(measure);
    for (const cell of cells) if (cell) observer.observe(cell);
    return () => observer.disconnect();
  }, [tableReady, frozenCount]);

  // Column widths set by dragging a header's right edge (double-click resets to auto-fit);
  // remembered per product line in this browser.
  const widthsStorageKey = `invoiceColWidths:${prdLineCd}`;
  const [colWidths, setColWidths] = useState<Record<string, number>>(() => {
    if (typeof window === "undefined") return {};
    try {
      return JSON.parse(window.localStorage.getItem(widthsStorageKey) ?? "{}");
    } catch {
      return {};
    }
  });
  // True from mousedown on a resize handle until just after mouseup, so the click that ends a
  // drag doesn't also sort the column.
  const resizingRef = useRef(false);

  useEffect(() => {
    try {
      window.localStorage.setItem(widthsStorageKey, JSON.stringify(colWidths));
    } catch {
      // storage unavailable — widths just won't persist
    }
  }, [widthsStorageKey, colWidths]);

  function startResize(e: React.MouseEvent<HTMLElement>, colKey: string) {
    e.preventDefault();
    e.stopPropagation();
    const th = e.currentTarget.parentElement;
    if (!th) return;
    const startX = e.clientX;
    const startWidth = th.getBoundingClientRect().width;
    resizingRef.current = true;
    const onMove = (ev: MouseEvent) => {
      const width = Math.max(40, Math.round(startWidth + ev.clientX - startX));
      setColWidths((prev) => ({ ...prev, [colKey]: width }));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.classList.remove("cursor-col-resize");
      setTimeout(() => {
        resizingRef.current = false;
      }, 0);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    document.body.classList.add("cursor-col-resize");
  }

  function resetWidth(colKey: string) {
    setColWidths((prev) => {
      const next = { ...prev };
      delete next[colKey];
      return next;
    });
  }

  /** Per-column cell props: the user-set width (content is clipped to it), plus sticky-left
   *  positioning for a frozen cell (colKey null = the checkbox column). `bg` must be opaque so
   *  scrolled-under cells don't show through a frozen one. */
  function frozen(colKey: string | null, bg: string, zIndex = 5, span = 1): { cls: string; style: CSSProperties } {
    const width = colKey !== null && span === 1 ? colWidths[colKey] : undefined;
    const sized: CSSProperties = width
      ? { width, minWidth: width, maxWidth: width, overflow: "hidden", textOverflow: "ellipsis" }
      : {};
    const pos = colKey === null ? 0 : frozenPos.get(colKey);
    if (pos === undefined) return { cls: "", style: sized };
    const isEdge = pos + span - 1 === frozenCount;
    return {
      cls: `sticky ${bg}`,
      style: { ...sized, left: frozenLeft[pos] ?? 0, zIndex, ...(isEdge ? { borderRight: "2px solid #9ca3af" } : null) },
    };
  }
  const rowBg = "bg-white group-hover/row:bg-gray-50";
  const subRowBg = "bg-gray-50";
  const pendingCount = Object.keys(pendingCellEdits).length + Object.keys(pendingSkuEdits).length;
  const activeFilterCount = Object.keys(columnFilters).length;

  function handleSort(colKey: string) {
    if (sortKey !== colKey) {
      setSortKey(colKey);
      setSortDir("asc");
    } else if (sortDir === "asc") {
      setSortDir("desc");
    } else if (sortDir === "desc") {
      setSortKey(null);
      setSortDir(null);
    } else {
      setSortDir("asc");
    }
    setPage(1);
  }

  function sortIcon(colKey: string) {
    if (sortKey !== colKey) {
      return <i className="fa-solid fa-sort text-[10px] text-gray-300 opacity-0 transition-opacity group-hover:opacity-100" />;
    }
    if (sortDir === "asc") return <i className="fa-solid fa-sort-up text-[10px] text-[#ff4b4b]" />;
    if (sortDir === "desc") return <i className="fa-solid fa-sort-down text-[10px] text-[#ff4b4b]" />;
    return <i className="fa-solid fa-sort text-[10px] text-gray-300 opacity-0 transition-opacity group-hover:opacity-100" />;
  }

  const activeFilters = Object.entries(columnFilters).flatMap(([key, allowed]) => {
    const col = allColumns.find((c) => c.key === key);
    return col ? [{ key, col, allowed: new Set(allowed) }] : [];
  });

  // `exceptKey` skips one column's own filter, so its dropdown lists the values still reachable
  // under the other filters (as Excel does) while keeping its own unticked values listed.
  function passesFilters(r: InvoiceRow, exceptKey?: string) {
    return activeFilters.every(({ key, col, allowed }) => key === exceptKey || allowed.has(formatCell(col, getEffectiveValue(col, r))));
  }

  const filteredRows = rows?.filter((r) => passesFilters(r)) ?? null;

  function filterValues(col: InvoiceColumn): string[] {
    const set = new Set<string>();
    for (const r of rows ?? []) if (passesFilters(r, col.key)) set.add(formatCell(col, getEffectiveValue(col, r)));
    const numeric = col.align === "right" && col.format !== "date";
    return [...set].sort((a, b) => {
      if (!a || !b) return a ? -1 : b ? 1 : 0; // blanks last
      return numeric ? Number(a.replaceAll(",", "")) - Number(b.replaceAll(",", "")) : a.localeCompare(b, "ko", { numeric: true });
    });
  }

  const sortedRows = filteredRows
    ? [...filteredRows].sort((a, b) => {
        if (!sortKey || !sortDir) return 0;
        const col = allColumns.find((c) => c.key === sortKey);
        if (!col) return 0;
        const va = getEffectiveValue(col, a);
        const vb = getEffectiveValue(col, b);
        if (va == null && vb == null) return 0;
        if (va == null) return sortDir === "asc" ? -1 : 1;
        if (vb == null) return sortDir === "asc" ? 1 : -1;
        if (typeof va === "number" && typeof vb === "number") return sortDir === "asc" ? va - vb : vb - va;
        const sa = String(va);
        const sb = String(vb);
        return sortDir === "asc" ? sa.localeCompare(sb) : sb.localeCompare(sa);
      })
    : null;

  const totalPages = sortedRows ? Math.max(1, Math.ceil(sortedRows.length / pageSize)) : 1;
  // `page` can outlive the rows it pointed at (a delete or filter shrinks the list), so clamp it
  // while rendering instead of correcting the state afterwards.
  const currentPage = Math.min(page, totalPages);
  const pagedRows = sortedRows ? sortedRows.slice((currentPage - 1) * pageSize, currentPage * pageSize) : null;
  const pageIds = pagedRows?.map((r) => r.shpmId) ?? [];
  const allSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));

  // Subtotal covers every filtered/sorted row (not just the current page) — QTY/Amount columns
  // only; date columns are also right-aligned but obviously aren't summable.
  function sumColumn(col: InvoiceColumn): number {
    if (col.align !== "right" || col.format === "date") return 0;
    return (sortedRows ?? []).reduce((sum, r) => {
      const v = getEffectiveValue(col, r);
      return sum + (typeof v === "number" ? v : 0);
    }, 0);
  }

  // The download and the blank template share one layout, so a downloaded file can be edited
  // and uploaded back as-is.
  async function saveWorkbook(dataRows: InvoiceRow[], name: string) {
    const buffer = await buildInvoiceWorkbook(prdLineCd, dataRows);
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Ticked rows only; nothing ticked = every row the filters leave, in the on-screen order.
  async function handleDownload() {
    if (!rows || !sortedRows) return;
    const picked = rows.filter((r) => selectedIds.has(r.shpmId));
    await saveWorkbook(picked.length > 0 ? picked : sortedRows, fileName);
  }

  async function handleTemplateDownload() {
    setUploadMenuOpen(false);
    await saveWorkbook([], `${fileName}_template`);
  }

  async function handleUploadFile(file: File) {
    setSaving(true);
    try {
      let uploadRows;
      try {
        uploadRows = await parseInvoiceWorkbook(prdLineCd, await file.arrayBuffer());
      } catch (err) {
        alert(err instanceof Error ? err.message : "파일을 읽을 수 없습니다.");
        return;
      }
      if (uploadRows.length === 0) {
        alert("업로드할 데이터가 없습니다.");
        return;
      }
      if (!confirm(`${uploadRows.length}건을 업로드할까요?\n이미 있는 컨테이너는 수정되고, 없는 컨테이너는 새로 추가됩니다. (빈 칸은 기존 값을 유지합니다)`)) return;

      const res = await fetch(`${apiUrl}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: uploadRows }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errors: string[] = Array.isArray(data.errors) ? data.errors : [];
        const shown = errors.slice(0, 10).join("\n");
        const more = errors.length > 10 ? `\n… 외 ${errors.length - 10}건` : "";
        alert(`${data.message ?? "업로드에 실패했습니다."}${shown ? `\n\n${shown}${more}` : ""}`);
        return;
      }
      alert(`업로드 완료: 추가 ${data.inserted}건, 수정 ${data.updated}건`);
      await load();
      loadPartyOptions();
    } finally {
      setSaving(false);
    }
  }

  function renderCell(col: InvoiceColumn, row: InvoiceRow) {
    const isEditing = editingCell?.shpmId === row.shpmId && editingCell?.colKey === col.key;
    const isPending = `${row.shpmId}:${col.key}` in pendingCellEdits;
    const cellCls = `${tdBase} ${col.align === "right" ? "text-right" : ""} ${col.editTarget ? "cursor-pointer hover:bg-gray-50" : ""}`;
    const fz = frozen(col.key, rowBg);

    if (isEditing && col.select === "used" && col.editTarget && !manualEntry) {
      const opts = partyOptions[optionKey(col.editTarget)] ?? [];
      // Keep the current value selectable even if it's no longer used anywhere else.
      const hasCurrent = !draft || opts.includes(draft);
      return (
        <td key={col.key} className={`${tdBase} ${fz.cls}`} style={{ ...tdBorder, ...fz.style, ...inlineEditShadow }}>
          <div className="relative min-h-[1lh]">
          <span className="invisible">
            {isPending && pendingDot}
            {formatCell(col, getEffectiveValue(col, row))}
          </span>
          <select
            autoFocus
            value={draft}
            onChange={(e) => {
              if (e.target.value === MANUAL_ENTRY) {
                manualEntryRef.current = true;
                setManualEntry(true);
                setDraft("");
              } else {
                commitEdit(col, row, e.target.value);
              }
            }}
            onBlur={() => {
              if (!manualEntryRef.current && editingKeyRef.current === `${row.shpmId}:${col.key}`) cancelEdit();
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") cancelEdit();
              if (isTableUndo(e, true)) {
                e.preventDefault();
                undo();
                return;
              }
              if (e.key === "Delete" || e.key === "Backspace") {
                e.preventDefault();
                commitEdit(col, row, "");
                return;
              }
              // Arrows would otherwise change (and commit) the selected option; Alt+↓ still opens it.
              const dir = navDir(e);
              if (dir) {
                e.preventDefault();
                moveEdit(col, row, dir);
              }
            }}
            className={selectEditCls}
          >
            <option value="">(없음)</option>
            {!hasCurrent && <option value={draft}>{draft}</option>}
            {opts.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
            <option value={MANUAL_ENTRY}>직접 입력…</option>
          </select>
          </div>
        </td>
      );
    }

    if (isEditing) {
      return (
        <td key={col.key} className={`${tdBase} ${fz.cls}`} style={{ ...tdBorder, ...fz.style, ...inlineEditShadow }}>
          <input
            autoFocus
            // Plain text inputs throughout: dates are typed as yyyy-mm-dd (no picker), numbers are
            // filtered to numeric chars, and the caret stays readable for Left/Right navigation.
            type="text"
            inputMode={isNumericEdit(col) ? "decimal" : undefined}
            placeholder={col.format === "date" ? "yyyy-mm-dd" : undefined}
            value={draft}
            onChange={(e) => {
              if (!isNumericEdit(col) || NUMERIC_DRAFT.test(e.target.value)) setDraft(e.target.value);
            }}
            onFocus={selectAll}
            onBlur={() => commitEdit(col, row)}
            onKeyDown={(e) => {
              if (e.key === "Escape") cancelEdit();
              if (isTableUndo(e, draft === draftStartRef.current)) {
                e.preventDefault();
                undo();
                return;
              }
              const dir = navDir(e);
              if (dir) {
                e.preventDefault();
                commitEdit(col, row);
                moveEdit(col, row, dir);
              }
            }}
            className={`${inlineEditCls} ${col.align === "right" ? "text-right" : ""}`}
          />
        </td>
      );
    }

    const value = getEffectiveValue(col, row);
    const badDate = isInvalidDate(col, value);
    return (
      <td
        key={col.key}
        className={`${cellCls} ${fz.cls}`}
        style={{ ...tdBorder, ...fz.style, ...(badDate ? { backgroundColor: "#fee2e2" } : null) }}
        title={badDate ? "유효하지 않은 날짜 형식입니다 (yyyy-mm-dd)" : undefined}
        onClick={() => startEdit(col, row)}
      >
        {isPending && pendingDot}
        {formatCell(col, value)}
      </td>
    );
  }

  function skuInput(field: SkuField, shpmId: number, shpmDtlId: number, cls: string) {
    return (
      <input
        autoFocus
        type="text"
        inputMode={field === "skuCd" ? undefined : "decimal"}
        value={skuDraft}
        onChange={(e) => {
          if (field === "skuCd" || NUMERIC_DRAFT.test(e.target.value)) setSkuDraft(e.target.value);
        }}
        onFocus={selectAll}
        onBlur={() => commitEditSku(shpmId, shpmDtlId, field)}
        onKeyDown={(e) => {
          if (e.key === "Escape") cancelEditSku();
          if (isTableUndo(e, skuDraft === skuDraftStartRef.current)) {
            e.preventDefault();
            undo();
            return;
          }
          const dir = navDir(e);
          if (dir) {
            e.preventDefault();
            commitEditSku(shpmId, shpmDtlId, field);
            moveEditSku(shpmId, shpmDtlId, field, dir);
          }
        }}
        style={inlineEditShadow}
        className={cls}
      />
    );
  }

  function renderSkuCell(col: InvoiceColumn, sku: InvoiceSku, shpmId: number) {
    const fz = frozen(col.key, subRowBg);
    if (col.skuField === "sku") {
      const editingCode = editingSku?.shpmDtlId === sku.shpmDtlId && editingSku.field === "skuCd";
      const codePending = `${sku.shpmDtlId}:skuCd` in pendingSkuEdits;
      return (
        <td key={col.key} className={`${tdBase} ${fz.cls}`} style={{ ...tdBorder, ...fz.style }}>
          <div className="flex items-center justify-between gap-1.5">
            <span className="flex items-center">
              {codePending && pendingDot}
              {editingCode ? (
                skuInput("skuCd", shpmId, sku.shpmDtlId, inlineEditCls)
              ) : (
                <span className="cursor-pointer hover:text-[#ff4b4b]" onClick={() => startEditSku(sku, "skuCd")}>
                  {getEffectiveSkuValue(sku, "skuCd")}
                </span>
              )}
            </span>
            <button onClick={() => handleDeleteSku(shpmId, sku)} className="shrink-0 text-gray-300 hover:text-[#ff4b4b]" title="SKU 삭제">
              <i className="fa-solid fa-trash text-[10px]" />
            </button>
          </div>
        </td>
      );
    }

    if (col.skuField === "qty" || col.skuField === "amt") {
      const field = col.skuField;
      const isEditing = editingSku?.shpmDtlId === sku.shpmDtlId && editingSku.field === field;
      const isPending = `${sku.shpmDtlId}:${field}` in pendingSkuEdits;
      if (isEditing) {
        return (
          <td key={col.key} className={`${tdBase} ${fz.cls}`} style={{ ...tdBorder, ...fz.style, ...inlineEditShadow }}>
            {skuInput(field, shpmId, sku.shpmDtlId, `${inlineEditCls} text-right`)}
          </td>
        );
      }
      const value = getEffectiveSkuValue(sku, field);
      return (
        <td
          key={col.key}
          className={`${tdBase} cursor-pointer text-right hover:bg-gray-50 ${fz.cls}`}
          style={{ ...tdBorder, ...fz.style }}
          onClick={() => startEditSku(sku, field)}
        >
          {isPending && pendingDot}
          {value != null ? (field === "amt" ? formatSkuAmt(value as number) : String(value)) : ""}
        </td>
      );
    }

    return <td key={col.key} className={`${tdBase} ${col.align === "right" ? "text-right" : ""} ${fz.cls}`} style={{ ...tdBorder, ...fz.style }} />;
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-5 py-3.5">
        <p className="text-xs text-gray-400">
          {rows ? "셀을 클릭해 수정 · Enter/포커스 아웃 시 임시 반영 · 저장 버튼을 눌러야 서버에 반영됩니다" : error ? "" : "불러오는 중..."}
        </p>
        {rows && (
          <div className="flex items-center gap-2">
            {saving && <span className="text-xs text-gray-400">처리 중...</span>}
            {activeFilterCount > 0 && (
              <button onClick={() => setColumnFilters({})} className={toolbarBtnCls}>
                <i className="fa-solid fa-filter-circle-xmark text-xs" />
                필터 초기화 ({activeFilterCount})
              </button>
            )}
            <button onClick={handleSaveAll} className={toolbarBtnCls}>
              <i className="fa-solid fa-floppy-disk text-xs" />
              저장{pendingCount > 0 ? ` (${pendingCount})` : ""}
            </button>
            <button onClick={handleBulkDelete} className={toolbarBtnCls}>
              <i className="fa-solid fa-trash text-xs" />
              삭제{selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}
            </button>
            <button onClick={handleAddRow} className={toolbarBtnCls}>
              <i className="fa-solid fa-plus text-xs" />
              추가
            </button>
            <button onClick={handleDownload} className={toolbarBtnCls}>
              <i className="fa-solid fa-download text-xs" />
              {selectedIds.size > 0
                ? `선택 내려받기 (${selectedIds.size})`
                : activeFilterCount > 0
                  ? `필터 결과 내려받기 (${sortedRows?.length ?? 0})`
                  : "엑셀 내려받기"}
            </button>
            <div className="relative">
              <button onClick={() => setUploadMenuOpen((open) => !open)} className={toolbarBtnCls}>
                <i className="fa-solid fa-upload text-xs" />
                엑셀 업로드
              </button>
              {uploadMenuOpen && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setUploadMenuOpen(false)} />
                  <div className="absolute right-0 top-10 z-30 w-40 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                    <button
                      onClick={handleTemplateDownload}
                      className="block w-full px-3.5 py-2 text-left text-sm text-gray-600 hover:bg-[#fff5f5] hover:text-[#ff4b4b]"
                    >
                      <i className="fa-solid fa-file-arrow-down mr-2 text-xs" />
                      양식 다운받기
                    </button>
                    <button
                      onClick={() => {
                        setUploadMenuOpen(false);
                        fileInputRef.current?.click();
                      }}
                      className="block w-full px-3.5 py-2 text-left text-sm text-gray-600 hover:bg-[#fff5f5] hover:text-[#ff4b4b]"
                    >
                      <i className="fa-solid fa-file-arrow-up mr-2 text-xs" />
                      파일 업로드
                    </button>
                  </div>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = ""; // allow picking the same file again
                  if (file) handleUploadFile(file);
                }}
              />
            </div>
          </div>
        )}
      </div>

      {error && <p className="px-5 py-3 text-sm text-[#ff4b4b]">{error}</p>}

      {pagedRows && (
        <div className="hover-scroll overflow-auto px-2" style={{ maxHeight: "calc(100vh - 280px)" }}>
          <table style={{ borderCollapse: "separate", borderSpacing: 0, fontSize: "13px" }}>
            <thead>
              {/* Two header rows, like the source sheets. Row 1: group / top labels (see topCells).
                  Row 2: every column's own sortable label. */}
              <tr style={{ height: HEADER_ROW_H }}>
                <th
                  ref={(el) => {
                    frozenCellRefs.current[0] = el;
                  }}
                  className={thBase}
                  style={{ ...thBorder, top: 0, ...frozen(null, "", 20).style }}
                  rowSpan={3}
                >
                  <input type="checkbox" className={checkboxCls} checked={allSelected} onChange={() => toggleSelectAll(pageIds)} />
                </th>
                {topCells.map((t) => (
                  <th
                    key={t.key}
                    colSpan={t.span}
                    className={t.grouped ? thGroup : `${thBase} text-center`}
                    style={{ ...thBorder, top: 0, ...frozen(t.colKey, "", 20, t.span).style }}
                  >
                    {t.label}
                  </th>
                ))}
              </tr>
              <tr style={{ height: HEADER_ROW_H }}>
                {allColumns.map((c, ci) => (
                  <th
                    key={c.key}
                    className={`${thSortable} ${c.align === "right" ? "text-right" : ""}`}
                    style={{ ...thBorder, top: HEADER_ROW_H, ...frozen(c.key, "", 20).style }}
                    onClick={() => {
                      if (!resizingRef.current) handleSort(c.key);
                    }}
                  >
                    {/* Sort arrow leads the label; the freeze pin sits at the far right so the two
                        are never next to each other. */}
                    <div className="flex items-center gap-1">
                      {sortIcon(c.key)}
                      {c.label}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setFrozenThrough(ci + 1 === frozenCount ? 0 : ci + 1);
                        }}
                        className={`ml-auto pl-2 text-[10px] leading-none ${
                          ci + 1 === frozenCount ? "text-[#ff4b4b]" : "text-gray-300 opacity-0 transition-opacity hover:text-[#ff4b4b] group-hover:opacity-100"
                        }`}
                        title={ci + 1 === frozenCount ? "틀고정 해제" : "여기까지 틀고정"}
                      >
                        <i className="fa-solid fa-thumbtack" />
                      </button>
                    </div>
                    <span
                      onMouseDown={(e) => startResize(e, c.key)}
                      onClick={(e) => e.stopPropagation()}
                      onDoubleClick={() => resetWidth(c.key)}
                      className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-[#ff4b4b]/50"
                      title="드래그: 너비 조정 / 더블클릭: 자동 맞춤"
                    />
                  </th>
                ))}
              </tr>
              <tr style={{ height: FILTER_ROW_H }}>
                {allColumns.map((c) => (
                  <th
                    key={c.key}
                    ref={(el) => {
                      const pos = frozenPos.get(c.key);
                      if (pos !== undefined) frozenCellRefs.current[pos] = el;
                    }}
                    className={thBase}
                    style={{ ...thBorder, top: HEADER_ROW_H * 2, padding: "4px 8px", ...frozen(c.key, "", 20).style }}
                  >
                    <button
                      data-filter-anchor
                      onClick={(e) => {
                        e.stopPropagation();
                        const anchor = e.currentTarget.getBoundingClientRect();
                        setFilterMenu((prev) => (prev?.colKey === c.key ? null : { colKey: c.key, anchor }));
                      }}
                      className={`flex h-6 w-full min-w-[70px] items-center justify-between gap-1 rounded-md border px-1.5 text-[11px] font-normal outline-none ${
                        columnFilters[c.key]
                          ? "border-[#ff4b4b]/50 bg-[#ff4b4b]/5 text-[#ff4b4b]"
                          : "border-gray-200 bg-gray-50/70 text-gray-400 hover:border-gray-300"
                      }`}
                      title={columnFilters[c.key]?.map((v) => v || "(빈 셀)").join(", ")}
                    >
                      <span className="truncate">{columnFilters[c.key] ? `${columnFilters[c.key].length}개 선택` : "전체"}</span>
                      <i className={`fa-solid ${columnFilters[c.key] ? "fa-filter" : "fa-caret-down"} text-[9px]`} />
                    </button>
                  </th>
                ))}
              </tr>
              {/* Totals of the filtered rows, pinned under the filters so they stay in view. */}
              <tr>
                <th className={thSum} style={{ ...thBorder, top: SUM_ROW_TOP, ...frozen(null, "", 20).style }}>
                  합계
                </th>
                {allColumns.map((c) => (
                  <th
                    key={c.key}
                    className={`${thSum} ${c.align === "right" ? "text-right" : ""}`}
                    style={{ ...thBorder, top: SUM_ROW_TOP, ...frozen(c.key, "", 20).style }}
                  >
                    {c.align === "right" && c.format !== "date" ? formatCell(c, sumColumn(c)) : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pagedRows.map((r) => {
                const isExpanded = expanded.has(r.shpmId);
                return (
                  <Fragment key={r.shpmId}>
                    <tr className="group/row bg-white hover:bg-gray-50/70">
                      <td className={`${tdBase} ${frozen(null, rowBg).cls}`} style={{ ...tdBorder, ...frozen(null, rowBg).style }}>
                        <input type="checkbox" className={checkboxCls} checked={selectedIds.has(r.shpmId)} onChange={() => toggleSelect(r.shpmId)} />
                      </td>
                      {sections.map((s, si) => (
                        <Fragment key={si}>
                          {s.columns.map((c) =>
                            c.key === "cont" ? (
                              <td
                                key={c.key}
                                onClick={() => toggleExpanded(r.shpmId)}
                                onDoubleClick={() => startEdit({ ...c, editTarget: { kind: "master", field: "contNo" } }, r)}
                                className={`${tdBase} cursor-pointer font-medium text-[#ff4b4b] hover:bg-gray-50 ${frozen(c.key, rowBg).cls}`}
                                style={{ ...tdBorder, ...frozen(c.key, rowBg).style }}
                                title="클릭: SKU 상세 펼치기 / 더블클릭: 수정"
                              >
                                {`${r.shpmId}:${c.key}` in pendingCellEdits && pendingDot}
                                {editingCell?.shpmId === r.shpmId && editingCell?.colKey === c.key ? (
                                  <input
                                    autoFocus
                                    value={draft}
                                    onChange={(e) => setDraft(e.target.value)}
                                    onClick={(e) => e.stopPropagation()}
                                    onBlur={() => commitEdit({ ...c, editTarget: { kind: "master", field: "contNo" } }, r)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                                      if (e.key === "Escape") cancelEdit();
                                    }}
                                    style={inlineEditShadow}
                                    className={inlineEditCls}
                                  />
                                ) : (
                                  <>
                                    <i className={`fa-solid ${isExpanded ? "fa-chevron-down" : "fa-chevron-right"} mr-1.5 text-[9px] text-gray-400`} />
                                    {formatCell(c, getEffectiveValue(c, r))}
                                  </>
                                )}
                              </td>
                            ) : (
                              renderCell(c, r)
                            )
                          )}
                        </Fragment>
                      ))}
                    </tr>
                    {isExpanded &&
                      r.skuDetails.map((sku) => (
                        <tr key={sku.shpmDtlId} className="bg-gray-50/60">
                          <td className={`${tdBase} ${frozen(null, subRowBg).cls}`} style={{ ...tdBorder, ...frozen(null, subRowBg).style }} />
                          {sections.map((s, si) => (
                            <Fragment key={si}>{s.columns.map((c) => renderSkuCell(c, sku, r.shpmId))}</Fragment>
                          ))}
                        </tr>
                      ))}
                    {isExpanded && (
                      <tr className="bg-gray-50/60">
                        <td className={`${tdBase} ${frozen(null, subRowBg).cls}`} style={{ ...tdBorder, ...frozen(null, subRowBg).style }} />
                        <td colSpan={totalCols - 1} className={tdBase} style={tdBorder}>
                          <button
                            onClick={() => handleAddSku(r.shpmId)}
                            className="sticky text-xs text-gray-400 hover:text-[#ff4b4b]"
                            style={{ left: (frozenLeft[1] ?? 0) + 10 }}
                          >
                            <i className="fa-solid fa-plus mr-1 text-[10px]" />
                            SKU 추가
                          </button>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {rows && (
        <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3">
          <span className="text-sm text-gray-500">
            총 <span className="font-medium text-gray-800">{sortedRows?.length ?? 0}</span>건
            {activeFilterCount > 0 && <span className="text-gray-400"> (전체 {rows.length}건 중 필터링됨)</span>}
          </span>
          <div className="flex items-center gap-3">
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="h-8 rounded-lg border border-gray-200 px-2 text-sm text-gray-500 focus:border-[#ff4b4b] focus:outline-none"
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}개씩
                </option>
              ))}
            </select>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPage(Math.max(1, currentPage - 1))}
                disabled={currentPage <= 1}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <i className="fa-solid fa-chevron-left text-xs" />
              </button>
              <span className="min-w-[56px] rounded-lg bg-[#ff4b4b] px-3 py-1.5 text-center text-sm font-medium text-white">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage >= totalPages}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <i className="fa-solid fa-chevron-right text-xs" />
              </button>
            </div>
          </div>
        </div>
      )}

      {filterMenu &&
        (() => {
          const col = allColumns.find((c) => c.key === filterMenu.colKey);
          if (!col) return null;
          return (
            <ColumnFilterMenu
              key={col.key}
              anchor={filterMenu.anchor}
              values={filterValues(col)}
              selected={columnFilters[col.key] ?? null}
              onApply={(picked) => {
                setColumnFilters((prev) => {
                  const next = { ...prev };
                  if (picked) next[col.key] = picked;
                  else delete next[col.key];
                  return next;
                });
                setPage(1);
                setFilterMenu(null);
              }}
              onClose={closeFilterMenu}
            />
          );
        })()}
    </div>
  );
}
