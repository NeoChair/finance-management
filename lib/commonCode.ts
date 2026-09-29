import { getPool, sql } from "./db";

export type CodeGroup = {
  cmGrpCd: string;
  cmGrpNm: string;
};

export type Code = {
  cmCd: string;
  cmNm: string;
  cmDesc: string | null;
};

const OWNR_ETP_CD = "KR-DT-HG";
const REGR_ID = "web_ui";

export async function getCodeGroups(): Promise<CodeGroup[]> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("ownrEtpCd", sql.VarChar(30), OWNR_ETP_CD)
    .query(`SELECT CM_GRP_CD, CM_GRP_NM FROM BC.TB_CM_GRP_CD WHERE OWNR_ETP_CD = @ownrEtpCd ORDER BY CM_GRP_CD`);
  return result.recordset.map((r) => ({ cmGrpCd: r.CM_GRP_CD, cmGrpNm: r.CM_GRP_NM }));
}

export async function createCodeGroup(cmGrpCd: string): Promise<void> {
  const pool = await getPool();
  // CM_GRP_NM/IS_USE/REGT_DT/MDFY_DT are NOT NULL with no DB-level default — seed a blank name,
  // "in use", and GETDATE() timestamps so the insert succeeds; the name gets filled in
  // immediately via inline edit right after.
  await pool
    .request()
    .input("ownrEtpCd", sql.VarChar(30), OWNR_ETP_CD)
    .input("cmGrpCd", sql.VarChar(20), cmGrpCd)
    .input("regrId", sql.VarChar(50), REGR_ID)
    .query(
      `INSERT INTO BC.TB_CM_GRP_CD (OWNR_ETP_CD, CM_GRP_CD, CM_GRP_NM, IS_USE, REGT_DT, MDFR_ID, MDFY_DT, REGR_ID)
       VALUES (@ownrEtpCd, @cmGrpCd, N'', 1, GETDATE(), @regrId, GETDATE(), @regrId)`
    );
}

const GROUP_FIELD_COLUMNS: Record<string, string> = {
  cmGrpCd: "CM_GRP_CD",
  cmGrpNm: "CM_GRP_NM",
};

export async function updateCodeGroupField(cmGrpCd: string, field: string, value: string | null): Promise<void> {
  const column = GROUP_FIELD_COLUMNS[field];
  if (!column) throw new Error(`Unknown code group field: ${field}`);
  const pool = await getPool();
  await pool
    .request()
    .input("ownrEtpCd", sql.VarChar(30), OWNR_ETP_CD)
    .input("cmGrpCd", sql.VarChar(20), cmGrpCd)
    .input("value", sql.NVarChar(50), value ?? "")
    .input("mdfrId", sql.VarChar(50), REGR_ID)
    .query(`UPDATE BC.TB_CM_GRP_CD SET ${column} = @value, MDFR_ID = @mdfrId, MDFY_DT = GETDATE() WHERE OWNR_ETP_CD = @ownrEtpCd AND CM_GRP_CD = @cmGrpCd`);
}

export async function deleteCodeGroup(cmGrpCd: string): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input("ownrEtpCd", sql.VarChar(30), OWNR_ETP_CD)
    .input("cmGrpCd", sql.VarChar(20), cmGrpCd)
    .query(`DELETE FROM BC.TB_CM_GRP_CD WHERE OWNR_ETP_CD = @ownrEtpCd AND CM_GRP_CD = @cmGrpCd`);
}

export async function getCodes(cmGrpCd: string): Promise<Code[]> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("ownrEtpCd", sql.VarChar(30), OWNR_ETP_CD)
    .input("cmGrpCd", sql.VarChar(20), cmGrpCd)
    .query(
      `SELECT CM_CD, CM_NM, CM_DESC FROM BC.TB_CM_CD
       WHERE OWNR_ETP_CD = @ownrEtpCd AND CM_GRP_CD = @cmGrpCd
       ORDER BY SORT_ORDR, CM_CD`
    );
  return result.recordset.map((r) => ({ cmCd: r.CM_CD, cmNm: r.CM_NM, cmDesc: r.CM_DESC }));
}

export async function createCode(cmGrpCd: string, cmCd: string): Promise<void> {
  const pool = await getPool();
  // CM_NM/SORT_ORDR/IS_USE/REGT_DT/MDFY_DT are NOT NULL with no default — same
  // placeholder-then-edit approach as createCodeGroup.
  await pool
    .request()
    .input("ownrEtpCd", sql.VarChar(30), OWNR_ETP_CD)
    .input("cmGrpCd", sql.VarChar(20), cmGrpCd)
    .input("cmCd", sql.VarChar(12), cmCd)
    .input("regrId", sql.VarChar(50), REGR_ID)
    .query(
      `INSERT INTO BC.TB_CM_CD (OWNR_ETP_CD, CM_GRP_CD, CM_CD, CM_NM, SORT_ORDR, IS_USE, REGT_DT, MDFR_ID, MDFY_DT, REGR_ID)
       VALUES (@ownrEtpCd, @cmGrpCd, @cmCd, N'', 0, 1, GETDATE(), @regrId, GETDATE(), @regrId)`
    );
}

const CODE_FIELD_COLUMNS: Record<string, string> = {
  cmCd: "CM_CD",
  cmNm: "CM_NM",
  cmDesc: "CM_DESC",
};

export async function updateCodeField(cmGrpCd: string, cmCd: string, field: string, value: string | null): Promise<void> {
  const column = CODE_FIELD_COLUMNS[field];
  if (!column) throw new Error(`Unknown code field: ${field}`);
  const pool = await getPool();
  await pool
    .request()
    .input("ownrEtpCd", sql.VarChar(30), OWNR_ETP_CD)
    .input("cmGrpCd", sql.VarChar(20), cmGrpCd)
    .input("cmCd", sql.VarChar(12), cmCd)
    .input("value", field === "cmNm" ? sql.NVarChar(100) : sql.NVarChar(200), field === "cmNm" ? (value ?? "") : value)
    .input("mdfrId", sql.VarChar(50), REGR_ID)
    .query(`UPDATE BC.TB_CM_CD SET ${column} = @value, MDFR_ID = @mdfrId, MDFY_DT = GETDATE() WHERE OWNR_ETP_CD = @ownrEtpCd AND CM_GRP_CD = @cmGrpCd AND CM_CD = @cmCd`);
}

export async function deleteCode(cmGrpCd: string, cmCd: string): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input("ownrEtpCd", sql.VarChar(30), OWNR_ETP_CD)
    .input("cmGrpCd", sql.VarChar(20), cmGrpCd)
    .input("cmCd", sql.VarChar(12), cmCd)
    .query(`DELETE FROM BC.TB_CM_CD WHERE OWNR_ETP_CD = @ownrEtpCd AND CM_GRP_CD = @cmGrpCd AND CM_CD = @cmCd`);
}
