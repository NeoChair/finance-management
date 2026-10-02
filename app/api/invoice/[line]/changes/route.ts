import { NextRequest, NextResponse } from "next/server";
import { getChangeLogs } from "@/lib/invoice";
import { getSessionUser, unauthorized } from "@/lib/currentUser";
import { slugToProductLine } from "@/lib/productLines";

/** Change log of a product line. `?last=1` → only the most recent save (for highlighting
 *  cells); otherwise the latest `limit` rows (default 1000), `?shpmId=` narrowing it to one
 *  row for that row's history modal. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ line: string }> }) {
  if (!(await getSessionUser())) return unauthorized();

  const { line } = await params;
  const prdLineCd = slugToProductLine(line);
  if (!prdLineCd) return NextResponse.json({ message: "알 수 없는 제품군입니다." }, { status: 404 });

  const sp = req.nextUrl.searchParams;
  const last = sp.get("last") === "1";
  const limit = Number(sp.get("limit") ?? 1000);
  const shpmId = sp.has("shpmId") ? Number(sp.get("shpmId")) : undefined;
  if (shpmId !== undefined && !Number.isInteger(shpmId)) return NextResponse.json({ message: "잘못된 ID입니다." }, { status: 400 });

  try {
    const entries = await getChangeLogs(prdLineCd, last ? { lastSaveOnly: true } : { limit: Number.isFinite(limit) ? limit : 1000, shpmId });
    return NextResponse.json({ entries });
  } catch (err) {
    console.error(`[api/invoice/${line}/changes] GET error:`, err);
    return NextResponse.json({ message: "변경 이력 조회에 실패했습니다." }, { status: 500 });
  }
}
