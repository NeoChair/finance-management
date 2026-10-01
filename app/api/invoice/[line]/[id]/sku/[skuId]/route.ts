import { NextRequest, NextResponse } from "next/server";
import { deleteSku } from "@/lib/invoice";

// SKU field edits go through POST /api/invoice/[line]/save (one transaction, change-logged).

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ line: string; id: string; skuId: string }> }) {
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
