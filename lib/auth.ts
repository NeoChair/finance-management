import { getPool, sql } from "./db";
import { encryptPassword } from "./passwordHash";

const FINANCE_PERM_CD = "AP_FINANCE";

export type AuthResult =
  | { ok: true; user: { usrId: string; usrNm: string; usrTypCd: string; ownrEtpCd: string; email: string | null } }
  | { ok: false; reason: "NOT_FOUND" | "WRONG_PASSWORD" | "PW_INIT" | "NO_ACCESS" };

export async function verifyCredentials(usrId: string, password: string): Promise<AuthResult> {
  const pool = await getPool();

  const userResult = await pool
    .request()
    .input("usrId", sql.VarChar(50), usrId)
    .query(
      `SELECT TOP 1 OWNR_ETP_CD, USR_ID, USR_NM, USR_PW, USR_TYP_CD, EMAIL, IS_PW_INIT
       FROM BC.TB_USR_MST
       WHERE USR_ID = @usrId AND IS_USE = 1`
    );

  const row = userResult.recordset[0];
  if (!row) {
    return { ok: false, reason: "NOT_FOUND" };
  }

  if (row.USR_PW !== encryptPassword(password)) {
    return { ok: false, reason: "WRONG_PASSWORD" };
  }

  if (row.IS_PW_INIT) {
    return { ok: false, reason: "PW_INIT" };
  }

  const hasAccess = await checkFinanceAccess(row.OWNR_ETP_CD, row.USR_ID, row.USR_TYP_CD);
  if (!hasAccess) {
    return { ok: false, reason: "NO_ACCESS" };
  }

  return {
    ok: true,
    user: {
      usrId: row.USR_ID,
      usrNm: row.USR_NM,
      usrTypCd: row.USR_TYP_CD,
      ownrEtpCd: row.OWNR_ETP_CD,
      email: row.EMAIL ?? null,
    },
  };
}

// Mirrors IHS.WEB's Services/PermissionService.cs: ROLE ALLOW, minus USER DENY, plus USER ALLOW.
async function checkFinanceAccess(ownrEtpCd: string, usrId: string, usrTypCd: string): Promise<boolean> {
  const pool = await getPool();

  const result = await pool
    .request()
    .input("ownrEtpCd", sql.VarChar(30), ownrEtpCd)
    .input("usrId", sql.VarChar(50), usrId)
    .input("usrTypCd", sql.VarChar(50), usrTypCd)
    .input("permCd", sql.VarChar(12), FINANCE_PERM_CD)
    .query(
      `SELECT SUBJ_TYP_CD, SUBJ_CD, GRANT_TYP_CD
       FROM BC.TB_PERM_GRANT
       WHERE OWNR_ETP_CD = @ownrEtpCd
         AND PERM_CD = @permCd
         AND IS_USE = 1
         AND (
           (SUBJ_TYP_CD = 'ROLE' AND SUBJ_CD = @usrTypCd)
           OR (SUBJ_TYP_CD = 'USER' AND SUBJ_CD = @usrId)
         )`
    );

  let allowed = false;
  for (const grant of result.recordset) {
    if (grant.SUBJ_TYP_CD === "ROLE" && grant.GRANT_TYP_CD === "ALLOW") {
      allowed = true;
    }
  }
  for (const grant of result.recordset) {
    if (grant.SUBJ_TYP_CD === "USER" && grant.GRANT_TYP_CD === "ALLOW") {
      allowed = true;
    }
  }
  for (const grant of result.recordset) {
    if (grant.SUBJ_TYP_CD === "USER" && grant.GRANT_TYP_CD === "DENY") {
      allowed = false;
    }
  }

  return allowed;
}
