import { NextRequest, NextResponse } from "next/server";
import { createSku } from "@/lib/invoice";
import { forbidden, getSessionUser, unauthorized } from "@/lib/currentUser";
import { isAdmin } from "@/lib/userPerms";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ line: string; id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!isAdmin(user)) return forbidden("SKU 추가는 시스템 관리자만 할 수 있습니다.");

  const { line, id } = await params;
  const shpmId = Number(id);
  if (!Number.isInteger(shpmId)) return NextResponse.json({ message: "잘못된 ID입니다." }, { status: 400 });

  try {
    const shpmDtlId = await createSku(shpmId, user.usrId);
    return NextResponse.json({ shpmDtlId }, { status: 201 });
  } catch (err) {
    console.error(`[api/invoice/${line}/${id}/sku] POST error:`, err);
    return NextResponse.json({ message: "SKU 추가에 실패했습니다." }, { status: 500 });
  }
}
