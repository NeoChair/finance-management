import { NextRequest, NextResponse } from "next/server";
import { forbidden, getSessionUser, unauthorized } from "@/lib/currentUser";
import { PERM_CODES, type PermCode } from "@/lib/permissions";
import { isAdmin, listUserPerms, setUserPerm } from "@/lib/userPerms";

/** 권한 관리: every active user of the admin's company with their column permissions. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!isAdmin(user)) return forbidden();

  try {
    return NextResponse.json({ users: await listUserPerms(user.ownrEtpCd) });
  } catch (err) {
    console.error("[api/settings/permissions] GET error:", err);
    return NextResponse.json({ message: "권한 목록 조회에 실패했습니다." }, { status: 500 });
  }
}

/** Grants / revokes one permission: { usrId, code: "AMT" | "PAY_DE", granted }. */
export async function PUT(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!isAdmin(user)) return forbidden();

  const body = await req.json().catch(() => null);
  const usrId = typeof body?.usrId === "string" ? body.usrId : "";
  const code = body?.code as PermCode;
  if (!usrId || !PERM_CODES.includes(code) || typeof body?.granted !== "boolean") {
    return NextResponse.json({ message: "잘못된 요청입니다." }, { status: 400 });
  }

  try {
    await setUserPerm(user.ownrEtpCd, usrId, code, body.granted, user.usrId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/settings/permissions] PUT error:", err);
    return NextResponse.json({ message: "권한 저장에 실패했습니다." }, { status: 500 });
  }
}
