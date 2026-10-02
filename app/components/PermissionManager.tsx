"use client";

import { useEffect, useState } from "react";
import { ADMIN_USR_TYP_CD, PERM_CODES, PERM_DESCRIPTIONS, PERM_LABELS, type PermCode } from "@/lib/permissions";
import type { UserPermRow } from "@/lib/userPerms";

const USER_TYPE_NAMES: Record<string, string> = {
  UTADMN: "시스템 관리자",
  UTMNGR: "관리자",
  UTNUSR: "일반 사용자",
  UTTUSR: "임시 사용자",
};

const thCls = "sticky top-0 z-10 border-b border-gray-200 bg-gray-100 px-3 py-2.5 text-left text-[13px] font-semibold text-gray-600";
const tdCls = "border-b border-gray-100 px-3 py-2 text-[13px] text-gray-700";

/** 권한 관리: per user, what they may do on the invoice tables (View / Edit / Amount /
 *  Payment Date / Add / Delete / Import / Export). Each checkbox saves immediately. */
export default function PermissionManager() {
  const [users, setUsers] = useState<UserPermRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [onlyGranted, setOnlyGranted] = useState(false);
  const [busy, setBusy] = useState<string | null>(null); // "usrId:code" being saved

  useEffect(() => {
    fetch("/api/settings/permissions")
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message ?? "권한 목록 조회에 실패했습니다.");
        setUsers(data.users);
      })
      .catch((err) => setError(err.message));
  }, []);

  async function toggle(u: UserPermRow, code: PermCode) {
    const granted = !u.codes.includes(code);
    setBusy(`${u.usrId}:${code}`);
    try {
      const res = await fetch("/api/settings/permissions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usrId: u.usrId, code, granted }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.message ?? "권한 저장에 실패했습니다.");
        return;
      }
      setUsers((prev) =>
        prev?.map((x) => (x.usrId === u.usrId ? { ...x, codes: granted ? [...x.codes, code] : x.codes.filter((c) => c !== code) } : x)) ?? prev
      );
    } finally {
      setBusy(null);
    }
  }

  const q = search.trim().toLowerCase();
  const shown = (users ?? []).filter(
    (u) =>
      (!q || [u.usrId, u.usrNm, u.email ?? ""].some((v) => v.toLowerCase().includes(q))) &&
      (!onlyGranted || u.codes.length > 0 || u.usrTypCd === ADMIN_USR_TYP_CD)
  );

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-5 py-3.5">
        <p className="text-xs text-gray-400">
          체크하면 바로 저장됩니다 · 권한이 없는 사용자는 읽기만 가능 · 선적 정보·SKU·추가·삭제·Import는 시스템 관리자만 가능
        </p>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-gray-500">
            <input type="checkbox" className="accent-[#ff4b4b]" checked={onlyGranted} onChange={(e) => setOnlyGranted(e.target.checked)} />
            권한 있는 사용자만
          </label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="이름, 아이디, 이메일 검색"
            className="h-8 w-56 rounded-lg border border-gray-200 px-2.5 text-xs outline-none focus:border-[#ff4b4b]"
          />
        </div>
      </div>

      {error && <p className="px-5 py-3 text-sm text-[#ff4b4b]">{error}</p>}
      {!error && !users && <p className="px-5 py-6 text-center text-sm text-gray-400">불러오는 중...</p>}

      {users && (
        <div className="hover-scroll mx-2 overflow-auto" style={{ maxHeight: "calc(100vh - 280px)" }}>
          <table className="w-full" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
            <thead>
              <tr>
                <th className={thCls}>이름</th>
                <th className={thCls}>아이디</th>
                <th className={thCls}>사용자 유형</th>
                {PERM_CODES.map((code) => (
                  <th key={code} className={`${thCls} cursor-help text-center`} title={PERM_DESCRIPTIONS[code]}>
                    {PERM_LABELS[code]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((u) => {
                const admin = u.usrTypCd === ADMIN_USR_TYP_CD;
                return (
                  <tr key={u.usrId} className="hover:bg-gray-50/70">
                    <td className={`${tdCls} font-medium`}>{u.usrNm}</td>
                    <td className={`${tdCls} text-gray-500`}>{u.usrId}</td>
                    <td className={`${tdCls} text-gray-500`}>{USER_TYPE_NAMES[u.usrTypCd] ?? u.usrTypCd}</td>
                    {PERM_CODES.map((code) => (
                      <td key={code} className={`${tdCls} text-center`}>
                        {admin ? (
                          <span className="text-[11px] text-gray-400">전체 권한</span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5">
                            <input
                              type="checkbox"
                              className="h-4 w-4 cursor-pointer accent-[#ff4b4b] disabled:cursor-wait"
                              checked={u.codes.includes(code)}
                              disabled={busy === `${u.usrId}:${code}`}
                              onChange={() => toggle(u, code)}
                            />
                            {/* Granted to their whole role in IHS; unticking denies it for this user only. */}
                            {u.viaRole.includes(code) && u.codes.includes(code) && (
                              <span className="text-[10px] text-gray-400" title="IHS에서 사용자 유형(역할) 전체에 부여된 권한입니다">
                                역할
                              </span>
                            )}
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={3 + PERM_CODES.length} className="px-3 py-6 text-center text-sm text-gray-400">
                    해당하는 사용자가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {users && <p className="px-5 py-3 text-xs text-gray-400">총 {shown.length}명</p>}
    </div>
  );
}
