// Maps the URL-friendly product line slug (used in /Invoice/* pages and /api/invoice/*) to the
// PRD_LINE_CD stored in FM.TB_SHPM_MST.
const SLUG_TO_PRD_LINE: Record<string, string> = {
  chair: "CHAIR",
  "chair-wf": "CHAIR_WF",
  mattress: "MATTRESS",
  tyj: "CHAIR_TYJ",
};

export function slugToProductLine(slug: string): string | null {
  return SLUG_TO_PRD_LINE[slug] ?? null;
}
