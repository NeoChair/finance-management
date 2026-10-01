import { NextRequest, NextResponse } from "next/server";
import { createSku } from "@/lib/invoice";
import { getSessionUser, unauthorized } from "@/lib/currentUser";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ line: string; id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

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
