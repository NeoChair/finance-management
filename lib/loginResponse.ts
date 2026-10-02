import { NextResponse } from "next/server";
import { verifyCredentials } from "./auth";
import { createSessionToken, SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from "./session";

const NO_LOGIN_MESSAGES: Record<string, string> = {
  NO_ACCESS: "이 시스템에 대한 접근 권한이 없습니다. 관리자에게 문의하세요.",
};

/** Logs in right after a password change / expiry extension: the full login checks again
 *  (permission included), then the session cookie. */
export async function loginResponse(userId: string, password: string): Promise<NextResponse> {
  const result = await verifyCredentials(userId, password);
  if (!result.ok) {
    return NextResponse.json({ message: NO_LOGIN_MESSAGES[result.reason] ?? "로그인에 실패했습니다. 다시 로그인해 주세요." }, { status: 401 });
  }
  const response = NextResponse.json({ user: result.user });
  response.cookies.set(SESSION_COOKIE, await createSessionToken(result.user), SESSION_COOKIE_OPTIONS);
  return response;
}
