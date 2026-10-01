// Creates FM.TB_SHPM_CHG_LOG — one row per changed value, grouped per save (SAVE_ID).
// Run once:  node --env-file=.env.local scripts/create-change-log.mjs
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

const exists = await pool.request().query(`SELECT OBJECT_ID('FM.TB_SHPM_CHG_LOG') AS ID`);
if (exists.recordset[0].ID != null) {
  console.log("FM.TB_SHPM_CHG_LOG already exists — nothing to do.");
} else {
  await pool.request().query(`
    CREATE TABLE FM.TB_SHPM_CHG_LOG (
      LOG_ID       BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_TB_SHPM_CHG_LOG PRIMARY KEY,
      SAVE_ID      UNIQUEIDENTIFIER NOT NULL,   -- one save button press / one Excel upload
      PRD_LINE_CD  VARCHAR(20)   NOT NULL,
      SHPM_ID      INT           NOT NULL,      -- no FK: the log outlives deleted shipments
      CONT_NO      VARCHAR(30)   NULL,          -- container at save time, for reading the log
      TRGT_TBL     VARCHAR(30)   NOT NULL,      -- SHPM_MST / INV_MST / SHPM_COST_DTL / SHPM_DTL
      TRGT_KEY     VARCHAR(30)   NOT NULL,      -- '' / INV_TP_CD / COST_TP_CD / SHPM_DTL_ID
      COL_NM       VARCHAR(50)   NOT NULL,
      SKU_CD       VARCHAR(50)   NULL,          -- SKU line edits: the SKU code at save time
      CHG_TP_CD    CHAR(1)       NOT NULL,      -- I insert / U update / D delete
      BFR_VAL      NVARCHAR(500) NULL,
      AFT_VAL      NVARCHAR(500) NULL,
      CHG_SRC_CD   VARCHAR(10)   NOT NULL,      -- WEB (save button) / EXCEL (upload)
      REGR_ID      VARCHAR(30)   NOT NULL,
      REGR_NM      NVARCHAR(50)  NULL,
      REGT_DT      DATETIME      NOT NULL CONSTRAINT DF_TB_SHPM_CHG_LOG_REGT_DT DEFAULT GETDATE()
    );
    CREATE INDEX IX_TB_SHPM_CHG_LOG_LINE ON FM.TB_SHPM_CHG_LOG (PRD_LINE_CD, LOG_ID DESC);
    CREATE INDEX IX_TB_SHPM_CHG_LOG_SAVE ON FM.TB_SHPM_CHG_LOG (SAVE_ID);
  `);
  console.log("Created FM.TB_SHPM_CHG_LOG.");
}

await pool.close();
