"use client";

import { useCallback, useEffect, useState } from "react";

export type CrudOption = { value: string; label: string };

/**
 * width: fixed column width (e.g. "160px"); columns without one share the remaining space.
 * options: edit with a dropdown — either a fixed list, or loaded from a URL returning `{ rows }`
 * (e.g. a common-code group) mapped through valueKey/labelKey. Cells show the option's label.
 */
export type CrudColumn = {
  key: string;
  label: string;
  width?: string;
  options?: CrudOption[] | { url: string; valueKey: string; labelKey: string };
  /** Dropdown only: offer a blank "(없음)" choice (default true). */
  allowEmpty?: boolean;
};

type Row = Record<string, string | null>;

const thBase = "sticky top-0 z-10 px-3 py-2.5 font-semibold whitespace-nowrap text-left text-[13px] text-gray-600 bg-gray-100";
const tdBase = "px-3 py-2.5 whitespace-nowrap text-[13px] text-gray-700";
const checkboxCls = "h-4 w-4 cursor-pointer rounded border-gray-300 accent-[#ff4b4b]";
// Toolbar buttons share one look: outlined, Font Awesome icon + label, brand colour on hover.
const toolbarBtnCls =
  "inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3.5 text-sm text-gray-600 hover:border-[#ff4b4b] hover:text-[#ff4b4b]";
const thBorder = { borderRight: "1px solid #9ca3af", borderBottom: "1px solid #9ca3af" };
const tdBorder = { borderRight: "1px dotted #9ca3af", borderBottom: "1px dotted #9ca3af" };
const inlineEditCls = "w-full min-w-[60px] border-0 bg-transparent p-0 text-[13px] text-gray-800 outline-none";
const inlineEditShadow = { boxShadow: "inset 0 -2px 0 0 #ff4b4b" };
// Dropdowns read larger than the 13px grid text (the option list especially) — 15px, with a
// fixed line box so the row still doesn't change height while the select is open.
const selectEditCls =
  "w-full min-w-[150px] h-5 border-0 bg-transparent p-0 text-[15px] leading-5 text-gray-800 outline-none cursor-pointer [&>option]:text-[15px]";
const pendingDot = <span className="mr-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400 align-middle" />;

type EditingCell = { id: string; key: string };
type PendingEdit = { id: string; key: string; value: string };

// Small, flat master-data tables (warehouse list, company list, ...) don't need the grouped
// headers / SKU drill-down / sort-filter-paginate machinery InvoiceTable has — just inline
// batch-edit + add + bulk delete, styled the same way for visual consistency across the app.
export default function SimpleCrudTable({
  apiUrl,
  idField,
  columns,
}: {
  apiUrl: string;
  idField: string;
  columns: CrudColumn[];
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [draft, setDraft] = useState("");
  const [pendingEdits, setPendingEdits] = useState<Record<string, PendingEdit>>({});
  const [loadedOptions, setLoadedOptions] = useState<Record<string, CrudOption[]>>({});

  useEffect(() => {
    for (const c of columns) {
      const src = c.options;
      if (!src || Array.isArray(src)) continue;
      fetch(src.url)
        .then((res) => (res.ok ? res.json() : { rows: [] }))
        .then((data: { rows?: Record<string, string>[] }) =>
          setLoadedOptions((prev) => ({
            ...prev,
            [c.key]: (data.rows ?? []).map((r) => ({ value: r[src.valueKey], label: r[src.labelKey] || r[src.valueKey] })),
          }))
        )
        .catch(() => {});
    }
  }, [columns]);

  function optionsFor(c: CrudColumn): CrudOption[] | null {
    if (!c.options) return null;
    return Array.isArray(c.options) ? c.options : (loadedOptions[c.key] ?? []);
  }

  const load = useCallback(() => {
    return fetch(apiUrl)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.message ?? "조회 실패");
        setRows(data.rows);
        setError(null);
      })
      .catch((err) => setError(err.message ?? "조회 실패"));
  }, [apiUrl]);

  useEffect(() => {
    load();
  }, [load]);

  function getEffectiveValue(row: Row, key: string): string {
    const id = String(row[idField]);
    const pending = pendingEdits[`${id}:${key}`];
    return pending ? pending.value : (row[key] ?? "");
  }

  function startEdit(row: Row, key: string) {
    setEditingCell({ id: String(row[idField]), key });
    setDraft(getEffectiveValue(row, key));
  }

  // `picked` comes from a dropdown, which commits on change rather than on blur.
  function commitEdit(row: Row, picked?: string) {
    if (!editingCell) return;
    const { id, key } = editingCell;
    setEditingCell(null);
    setPendingEdits((prev) => ({ ...prev, [`${id}:${key}`]: { id, key, value: picked ?? draft } }));
  }

  async function handleAddRow() {
    // Keep this short — the smallest code column across these master tables (CM_CD) only
    // allows 12 chars, and a full millisecond timestamp blows past that.
    const tempCode = `NEW${Date.now().toString(36).slice(-6)}`;
    setSaving(true);
    try {
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [idField]: tempCode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.message ?? "추가에 실패했습니다.");
        return;
      }
      await load();
      setEditingCell({ id: tempCode, key: idField });
      setDraft("");
    } finally {
      setSaving(false);
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (!rows) return;
    setSelectedIds((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((r) => String(r[idField])))));
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) {
      alert("삭제할 항목을 선택하세요.");
      return;
    }
    if (!confirm(`선택한 ${selectedIds.size}건을 삭제할까요?\n다른 시스템(IHS)에서도 참조하는 마스터 데이터이니 신중히 확인하세요.`)) return;
    setSaving(true);
    try {
      const results = await Promise.all(
        Array.from(selectedIds).map((id) => fetch(`${apiUrl}/${encodeURIComponent(id)}`, { method: "DELETE" }))
      );
      const failed = results.filter((r) => !r.ok);
      if (failed.length > 0) alert(`${failed.length}건 삭제에 실패했습니다. 다른 데이터에서 참조 중일 수 있습니다.`);
      setSelectedIds(new Set());
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveAll() {
    const edits = Object.values(pendingEdits);
    if (edits.length === 0) {
      alert("저장할 변경사항이 없습니다.");
      return;
    }
    setSaving(true);
    try {
      const results = await Promise.all(
        edits.map((e) =>
          fetch(`${apiUrl}/${encodeURIComponent(e.id)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ field: e.key, value: e.value === "" ? null : e.value }),
          })
        )
      );
      const failed = results.filter((r) => !r.ok);
      if (failed.length > 0) alert(`${failed.length}건 저장에 실패했습니다.`);
      setPendingEdits({});
      await load();
    } finally {
      setSaving(false);
    }
  }

  const allSelected = rows != null && rows.length > 0 && selectedIds.size === rows.length;
  const pendingCount = Object.keys(pendingEdits).length;

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-5 py-3.5">
        <p className="text-xs text-gray-400">
          {rows ? "셀을 클릭해 수정 · Enter/포커스 아웃 시 임시 반영 · 저장 버튼을 눌러야 서버에 반영됩니다" : error ? "" : "불러오는 중..."}
        </p>
        {rows && (
          <div className="flex items-center gap-2">
            {saving && <span className="text-xs text-gray-400">처리 중...</span>}
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
          </div>
        )}
      </div>

      {error && <p className="px-5 py-3 text-sm text-[#ff4b4b]">{error}</p>}

      {rows && (
        <div className="hover-scroll overflow-auto px-2" style={{ maxHeight: "calc(100vh - 280px)" }}>
          <table className="w-full" style={{ borderCollapse: "separate", borderSpacing: 0, fontSize: "13px" }}>
            <thead>
              <tr>
                <th className={thBase} style={{ ...thBorder, width: "44px" }}>
                  <input type="checkbox" className={checkboxCls} checked={allSelected} onChange={toggleSelectAll} />
                </th>
                {columns.map((c) => (
                  <th key={c.key} className={thBase} style={{ ...thBorder, width: c.width }}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const id = String(row[idField]);
                return (
                  <tr key={id} className="bg-white hover:bg-gray-50/70">
                    <td className={tdBase} style={tdBorder}>
                      <input type="checkbox" className={checkboxCls} checked={selectedIds.has(id)} onChange={() => toggleSelect(id)} />
                    </td>
                    {columns.map((c) => {
                      const isEditing = editingCell?.id === id && editingCell?.key === c.key;
                      const isPending = `${id}:${c.key}` in pendingEdits;
                      const opts = optionsFor(c);
                      if (isEditing && opts) {
                        const known = !draft || opts.some((o) => o.value === draft);
                        return (
                          <td key={c.key} className={tdBase} style={{ ...tdBorder, ...inlineEditShadow }}>
                            <select
                              autoFocus
                              value={draft}
                              onChange={(e) => commitEdit(row, e.target.value)}
                              onBlur={() => setEditingCell(null)}
                              onKeyDown={(e) => {
                                if (e.key === "Escape") setEditingCell(null);
                              }}
                              className={selectEditCls}
                            >
                              {c.allowEmpty !== false && <option value="">(없음)</option>}
                              {!known && <option value={draft}>{draft}</option>}
                              {opts.map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                          </td>
                        );
                      }
                      if (isEditing) {
                        return (
                          <td key={c.key} className={tdBase} style={{ ...tdBorder, ...inlineEditShadow }}>
                            <input
                              autoFocus
                              value={draft}
                              onChange={(e) => setDraft(e.target.value)}
                              onBlur={() => commitEdit(row)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                                if (e.key === "Escape") setEditingCell(null);
                              }}
                              className={inlineEditCls}
                            />
                          </td>
                        );
                      }
                      return (
                        <td
                          key={c.key}
                          className={`${tdBase} cursor-pointer hover:bg-gray-50`}
                          style={tdBorder}
                          onClick={() => startEdit(row, c.key)}
                        >
                          {isPending && pendingDot}
                          {(() => {
                            const v = getEffectiveValue(row, c.key);
                            return opts?.find((o) => o.value === v)?.label ?? v;
                          })()}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td className={tdBase} style={tdBorder} colSpan={columns.length + 1}>
                    데이터가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {rows && (
        <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3">
          <span className="text-sm text-gray-500">
            총 <span className="font-medium text-gray-800">{rows.length}</span>건
          </span>
        </div>
      )}
    </div>
  );
}
