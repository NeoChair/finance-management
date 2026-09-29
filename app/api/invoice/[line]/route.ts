import { NextRequest, NextResponse } from "next/server";
import { getInvoicesByProductLine, createShipment, type ShipmentInput } from "@/lib/invoice";
import { slugToProductLine } from "@/lib/productLines";

const OWNR_ETP_CD = "KR-DT-HG";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ line: string }> }) {
  const { line } = await params;
  const prdLineCd = slugToProductLine(line);
  if (!prdLineCd) return NextResponse.json({ message: "알 수 없는 제품군입니다." }, { status: 404 });

  try {
    const rows = await getInvoicesByProductLine(prdLineCd);
    return NextResponse.json({ rows });
  } catch (err) {
    console.error(`[api/invoice/${line}] GET error:`, err);
    return NextResponse.json({ message: "DB 조회에 실패했습니다." }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ line: string }> }) {
  const { line } = await params;
  const prdLineCd = slugToProductLine(line);
  if (!prdLineCd) return NextResponse.json({ message: "알 수 없는 제품군입니다." }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ message: "잘못된 요청입니다." }, { status: 400 });

  const input: ShipmentInput = { ...body, prdLineCd, ownrEtpCd: OWNR_ETP_CD };

  try {
    const shpmId = await createShipment(input);
    return NextResponse.json({ shpmId }, { status: 201 });
  } catch (err) {
    console.error(`[api/invoice/${line}] POST error:`, err);
    return NextResponse.json({ message: "저장에 실패했습니다." }, { status: 500 });
  }
}
