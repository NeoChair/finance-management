import sql from "mssql";

const config = {
  server: process.env.DB_SERVER,
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  options: { encrypt: false, trustServerCertificate: true },
};

const pool = await new sql.ConnectionPool(config).connect();

await pool.request().query(`
  ALTER TABLE FM.TB_SHPM_DTL ADD
    HBL_NO VARCHAR(50) NULL,
    MBL_NO VARCHAR(50) NULL,
    CONT_NO VARCHAR(30) NULL,
    PO_NO VARCHAR(50) NULL,
    SNDR_NM NVARCHAR(50) NULL,
    RCVR_NM NVARCHAR(50) NULL,
    PAY_DE VARCHAR(8) NULL;
`);
console.log("ALTER TABLE FM.TB_SHPM_DTL done.");

const upd1 = await pool.request().query(`
  UPDATE d
  SET d.HBL_NO = m.HBL_NO, d.MBL_NO = m.MBL_NO, d.CONT_NO = m.CONT_NO, d.PO_NO = m.PO_NO
  FROM FM.TB_SHPM_DTL d
  JOIN FM.TB_SHPM_MST m ON m.SHPM_ID = d.SHPM_ID;
`);
console.log("Backfilled HBL/MBL/CONT/PO from master:", upd1.rowsAffected);

const upd2 = await pool.request().query(`
  UPDATE d
  SET d.SNDR_NM = i.SNDR_NM, d.RCVR_NM = i.RCVR_NM, d.PAY_DE = i.PAY_DE
  FROM FM.TB_SHPM_DTL d
  JOIN FM.TB_INV_MST i ON i.SHPM_ID = d.SHPM_ID AND i.INV_TP_CD = d.INV_TP_CD;
`);
console.log("Backfilled SNDR/RCVR/PAY_DE from TB_INV_MST:", upd2.rowsAffected);

const check = await pool.request().query(`
  SELECT TOP 10 SHPM_DTL_ID, SHPM_ID, INV_TP_CD, SKU_CD, HBL_NO, MBL_NO, CONT_NO, PO_NO, SNDR_NM, RCVR_NM, PAY_DE, QTY, AMT
  FROM FM.TB_SHPM_DTL ORDER BY SHPM_DTL_ID
`);
console.log("Sample after backfill:", JSON.stringify(check.recordset, null, 2));

await pool.close();
