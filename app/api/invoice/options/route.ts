import { NextResponse } from "next/server";
import { getPartyOptions } from "@/lib/invoice";

export async function GET() {
  try {
    return NextResponse.json({ options: await getPartyOptions() });
  } catch (err) {
    console.error("[api/invoice/options] GET error:", err);
    return NextResponse.json({ message: "DB 조회에 실패했습니다." }, { status: 500 });
  }
}
