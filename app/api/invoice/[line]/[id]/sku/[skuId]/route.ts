import { NextRequest, NextResponse } from "next/server";
import { updateSkuField, deleteSku, type SkuFieldEdit } from "@/lib/invoice";

function parseSkuFieldEdit(body: unknown): SkuFieldEdit | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  if (b.field !== "skuCd" && b.field !== "qty" && b.field !== "unitPrc" && b.field !== "amt") return null;
  const value = b.value as string | number | null;
  return { field: b.field, value: value ?? null };
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ line: string; id: string; skuId: string }> }) {
  const { line, id, skuId } = await params;
  const shpmDtlId = Number(skuId);
  if (!Number.isInteger(shpmDtlId)) return NextResponse.json({ message: "잘못된 ID입니다." }, { status: 400 });

  const body = await req.json().catch(() => null);
  const edit = parseSkuFieldEdit(body);
  if (!edit) return NextResponse.json({ message: "잘못된 요청입니다." }, { status: 400 });

  try {
    await updateSkuField(shpmDtlId, edit);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(`[api/invoice/${line}/${id}/sku/${skuId}] PATCH error:`, err);
    return NextResponse.json({ message: "수정에 실패했습니다." }, { status: 500 });
  }
}

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
