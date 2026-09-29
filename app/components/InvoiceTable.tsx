"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import ExcelJS from "exceljs";
import type { InvoiceRow, InvoiceSku } from "@/lib/invoice";
import { getInvoiceSections, optionKey, type EditTarget, type InvoiceColumn } from "@/lib/invoiceColumns";

function formatDate(v: string | null): string {
  if (!v || v.length !== 8) return "";
  return `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
}

function formatCell(col: InvoiceColumn, value: string | number | null): string {
  if (value == null || value === "") return "";
  if (col.format === "date") return formatDate(String(value));
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
const thBase = "sticky z-10 px-3 font-semibold whitespace-nowrap text-left text-[13px] text-gray-600 bg-gray-100";
const thSortable = `${thBase} group cursor-pointer select-none hover:bg-gray-200/70`;
const thGroup = "sticky top-0 z-10 h-9 px-3 text-center text-[13px] font-semibold text-gray-700 bg-[#ff4b4b]/15";
const tdBase = "px-3 py-2.5 whitespace-nowrap text-[13px] text-gray-700";
const checkboxCls = "h-4 w-4 cursor-pointer rounded border-gray-300 accent-[#ff4b4b]";
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
// Dropdowns read larger than the 13px grid text (the option list especially) — 15px, with a
// fixed line box so the row still doesn't change height while the select is open.
const selectEditCls =
  "w-full min-w-[150px] h-5 border-0 bg-transparent p-0 text-[15px] leading-5 text-gray-800 outline-none cursor-pointer [&>option]:text-[15px]";

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
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  // Dropdown values for the Shipper/Sender/Receiver/Buyer/Seller columns: whatever is already
  // stored in that same DB column (see getPartyOptions), keyed by optionKey(editTarget).
  const [partyOptions, setPartyOptions] = useState<Record<string, string[]>>({});
  // The select's "직접 입력" choice swaps the cell to a plain text input for a new name.
  const [manualEntry, setManualEntry] = useState(false);
  // Mirrors manualEntry synchronously: the select's blur can fire in the same tick it's swapped
  // out for the text input, before the state update is visible to that handler.
  const manualEntryRef = useRef(false);

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

  function getEffectiveValue(col: InvoiceColumn, row: InvoiceRow): string | number | null {
    const pending = pendingCellEdits[`${row.shpmId}:${col.key}`];
    return pending ? pending.value : col.getValue(row);
  }

  function getEffectiveSkuValue(sku: InvoiceSku, field: SkuField): string | number | null {
    const pending = pendingSkuEdits[`${sku.shpmDtlId}:${field}`];
    if (pending) return pending.value;
    return field === "skuCd" ? sku.skuCd : field === "qty" ? sku.qty : field === "unitPrc" ? sku.unitPrc : sku.amt;
  }

  function startEdit(col: InvoiceColumn, row: InvoiceRow) {
    if (!col.editTarget) return;
    manualEntryRef.current = false;
    setManualEntry(false);
    setEditingCell({ shpmId: row.shpmId, colKey: col.key });
    const raw = getEffectiveValue(col, row);
    setDraft(col.format === "date" ? formatDate(raw as string | null) : raw == null ? "" : String(raw));
  }

  // `picked` is passed by the dropdown, which commits on change rather than on blur.
  function commitEdit(col: InvoiceColumn, row: InvoiceRow, picked?: string) {
    const target = col.editTarget;
    setEditingCell(null);
    if (!target) return;

    let value: string | number | null;
    if (picked !== undefined) {
      value = picked === "" ? null : picked;
    } else if (col.format === "date") {
      value = draft ? draft.replaceAll("-", "") : null;
    } else if (isNumericEdit(col)) {
      value = draft === "" ? null : Number(draft);
    } else {
      value = draft === "" ? null : draft;
    }

    const key = `${row.shpmId}:${col.key}`;
    setPendingCellEdits((prev) => ({ ...prev, [key]: { shpmId: row.shpmId, editTarget: target, value } }));
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
      await load();
      loadPartyOptions(); // a newly typed name becomes a choice from now on
    } finally {
      setSaving(false);
    }
  }

  function startEditSku(sku: InvoiceSku, field: SkuField) {
    setEditingSku({ shpmDtlId: sku.shpmDtlId, field });
    const raw = getEffectiveSkuValue(sku, field);
    setSkuDraft(raw == null ? "" : String(raw));
  }

  function commitEditSku(shpmId: number, shpmDtlId: number, field: SkuField) {
    setEditingSku(null);
    const value: string | number | null = skuDraft === "" ? null : field === "skuCd" ? skuDraft : Number(skuDraft);
    const key = `${shpmDtlId}:${field}`;
    setPendingSkuEdits((prev) => ({ ...prev, [key]: { shpmId, shpmDtlId, field, value } }));
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
        setEditingSku({ shpmDtlId: data.shpmDtlId, field: "skuCd" });
        setSkuDraft("");
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
  const pendingCount = Object.keys(pendingCellEdits).length + Object.keys(pendingSkuEdits).length;
  const activeFilterCount = Object.values(columnFilters).filter((v) => v).length;

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

  const filteredRows =
    rows?.filter((r) =>
      Object.entries(columnFilters).every(([key, filterVal]) => {
        if (!filterVal) return true;
        const col = allColumns.find((c) => c.key === key);
        if (!col) return true;
        return formatCell(col, getEffectiveValue(col, r)).toLowerCase().includes(filterVal.toLowerCase());
      })
    ) ?? null;

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
  const pagedRows = sortedRows ? sortedRows.slice((page - 1) * pageSize, page * pageSize) : null;
  const pageIds = pagedRows?.map((r) => r.shpmId) ?? [];
  const allSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  // Subtotal covers every filtered/sorted row (not just the current page) — QTY/Amount columns
  // only; date columns are also right-aligned but obviously aren't summable.
  function sumColumn(col: InvoiceColumn): number {
    if (col.align !== "right" || col.format === "date") return 0;
    return (sortedRows ?? []).reduce((sum, r) => {
      const v = getEffectiveValue(col, r);
      return sum + (typeof v === "number" ? v : 0);
    }, 0);
  }

  async function handleDownload() {
    if (!rows) return;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Sheet1");

    sheet.addRow(sections.flatMap((s) => s.columns.map((c) => c.label)));
    sheet.getRow(1).font = { bold: true };

    for (const r of rows) {
      sheet.addRow(sections.flatMap((s) => s.columns.map((c) => formatCell(c, c.getValue(r)))));
    }
    sheet.columns.forEach((col) => { col.width = 16; });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileName}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function renderCell(col: InvoiceColumn, row: InvoiceRow) {
    const isEditing = editingCell?.shpmId === row.shpmId && editingCell?.colKey === col.key;
    const isPending = `${row.shpmId}:${col.key}` in pendingCellEdits;
    const cellCls = `${tdBase} ${col.align === "right" ? "text-right" : ""} ${col.editTarget ? "cursor-pointer hover:bg-gray-50" : ""}`;

    if (isEditing && col.select === "used" && col.editTarget && !manualEntry) {
      const opts = partyOptions[optionKey(col.editTarget)] ?? [];
      // Keep the current value selectable even if it's no longer used anywhere else.
      const hasCurrent = !draft || opts.includes(draft);
      return (
        <td key={col.key} className={tdBase} style={{ ...tdBorder, ...inlineEditShadow }}>
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
              if (!manualEntryRef.current) setEditingCell(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") setEditingCell(null);
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
            <option value={MANUAL_ENTRY}>✎ 직접 입력…</option>
          </select>
        </td>
      );
    }

    if (isEditing) {
      return (
        <td key={col.key} className={tdBase} style={{ ...tdBorder, ...inlineEditShadow }}>
          <input
            autoFocus
            type={col.format === "date" ? "date" : isNumericEdit(col) ? "number" : "text"}
            step={isNumericEdit(col) ? "0.01" : undefined}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => commitEdit(col, row)}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setEditingCell(null);
            }}
            className={`${inlineEditCls} ${col.align === "right" ? "text-right" : ""}`}
          />
        </td>
      );
    }

    return (
      <td key={col.key} className={cellCls} style={tdBorder} onClick={() => startEdit(col, row)}>
        {isPending && pendingDot}
        {formatCell(col, getEffectiveValue(col, row))}
      </td>
    );
  }

  function skuInput(field: SkuField, shpmId: number, shpmDtlId: number, cls: string) {
    return (
      <input
        autoFocus
        type={field === "skuCd" ? "text" : "number"}
        step={field === "skuCd" ? undefined : field === "qty" ? "1" : "0.01"}
        value={skuDraft}
        onChange={(e) => setSkuDraft(e.target.value)}
        onBlur={() => commitEditSku(shpmId, shpmDtlId, field)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") setEditingSku(null);
        }}
        style={inlineEditShadow}
        className={cls}
      />
    );
  }

  function renderSkuCell(col: InvoiceColumn, sku: InvoiceSku, shpmId: number) {
    if (col.skuField === "sku") {
      const editingCode = editingSku?.shpmDtlId === sku.shpmDtlId && editingSku.field === "skuCd";
      const codePending = `${sku.shpmDtlId}:skuCd` in pendingSkuEdits;
      return (
        <td key={col.key} className={tdBase} style={tdBorder}>
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
          <td key={col.key} className={tdBase} style={{ ...tdBorder, ...inlineEditShadow }}>
            {skuInput(field, shpmId, sku.shpmDtlId, `${inlineEditCls} text-right`)}
          </td>
        );
      }
      const value = getEffectiveSkuValue(sku, field);
      return (
        <td
          key={col.key}
          className={`${tdBase} cursor-pointer text-right hover:bg-gray-50`}
          style={tdBorder}
          onClick={() => startEditSku(sku, field)}
        >
          {isPending && pendingDot}
          {value != null ? (field === "amt" ? formatSkuAmt(value as number) : String(value)) : ""}
        </td>
      );
    }

    return <td key={col.key} className={`${tdBase} ${col.align === "right" ? "text-right" : ""}`} style={tdBorder} />;
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
              <button
                onClick={() => setColumnFilters({})}
                className="h-9 rounded-lg border border-gray-200 bg-white px-3.5 text-sm text-gray-500 hover:border-[#ff4b4b] hover:text-[#ff4b4b]"
              >
                필터 초기화 ({activeFilterCount})
              </button>
            )}
            <button
              onClick={handleSaveAll}
              className="h-9 rounded-lg border border-[#ff4b4b] bg-white px-3.5 text-sm font-medium text-[#ff4b4b] hover:bg-[#fff5f5]"
            >
              저장{pendingCount > 0 ? ` (${pendingCount})` : ""}
            </button>
            <button
              onClick={handleBulkDelete}
              className="h-9 rounded-lg bg-[#ff4b4b] px-3.5 text-sm font-medium text-white hover:bg-[#e03e3e]"
            >
              삭제{selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}
            </button>
            <button
              onClick={handleAddRow}
              className="h-9 rounded-lg bg-[#ff4b4b] px-3.5 text-sm font-medium text-white hover:bg-[#e03e3e]"
            >
              + 추가
            </button>
            <button
              onClick={handleDownload}
              className="h-9 rounded-lg border border-gray-200 bg-white px-3.5 text-sm text-gray-500 hover:border-[#ff4b4b] hover:text-[#ff4b4b]"
            >
              ⬇️ Download
            </button>
          </div>
        )}
      </div>

      {error && <p className="px-5 py-3 text-sm text-[#ff4b4b]">{error}</p>}

      {pagedRows && (
        <div className="hover-scroll overflow-auto px-2" style={{ maxHeight: "calc(100vh - 280px)" }}>
          <table style={{ borderCollapse: "separate", borderSpacing: 0, fontSize: "13px" }}>
            <thead>
              {/* Row 1: ungrouped columns get their one header cell here (rowSpan=2); grouped
                  sections show their group label here, spanning their sub-columns. Both <tr>s get
                  an explicit height so the rowSpan cell's total height always matches exactly. */}
              <tr style={{ height: HEADER_ROW_H }}>
                <th className={thBase} style={{ ...thBorder, top: 0 }} rowSpan={3}>
                  <input type="checkbox" className={checkboxCls} checked={allSelected} onChange={() => toggleSelectAll(pageIds)} />
                </th>
                {sections.map((s, si) =>
                  s.groupLabel === null ? (
                    s.columns.map((c) => (
                      <th key={c.key} className={thSortable} style={{ ...thBorder, top: 0 }} rowSpan={2} onClick={() => handleSort(c.key)}>
                        <span className="inline-flex items-center gap-1">
                          {c.label}
                          {sortIcon(c.key)}
                        </span>
                      </th>
                    ))
                  ) : (
                    <th key={`grp-${si}`} colSpan={s.columns.length} className={thGroup} style={thBorder}>
                      {s.groupLabel}
                    </th>
                  )
                )}
              </tr>
              <tr style={{ height: HEADER_ROW_H }}>
                {sections.map((s, si) =>
                  s.groupLabel === null ? null : (
                    <Fragment key={`sub-${si}`}>
                      {s.columns.map((c) => (
                        <th
                          key={c.key}
                          className={`${thSortable} ${c.align === "right" ? "text-right" : ""}`}
                          style={{ ...thBorder, top: HEADER_ROW_H }}
                          onClick={() => handleSort(c.key)}
                        >
                          <span className="inline-flex items-center gap-1">
                            {c.label}
                            {sortIcon(c.key)}
                          </span>
                        </th>
                      ))}
                    </Fragment>
                  )
                )}
              </tr>
              <tr style={{ height: FILTER_ROW_H }}>
                {allColumns.map((c) => (
                  <th key={c.key} className={thBase} style={{ ...thBorder, top: HEADER_ROW_H * 2, padding: "4px 8px" }}>
                    <input
                      value={columnFilters[c.key] ?? ""}
                      onChange={(e) => {
                        setColumnFilters((prev) => ({ ...prev, [c.key]: e.target.value }));
                        setPage(1);
                      }}
                      placeholder="필터"
                      className="h-6 w-full min-w-[70px] rounded-md border border-gray-200 bg-gray-50/70 px-1.5 text-[11px] font-normal text-gray-500 outline-none focus:border-[#ff4b4b] focus:bg-white"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pagedRows.map((r) => {
                const isExpanded = expanded.has(r.shpmId);
                return (
                  <Fragment key={r.shpmId}>
                    <tr className="bg-white hover:bg-gray-50/70">
                      <td className={tdBase} style={tdBorder}>
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
                                className={`${tdBase} cursor-pointer font-medium text-[#ff4b4b] hover:bg-gray-50`}
                                style={tdBorder}
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
                                      if (e.key === "Escape") setEditingCell(null);
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
                          <td className={tdBase} style={tdBorder} />
                          {sections.map((s, si) => (
                            <Fragment key={si}>{s.columns.map((c) => renderSkuCell(c, sku, r.shpmId))}</Fragment>
                          ))}
                        </tr>
                      ))}
                    {isExpanded && (
                      <tr className="bg-gray-50/60">
                        <td className={tdBase} style={tdBorder} />
                        <td colSpan={totalCols - 1} className={tdBase} style={tdBorder}>
                          <button onClick={() => handleAddSku(r.shpmId)} className="text-xs text-gray-400 hover:text-[#ff4b4b]">
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
            <tfoot>
              <tr className="sticky bottom-0 z-10 border-t-2 border-gray-200 bg-gray-50/95 font-semibold text-gray-700">
                <td className={tdBase} style={tdBorder}>
                  합계
                </td>
                {allColumns.map((c) => (
                  <td key={c.key} className={`${tdBase} ${c.align === "right" ? "text-right" : ""}`} style={tdBorder}>
                    {c.align === "right" && c.format !== "date" ? formatCell(c, sumColumn(c)) : ""}
                  </td>
                ))}
              </tr>
            </tfoot>
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
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <i className="fa-solid fa-chevron-left text-xs" />
              </button>
              <span className="min-w-[56px] rounded-lg bg-[#ff4b4b] px-3 py-1.5 text-center text-sm font-medium text-white">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <i className="fa-solid fa-chevron-right text-xs" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
