import { NextRequest, NextResponse } from "next/server";
import { importShipments, ImportRowError } from "@/lib/invoice";
import { buildShipmentImports, type UploadRow } from "@/lib/invoiceImport";
import { slugToProductLine } from "@/lib/productLines";

const OWNR_ETP_CD = "KR-DT-HG";

function parseUploadRows(body: unknown): UploadRow[] | null {
  if (typeof body !== "object" || body === null) return null;
  const rows = (body as { rows?: unknown }).rows;
  if (!Array.isArray(rows)) return null;

  const parsed: UploadRow[] = [];
  for (const r of rows) {
    if (typeof r !== "object" || r === null) return null;
    const { rowNo, cells } = r as { rowNo?: unknown; cells?: unknown };
    if (!Number.isInteger(rowNo) || typeof cells !== "object" || cells === null) return null;
    const clean: UploadRow["cells"] = {};
    for (const [key, value] of Object.entries(cells)) {
      if (typeof value === "string" || typeof value === "number") clean[key] = value;
    }
    parsed.push({ rowNo: rowNo as number, cells: clean });
  }
  return parsed;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ line: string }> }) {
  const { line } = await params;
  const prdLineCd = slugToProductLine(line);
  if (!prdLineCd) return NextResponse.json({ message: "알 수 없는 제품군입니다." }, { status: 404 });

  const rows = parseUploadRows(await req.json().catch(() => null));
  if (!rows) return NextResponse.json({ message: "잘못된 요청입니다." }, { status: 400 });
  if (rows.length === 0) return NextResponse.json({ message: "업로드할 데이터가 없습니다." }, { status: 400 });

  const { imports, errors } = buildShipmentImports(prdLineCd, rows);
  if (errors.length > 0) {
    return NextResponse.json({ message: "업로드 파일에 오류가 있어 반영하지 않았습니다.", errors }, { status: 400 });
  }

  try {
    const result = await importShipments(prdLineCd, OWNR_ETP_CD, imports);
    return NextResponse.json(result);
  } catch (err) {
    console.error(`[api/invoice/${line}/import] POST error:`, err);
    if (err instanceof ImportRowError) {
      return NextResponse.json(
        { message: "저장 중 오류가 발생해 전체 업로드를 취소했습니다.", errors: [`${err.rowNo}행: ${err.message}`] },
        { status: 400 }
      );
    }
    return NextResponse.json({ message: "업로드에 실패했습니다." }, { status: 500 });
  }
}
