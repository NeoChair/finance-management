import { getPool, sql } from "./db";

export type InvoiceCost = {
  costTpCd: string;
  costTpNm: string;
  amt: number;
  sndrNm: string | null;
  rcvrNm: string | null;
  invNo: string | null;
  invDe: string | null;
  payDe: string | null;
};

export type InvoiceParty = {
  sndrNm: string | null;
  rcvrNm: string | null;
  payDe: string | null;
  amt: number | null;
};

export type InvoiceSku = {
  shpmDtlId: number;
  skuCd: string;
  mdlNm: string | null;
  qty: number | null;
  unitPrc: number | null;
  amt: number | null;
};

export type InvoiceRow = {
  shpmId: number;
  poNo: string | null;
  hblNo: string | null;
  mblNo: string | null;
  contNo: string | null;
  suplFactNm: string | null;
  sttsNm: string | null;
  loadType: string | null;
  subpoNo: string | null;
  currCd: string | null;
  podNm: string | null;
  etd: string | null;
  eta: string | null;
  wrhsArrvDe: string | null;
  usdExchRt: number | null;
  invNo: string | null;
  invDe: string | null;
  qty: number | null;
  amt: number | null;
  rmrk: string | null;
  neoInv: InvoiceParty | null;
  factoryInv: InvoiceParty | null;
  costs: InvoiceCost[];
  skuDetails: InvoiceSku[];
};

/** Editable subset used by the create/update forms — the master shipment record only.
 *  The product qty/amount shown on the row is SUM(TB_SHPM_DTL) and is edited per SKU line. */
export type ShipmentInput = {
  prdLineCd: string;
  ownrEtpCd: string;
  suplFactNm: string | null;
  sttsNm: string | null;
  loadType: string | null;
  hblNo: string | null;
  mblNo: string | null;
  contNo: string | null;
  poNo: string | null;
  subpoNo: string | null;
  podNm: string | null;
  etd: string | null;
  eta: string | null;
  wrhsArrvDe: string | null;
  usdExchRt: number | null;
  invNo: string | null;
  invDe: string | null;
  currCd: string | null;
  rmrk: string | null;
};

export async function getInvoicesByProductLine(prdLineCd: string): Promise<InvoiceRow[]> {
  const pool = await getPool();

  const shpmResult = await pool
    .request()
    .input("prdLineCd", sql.VarChar(20), prdLineCd)
    .query(
      `SELECT s.SHPM_ID, s.PO_NO, s.HBL_NO, s.MBL_NO, s.CONT_NO, s.SUPL_FACT_NM, s.STTS_NM,
              s.LOAD_TYPE, s.SUBPO_NO, s.CURR_CD, s.INV_NO, s.INV_DE,
              s.POD_NM, s.ETD, s.ETA, s.WRHS_ARRV_DE, s.USD_EXCH_RT, s.RMRK,
              d.QTY, d.AMT
       FROM FM.TB_SHPM_MST s
       OUTER APPLY (
         SELECT SUM(QTY) AS QTY, SUM(AMT) AS AMT
         FROM FM.TB_SHPM_DTL
         WHERE SHPM_ID = s.SHPM_ID AND INV_TP_CD = 'NEO'
       ) d
       WHERE s.PRD_LINE_CD = @prdLineCd
       ORDER BY s.SHPM_ID`
    );

  const invResult = await pool
    .request()
    .input("prdLineCd", sql.VarChar(20), prdLineCd)
    .query(
      `SELECT i.SHPM_ID, i.INV_TP_CD, i.SNDR_NM, i.RCVR_NM, i.PAY_DE, i.AMT
       FROM FM.TB_INV_MST i
       JOIN FM.TB_SHPM_MST s ON s.SHPM_ID = i.SHPM_ID
       WHERE s.PRD_LINE_CD = @prdLineCd`
    );

  const costsResult = await pool
    .request()
    .input("prdLineCd", sql.VarChar(20), prdLineCd)
    .query(
      `SELECT c.SHPM_ID, c.COST_TP_CD, t.COST_TP_NM, c.AMT, c.SNDR_NM, c.RCVR_NM, c.INV_NO, c.INV_DE, c.PAY_DE
       FROM FM.TB_SHPM_COST_DTL c
       JOIN FM.TB_SHPM_MST s ON s.SHPM_ID = c.SHPM_ID
       JOIN FM.TB_COST_TYPE_MST t ON t.COST_TP_CD = c.COST_TP_CD
       WHERE s.PRD_LINE_CD = @prdLineCd
       ORDER BY t.SORT_ORD`
    );

  const skuResult = await pool
    .request()
    .input("prdLineCd", sql.VarChar(20), prdLineCd)
    .query(
      `SELECT d.SHPM_DTL_ID, d.SHPM_ID, d.SKU_CD, d.MDL_NM, d.QTY, d.UNIT_PRC, d.AMT
       FROM FM.TB_SHPM_DTL d
       JOIN FM.TB_SHPM_MST s ON s.SHPM_ID = d.SHPM_ID
       WHERE s.PRD_LINE_CD = @prdLineCd AND d.INV_TP_CD = 'NEO'
       ORDER BY d.SHPM_DTL_ID`
    );

  const invByShpm = new Map<number, { neo?: InvoiceParty; factory?: InvoiceParty }>();
  for (const row of invResult.recordset) {
    const entry = invByShpm.get(row.SHPM_ID) ?? {};
    const party: InvoiceParty = {
      sndrNm: row.SNDR_NM,
      rcvrNm: row.RCVR_NM,
      payDe: row.PAY_DE,
      amt: row.AMT,
    };
    if (row.INV_TP_CD === "NEO") entry.neo = party;
    if (row.INV_TP_CD === "FACTORY") entry.factory = party;
    invByShpm.set(row.SHPM_ID, entry);
  }

  const costsByShpm = new Map<number, InvoiceCost[]>();
  for (const row of costsResult.recordset) {
    const list = costsByShpm.get(row.SHPM_ID) ?? [];
    list.push({
      costTpCd: row.COST_TP_CD,
      costTpNm: row.COST_TP_NM,
      amt: row.AMT,
      sndrNm: row.SNDR_NM,
      rcvrNm: row.RCVR_NM,
      invNo: row.INV_NO,
      invDe: row.INV_DE,
      payDe: row.PAY_DE,
    });
    costsByShpm.set(row.SHPM_ID, list);
  }

  const skuByShpm = new Map<number, InvoiceSku[]>();
  for (const row of skuResult.recordset) {
    const list = skuByShpm.get(row.SHPM_ID) ?? [];
    list.push({
      shpmDtlId: row.SHPM_DTL_ID,
      skuCd: row.SKU_CD,
      mdlNm: row.MDL_NM,
      qty: row.QTY,
      unitPrc: row.UNIT_PRC,
      amt: row.AMT,
    });
    skuByShpm.set(row.SHPM_ID, list);
  }

  return shpmResult.recordset.map((r) => ({
    shpmId: r.SHPM_ID,
    poNo: r.PO_NO,
    hblNo: r.HBL_NO,
    mblNo: r.MBL_NO,
    contNo: r.CONT_NO,
    suplFactNm: r.SUPL_FACT_NM,
    sttsNm: r.STTS_NM,
    loadType: r.LOAD_TYPE,
    subpoNo: r.SUBPO_NO,
    currCd: r.CURR_CD,
    podNm: r.POD_NM,
    etd: r.ETD,
    eta: r.ETA,
    wrhsArrvDe: r.WRHS_ARRV_DE,
    usdExchRt: r.USD_EXCH_RT,
    invNo: r.INV_NO,
    invDe: r.INV_DE,
    qty: r.QTY,
    amt: r.AMT,
    rmrk: r.RMRK,
    neoInv: invByShpm.get(r.SHPM_ID)?.neo ?? null,
    factoryInv: invByShpm.get(r.SHPM_ID)?.factory ?? null,
    costs: costsByShpm.get(r.SHPM_ID) ?? [],
    skuDetails: skuByShpm.get(r.SHPM_ID) ?? [],
  }));
}

const REGR_ID = "web_ui";

/** Distinct values already stored in each party-name column, across all product lines, keyed
 *  like invoiceColumns.optionKey(). Feeds the Shipper/Sender/Receiver/Buyer/Seller dropdowns. */
export async function getPartyOptions(): Promise<Record<string, string[]>> {
  const pool = await getPool();
  const result = await pool.request().query(
    `SELECT 'master:suplFactNm' AS K, SUPL_FACT_NM AS V FROM FM.TB_SHPM_MST WHERE SUPL_FACT_NM IS NOT NULL
     UNION SELECT 'party:' + INV_TP_CD + ':sndrNm', SNDR_NM FROM FM.TB_INV_MST WHERE SNDR_NM IS NOT NULL
     UNION SELECT 'party:' + INV_TP_CD + ':rcvrNm', RCVR_NM FROM FM.TB_INV_MST WHERE RCVR_NM IS NOT NULL
     UNION SELECT 'cost:' + COST_TP_CD + ':sndrNm', SNDR_NM FROM FM.TB_SHPM_COST_DTL WHERE SNDR_NM IS NOT NULL
     UNION SELECT 'cost:' + COST_TP_CD + ':rcvrNm', RCVR_NM FROM FM.TB_SHPM_COST_DTL WHERE RCVR_NM IS NOT NULL`
  );
  const out: Record<string, string[]> = {};
  for (const r of result.recordset) (out[r.K] ??= []).push(r.V);
  for (const list of Object.values(out)) list.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  return out;
}

export async function createShipment(input: ShipmentInput): Promise<number> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("ownrEtpCd", sql.VarChar(20), input.ownrEtpCd)
    .input("prdLineCd", sql.VarChar(20), input.prdLineCd)
    .input("suplFactNm", sql.NVarChar(50), input.suplFactNm)
    .input("sttsNm", sql.NVarChar(100), input.sttsNm)
    .input("loadType", sql.VarChar(20), input.loadType)
    .input("hblNo", sql.VarChar(50), input.hblNo)
    .input("mblNo", sql.VarChar(50), input.mblNo)
    .input("contNo", sql.VarChar(30), input.contNo)
    .input("poNo", sql.VarChar(50), input.poNo)
    .input("subpoNo", sql.VarChar(50), input.subpoNo)
    .input("podNm", sql.NVarChar(50), input.podNm)
    .input("etd", sql.VarChar(8), input.etd)
    .input("eta", sql.VarChar(8), input.eta)
    .input("wrhsArrvDe", sql.VarChar(8), input.wrhsArrvDe)
    .input("usdExchRt", sql.Decimal(18, 4), input.usdExchRt)
    .input("invNo", sql.VarChar(50), input.invNo)
    .input("invDe", sql.VarChar(8), input.invDe)
    .input("currCd", sql.Char(3), input.currCd)
    .input("rmrk", sql.NVarChar(500), input.rmrk)
    .input("regrId", sql.VarChar(30), REGR_ID)
    .query(
      `INSERT INTO FM.TB_SHPM_MST
         (OWNR_ETP_CD, PRD_LINE_CD, SUPL_FACT_NM, STTS_NM, LOAD_TYPE, HBL_NO, MBL_NO, CONT_NO,
          PO_NO, SUBPO_NO, POD_NM, ETD, ETA, WRHS_ARRV_DE, USD_EXCH_RT, INV_NO, INV_DE, CURR_CD, RMRK, REGR_ID)
       OUTPUT INSERTED.SHPM_ID
       VALUES
         (@ownrEtpCd, @prdLineCd, @suplFactNm, @sttsNm, @loadType, @hblNo, @mblNo, @contNo,
          @poNo, @subpoNo, @podNm, @etd, @eta, @wrhsArrvDe, @usdExchRt, @invNo, @invDe, @currCd, @rmrk, @regrId)`
    );
  return result.recordset[0].SHPM_ID as number;
}

export async function updateShipment(shpmId: number, input: ShipmentInput): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input("shpmId", sql.Int, shpmId)
    .input("suplFactNm", sql.NVarChar(50), input.suplFactNm)
    .input("sttsNm", sql.NVarChar(100), input.sttsNm)
    .input("loadType", sql.VarChar(20), input.loadType)
    .input("hblNo", sql.VarChar(50), input.hblNo)
    .input("mblNo", sql.VarChar(50), input.mblNo)
    .input("contNo", sql.VarChar(30), input.contNo)
    .input("poNo", sql.VarChar(50), input.poNo)
    .input("subpoNo", sql.VarChar(50), input.subpoNo)
    .input("podNm", sql.NVarChar(50), input.podNm)
    .input("etd", sql.VarChar(8), input.etd)
    .input("eta", sql.VarChar(8), input.eta)
    .input("wrhsArrvDe", sql.VarChar(8), input.wrhsArrvDe)
    .input("usdExchRt", sql.Decimal(18, 4), input.usdExchRt)
    .input("invNo", sql.VarChar(50), input.invNo)
    .input("invDe", sql.VarChar(8), input.invDe)
    .input("currCd", sql.Char(3), input.currCd)
    .input("rmrk", sql.NVarChar(500), input.rmrk)
    .input("mdfrId", sql.VarChar(30), REGR_ID)
    .query(
      `UPDATE FM.TB_SHPM_MST SET
         SUPL_FACT_NM = @suplFactNm, STTS_NM = @sttsNm, LOAD_TYPE = @loadType,
         HBL_NO = @hblNo, MBL_NO = @mblNo, CONT_NO = @contNo, PO_NO = @poNo, SUBPO_NO = @subpoNo,
         POD_NM = @podNm, ETD = @etd, ETA = @eta, WRHS_ARRV_DE = @wrhsArrvDe,
         USD_EXCH_RT = @usdExchRt, INV_NO = @invNo, INV_DE = @invDe, CURR_CD = @currCd, RMRK = @rmrk,
         MDFR_ID = @mdfrId, MDFY_DT = GETDATE()
       WHERE SHPM_ID = @shpmId`
    );
}

// Field names are whitelisted below and mapped to fixed column names — never built from
// client-supplied strings — so this stays safe from SQL injection despite the dynamic SQL text.
const MASTER_FIELD_COLUMNS: Record<string, string> = {
  suplFactNm: "SUPL_FACT_NM",
  sttsNm: "STTS_NM",
  loadType: "LOAD_TYPE",
  hblNo: "HBL_NO",
  mblNo: "MBL_NO",
  contNo: "CONT_NO",
  poNo: "PO_NO",
  subpoNo: "SUBPO_NO",
  podNm: "POD_NM",
  etd: "ETD",
  eta: "ETA",
  wrhsArrvDe: "WRHS_ARRV_DE",
  usdExchRt: "USD_EXCH_RT",
  invNo: "INV_NO",
  invDe: "INV_DE",
  currCd: "CURR_CD",
  rmrk: "RMRK",
};

/** Which column of an invoice/cost line a party/cost edit targets; absent = the amount. */
export type PartyField = "sndrNm" | "rcvrNm";

export type FieldEdit =
  | { kind: "master"; field: keyof typeof MASTER_FIELD_COLUMNS; value: string | number | null }
  | { kind: "party"; invTpCd: "NEO" | "FACTORY"; field?: PartyField; value: string | number | null }
  | { kind: "cost"; costTpCd: string; field?: PartyField; value: string | number | null };

const PARTY_FIELD_COLUMNS: Record<PartyField, string> = { sndrNm: "SNDR_NM", rcvrNm: "RCVR_NM" };

export async function applyFieldEdit(shpmId: number, edit: FieldEdit): Promise<void> {
  const pool = await getPool();

  if (edit.kind === "master") {
    const column = MASTER_FIELD_COLUMNS[edit.field];
    if (!column) throw new Error(`Unknown master field: ${edit.field}`);
    await pool
      .request()
      .input("shpmId", sql.Int, shpmId)
      .input("value", sql.NVarChar(500), edit.value == null ? null : String(edit.value))
      .input("mdfrId", sql.VarChar(30), REGR_ID)
      .query(`UPDATE FM.TB_SHPM_MST SET ${column} = @value, MDFR_ID = @mdfrId, MDFY_DT = GETDATE() WHERE SHPM_ID = @shpmId`);
    return;
  }

  // Invoice legs (TB_INV_MST, keyed by INV_TP_CD) and cost lines (TB_SHPM_COST_DTL, keyed by
  // COST_TP_CD) are edited the same way: update the line if it exists, else create it holding
  // just this one value. Column names come from the fixed maps above, never from the client.
  const [table, keyCol, keyVal, amtType] =
    edit.kind === "party"
      ? ["FM.TB_INV_MST", "INV_TP_CD", edit.invTpCd, sql.Decimal(18, 4)]
      : ["FM.TB_SHPM_COST_DTL", "COST_TP_CD", edit.costTpCd, sql.Decimal(18, 2)];
  const column = edit.field ? PARTY_FIELD_COLUMNS[edit.field] : "AMT";
  if (!column) throw new Error(`Unknown party field: ${edit.field}`);
  const value = edit.field
    ? edit.value == null ? null : String(edit.value)
    : edit.value == null ? null : Number(edit.value);
  const valueType = edit.field ? sql.NVarChar(50) : amtType;

  const existing = await pool
    .request()
    .input("shpmId", sql.Int, shpmId)
    .input("key", sql.VarChar(30), keyVal)
    .query(`SELECT 1 AS found FROM ${table} WHERE SHPM_ID = @shpmId AND ${keyCol} = @key`);
  if (existing.recordset.length > 0) {
    await pool
      .request()
      .input("shpmId", sql.Int, shpmId)
      .input("key", sql.VarChar(30), keyVal)
      .input("value", valueType, value)
      .input("mdfrId", sql.VarChar(30), REGR_ID)
      .query(`UPDATE ${table} SET ${column} = @value, MDFR_ID = @mdfrId, MDFY_DT = GETDATE() WHERE SHPM_ID = @shpmId AND ${keyCol} = @key`);
  } else {
    await pool
      .request()
      .input("shpmId", sql.Int, shpmId)
      .input("key", sql.VarChar(30), keyVal)
      .input("value", valueType, value)
      .input("regrId", sql.VarChar(30), REGR_ID)
      .query(`INSERT INTO ${table} (SHPM_ID, ${keyCol}, CURR_CD, ${column}, REGR_ID) VALUES (@shpmId, @key, 'USD', @value, @regrId)`);
  }
}

export async function deleteShipment(shpmId: number): Promise<void> {
  const pool = await getPool();
  await pool.request().input("shpmId", sql.Int, shpmId).query("DELETE FROM FM.TB_SHPM_COST_DTL WHERE SHPM_ID = @shpmId");
  await pool.request().input("shpmId", sql.Int, shpmId).query("DELETE FROM FM.TB_INV_MST WHERE SHPM_ID = @shpmId");
  await pool.request().input("shpmId", sql.Int, shpmId).query("DELETE FROM FM.TB_SHPM_DTL WHERE SHPM_ID = @shpmId");
  await pool.request().input("shpmId", sql.Int, shpmId).query("DELETE FROM FM.TB_SHPM_MST WHERE SHPM_ID = @shpmId");
}

// ---- SKU detail (NEO-leg per-SKU lines shown when a shipment row is expanded; the row's product qty/amount is their SUM) ----

export async function createSku(shpmId: number): Promise<number> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("shpmId", sql.Int, shpmId)
    .input("skuCd", sql.VarChar(50), `NEW-${Date.now()}`)
    .input("qty", sql.Int, 0)
    .input("amt", sql.Decimal(18, 4), 0)
    .input("regrId", sql.VarChar(30), REGR_ID)
    .query(
      `INSERT INTO FM.TB_SHPM_DTL (SHPM_ID, INV_TP_CD, SKU_CD, QTY, AMT, REGR_ID)
       OUTPUT INSERTED.SHPM_DTL_ID
       VALUES (@shpmId, 'NEO', @skuCd, @qty, @amt, @regrId)`
    );
  return result.recordset[0].SHPM_DTL_ID as number;
}

export type SkuFieldEdit = { field: "skuCd" | "qty" | "unitPrc" | "amt"; value: string | number | null };

export async function updateSkuField(shpmDtlId: number, edit: SkuFieldEdit): Promise<void> {
  const pool = await getPool();
  if (edit.field === "skuCd") {
    await pool
      .request()
      .input("id", sql.Int, shpmDtlId)
      .input("value", sql.VarChar(50), String(edit.value ?? ""))
      .input("mdfrId", sql.VarChar(30), REGR_ID)
      .query("UPDATE FM.TB_SHPM_DTL SET SKU_CD = @value, MDFR_ID = @mdfrId, MDFY_DT = GETDATE() WHERE SHPM_DTL_ID = @id AND INV_TP_CD = 'NEO'");
    return;
  }
  if (edit.field === "qty") {
    await pool
      .request()
      .input("id", sql.Int, shpmDtlId)
      .input("value", sql.Int, edit.value == null ? 0 : Number(edit.value))
      .input("mdfrId", sql.VarChar(30), REGR_ID)
      .query("UPDATE FM.TB_SHPM_DTL SET QTY = @value, MDFR_ID = @mdfrId, MDFY_DT = GETDATE() WHERE SHPM_DTL_ID = @id AND INV_TP_CD = 'NEO'");
    return;
  }
  if (edit.field === "amt") {
    await pool
      .request()
      .input("id", sql.Int, shpmDtlId)
      .input("value", sql.Decimal(18, 4), edit.value == null ? 0 : Number(edit.value))
      .input("mdfrId", sql.VarChar(30), REGR_ID)
      .query("UPDATE FM.TB_SHPM_DTL SET AMT = @value, MDFR_ID = @mdfrId, MDFY_DT = GETDATE() WHERE SHPM_DTL_ID = @id AND INV_TP_CD = 'NEO'");
    return;
  }
  // unitPrc is nullable
  await pool
    .request()
    .input("id", sql.Int, shpmDtlId)
    .input("value", sql.Decimal(18, 4), edit.value == null ? null : Number(edit.value))
    .input("mdfrId", sql.VarChar(30), REGR_ID)
    .query("UPDATE FM.TB_SHPM_DTL SET UNIT_PRC = @value, MDFR_ID = @mdfrId, MDFY_DT = GETDATE() WHERE SHPM_DTL_ID = @id AND INV_TP_CD = 'NEO'");
}

export async function deleteSku(shpmDtlId: number): Promise<void> {
  const pool = await getPool();
  await pool.request().input("id", sql.Int, shpmDtlId).query("DELETE FROM FM.TB_SHPM_DTL WHERE SHPM_DTL_ID = @id AND INV_TP_CD = 'NEO'");
}
