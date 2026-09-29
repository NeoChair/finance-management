import { NextRequest, NextResponse } from "next/server";
import { getCodeGroups, createCodeGroup } from "@/lib/commonCode";

export async function GET() {
  try {
    const rows = await getCodeGroups();
    return NextResponse.json({ rows });
  } catch (err) {
    console.error("[api/settings/code-groups] GET error:", err);
    return NextResponse.json({ message: "DB 조회에 실패했습니다." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const cmGrpCd = body?.cmGrpCd;
  if (typeof cmGrpCd !== "string" || !cmGrpCd) return NextResponse.json({ message: "잘못된 요청입니다." }, { status: 400 });

  try {
    await createCodeGroup(cmGrpCd);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    console.error("[api/settings/code-groups] POST error:", err);
    return NextResponse.json({ message: "추가에 실패했습니다." }, { status: 500 });
  }
}
