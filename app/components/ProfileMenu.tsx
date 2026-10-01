"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "./UserProvider";

// User type codes (USR_TYP_CD) as named in IHS's user-type code list.
const USER_TYPE_NAMES: Record<string, string> = {
  UTADMN: "시스템 관리자",
  UTMNGR: "관리자",
  UTNUSR: "일반 사용자",
  UTTUSR: "임시 사용자",
};

// Top-right account button: who is logged in, with their details and log out in a dropdown.
export default function ProfileMenu() {
  const user = useCurrentUser();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function logout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.replace("/");
      router.refresh();
    }
  }

  const initial = (user.usrNm || user.usrId).trim().charAt(0).toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm text-gray-700 hover:bg-white/70"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#ff4b4b] text-sm font-semibold text-white">{initial}</span>
        <span className="font-medium">{user.usrNm}</span>
        <i className={`fa-solid fa-chevron-down text-[10px] text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-64 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-lg">
          <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-3.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#ff4b4b] text-base font-semibold text-white">
              {initial}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-gray-800">{user.usrNm}</p>
              <p className="truncate text-xs text-gray-400">{user.email ?? user.usrId}</p>
            </div>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 px-4 py-3 text-xs">
            <dt className="text-gray-400">아이디</dt>
            <dd className="truncate text-gray-700">{user.usrId}</dd>
            <dt className="text-gray-400">회사</dt>
            <dd className="truncate text-gray-700">{user.ownrEtpCd}</dd>
            <dt className="text-gray-400">권한</dt>
            <dd className="truncate text-gray-700" title={user.usrTypCd}>
              {USER_TYPE_NAMES[user.usrTypCd] ?? user.usrTypCd}
            </dd>
          </dl>
          <button
            onClick={logout}
            disabled={loggingOut}
            className="flex w-full items-center gap-2 border-t border-gray-100 px-4 py-2.5 text-sm text-gray-600 hover:bg-[#fff5f5] hover:text-[#ff4b4b] disabled:opacity-60"
          >
            <i className="fa-solid fa-right-from-bracket text-xs" />
            {loggingOut ? "로그아웃 중..." : "로그아웃"}
          </button>
        </div>
      )}
    </div>
  );
}
