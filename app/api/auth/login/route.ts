import { NextRequest, NextResponse } from "next/server";
import { verifyCredentials } from "@/lib/auth";
import { createSessionToken, SESSION_COOKIE } from "@/lib/session";

const ERROR_MESSAGES: Record<string, string> = {
  NOT_FOUND: "아이디 또는 비밀번호가 올바르지 않습니다.",
  WRONG_PASSWORD: "아이디 또는 비밀번호가 올바르지 않습니다.",
  PW_INIT: "초기화된 비밀번호입니다. IHS에서 비밀번호를 변경한 후 다시 시도하세요.",
  NO_ACCESS: "이 시스템에 대한 접근 권한이 없습니다. 관리자에게 문의하세요.",
};

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const userId = body?.userId?.trim();
  const password = body?.password;

  if (!userId || !password) {
    return NextResponse.json({ message: "아이디와 비밀번호를 입력하세요." }, { status: 400 });
  }

  let result;
  try {
    result = await verifyCredentials(userId, password);
  } catch (err) {
    console.error("[auth/login] DB error:", err);
    return NextResponse.json(
      { message: "DB 연결에 실패했습니다. .env.local의 DB_* 값을 확인하세요." },
      { status: 500 }
    );
  }

  if (!result.ok) {
    return NextResponse.json({ message: ERROR_MESSAGES[result.reason] }, { status: 401 });
  }

  const token = await createSessionToken(result.user);
  const response = NextResponse.json({ user: result.user });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return response;
}
