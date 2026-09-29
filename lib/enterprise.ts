import { getPool, sql } from "./db";

export type Enterprise = {
  etpCd: string;
  etpNm: string | null;
  loclNatnCd: string | null;
  /** "Y" | "N" — IS_USE is a bit; kept as text so the generic CRUD table can edit it. */
  isUse: "Y" | "N";
  remk: string | null;
};

const OWNR_ETP_CD = "KR-DT-HG";
const REGR_ID = "web_ui";

export async function getEnterprises(): Promise<Enterprise[]> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("ownrEtpCd", sql.VarChar(30), OWNR_ETP_CD)
    .query(
      `SELECT ETP_CD, ETP_NM, LOCL_NATN_CD, IS_USE, REMK
       FROM BC.TB_ETP_MST
       WHERE OWNR_ETP_CD = @ownrEtpCd
       ORDER BY ETP_CD`
    );
  return result.recordset.map((r) => ({
    etpCd: r.ETP_CD,
    etpNm: r.ETP_NM,
    loclNatnCd: r.LOCL_NATN_CD,
    isUse: r.IS_USE ? "Y" : "N",
    remk: r.REMK,
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
const ETP_FIELD_COLUMNS: Record<string, { column: string; type: sql.ISqlType | (() => sql.ISqlType) }> = {
  etpCd: { column: "ETP_CD", type: sql.VarChar(30) },
  etpNm: { column: "ETP_NM", type: sql.NVarChar(127) },
  loclNatnCd: { column: "LOCL_NATN_CD", type: sql.VarChar(12) },
  isUse: { column: "IS_USE", type: sql.Bit },
  remk: { column: "REMK", type: sql.NVarChar(sql.MAX) },
};

export async function updateEnterpriseField(etpCd: string, field: string, value: string | null): Promise<void> {
  const spec = ETP_FIELD_COLUMNS[field];
  if (!spec) throw new Error(`Unknown enterprise field: ${field}`);
  // IS_USE is NOT NULL: anything but an explicit "N" means in use.
  const dbValue = field === "isUse" ? value !== "N" : value;
  const pool = await getPool();
  await pool
    .request()
    .input("ownrEtpCd", sql.VarChar(30), OWNR_ETP_CD)
    .input("etpCd", sql.VarChar(30), etpCd)
    .input("value", spec.type, dbValue)
    .input("mdfrId", sql.VarChar(30), REGR_ID)
    .query(`UPDATE BC.TB_ETP_MST SET ${spec.column} = @value, MDFR_ID = @mdfrId, MDFY_DT = GETDATE() WHERE OWNR_ETP_CD = @ownrEtpCd AND ETP_CD = @etpCd`);
}

export async function deleteEnterprise(etpCd: string): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input("ownrEtpCd", sql.VarChar(30), OWNR_ETP_CD)
    .input("etpCd", sql.VarChar(30), etpCd)
    .query(`DELETE FROM BC.TB_ETP_MST WHERE OWNR_ETP_CD = @ownrEtpCd AND ETP_CD = @etpCd`);
}
