import { NextRequest, NextResponse } from "next/server";
import { deleteSku } from "@/lib/invoice";
import { forbidden, getSessionUser, unauthorized } from "@/lib/currentUser";
import { isAdmin } from "@/lib/userPerms";

// SKU field edits go through POST /api/invoice/[line]/save (one transaction, change-logged).

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ line: string; id: string; skuId: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!isAdmin(user)) return forbidden("삭제는 시스템 관리자만 할 수 있습니다.");

  const { line, id, skuId } = await params;
  const shpmDtlId = Number(skuId);
  if (!Number.isInteger(shpmDtlId)) return NextResponse.json({ message: "잘못된 ID입니다." }, { status: 400 });

  try {
    await deleteSku(shpmDtlId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(`[api/invoice/${line}/${id}/sku/${skuId}] DELETE error:`, err);
    return NextResponse.json({ message: "삭제에 실패했습니다." }, { status: 500 });
  }
}
