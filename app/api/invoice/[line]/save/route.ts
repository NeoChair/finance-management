import { NextRequest, NextResponse } from "next/server";
import { saveEdits, type FieldEdit, type PartyField, type SkuFieldEdit } from "@/lib/invoice";
import { MASTER_FIELD_COLUMNS, PARTY_FIELD_COLUMNS } from "@/lib/invoiceFields";
import { forbidden, getSessionUser, unauthorized } from "@/lib/currentUser";
import { canEdit } from "@/lib/permissions";
import { getEditPerms } from "@/lib/userPerms";
import { slugToProductLine } from "@/lib/productLines";

function parseFieldEdit(b: Record<string, unknown>): FieldEdit | null {
  if (b.kind === "master") {
    if (typeof b.field !== "string" || !(b.field in MASTER_FIELD_COLUMNS)) return null;
    return { kind: "master", field: b.field, value: (b.value as string | number | null) ?? null };
  }
  // field absent → the amount (numeric); otherwise a name / invoice no / YYYYMMDD date (text).
  if (b.field !== undefined && !(typeof b.field === "string" && b.field in PARTY_FIELD_COLUMNS)) return null;
  const field = b.field as PartyField | undefined;
  const value = b.value == null || b.value === "" ? null : field ? String(b.value) : Number(b.value);
  if (value !== null && typeof value === "number" && !Number.isFinite(value)) return null;

  if (b.kind === "party" && (b.invTpCd === "NEO" || b.invTpCd === "FACTORY")) {
    return { kind: "party", invTpCd: b.invTpCd, field, value };
  }
  if (b.kind === "cost" && typeof b.costTpCd === "string") {
    return { kind: "cost", costTpCd: b.costTpCd, field, value };
  }
  return null;
}

function parseSkuEdit(b: Record<string, unknown>): SkuFieldEdit | null {
  if (b.field !== "skuCd" && b.field !== "qty" && b.field !== "unitPrc" && b.field !== "amt" && b.field !== "cbm") return null;
  return { field: b.field, value: (b.value as string | number | null) ?? null };
}

type Body = { cells?: unknown; skus?: unknown };

/** The save button: every pending cell / SKU edit in one transaction, logged as one save. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ line: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { line } = await params;
  const prdLineCd = slugToProductLine(line);
  if (!prdLineCd) return NextResponse.json({ message: "알 수 없는 제품군입니다." }, { status: 404 });

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body || !Array.isArray(body.cells) || !Array.isArray(body.skus)) {
    return NextResponse.json({ message: "잘못된 요청입니다." }, { status: 400 });
  }

  const cells: { shpmId: number; edit: FieldEdit }[] = [];
  for (const c of body.cells) {
    if (typeof c !== "object" || c === null) return NextResponse.json({ message: "잘못된 요청입니다." }, { status: 400 });
    const { shpmId, ...rest } = c as Record<string, unknown>;
    const edit = parseFieldEdit(rest);
    if (!Number.isInteger(shpmId) || !edit) return NextResponse.json({ message: "잘못된 요청입니다." }, { status: 400 });
    cells.push({ shpmId: shpmId as number, edit });
  }
  const skus: { shpmDtlId: number; edit: SkuFieldEdit }[] = [];
  for (const s of body.skus) {
    if (typeof s !== "object" || s === null) return NextResponse.json({ message: "잘못된 요청입니다." }, { status: 400 });
    const { shpmDtlId, ...rest } = s as Record<string, unknown>;
    const edit = parseSkuEdit(rest);
    if (!Number.isInteger(shpmDtlId) || !edit) return NextResponse.json({ message: "잘못된 요청입니다." }, { status: 400 });
    skus.push({ shpmDtlId: shpmDtlId as number, edit });
  }

  // Column permissions: the client only opens permitted cells, but every edit is checked here.
  try {
    const perms = await getEditPerms(user);
    if (cells.some((c) => !canEdit(perms, c.edit)) || skus.some((s) => !canEdit(perms, { kind: "sku", field: s.edit.field }))) {
      return forbidden("수정 권한이 없는 항목이 포함되어 있어 저장하지 않았습니다.");
    }
  } catch (err) {
    console.error(`[api/invoice/${line}/save] permission check error:`, err);
    return NextResponse.json({ message: "권한 확인에 실패했습니다." }, { status: 500 });
  }

  try {
    const result = await saveEdits(prdLineCd, { usrId: user.usrId, usrNm: user.usrNm }, cells, skus);
    return NextResponse.json(result);
  } catch (err) {
    console.error(`[api/invoice/${line}/save] POST error:`, err);
    const message = err instanceof Error && /^이미 삭제/.test(err.message) ? err.message : "저장에 실패했습니다. 변경 내용은 반영되지 않았습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
