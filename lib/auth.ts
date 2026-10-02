import { getPool, sql } from "./db";
import { encryptPassword } from "./passwordHash";

const FINANCE_PERM_CD = "AP_FINANCE";

export type AuthResult =
  | { ok: true; user: { usrId: string; usrNm: string; usrTypCd: string; ownrEtpCd: string; etpCd: string | null; email: string | null } }
  | { ok: false; reason: "NOT_FOUND" | "WRONG_PASSWORD" | "LOCKED" | "PW_INIT" | "PW_EXPIRED" | "NO_ACCESS" };

// BC.TB_USR_MST is IHS's user table, so its login rules apply here too (IHS.WEB
// Pages/Account/Unauthorized.cshtml.cs): locked after 5 wrong passwords, and the password must
// be changed when reset (IS_PW_INIT) or older than 3 months (PW_CHG_DE, YYYYMMDD).
const MAX_PW_ERRORS = 5;
const PW_MAX_AGE_MONTHS = 3;

function yyyymmdd(d: Date): number {
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

/** PW_CHG_DE more than 3 months back (a blank date never expires, as in IHS). */
function isPasswordExpired(pwChgDe: string | null): boolean {
  if (!pwChgDe || !/^\d{8}$/.test(pwChgDe.trim())) return false;
  const limit = new Date();
  limit.setMonth(limit.getMonth() - PW_MAX_AGE_MONTHS);
  return Number(pwChgDe.trim()) < yyyymmdd(limit);
}

type UserRow = {
  OWNR_ETP_CD: string;
  USR_ID: string;
  USR_NM: string;
  USR_PW: string;
  USR_TYP_CD: string;
  EMAIL: string | null;
  ETP_CD: string | null;
  IS_PW_INIT: boolean | null;
  PW_CHG_DE: string | null;
  PW_ERR_CNT: number | null;
};

async function findUser(usrId: string): Promise<UserRow | undefined> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("usrId", sql.VarChar(50), usrId)
    .query(
      `SELECT TOP 1 OWNR_ETP_CD, USR_ID, USR_NM, USR_PW, USR_TYP_CD, EMAIL, ETP_CD, IS_PW_INIT, PW_CHG_DE, PW_ERR_CNT
       FROM BC.TB_USR_MST
       WHERE USR_ID = @usrId AND IS_USE = 1`
    );
  return result.recordset[0];
}

/** Checks the password against the lock-out counter, updating PW_ERR_CNT the way IHS does:
 *  +1 (capped at 5) on a wrong password, back to 0 on a right one. */
async function checkPassword(row: UserRow, password: string): Promise<"OK" | "WRONG_PASSWORD" | "LOCKED"> {
  if ((row.PW_ERR_CNT ?? 0) >= MAX_PW_ERRORS) return "LOCKED";
  const ok = row.USR_PW === encryptPassword(password);
  const pool = await getPool();
  await pool
    .request()
    .input("ownrEtpCd", sql.VarChar(30), row.OWNR_ETP_CD)
    .input("usrId", sql.VarChar(50), row.USR_ID)
    .input("max", sql.SmallInt, MAX_PW_ERRORS)
    .query(
      ok
        ? `UPDATE BC.TB_USR_MST SET PW_ERR_CNT = 0 WHERE OWNR_ETP_CD = @ownrEtpCd AND USR_ID = @usrId AND ISNULL(PW_ERR_CNT, 0) <> 0`
        : `UPDATE BC.TB_USR_MST SET PW_ERR_CNT = CASE WHEN ISNULL(PW_ERR_CNT, 0) + 1 > @max THEN @max ELSE ISNULL(PW_ERR_CNT, 0) + 1 END
           WHERE OWNR_ETP_CD = @ownrEtpCd AND USR_ID = @usrId`
    );
  return ok ? "OK" : "WRONG_PASSWORD";
}

export async function verifyCredentials(usrId: string, password: string): Promise<AuthResult> {
  const row = await findUser(usrId);
  if (!row) {
    return { ok: false, reason: "NOT_FOUND" };
  }

  // Unlike IHS, the password is checked before the reset/expiry checks: the change-password
  // form that follows needs to know the current password was right.
  const pw = await checkPassword(row, password);
  if (pw !== "OK") {
    return { ok: false, reason: pw };
  }

  if (row.IS_PW_INIT) {
    return { ok: false, reason: "PW_INIT" };
  }
  if (isPasswordExpired(row.PW_CHG_DE)) {
    return { ok: false, reason: "PW_EXPIRED" };
  }

  const hasAccess = await checkFinanceAccess(row.OWNR_ETP_CD, row.USR_ID, row.USR_TYP_CD);
  if (!hasAccess) {
    return { ok: false, reason: "NO_ACCESS" };
  }

  const pool = await getPool();
  await pool
    .request()
    .input("ownrEtpCd", sql.VarChar(30), row.OWNR_ETP_CD)
    .input("usrId", sql.VarChar(50), row.USR_ID)
    .query(`UPDATE BC.TB_USR_MST SET LAST_SIGN_DT = GETDATE() WHERE OWNR_ETP_CD = @ownrEtpCd AND USR_ID = @usrId`);

  return {
    ok: true,
    user: {
      usrId: row.USR_ID,
      usrNm: row.USR_NM,
      usrTypCd: row.USR_TYP_CD,
      ownrEtpCd: row.OWNR_ETP_CD,
      etpCd: row.ETP_CD ?? null,
      email: row.EMAIL ?? null,
    },
  };
}

/** Why a new password is rejected, or null when it's acceptable.
 *  TODO: match IHS's Utilities.PasswordValidator.ValidatePassword(newPwd, userId) once its
 *  rules are known; these are provisional (IHS's login form allows 6–20 characters). */
export function newPasswordProblem(usrId: string, current: string, next: string): string | null {
  if (next.length < 8 || next.length > 20) return "비밀번호는 8자 이상 20자 이하여야 합니다.";
  if (next.toLowerCase().includes(usrId.toLowerCase())) return "비밀번호에 아이디를 포함할 수 없습니다.";
  // IHS hashes ASCII bytes (non-ASCII becomes '?'), so anything else would weaken / break it.
  if (!/^[\x21-\x7e]+$/.test(next)) return "비밀번호는 영문, 숫자, 특수문자만 사용할 수 있습니다 (공백 제외).";
  if (!/[A-Za-z]/.test(next) || !/[0-9]/.test(next)) return "비밀번호에는 영문과 숫자가 모두 포함되어야 합니다.";
  if (next === current) return "현재 비밀번호와 다른 비밀번호를 입력하세요.";
  return null;
}

export type ChangePasswordResult =
  | { ok: true }
  | { ok: false; reason: "NOT_FOUND" | "WRONG_PASSWORD" | "LOCKED" | "NOT_REQUIRED" | "INVALID"; message?: string };

/** Sets a new password for a user who must change theirs (reset: IS_PW_INIT, or older than 3
 *  months), after checking the current one under the same lock-out counter as login. Writes
 *  BC.TB_USR_MST, the table IHS logs in with, using IHS's own hashing and the same columns its
 *  password change sets, so the new password works there too. */
export async function changeRequiredPassword(usrId: string, current: string, next: string): Promise<ChangePasswordResult> {
  const row = await findUser(usrId);
  if (!row) return { ok: false, reason: "NOT_FOUND" };
  const pw = await checkPassword(row, current);
  if (pw !== "OK") return { ok: false, reason: pw };
  if (!row.IS_PW_INIT && !isPasswordExpired(row.PW_CHG_DE)) return { ok: false, reason: "NOT_REQUIRED" };
  const problem = newPasswordProblem(usrId, current, next);
  if (problem) return { ok: false, reason: "INVALID", message: problem };

  // PW_CHG_DE is YYYYMMDD, like the rows IHS writes.
  const pool = await getPool();
  await pool
    .request()
    .input("ownrEtpCd", sql.VarChar(30), row.OWNR_ETP_CD)
    .input("usrId", sql.VarChar(50), row.USR_ID)
    .input("pw", sql.VarChar(150), encryptPassword(next))
    .query(
      `UPDATE BC.TB_USR_MST
       SET USR_PW = @pw, IS_PW_INIT = 0, PW_CHG_DE = CONVERT(VARCHAR(8), GETDATE(), 112), PW_ERR_CNT = 0,
           MDFR_ID = @usrId, MDFY_DT = GETDATE()
       WHERE OWNR_ETP_CD = @ownrEtpCd AND USR_ID = @usrId`
    );
  return { ok: true };
}

export type ExtendPasswordResult =
  | { ok: true }
  | { ok: false; reason: "NOT_FOUND" | "WRONG_PASSWORD" | "LOCKED" | "NOT_EXPIRED" | "PW_INIT" };

/** "90일 연장": keeps an expired (3-month-old) password by restarting its age — PW_CHG_DE set
 *  to today, which IHS reads too. Not offered for a reset password, which must be replaced. */
export async function extendPasswordExpiry(usrId: string, current: string): Promise<ExtendPasswordResult> {
  const row = await findUser(usrId);
  if (!row) return { ok: false, reason: "NOT_FOUND" };
  const pw = await checkPassword(row, current);
  if (pw !== "OK") return { ok: false, reason: pw };
  if (row.IS_PW_INIT) return { ok: false, reason: "PW_INIT" };
  if (!isPasswordExpired(row.PW_CHG_DE)) return { ok: false, reason: "NOT_EXPIRED" };

  const pool = await getPool();
  await pool
    .request()
    .input("ownrEtpCd", sql.VarChar(30), row.OWNR_ETP_CD)
    .input("usrId", sql.VarChar(50), row.USR_ID)
    .query(
      `UPDATE BC.TB_USR_MST
       SET PW_CHG_DE = CONVERT(VARCHAR(8), GETDATE(), 112), MDFR_ID = @usrId, MDFY_DT = GETDATE()
       WHERE OWNR_ETP_CD = @ownrEtpCd AND USR_ID = @usrId`
    );
  return { ok: true };
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
