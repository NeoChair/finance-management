"use client";

import { useCallback, useEffect, useState } from "react";
import SimpleCrudTable, { type CrudColumn } from "@/app/components/SimpleCrudTable";

type CodeGroup = { cmGrpCd: string; cmGrpNm: string };

const CODE_COLUMNS: CrudColumn[] = [
  { key: "cmCd", label: "코드" },
  { key: "cmNm", label: "코드명" },
  { key: "cmDesc", label: "설명" },
];

export default function CommonCodeManager() {
  const [groups, setGroups] = useState<CodeGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [editingCd, setEditingCd] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    return fetch("/api/settings/code-groups")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.message ?? "조회 실패");
        setGroups(data.rows);
        setError(null);
        setSelected((prev) => prev ?? data.rows[0]?.cmGrpCd ?? null);
      })
      .catch((err) => setError(err.message ?? "조회 실패"));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAddGroup() {
    // Short on purpose — see the matching comment in SimpleCrudTable.handleAddRow.
    const tempCode = `NEW${Date.now().toString(36).slice(-6)}`;
    setSaving(true);
    try {
      const res = await fetch("/api/settings/code-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cmGrpCd: tempCode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.message ?? "추가에 실패했습니다.");
        return;
      }
      await load();
      setSelected(tempCode);
      setEditingCd(tempCode);
      setDraft("");
    } finally {
      setSaving(false);
    }
  }

  async function commitRename(cmGrpCd: string) {
    setEditingCd(null);
    const res = await fetch(`/api/settings/code-groups/${encodeURIComponent(cmGrpCd)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field: "cmGrpNm", value: draft }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.message ?? "저장에 실패했습니다.");
      return;
    }
    await load();
  }

  async function handleDeleteGroup(cmGrpCd: string) {
    if (!confirm(`그룹 "${cmGrpCd}"을(를) 삭제할까요? 그룹에 속한 코드들도 함께 관리되지 않게 됩니다.`)) return;
    const res = await fetch(`/api/settings/code-groups/${encodeURIComponent(cmGrpCd)}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.message ?? "삭제 실패");
      return;
    }
    if (selected === cmGrpCd) setSelected(null);
    await load();
  }

  return (
    <div className="flex" style={{ minHeight: 480 }}>
      <div className="flex w-64 shrink-0 flex-col border-r border-gray-100">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3.5">
          <p className="text-xs font-medium text-gray-500">코드 그룹</p>
          <button onClick={handleAddGroup} className="text-xs font-medium text-[#ff4b4b] hover:underline">
            <i className="fa-solid fa-plus mr-1 text-[10px]" />
            추가
          </button>
        </div>
        {error && <p className="px-4 py-3 text-sm text-[#ff4b4b]">{error}</p>}
        {!groups && !error && <p className="px-4 py-3 text-sm text-gray-400">불러오는 중...</p>}
        <div className="hover-scroll flex-1 overflow-auto">
          {groups?.map((g) => (
            <div
              key={g.cmGrpCd}
              onClick={() => setSelected(g.cmGrpCd)}
              className={`group flex cursor-pointer items-center justify-between gap-1 border-b border-dotted border-gray-200 px-4 py-2.5 text-[13px] ${
                selected === g.cmGrpCd ? "bg-[#ff4b4b]/10" : "hover:bg-gray-50"
              }`}
            >
              <div className="flex min-w-0 flex-col">
                <span className={`truncate font-medium ${selected === g.cmGrpCd ? "text-[#ff4b4b]" : "text-gray-700"}`}>{g.cmGrpCd}</span>
                {editingCd === g.cmGrpCd ? (
                  <input
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onBlur={() => commitRename(g.cmGrpCd)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      if (e.key === "Escape") setEditingCd(null);
                    }}
                    className="w-full border-0 border-b border-[#ff4b4b] bg-transparent p-0 text-[12px] text-gray-500 outline-none"
                  />
                ) : (
                  <span
                    className="truncate text-[12px] text-gray-400 hover:text-[#ff4b4b]"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingCd(g.cmGrpCd);
                      setDraft(g.cmGrpNm);
                    }}
                  >
                    {g.cmGrpNm || "이름 없음"}
                  </span>
                )}
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteGroup(g.cmGrpCd);
                }}
                className="shrink-0 text-gray-300 opacity-0 hover:text-[#ff4b4b] group-hover:opacity-100"
                title="그룹 삭제"
              >
                <i className="fa-solid fa-trash text-[11px]" />
              </button>
            </div>
          ))}
          {groups?.length === 0 && <p className="px-4 py-3 text-sm text-gray-400">그룹이 없습니다.</p>}
        </div>
        {saving && <p className="px-4 py-2 text-xs text-gray-400">처리 중...</p>}
      </div>

      <div className="flex-1">
        {selected ? (
          <SimpleCrudTable key={selected} apiUrl={`/api/settings/codes/${encodeURIComponent(selected)}`} idField="cmCd" columns={CODE_COLUMNS} />
        ) : (
          <p className="px-5 py-6 text-sm text-gray-400">왼쪽에서 코드 그룹을 선택하세요.</p>
        )}
      </div>
    </div>
  );
}
