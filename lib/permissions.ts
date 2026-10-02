// Who may change what on the invoice tables. Shared by the client (which cells open for editing)
// and the server (save / import / add / delete are checked again there). No DB imports here.

export const ADMIN_USR_TYP_CD = "UTADMN"; // 시스템 관리자

/** Grantable per user or role (IHS permission grants — see PERM_GRANT_CODES in userPerms).
 *  Everything else is admin-only; viewing and Export are open to every user of the app. */
export const PERM_CODES = ["AMT", "PAY_DE"] as const;
export type PermCode = (typeof PERM_CODES)[number];
export const PERM_LABELS: Record<PermCode, string> = { AMT: "Amount 입력", PAY_DE: "Payment Date 입력" };
export const PERM_DESCRIPTIONS: Record<PermCode, string> = {
  AMT: "금액 칸 수정 (제품, 운임, 관세 등)",
  PAY_DE: "Payment Date 칸 수정",
};

export type EditPerms = { admin: boolean; codes: PermCode[] };

type Target =
  | { kind: "master"; field: string }
  | { kind: "party"; invTpCd: string; field?: string }
  | { kind: "cost"; costTpCd: string; field?: string };

/** The permission a non-admin needs to edit this value; null = admin only. Shipment master
 *  fields and SKU lines are admin only; on invoice / cost lines the amount needs AMT and the
 *  payment date PAY_DE, while names / invoice no / invoice date stay admin only. */
export function requiredPerm(target: Target | "sku"): PermCode | null {
  if (target === "sku" || target.kind === "master") return null;
  if (!target.field) return "AMT";
  if (target.field === "payDe") return "PAY_DE";
  return null;
}

export function canEdit(perms: EditPerms, target: Target | "sku"): boolean {
  if (perms.admin) return true;
  const need = requiredPerm(target);
  return need !== null && perms.codes.includes(need);
}
