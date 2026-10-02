import { getPool, sql } from "./db";
import { ADMIN_USR_TYP_CD, PERM_CODES, type EditPerms, type PermCode } from "./permissions";
import type { SessionUser } from "./session";

// Column permissions are IHS permission grants (BC.TB_PERM_GRANT), so they can also be given
// per role or managed from IHS. System admins (USR_TYP_CD = UTADMN) need none.
export const PERM_GRANT_CODES: Record<PermCode, string> = {
  AMT: "AP_FIN_AMT",
  PAY_DE: "AP_FIN_PAYDE",
};

/** Access to this app at all (checked at login). */
export const FINANCE_PERM_CD = "AP_FINANCE";

export type GrantRow ={ SUBJ_TYP_CD: string; SUBJ_CD: string; PERM_CD: string; GRANT_TYP_CD: string };

/** IHS's rule (Services/PermissionService.cs): ROLE ALLOW, plus USER ALLOW, minus USER DENY —
 *  over grants that are IS_USE = 1. */
export function isGranted(grants: GrantRow[], permCd: string, usrId: string, usrTypCd: string): boolean {
  const mine = grants.filter((g) => g.PERM_CD === permCd);
  const has = (subj: string, cd: string, type: string) => mine.some((g) => g.SUBJ_TYP_CD === subj && g.SUBJ_CD === cd && g.GRANT_TYP_CD === type);
  if (has("USER", usrId, "DENY")) return false;
  return has("ROLE", usrTypCd, "ALLOW") || has("USER", usrId, "ALLOW");
}

export function isAdmin(user: Pick<SessionUser, "usrTypCd">): boolean {
  return user.usrTypCd === ADMIN_USR_TYP_CD;
}

function bindGrantCodes(req: sql.Request): string {
  return Object.values(PERM_GRANT_CODES)
    .map((code, i) => {
      req.input(`perm${i}`, sql.VarChar(100), code);
      return `@perm${i}`;
    })
    .join(", ");
}

export async function getEditPerms(user: SessionUser): Promise<EditPerms> {
  if (isAdmin(user)) return { admin: true, codes: [...PERM_CODES] };
  const pool = await getPool();
  const req = pool
    .request()
    .input("ownrEtpCd", sql.VarChar(30), user.ownrEtpCd)
    .input("usrId", sql.VarChar(50), user.usrId)
    .input("usrTypCd", sql.VarChar(50), user.usrTypCd);
  const res = await req.query(
    `SELECT SUBJ_TYP_CD, SUBJ_CD, PERM_CD, GRANT_TYP_CD FROM BC.TB_PERM_GRANT
     WHERE OWNR_ETP_CD = @ownrEtpCd AND IS_USE = 1 AND PERM_CD IN (${bindGrantCodes(req)})
       AND ((SUBJ_TYP_CD = 'ROLE' AND SUBJ_CD = @usrTypCd) OR (SUBJ_TYP_CD = 'USER' AND SUBJ_CD = @usrId))`
  );
  const codes = PERM_CODES.filter((c) => isGranted(res.recordset, PERM_GRANT_CODES[c], user.usrId, user.usrTypCd));
  return { admin: false, codes };
}

export type UserPermRow = {
  usrId: string;
  usrNm: string;
  usrTypCd: string;
  email: string | null;
  /** Effective permissions. */
  codes: PermCode[];
  /** Of those, the ones that come from the user's role (an IHS ROLE grant). */
  viaRole: PermCode[];
};

/** Active users of one company who can use this app (AP_FINANCE granted, the same check as
 *  login) with their effective column permissions, for the admin screen. */
export async function listUserPerms(ownrEtpCd: string): Promise<UserPermRow[]> {
  const pool = await getPool();
  const users = await pool
    .request()
    .input("ownrEtpCd", sql.VarChar(30), ownrEtpCd)
    .query(`SELECT USR_ID, USR_NM, USR_TYP_CD, EMAIL FROM BC.TB_USR_MST WHERE OWNR_ETP_CD = @ownrEtpCd AND IS_USE = 1 ORDER BY USR_NM, USR_ID`);
  const req = pool.request().input("ownrEtpCd", sql.VarChar(30), ownrEtpCd).input("financePerm", sql.VarChar(100), FINANCE_PERM_CD);
  const grants = (
    await req.query(
      `SELECT SUBJ_TYP_CD, SUBJ_CD, PERM_CD, GRANT_TYP_CD FROM BC.TB_PERM_GRANT
       WHERE OWNR_ETP_CD = @ownrEtpCd AND IS_USE = 1 AND PERM_CD IN (@financePerm, ${bindGrantCodes(req)})`
    )
  ).recordset as GrantRow[];

  const appUsers = users.recordset.filter((u) => isGranted(grants, FINANCE_PERM_CD, u.USR_ID, u.USR_TYP_CD));
  return appUsers.map((u) => {
    const codes = PERM_CODES.filter((c) => isGranted(grants, PERM_GRANT_CODES[c], u.USR_ID, u.USR_TYP_CD));
    const viaRole = codes.filter((c) =>
      grants.some((g) => g.PERM_CD === PERM_GRANT_CODES[c] && g.SUBJ_TYP_CD === "ROLE" && g.SUBJ_CD === u.USR_TYP_CD && g.GRANT_TYP_CD === "ALLOW")
    );
    return { usrId: u.USR_ID, usrNm: u.USR_NM, usrTypCd: u.USR_TYP_CD, email: u.EMAIL ?? null, codes, viaRole };
  });
}

/** Turns one permission on or off for one user via their USER grant row: ALLOW to grant; to
 *  revoke, DENY when their role grants it (so only they lose it), otherwise IS_USE = 0 (the row
 *  is kept, as IHS keeps its grant history). */
export async function setUserPerm(ownrEtpCd: string, usrId: string, code: PermCode, granted: boolean, actorId: string): Promise<void> {
  const pool = await getPool();
  const permCd = PERM_GRANT_CODES[code];
  const roleGrants = await pool
    .request()
    .input("ownrEtpCd", sql.VarChar(30), ownrEtpCd)
    .input("usrId", sql.VarChar(50), usrId)
    .input("permCd", sql.VarChar(100), permCd)
    .query(
      `SELECT COUNT(*) AS N FROM BC.TB_PERM_GRANT g
       JOIN BC.TB_USR_MST u ON u.OWNR_ETP_CD = g.OWNR_ETP_CD AND u.USR_ID = @usrId AND u.USR_TYP_CD = g.SUBJ_CD
       WHERE g.OWNR_ETP_CD = @ownrEtpCd AND g.PERM_CD = @permCd AND g.SUBJ_TYP_CD = 'ROLE' AND g.GRANT_TYP_CD = 'ALLOW' AND g.IS_USE = 1`
    );
  const roleAllows = roleGrants.recordset[0].N > 0;

  const req = pool
    .request()
    .input("ownrEtpCd", sql.VarChar(30), ownrEtpCd)
    .input("usrId", sql.VarChar(50), usrId)
    .input("permCd", sql.VarChar(100), permCd)
    .input("actorId", sql.VarChar(50), actorId);
  if (!granted && !roleAllows) {
    await req.query(
      `UPDATE BC.TB_PERM_GRANT SET IS_USE = 0, MDFR_ID = @actorId, MDFY_DT = GETDATE()
       WHERE OWNR_ETP_CD = @ownrEtpCd AND SUBJ_TYP_CD = 'USER' AND SUBJ_CD = @usrId AND PERM_CD = @permCd`
    );
    return;
  }
  req.input("grantTyp", sql.VarChar(10), granted ? "ALLOW" : "DENY");
  await req.query(
    `UPDATE BC.TB_PERM_GRANT SET GRANT_TYP_CD = @grantTyp, IS_USE = 1, MDFR_ID = @actorId, MDFY_DT = GETDATE()
     WHERE OWNR_ETP_CD = @ownrEtpCd AND SUBJ_TYP_CD = 'USER' AND SUBJ_CD = @usrId AND PERM_CD = @permCd;
     IF @@ROWCOUNT = 0
       INSERT INTO BC.TB_PERM_GRANT (OWNR_ETP_CD, SUBJ_TYP_CD, SUBJ_CD, PERM_CD, GRANT_TYP_CD, IS_USE, REGR_ID, REGT_DT, MDFR_ID, MDFY_DT)
       VALUES (@ownrEtpCd, 'USER', @usrId, @permCd, @grantTyp, 1, @actorId, GETDATE(), @actorId, GETDATE())`
  );
}
