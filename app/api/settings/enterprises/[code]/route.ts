import { NextRequest, NextResponse } from "next/server";
import { updateEnterpriseField, deleteEnterprise } from "@/lib/enterprise";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body.field !== "string") return NextResponse.json({ message: "잘못된 요청입니다." }, { status: 400 });

  try {
    await updateEnterpriseField(code, body.field, body.value ?? null);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(`[api/settings/enterprises/${code}] PATCH error:`, err);
    return NextResponse.json({ message: "수정에 실패했습니다." }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  try {
    await deleteEnterprise(code);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(`[api/settings/enterprises/${code}] DELETE error:`, err);
    return NextResponse.json({ message: "삭제에 실패했습니다. 다른 데이터에서 참조 중일 수 있습니다." }, { status: 500 });
  }
}
