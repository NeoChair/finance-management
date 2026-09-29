import { NextRequest, NextResponse } from "next/server";
import { updateCodeField, deleteCode } from "@/lib/commonCode";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ grpCd: string; code: string }> }) {
  const { grpCd, code } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body.field !== "string") return NextResponse.json({ message: "잘못된 요청입니다." }, { status: 400 });

  try {
    await updateCodeField(grpCd, code, body.field, body.value ?? null);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(`[api/settings/codes/${grpCd}/${code}] PATCH error:`, err);
    return NextResponse.json({ message: "수정에 실패했습니다." }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ grpCd: string; code: string }> }) {
  const { grpCd, code } = await params;
  try {
    await deleteCode(grpCd, code);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(`[api/settings/codes/${grpCd}/${code}] DELETE error:`, err);
    return NextResponse.json({ message: "삭제에 실패했습니다." }, { status: 500 });
  }
}
