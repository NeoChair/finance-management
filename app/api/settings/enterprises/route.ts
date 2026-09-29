import { NextRequest, NextResponse } from "next/server";
import { getEnterprises, createEnterprise } from "@/lib/enterprise";

export async function GET() {
  try {
    const rows = await getEnterprises();
    return NextResponse.json({ rows });
  } catch (err) {
    console.error("[api/settings/enterprises] GET error:", err);
    return NextResponse.json({ message: "DB 조회에 실패했습니다." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const etpCd = body?.etpCd;
  if (typeof etpCd !== "string" || !etpCd) return NextResponse.json({ message: "잘못된 요청입니다." }, { status: 400 });

  try {
    await createEnterprise(etpCd);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    console.error("[api/settings/enterprises] POST error:", err);
    return NextResponse.json({ message: "추가에 실패했습니다." }, { status: 500 });
  }
}
