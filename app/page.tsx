"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const inputCls =
  "h-11 w-full rounded-md border border-gray-300 bg-white px-3 text-base text-gray-800 focus:outline-none focus:ring-1 focus:ring-[#ff4b4b]";

function Field({
  id,
  label,
  ...props
}: { id: string; label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-gray-700">
        {label}
      </label>
      <input id={id} className={inputCls} {...props} />
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  // A reset (IS_PW_INIT) or 3-month-old password must be replaced before logging in: the form
  // switches to this, keeping the reason the server gave.
  const [mustChange, setMustChange] = useState<"PW_INIT" | "PW_EXPIRED" | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function post(url: string, body: object) {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { res, data: await res.json().catch(() => ({})) };
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { res, data } = await post("/api/auth/login", { userId, password });
      if (res.ok) {
        // The session cookie is set now; the (home) layout reads the user from it.
        router.push("/home");
        return;
      }
      if (data.code === "PW_CHANGE") {
        setMustChange(data.reason === "PW_EXPIRED" ? "PW_EXPIRED" : "PW_INIT");
        return;
      }
      setError(data.message ?? "로그인에 실패했습니다.");
    } catch {
      setError("서버에 연결할 수 없습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function handleChange(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError("새 비밀번호가 서로 다릅니다.");
      return;
    }
    setLoading(true);
    try {
      const { res, data } = await post("/api/auth/change-password", { userId, password, newPassword });
      if (!res.ok) {
        setError(data.message ?? "비밀번호 변경에 실패했습니다.");
        return;
      }
      router.push("/home");
    } catch {
      setError("서버에 연결할 수 없습니다.");
    } finally {
      setLoading(false);
    }
  }

  // Expired (not reset) password only: keep it for another 90 days instead of changing it.
  async function handleExtend() {
    setError(null);
    setLoading(true);
    try {
      const { res, data } = await post("/api/auth/extend-password", { userId, password });
      if (!res.ok) {
        setError(data.message ?? "비밀번호 연장에 실패했습니다.");
        return;
      }
      router.push("/home");
    } catch {
      setError("서버에 연결할 수 없습니다.");
    } finally {
      setLoading(false);
    }
  }

  function backToLogin() {
    setMustChange(null);
    setPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setError(null);
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-[#f0f2f6] px-4">
      <form
        onSubmit={mustChange ? handleChange : handleLogin}
        className="flex w-full max-w-sm flex-col gap-6 rounded-lg bg-white p-8 shadow-sm"
      >
        <div className="flex flex-col items-center gap-1">
          <span className="text-2xl font-bold text-gray-800">NeoChair</span>
          <span className="text-sm text-gray-500">Finance Management</span>
        </div>

        {mustChange ? (
          <>
            <div className="rounded-md bg-[#fff5f5] px-3 py-2.5 text-sm text-gray-700">
              <p className="font-medium text-[#ff4b4b]">비밀번호 변경이 필요합니다</p>
              <p className="mt-0.5 text-xs text-gray-500">
                <span className="font-medium text-gray-700">{userId}</span>{" "}
                {mustChange === "PW_EXPIRED"
                  ? "계정의 비밀번호를 변경한 지 3개월이 지났습니다. 새 비밀번호를 설정하거나, 지금 비밀번호를 90일 더 사용할 수 있습니다."
                  : "계정의 비밀번호가 초기화되었습니다. 새 비밀번호를 설정하면 바로 로그인됩니다."}{" "}
                (IHS에도 같이 적용됩니다)
              </p>
            </div>
            <div className="flex flex-col gap-4">
              {/* Lets password managers attach the new password to this account. */}
              <input type="text" value={userId} autoComplete="username" readOnly hidden />
              <Field
                id="newPassword"
                label="새 비밀번호"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="8~20자, 영문과 숫자 포함"
                autoComplete="new-password"
                autoFocus
              />
              <Field
                id="confirmPassword"
                label="새 비밀번호 확인"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="한 번 더 입력하세요"
                autoComplete="new-password"
              />
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-4">
            <Field
              id="userId"
              label="아이디"
              type="text"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="아이디를 입력하세요"
              autoComplete="username"
            />
            <Field
              id="password"
              label="비밀번호"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="비밀번호를 입력하세요"
              autoComplete="current-password"
            />
          </div>
        )}

        {error && <p className="text-sm text-[#ff4b4b]">{error}</p>}

        <div className="flex flex-col gap-2">
          <button
            type="submit"
            disabled={loading || (mustChange !== null && (!newPassword || !confirmPassword))}
            className="h-11 w-full rounded-md bg-[#ff4b4b] text-base font-medium text-white transition-colors hover:bg-[#e03e3e] disabled:opacity-60"
          >
            {mustChange ? (loading ? "처리 중..." : "비밀번호 변경 후 로그인") : loading ? "로그인 중..." : "로그인"}
          </button>
          {mustChange === "PW_EXPIRED" && (
            <button
              type="button"
              onClick={handleExtend}
              disabled={loading}
              className="h-11 w-full rounded-md border border-gray-300 text-sm font-medium text-gray-600 transition-colors hover:border-[#ff4b4b] hover:text-[#ff4b4b] disabled:opacity-60"
            >
              지금 비밀번호 그대로 90일 연장
            </button>
          )}
          {mustChange && (
            <button type="button" onClick={backToLogin} className="text-sm text-gray-400 hover:text-gray-600">
              다른 계정으로 로그인
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
