import { NextRequest, NextResponse } from "next/server";
import { extendPasswordExpiry } from "@/lib/auth";
import { loginResponse } from "@/lib/loginResponse";

const MESSAGES: Record<string, string> = {
  NOT_FOUND: "아이디 또는 비밀번호가 올바르지 않습니다.",
  WRONG_PASSWORD: "아이디 또는 비밀번호가 올바르지 않습니다.",
  LOCKED: "비밀번호를 5회 이상 잘못 입력해 계정이 잠겼습니다. 관리자에게 비밀번호 초기화를 요청하세요.",
  PW_INIT: "초기화된 비밀번호는 연장할 수 없습니다. 새 비밀번호를 설정해 주세요.",
  NOT_EXPIRED: "비밀번호 연장이 필요한 계정이 아닙니다. 다시 로그인해 주세요.",
};

/** Expired (3-month-old) password: keep it for another 3 months instead of changing it, then
 *  log in. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const userId = typeof body?.userId === "string" ? body.userId.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!userId || !password) {
    return NextResponse.json({ message: "잘못된 요청입니다." }, { status: 400 });
  }

  try {
    const extended = await extendPasswordExpiry(userId, password);
    if (!extended.ok) return NextResponse.json({ message: MESSAGES[extended.reason] }, { status: 401 });
    return await loginResponse(userId, password);
  } catch (err) {
    console.error("[auth/extend-password] error:", err);
    return NextResponse.json({ message: "비밀번호 연장에 실패했습니다." }, { status: 500 });
  }
}
