import { getPool, sql } from "./db";

export type Warehouse = {
  wrhsCd: string;
  wrhsNm: string | null;
  wrhsAlasCd: string | null;
  wrhsStatCd: string | null;
};

const OWNR_ETP_CD = "KR-DT-HG";
const REGR_ID = "web_ui";

export async function getWarehouses(): Promise<Warehouse[]> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("ownrEtpCd", sql.VarChar(30), OWNR_ETP_CD)
    .query(
      `SELECT WRHS_CD, WRHS_NM, WRHS_ALAS_CD, WRHS_STAT_CD
       FROM WM.TB_WRHS_MST
       WHERE OWNR_ETP_CD = @ownrEtpCd
       ORDER BY WRHS_CD`
    );
  return result.recordset.map((r) => ({
    wrhsCd: r.WRHS_CD,
    wrhsNm: r.WRHS_NM,
    wrhsAlasCd: r.WRHS_ALAS_CD,
    wrhsStatCd: r.WRHS_STAT_CD,
  }));
}

export async function createWarehouse(wrhsCd: string): Promise<void> {
  const pool = await getPool();
  // WRHS_NM/SCM_OWNR_ETP_CD/WRHS_KND_CD/LOCL_NATN_CD/LOCL_ZIP_CD/LOCL_ADDR_DFT/REGT_DT/MDFY_DT
  // are all NOT NULL with no DB-level default on this shared master table — placeholder blanks
  // (and GETDATE() for the timestamps) let the insert succeed; the name gets filled in
  // immediately via inline edit right after.
  await pool
    .request()
    .input("ownrEtpCd", sql.VarChar(30), OWNR_ETP_CD)
    .input("wrhsCd", sql.VarChar(15), wrhsCd)
    .input("regrId", sql.VarChar(30), REGR_ID)
    .query(
      `INSERT INTO WM.TB_WRHS_MST
         (OWNR_ETP_CD, WRHS_CD, WRHS_NM, SCM_OWNR_ETP_CD, WRHS_KND_CD, LOCL_NATN_CD, LOCL_ZIP_CD, LOCL_ADDR_DFT, REGT_DT, MDFR_ID, MDFY_DT, REGR_ID)
       VALUES
         (@ownrEtpCd, @wrhsCd, N'', @ownrEtpCd, '', '', '', N'', GETDATE(), @regrId, GETDATE(), @regrId)`
    );
}

// Field names are whitelisted below and mapped to fixed column names — never built from
// client-supplied strings — so this stays safe from SQL injection despite the dynamic SQL text.
const WRHS_FIELD_COLUMNS: Record<string, string> = {
  wrhsCd: "WRHS_CD",
  wrhsNm: "WRHS_NM",
  wrhsAlasCd: "WRHS_ALAS_CD",
  wrhsStatCd: "WRHS_STAT_CD",
};

export async function updateWarehouseField(wrhsCd: string, field: string, value: string | null): Promise<void> {
  const column = WRHS_FIELD_COLUMNS[field];
  if (!column) throw new Error(`Unknown warehouse field: ${field}`);
  const pool = await getPool();
  await pool
    .request()
    .input("ownrEtpCd", sql.VarChar(30), OWNR_ETP_CD)
    .input("wrhsCd", sql.VarChar(15), wrhsCd)
    .input("value", sql.NVarChar(200), value)
    .input("mdfrId", sql.VarChar(30), REGR_ID)
    .query(`UPDATE WM.TB_WRHS_MST SET ${column} = @value, MDFR_ID = @mdfrId, MDFY_DT = GETDATE() WHERE OWNR_ETP_CD = @ownrEtpCd AND WRHS_CD = @wrhsCd`);
}

export async function deleteWarehouse(wrhsCd: string): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input("ownrEtpCd", sql.VarChar(30), OWNR_ETP_CD)
    .input("wrhsCd", sql.VarChar(15), wrhsCd)
    .query(`DELETE FROM WM.TB_WRHS_MST WHERE OWNR_ETP_CD = @ownrEtpCd AND WRHS_CD = @wrhsCd`);
}
