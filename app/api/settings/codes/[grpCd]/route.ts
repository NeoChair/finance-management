import { NextRequest, NextResponse } from "next/server";
import { getCodes, createCode } from "@/lib/commonCode";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ grpCd: string }> }) {
  const { grpCd } = await params;
  try {
    const rows = await getCodes(grpCd);
    return NextResponse.json({ rows });
  } catch (err) {
    console.error(`[api/settings/codes/${grpCd}] GET error:`, err);
    return NextResponse.json({ message: "DB 조회에 실패했습니다." }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ grpCd: string }> }) {
  const { grpCd } = await params;
  const body = await req.json().catch(() => null);
  const cmCd = body?.cmCd;
  if (typeof cmCd !== "string" || !cmCd) return NextResponse.json({ message: "잘못된 요청입니다." }, { status: 400 });

  try {
    await createCode(grpCd, cmCd);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    console.error(`[api/settings/codes/${grpCd}] POST error:`, err);
    return NextResponse.json({ message: "추가에 실패했습니다." }, { status: 500 });
  }
}
