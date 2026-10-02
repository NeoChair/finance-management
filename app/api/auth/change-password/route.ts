import { NextRequest, NextResponse } from "next/server";
import { changeRequiredPassword } from "@/lib/auth";
import { loginResponse } from "@/lib/loginResponse";

const MESSAGES: Record<string, string> = {
  NOT_FOUND: "아이디 또는 비밀번호가 올바르지 않습니다.",
  WRONG_PASSWORD: "아이디 또는 비밀번호가 올바르지 않습니다.",
  LOCKED: "비밀번호를 5회 이상 잘못 입력해 계정이 잠겼습니다. 관리자에게 비밀번호 초기화를 요청하세요.",
  NOT_REQUIRED: "비밀번호 변경이 필요한 계정이 아닙니다. 다시 로그인해 주세요.",
};

/** Login that requires a new password (reset, or older than 3 months): set it (checked against
 *  the current one), then log in with it. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const userId = typeof body?.userId === "string" ? body.userId.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";
  if (!userId || !password || !newPassword) {
    return NextResponse.json({ message: "잘못된 요청입니다." }, { status: 400 });
  }

  try {
    const changed = await changeRequiredPassword(userId, password, newPassword);
    if (!changed.ok) {
      const status = changed.reason === "INVALID" ? 400 : 401;
      return NextResponse.json({ message: changed.message ?? MESSAGES[changed.reason] }, { status });
    }
    return await loginResponse(userId, newPassword);
  } catch (err) {
    console.error("[auth/change-password] error:", err);
    return NextResponse.json({ message: "비밀번호 변경에 실패했습니다." }, { status: 500 });
  }
}
