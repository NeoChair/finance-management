import { NextRequest, NextResponse } from "next/server";
import { getWarehouses, createWarehouse } from "@/lib/warehouse";

export async function GET() {
  try {
    const rows = await getWarehouses();
    return NextResponse.json({ rows });
  } catch (err) {
    console.error("[api/settings/warehouses] GET error:", err);
    return NextResponse.json({ message: "DB 조회에 실패했습니다." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const wrhsCd = body?.wrhsCd;
  if (typeof wrhsCd !== "string" || !wrhsCd) return NextResponse.json({ message: "잘못된 요청입니다." }, { status: 400 });

  try {
    await createWarehouse(wrhsCd);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    console.error("[api/settings/warehouses] POST error:", err);
    return NextResponse.json({ message: "추가에 실패했습니다." }, { status: 500 });
  }
}
