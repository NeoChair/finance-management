import { NextRequest, NextResponse } from "next/server";
import { updateShipment, deleteShipment, type ShipmentInput } from "@/lib/invoice";
import { getSessionUser, unauthorized } from "@/lib/currentUser";
import { slugToProductLine } from "@/lib/productLines";

const OWNR_ETP_CD = "KR-DT-HG";

// Single-cell edits go through POST ../save (one transaction, change-logged), not per cell here.

export async function PUT(req: NextRequest, { params }: { params: Promise<{ line: string; id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { line, id } = await params;
  const prdLineCd = slugToProductLine(line);
  if (!prdLineCd) return NextResponse.json({ message: "알 수 없는 제품군입니다." }, { status: 404 });

  const shpmId = Number(id);
  if (!Number.isInteger(shpmId)) return NextResponse.json({ message: "잘못된 ID입니다." }, { status: 400 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ message: "잘못된 요청입니다." }, { status: 400 });

  const input: ShipmentInput = { ...body, prdLineCd, ownrEtpCd: OWNR_ETP_CD };

  try {
    await updateShipment(shpmId, input, user.usrId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(`[api/invoice/${line}/${id}] PUT error:`, err);
    return NextResponse.json({ message: "수정에 실패했습니다." }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ line: string; id: string }> }) {
  const { line, id } = await params;
  const shpmId = Number(id);
  if (!Number.isInteger(shpmId)) return NextResponse.json({ message: "잘못된 ID입니다." }, { status: 400 });

  try {
    await deleteShipment(shpmId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(`[api/invoice/${line}/${id}] DELETE error:`, err);
    return NextResponse.json({ message: "삭제에 실패했습니다." }, { status: 500 });
  }
}
