import { getPool, sql } from "./db";

export type Enterprise = {
  etpCd: string;
  etpNm: string | null;
  loclNatnCd: string | null;
};

const OWNR_ETP_CD = "KR-DT-HG";
const REGR_ID = "web_ui";

export async function getEnterprises(): Promise<Enterprise[]> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("ownrEtpCd", sql.VarChar(30), OWNR_ETP_CD)
    .query(
      `SELECT ETP_CD, ETP_NM, LOCL_NATN_CD
       FROM BC.TB_ETP_MST
       WHERE OWNR_ETP_CD = @ownrEtpCd
       ORDER BY ETP_CD`
    );
  return result.recordset.map((r) => ({
    etpCd: r.ETP_CD,
    etpNm: r.ETP_NM,
    loclNatnCd: r.LOCL_NATN_CD,
  }));
}

export async function createEnterprise(etpCd: string): Promise<void> {
  const pool = await getPool();
  // ETP_NM/REGT_DT/MDFY_DT are NOT NULL with no DB-level default — a placeholder blank name
  // (filled in immediately via inline edit) and GETDATE() for the timestamps let the insert
  // succeed.
  await pool
    .request()
    .input("ownrEtpCd", sql.VarChar(30), OWNR_ETP_CD)
    .input("etpCd", sql.VarChar(30), etpCd)
    .input("regrId", sql.VarChar(30), REGR_ID)
    .query(
      `INSERT INTO BC.TB_ETP_MST (OWNR_ETP_CD, ETP_CD, ETP_NM, REGT_DT, MDFR_ID, MDFY_DT, REGR_ID)
       VALUES (@ownrEtpCd, @etpCd, N'', GETDATE(), @regrId, GETDATE(), @regrId)`
    );
}

// Field names are whitelisted below and mapped to fixed column names — never built from
// client-supplied strings — so this stays safe from SQL injection despite the dynamic SQL text.
const ETP_FIELD_COLUMNS: Record<string, string> = {
  etpCd: "ETP_CD",
  etpNm: "ETP_NM",
  loclNatnCd: "LOCL_NATN_CD",
};

export async function updateEnterpriseField(etpCd: string, field: string, value: string | null): Promise<void> {
  const column = ETP_FIELD_COLUMNS[field];
  if (!column) throw new Error(`Unknown enterprise field: ${field}`);
  const pool = await getPool();
  await pool
    .request()
    .input("ownrEtpCd", sql.VarChar(30), OWNR_ETP_CD)
    .input("etpCd", sql.VarChar(30), etpCd)
    .input("value", sql.NVarChar(200), value)
    .input("mdfrId", sql.VarChar(30), REGR_ID)
    .query(`UPDATE BC.TB_ETP_MST SET ${column} = @value, MDFR_ID = @mdfrId, MDFY_DT = GETDATE() WHERE OWNR_ETP_CD = @ownrEtpCd AND ETP_CD = @etpCd`);
}

export async function deleteEnterprise(etpCd: string): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input("ownrEtpCd", sql.VarChar(30), OWNR_ETP_CD)
    .input("etpCd", sql.VarChar(30), etpCd)
    .query(`DELETE FROM BC.TB_ETP_MST WHERE OWNR_ETP_CD = @ownrEtpCd AND ETP_CD = @etpCd`);
}
