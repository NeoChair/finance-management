import { NextRequest, NextResponse } from "next/server";
import { updateShipment, deleteShipment, applyFieldEdit, type ShipmentInput, type FieldEdit } from "@/lib/invoice";
import { slugToProductLine } from "@/lib/productLines";

const OWNR_ETP_CD = "KR-DT-HG";

const MASTER_FIELDS = new Set([
  "suplFactNm", "sttsNm", "loadType", "hblNo", "mblNo", "contNo", "poNo",
  "subpoNo", "podNm", "etd", "eta", "wrhsArrvDe", "usdExchRt", "currCd", "rmrk",
]);

function parseFieldEdit(body: unknown): FieldEdit | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;

  if (b.kind === "master" && typeof b.field === "string" && MASTER_FIELDS.has(b.field)) {
    return { kind: "master", field: b.field as FieldEdit extends { kind: "master"; field: infer F } ? F : never, value: (b.value as string | number | null) ?? null };
  }
  // field absent → the amount (numeric); sndrNm/rcvrNm → a party name (text).
  if (b.field !== undefined && b.field !== "sndrNm" && b.field !== "rcvrNm") return null;
  const field = b.field as "sndrNm" | "rcvrNm" | undefined;
  const value = b.value == null || b.value === "" ? null : field ? String(b.value) : Number(b.value);

  if (b.kind === "party" && (b.invTpCd === "NEO" || b.invTpCd === "FACTORY")) {
    return { kind: "party", invTpCd: b.invTpCd, field, value };
  }
  if (b.kind === "cost" && typeof b.costTpCd === "string") {
    return { kind: "cost", costTpCd: b.costTpCd, field, value };
  }
  return null;
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ line: string; id: string }> }) {
  const { line, id } = await params;
  const prdLineCd = slugToProductLine(line);
  if (!prdLineCd) return NextResponse.json({ message: "알 수 없는 제품군입니다." }, { status: 404 });

  const shpmId = Number(id);
  if (!Number.isInteger(shpmId)) return NextResponse.json({ message: "잘못된 ID입니다." }, { status: 400 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ message: "잘못된 요청입니다." }, { status: 400 });

  const input: ShipmentInput = { ...body, prdLineCd, ownrEtpCd: OWNR_ETP_CD };

  try {
    await updateShipment(shpmId, input);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(`[api/invoice/${line}/${id}] PUT error:`, err);
    return NextResponse.json({ message: "수정에 실패했습니다." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ line: string; id: string }> }) {
  const { line, id } = await params;
  const shpmId = Number(id);
  if (!Number.isInteger(shpmId)) return NextResponse.json({ message: "잘못된 ID입니다." }, { status: 400 });

  const body = await req.json().catch(() => null);
  const edit = parseFieldEdit(body);
  if (!edit) return NextResponse.json({ message: "잘못된 요청입니다." }, { status: 400 });

  try {
    await applyFieldEdit(shpmId, edit);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(`[api/invoice/${line}/${id}] PATCH error:`, err);
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
