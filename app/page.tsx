"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/app/store/useAuthStore";

export default function LoginPage() {
  const router = useRouter();
  const setUser = useAuthStore((state) => state.setUser);
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.message ?? "로그인에 실패했습니다.");
        return;
      }

      setUser(data.user);
      router.push("/home");
    } catch {
      setError("서버에 연결할 수 없습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-[#f0f2f6] px-4">
      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-sm flex-col gap-6 rounded-lg bg-white p-8 shadow-sm"
      >
        <div className="flex flex-col items-center gap-1">
          <span className="text-2xl font-bold text-gray-800">NeoChair</span>
          <span className="text-sm text-gray-500">Finance Management</span>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="userId" className="text-sm font-medium text-gray-700">
              아이디
            </label>
            <input
              id="userId"
              type="text"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="아이디를 입력하세요"
              autoComplete="username"
              className="h-11 w-full rounded-md border border-gray-300 bg-white px-3 text-base text-gray-800 focus:outline-none focus:ring-1 focus:ring-[#ff4b4b]"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-sm font-medium text-gray-700">
              비밀번호
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="비밀번호를 입력하세요"
              autoComplete="current-password"
              className="h-11 w-full rounded-md border border-gray-300 bg-white px-3 text-base text-gray-800 focus:outline-none focus:ring-1 focus:ring-[#ff4b4b]"
            />
          </div>
        </div>

        {error && <p className="text-sm text-[#ff4b4b]">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="h-11 w-full rounded-md bg-[#ff4b4b] text-base font-medium text-white transition-colors hover:bg-[#e03e3e] disabled:opacity-60"
        >
          {loading ? "로그인 중..." : "로그인"}
        </button>
      </form>
    </div>
  );
}
