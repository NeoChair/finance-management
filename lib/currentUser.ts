import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken, type SessionUser } from "./session";

/** The logged-in user from the session cookie, or null. For route handlers and server components. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? verifySessionToken(token) : null;
}

export function unauthorized() {
  return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
}

export function forbidden(message = "권한이 없습니다. 시스템 관리자에게 문의하세요.") {
  return NextResponse.json({ message }, { status: 403 });
}
