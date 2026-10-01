"use client";

import { useEffect, useState } from "react";
import type { InvoiceColumn, InvoiceSection } from "@/lib/invoiceColumns";
import { logTargetOf, type ChangeLogEntry } from "@/lib/invoiceFields";

const SKU_LABELS: Record<string, string> = { SKU_CD: "SKU 코드", QTY: "SKU QTY", AMT: "SKU Amount", UNIT_PRC: "SKU 단가" };

function targetId(tbl: string, key: string, col: string) {
  return `${tbl}|${key}|${col}`;
}

function formatValue(col: InvoiceColumn | undefined, v: string | null): string {
  if (v == null) return "";
  if (col?.format === "date" && /^\d{8}$/.test(v)) return `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
  if (col?.align === "right" && col.label !== "QTY" && v !== "" && !isNaN(Number(v))) {
    return Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  }
  return v;
}

type Group = { saveId: string; savedAt: string; usr: string; srcCd: string; entries: ChangeLogEntry[] };

/** Change history of one table row (latest 1000 changed values), grouped per save / upload. */
export default function ChangeLogModal({
  apiUrl,
  sections,
  shpmId,
  contNo,
  lastSaveId,
  onClose,
}: {
  apiUrl: string;
  sections: InvoiceSection[];
  shpmId: number;
  contNo: string | null;
  /** The save currently highlighted on the table, to mark it in the list. */
  lastSaveId: string | null;
  onClose: () => void;
}) {
  const [entries, setEntries] = useState<ChangeLogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch(`${apiUrl}/changes?limit=1000&shpmId=${shpmId}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message ?? "변경 이력 조회에 실패했습니다.");
        setEntries(data.entries);
      })
      .catch((err) => setError(err.message));
  }, [apiUrl, shpmId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Which on-screen column a log row belongs to, for its label and value formatting.
  const columnsByTarget = new Map<string, { col: InvoiceColumn; label: string }>();
  for (const s of sections) {
    for (const col of s.columns) {
      const t = col.editTarget ? logTargetOf(col.editTarget) : col.skuField === "sku" ? logTargetOf({ kind: "master", field: "contNo" }) : null;
      if (!t) continue;
      const id = targetId(t.tbl, t.key, t.col);
      if (!columnsByTarget.has(id)) columnsByTarget.set(id, { col, label: s.groupLabel ? `${s.groupLabel.trim()} › ${col.label}` : col.label });
    }
  }
  function describe(e: ChangeLogEntry): { label: string; col?: InvoiceColumn } {
    if (e.tbl === "SHPM_DTL") return { label: `${SKU_LABELS[e.col] ?? e.col}${e.skuCd ? ` (${e.skuCd})` : ""}` };
    const hit = columnsByTarget.get(targetId(e.tbl, e.key, e.col));
    return hit ?? { label: [e.key, e.col].filter(Boolean).join(" ") };
  }

  const q = search.trim().toLowerCase();
  const groups: Group[] = [];
  for (const e of entries ?? []) {
    const { label, col } = describe(e);
    if (q) {
      const hay = [e.usrNm, e.usrId, label, formatValue(col, e.bfrVal), formatValue(col, e.aftVal)].join(" ").toLowerCase();
      if (!hay.includes(q)) continue;
    }
    let g = groups[groups.length - 1];
    if (!g || g.saveId !== e.saveId) {
      g = { saveId: e.saveId, savedAt: e.savedAt, usr: e.usrNm ?? e.usrId, srcCd: e.srcCd, entries: [] };
      groups.push(g);
    }
    g.entries.push(e);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onMouseDown={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-5xl flex-col rounded-xl bg-white shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-3.5">
          <h2 className="text-sm font-semibold text-gray-800">변경 이력{contNo ? ` · ${contNo}` : ""}</h2>
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="사용자, 항목, 값 검색"
              className="h-8 w-64 rounded-lg border border-gray-200 px-2.5 text-xs outline-none focus:border-[#ff4b4b]"
            />
            <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600" title="닫기">
              <i className="fa-solid fa-xmark" />
            </button>
          </div>
        </div>

        <div className="overflow-auto px-5 py-3">
          {error && <p className="py-6 text-center text-sm text-[#ff4b4b]">{error}</p>}
          {!error && entries === null && <p className="py-6 text-center text-sm text-gray-400">불러오는 중...</p>}
          {entries && groups.length === 0 && (
            <p className="py-6 text-center text-sm text-gray-400">{q ? "검색 결과가 없습니다." : "아직 변경 이력이 없습니다."}</p>
          )}
          {groups.length > 0 && (
            <table className="w-full text-[12px]" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
              <thead>
                <tr className="text-left text-gray-500">
                  {["항목", "기존 값", "변경 값"].map((h) => (
                    <th key={h} className="sticky top-0 z-10 border-b border-gray-200 bg-white px-2.5 py-2 font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.map((g, gi) => (
                  <GroupRows key={`${g.saveId}-${gi}`} group={g} describe={describe} isLatest={g.saveId === lastSaveId} />
                ))}
              </tbody>
            </table>
          )}
          {entries && entries.length >= 1000 && <p className="pt-3 text-center text-[11px] text-gray-400">최근 1000건까지 표시합니다.</p>}
        </div>
      </div>
    </div>
  );
}

function GroupRows({
  group,
  describe,
  isLatest,
}: {
  group: Group;
  describe: (e: ChangeLogEntry) => { label: string; col?: InvoiceColumn };
  isLatest: boolean;
}) {
  return (
    <>
      <tr>
        <td colSpan={3} className="border-b border-gray-100 bg-gray-50 px-2.5 py-1.5 font-medium text-gray-600">
          {group.savedAt} · {group.usr} · {group.srcCd === "EXCEL" ? "엑셀 업로드" : "저장"} · {group.entries.length}건
          {isLatest && <span className="ml-2 rounded bg-[#fef9c3] px-1.5 py-0.5 text-[10px] text-yellow-700">화면에 표시 중</span>}
        </td>
      </tr>
      {group.entries.map((e) => {
        const { label, col } = describe(e);
        return (
          <tr key={e.logId} className="hover:bg-gray-50/70">
            <td className="border-b border-gray-50 px-2.5 py-1.5 text-gray-700">
              {label}
              {e.chgTpCd === "I" && <span className="ml-1.5 rounded bg-blue-50 px-1 text-[10px] text-blue-600">신규</span>}
            </td>
            <td className="border-b border-gray-50 px-2.5 py-1.5 text-gray-400 line-through decoration-gray-300">{formatValue(col, e.bfrVal)}</td>
            <td className="border-b border-gray-50 px-2.5 py-1.5 font-medium text-gray-800">{formatValue(col, e.aftVal)}</td>
          </tr>
        );
      })}
    </>
  );
}
