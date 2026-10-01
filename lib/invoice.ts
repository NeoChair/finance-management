import { randomUUID } from "node:crypto";
import { getPool, sql } from "./db";
import {
  MASTER_FIELD_COLUMNS,
  PARTY_FIELD_COLUMNS,
  SKU_FIELD_COLUMNS,
  logTargetOf,
  skuLogTarget,
  type ChangeLogEntry,
  type LogTarget,
  type PartyField,
  type SkuField,
} from "./invoiceFields";

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

export async function createShipment(input: ShipmentInput, regrId: string): Promise<number> {
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
    .input("regrId", sql.VarChar(30), regrId)
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

export async function updateShipment(shpmId: number, input: ShipmentInput, mdfrId: string): Promise<void> {
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
    .input("mdfrId", sql.VarChar(30), mdfrId)
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

// Field names are whitelisted (lib/invoiceFields) and mapped to fixed column names — never built
// from client-supplied strings — so this stays safe from SQL injection despite dynamic SQL text.
export type { PartyField };

export type FieldEdit =
  | { kind: "master"; field: string; value: string | number | null }
  | { kind: "party"; invTpCd: "NEO" | "FACTORY"; field?: PartyField; value: string | number | null }
  | { kind: "cost"; costTpCd: string; field?: PartyField; value: string | number | null };

/** Who is saving — written to REGR_ID/MDFR_ID and the change log. */
export type Actor = { usrId: string; usrNm: string };

// ---- Change log (FM.TB_SHPM_CHG_LOG): one row per value that actually changed, grouped per save ----

type LogValue = string | number | null | undefined;

/** Stored text of a value: blank → null, numbers as plain digits. */
function logText(v: LogValue): string | null {
  if (v == null) return null;
  const s = String(v);
  return s === "" ? null : s;
}

function sameLogValue(a: LogValue, b: LogValue): boolean {
  const sa = logText(a);
  const sb = logText(b);
  if (sa === sb) return true;
  return sa !== null && sb !== null && !isNaN(Number(sa)) && !isNaN(Number(sb)) && Number(sa) === Number(sb);
}

type PendingLog = {
  shpmId: number;
  contNo: string | null;
  target: LogTarget;
  skuCd: string | null;
  chgTpCd: "I" | "U" | "D";
  bfrVal: string | null;
  aftVal: string | null;
};

class ChangeCollector {
  entries: PendingLog[] = [];

  /** Records the change unless before and after are the same value. */
  add(shpmId: number, contNo: string | null, target: LogTarget, before: LogValue, after: LogValue, opts: { inserted?: boolean; skuCd?: string | null } = {}) {
    if (sameLogValue(before, after)) return;
    this.entries.push({
      shpmId,
      contNo,
      target,
      skuCd: opts.skuCd ?? null,
      chgTpCd: opts.inserted ? "I" : "U",
      bfrVal: logText(before),
      aftVal: logText(after),
    });
  }

  async write(tx: sql.Transaction, saveId: string, prdLineCd: string, srcCd: "WEB" | "EXCEL", actor: Actor) {
    // Multi-row INSERTs, kept well under SQL Server's 2100-parameter limit.
    const CHUNK = 100;
    for (let i = 0; i < this.entries.length; i += CHUNK) {
      const chunk = this.entries.slice(i, i + CHUNK);
      const req = new sql.Request(tx)
        .input("saveId", sql.UniqueIdentifier, saveId)
        .input("prdLineCd", sql.VarChar(20), prdLineCd)
        .input("srcCd", sql.VarChar(10), srcCd)
        .input("usrId", sql.VarChar(30), actor.usrId)
        .input("usrNm", sql.NVarChar(50), actor.usrNm);
      const values = chunk.map((e, j) => {
        req
          .input(`s${j}`, sql.Int, e.shpmId)
          .input(`c${j}`, sql.VarChar(30), e.contNo)
          .input(`t${j}`, sql.VarChar(30), e.target.tbl)
          .input(`k${j}`, sql.VarChar(30), e.target.key)
          .input(`n${j}`, sql.VarChar(50), e.target.col)
          .input(`u${j}`, sql.VarChar(50), e.skuCd)
          .input(`g${j}`, sql.Char(1), e.chgTpCd)
          .input(`b${j}`, sql.NVarChar(500), e.bfrVal)
          .input(`a${j}`, sql.NVarChar(500), e.aftVal);
        return `(@saveId, @prdLineCd, @s${j}, @c${j}, @t${j}, @k${j}, @n${j}, @u${j}, @g${j}, @b${j}, @a${j}, @srcCd, @usrId, @usrNm)`;
      });
      await req.query(
        `INSERT INTO FM.TB_SHPM_CHG_LOG
           (SAVE_ID, PRD_LINE_CD, SHPM_ID, CONT_NO, TRGT_TBL, TRGT_KEY, COL_NM, SKU_CD, CHG_TP_CD, BFR_VAL, AFT_VAL, CHG_SRC_CD, REGR_ID, REGR_NM)
         VALUES ${values.join(", ")}`
      );
    }
  }
}

const LEG_TABLES = {
  party: { table: "FM.TB_INV_MST", keyCol: "INV_TP_CD", amtType: () => sql.Decimal(18, 4) },
  cost: { table: "FM.TB_SHPM_COST_DTL", keyCol: "COST_TP_CD", amtType: () => sql.Decimal(18, 2) },
} as const;

export type SaveResult = { saveId: string | null; changed: number };

/** Applies the save button's pending edits in one transaction and logs what actually changed
 *  (before values read from the DB inside the transaction). All or nothing. */
export async function saveEdits(
  prdLineCd: string,
  actor: Actor,
  cellEdits: { shpmId: number; edit: FieldEdit }[],
  skuEdits: { shpmDtlId: number; edit: SkuFieldEdit }[]
): Promise<SaveResult> {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  const log = new ChangeCollector();

  try {
    // Shipments touched by cell edits, restricted to this product line (also gives CONT_NO).
    const contByShpm = new Map<number, string | null>();
    const shpmIds = [...new Set(cellEdits.map((e) => e.shpmId))];
    if (shpmIds.length > 0) {
      const req = new sql.Request(tx).input("prdLineCd", sql.VarChar(20), prdLineCd);
      shpmIds.forEach((id, i) => req.input(`id${i}`, sql.Int, id));
      const res = await req.query(
        `SELECT SHPM_ID, CONT_NO FROM FM.TB_SHPM_MST
         WHERE PRD_LINE_CD = @prdLineCd AND SHPM_ID IN (${shpmIds.map((_, i) => `@id${i}`).join(", ")})`
      );
      for (const r of res.recordset) contByShpm.set(r.SHPM_ID, r.CONT_NO);
    }
    // A container-number edit labels that shipment's log rows with the new number.
    for (const { shpmId, edit } of cellEdits) {
      if (edit.kind === "master" && edit.field === "contNo" && edit.value != null) contByShpm.set(shpmId, String(edit.value));
    }

    for (const { shpmId, edit } of cellEdits) {
      if (!contByShpm.has(shpmId)) throw new Error(`이미 삭제되었거나 없는 건입니다 (ID ${shpmId}). 새로고침 후 다시 시도해 주세요.`);
      const contNo = contByShpm.get(shpmId) ?? null;
      const target = logTargetOf(edit);

      if (edit.kind === "master") {
        const column = MASTER_FIELD_COLUMNS[edit.field];
        if (!column) throw new Error(`Unknown master field: ${edit.field}`);
        const value = edit.value == null || edit.value === "" ? null : String(edit.value);
        const before = await new sql.Request(tx)
          .input("shpmId", sql.Int, shpmId)
          .query(`SELECT ${column} AS V FROM FM.TB_SHPM_MST WHERE SHPM_ID = @shpmId`);
        await new sql.Request(tx)
          .input("shpmId", sql.Int, shpmId)
          .input("value", sql.NVarChar(500), value)
          .input("mdfrId", sql.VarChar(30), actor.usrId)
          .query(`UPDATE FM.TB_SHPM_MST SET ${column} = @value, MDFR_ID = @mdfrId, MDFY_DT = GETDATE() WHERE SHPM_ID = @shpmId`);
        log.add(shpmId, contNo, target, before.recordset[0]?.V, value);
        continue;
      }

      // Invoice legs (TB_INV_MST, keyed by INV_TP_CD) and cost lines (TB_SHPM_COST_DTL, keyed by
      // COST_TP_CD) are edited the same way: update the line if it exists, else create it holding
      // just this one value.
      const { table, keyCol, amtType } = LEG_TABLES[edit.kind];
      const keyVal = edit.kind === "party" ? edit.invTpCd : edit.costTpCd;
      const column = edit.field ? PARTY_FIELD_COLUMNS[edit.field] : "AMT";
      if (!column) throw new Error(`Unknown party field: ${edit.field}`);
      const value = edit.value == null || edit.value === "" ? null : edit.field ? String(edit.value) : Number(edit.value);
      const valueType = edit.field ? sql.NVarChar(50) : amtType();

      const existing = await new sql.Request(tx)
        .input("shpmId", sql.Int, shpmId)
        .input("key", sql.VarChar(30), keyVal)
        .query(`SELECT ${column} AS V FROM ${table} WHERE SHPM_ID = @shpmId AND ${keyCol} = @key`);
      if (existing.recordset.length > 0) {
        await new sql.Request(tx)
          .input("shpmId", sql.Int, shpmId)
          .input("key", sql.VarChar(30), keyVal)
          .input("value", valueType, value)
          .input("mdfrId", sql.VarChar(30), actor.usrId)
          .query(`UPDATE ${table} SET ${column} = @value, MDFR_ID = @mdfrId, MDFY_DT = GETDATE() WHERE SHPM_ID = @shpmId AND ${keyCol} = @key`);
        log.add(shpmId, contNo, target, existing.recordset[0].V, value);
      } else if (value != null) {
        await new sql.Request(tx)
          .input("shpmId", sql.Int, shpmId)
          .input("key", sql.VarChar(30), keyVal)
          .input("value", valueType, value)
          .input("regrId", sql.VarChar(30), actor.usrId)
          .query(`INSERT INTO ${table} (SHPM_ID, ${keyCol}, CURR_CD, ${column}, REGR_ID) VALUES (@shpmId, @key, 'USD', @value, @regrId)`);
        log.add(shpmId, contNo, target, null, value, { inserted: true });
      }
    }

    for (const { shpmDtlId, edit } of skuEdits) {
      const column = SKU_FIELD_COLUMNS[edit.field];
      const res = await new sql.Request(tx)
        .input("id", sql.Int, shpmDtlId)
        .input("prdLineCd", sql.VarChar(20), prdLineCd)
        .query(
          `SELECT d.SHPM_ID, d.SKU_CD, s.CONT_NO, d.${column} AS V
           FROM FM.TB_SHPM_DTL d JOIN FM.TB_SHPM_MST s ON s.SHPM_ID = d.SHPM_ID
           WHERE d.SHPM_DTL_ID = @id AND d.INV_TP_CD = 'NEO' AND s.PRD_LINE_CD = @prdLineCd`
        );
      const row = res.recordset[0];
      if (!row) throw new Error(`이미 삭제되었거나 없는 SKU입니다 (ID ${shpmDtlId}). 새로고침 후 다시 시도해 주세요.`);

      // SKU code / QTY / AMT are NOT NULL (blank → "" / 0); unit price may be null.
      const [type, value] =
        edit.field === "skuCd"
          ? [sql.VarChar(50), String(edit.value ?? "")]
          : edit.field === "qty"
            ? [sql.Int(), edit.value == null ? 0 : Number(edit.value)]
            : edit.field === "amt"
              ? [sql.Decimal(18, 4), edit.value == null ? 0 : Number(edit.value)]
              : [sql.Decimal(18, 4), edit.value == null ? null : Number(edit.value)];
      await new sql.Request(tx)
        .input("id", sql.Int, shpmDtlId)
        .input("value", type, value)
        .input("mdfrId", sql.VarChar(30), actor.usrId)
        .query(`UPDATE FM.TB_SHPM_DTL SET ${column} = @value, MDFR_ID = @mdfrId, MDFY_DT = GETDATE() WHERE SHPM_DTL_ID = @id AND INV_TP_CD = 'NEO'`);
      const skuCd = edit.field === "skuCd" ? String(value) : row.SKU_CD;
      log.add(row.SHPM_ID, row.CONT_NO, skuLogTarget(shpmDtlId, edit.field), row.V, value, { skuCd });
    }

    const saveId = log.entries.length > 0 ? randomUUID() : null;
    if (saveId) await log.write(tx, saveId, prdLineCd, "WEB", actor);
    await tx.commit();
    return { saveId, changed: log.entries.length };
  } catch (err) {
    await tx.rollback().catch(() => {});
    throw err;
  }
}

/** The change log of one product line, newest first: either the latest save only, or the most
 *  recent `limit` rows (optionally of one shipment). */
export async function getChangeLogs(
  prdLineCd: string,
  opts: { lastSaveOnly: true } | { limit: number; shpmId?: number }
): Promise<ChangeLogEntry[]> {
  const pool = await getPool();
  const req = pool.request().input("prdLineCd", sql.VarChar(20), prdLineCd);
  let where: string;
  if ("lastSaveOnly" in opts) {
    where = `SAVE_ID = (SELECT TOP 1 SAVE_ID FROM FM.TB_SHPM_CHG_LOG WHERE PRD_LINE_CD = @prdLineCd ORDER BY LOG_ID DESC)`;
  } else if (opts.shpmId != null) {
    req.input("shpmId", sql.Int, opts.shpmId);
    where = `PRD_LINE_CD = @prdLineCd AND SHPM_ID = @shpmId`;
  } else {
    where = `PRD_LINE_CD = @prdLineCd`;
  }
  const top = "limit" in opts ? `TOP (${Math.max(1, Math.min(5000, Math.floor(opts.limit)))})` : "";
  const res = await req.query(
    `SELECT ${top} LOG_ID, CONVERT(VARCHAR(36), SAVE_ID) AS SAVE_ID, SHPM_ID, CONT_NO, TRGT_TBL, TRGT_KEY, COL_NM, SKU_CD,
            CHG_TP_CD, BFR_VAL, AFT_VAL, CHG_SRC_CD, REGR_ID, REGR_NM,
            CONVERT(VARCHAR(19), REGT_DT, 120) AS SAVED_AT
     FROM FM.TB_SHPM_CHG_LOG
     WHERE ${where}
     ORDER BY LOG_ID DESC`
  );
  return res.recordset.map((r) => ({
    logId: Number(r.LOG_ID),
    saveId: r.SAVE_ID,
    shpmId: r.SHPM_ID,
    contNo: r.CONT_NO,
    tbl: r.TRGT_TBL,
    key: r.TRGT_KEY,
    col: r.COL_NM,
    skuCd: r.SKU_CD,
    chgTpCd: r.CHG_TP_CD,
    bfrVal: r.BFR_VAL,
    aftVal: r.AFT_VAL,
    srcCd: r.CHG_SRC_CD,
    usrId: r.REGR_ID,
    usrNm: r.REGR_NM,
    savedAt: r.SAVED_AT,
  }));
}

export async function deleteShipment(shpmId: number): Promise<void> {
  const pool = await getPool();
  await pool.request().input("shpmId", sql.Int, shpmId).query("DELETE FROM FM.TB_SHPM_COST_DTL WHERE SHPM_ID = @shpmId");
  await pool.request().input("shpmId", sql.Int, shpmId).query("DELETE FROM FM.TB_INV_MST WHERE SHPM_ID = @shpmId");
  await pool.request().input("shpmId", sql.Int, shpmId).query("DELETE FROM FM.TB_SHPM_DTL WHERE SHPM_ID = @shpmId");
  await pool.request().input("shpmId", sql.Int, shpmId).query("DELETE FROM FM.TB_SHPM_MST WHERE SHPM_ID = @shpmId");
}

// ---- SKU detail (NEO-leg per-SKU lines shown when a shipment row is expanded; the row's product qty/amount is their SUM) ----

export async function createSku(shpmId: number, regrId: string): Promise<number> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("shpmId", sql.Int, shpmId)
    .input("skuCd", sql.VarChar(50), `NEW-${Date.now()}`)
    .input("qty", sql.Int, 0)
    .input("amt", sql.Decimal(18, 4), 0)
    .input("regrId", sql.VarChar(30), regrId)
    .query(
      `INSERT INTO FM.TB_SHPM_DTL (SHPM_ID, INV_TP_CD, SKU_CD, QTY, AMT, REGR_ID)
       OUTPUT INSERTED.SHPM_DTL_ID
       VALUES (@shpmId, 'NEO', @skuCd, @qty, @amt, @regrId)`
    );
  return result.recordset[0].SHPM_DTL_ID as number;
}

export type SkuFieldEdit = { field: SkuField; value: string | number | null };

export async function deleteSku(shpmDtlId: number): Promise<void> {
  const pool = await getPool();
  await pool.request().input("id", sql.Int, shpmDtlId).query("DELETE FROM FM.TB_SHPM_DTL WHERE SHPM_DTL_ID = @id AND INV_TP_CD = 'NEO'");
}

// ---- Excel upload (bulk upsert of shipment rows; SKU detail is not part of the upload) ----

export type LegField = PartyField | "amt";
export type LegValues = Partial<Record<LegField, string | number>>;

/** One Excel-upload row, already validated and grouped by target table. Only the cells that
 *  were filled in are present — blank cells never overwrite existing values. */
export type ShipmentImport = {
  rowNo: number;
  master: Record<string, string | number>;
  parties: { invTpCd: "NEO" | "FACTORY"; values: LegValues }[];
  costs: { costTpCd: string; values: LegValues }[];
};

const LEG_FIELD_TYPES: Record<LegField, sql.ISqlType> = {
  amt: sql.Decimal(18, 4),
  sndrNm: sql.NVarChar(50),
  rcvrNm: sql.NVarChar(50),
  invNo: sql.VarChar(50),
  invDe: sql.VarChar(8),
  payDe: sql.VarChar(8),
};

function legColumn(f: LegField): string {
  return f === "amt" ? "AMT" : PARTY_FIELD_COLUMNS[f];
}

/** A failure tied to one uploaded row; rowNo is the Excel row number. */
export class ImportRowError extends Error {
  constructor(public rowNo: number, message: string) {
    super(message);
  }
}

function normKey(v: string | number | null | undefined): string | null {
  if (v == null) return null;
  const s = String(v).trim().toUpperCase();
  return s === "" ? null : s;
}

// SHPM_ID is an IDENTITY column, so the upload file never carries it. An uploaded row is tied
// to an existing shipment by container number, narrowed by H-BL/M-BL when the file has them —
// the same columns as the UQ_TB_SHPM_MST_BL unique key. No match = a new shipment.
async function findShipmentForImport(tx: sql.Transaction, prdLineCd: string, s: ShipmentImport): Promise<number | null> {
  const result = await new sql.Request(tx)
    .input("contNo", sql.VarChar(30), String(s.master.contNo))
    .query("SELECT SHPM_ID, PRD_LINE_CD, HBL_NO, MBL_NO FROM FM.TB_SHPM_MST WHERE CONT_NO = @contNo");

  const hbl = normKey(s.master.hblNo);
  const mbl = normKey(s.master.mblNo);
  const compatible = result.recordset.filter((r) => {
    const rHbl = normKey(r.HBL_NO);
    const rMbl = normKey(r.MBL_NO);
    return (hbl == null || rHbl == null || rHbl === hbl) && (mbl == null || rMbl == null || rMbl === mbl);
  });
  const exact = compatible.find((r) => normKey(r.HBL_NO) === hbl && normKey(r.MBL_NO) === mbl);
  const sameLine = compatible.filter((r) => r.PRD_LINE_CD === prdLineCd);
  const match = exact ?? (sameLine.length === 1 ? sameLine[0] : undefined);

  if (!match) {
    if (sameLine.length > 1) throw new ImportRowError(s.rowNo, "같은 컨테이너가 여러 건 있습니다. H-BL/M-BL을 입력해 구분해 주세요.");
    return null;
  }
  if (match.PRD_LINE_CD !== prdLineCd) {
    throw new ImportRowError(s.rowNo, `다른 제품군(${match.PRD_LINE_CD})에 이미 등록된 B/L·컨테이너입니다.`);
  }
  return match.SHPM_ID as number;
}

function bindMasterFields(req: sql.Request, master: Record<string, string | number>): { column: string; param: string }[] {
  return Object.entries(master).map(([field, value]) => {
    const column = MASTER_FIELD_COLUMNS[field];
    if (!column) throw new Error(`Unknown master field: ${field}`);
    req.input(field, sql.NVarChar(500), String(value));
    return { column, param: `@${field}` };
  });
}

async function upsertLeg(
  tx: sql.Transaction,
  kind: "party" | "cost",
  shpmId: number,
  typeCd: string,
  values: LegValues,
  actor: Actor,
  log: ChangeCollector,
  contNo: string | null
): Promise<void> {
  const fields = Object.keys(values) as LegField[];
  if (fields.length === 0) return;
  const { table, keyCol } = LEG_TABLES[kind];

  // Current values first, for the change log.
  const before = await new sql.Request(tx)
    .input("shpmId", sql.Int, shpmId)
    .input("typeCd", sql.VarChar(30), typeCd)
    .query(`SELECT ${fields.map((f) => `${legColumn(f)} AS ${f}`).join(", ")} FROM ${table} WHERE SHPM_ID = @shpmId AND ${keyCol} = @typeCd`);
  const existing: Record<string, LogValue> | undefined = before.recordset[0];

  const req = new sql.Request(tx)
    .input("shpmId", sql.Int, shpmId)
    .input("typeCd", sql.VarChar(30), typeCd)
    .input("userId", sql.VarChar(30), actor.usrId);
  for (const f of fields) req.input(f, LEG_FIELD_TYPES[f], values[f]);
  await req.query(
    existing
      ? `UPDATE ${table} SET ${fields.map((f) => `${legColumn(f)} = @${f}`).join(", ")},
                MDFR_ID = @userId, MDFY_DT = GETDATE()
         WHERE SHPM_ID = @shpmId AND ${keyCol} = @typeCd`
      : `INSERT INTO ${table} (SHPM_ID, ${keyCol}, CURR_CD, REGR_ID, ${fields.map(legColumn).join(", ")})
         VALUES (@shpmId, @typeCd, 'USD', @userId, ${fields.map((f) => `@${f}`).join(", ")})`
  );

  for (const f of fields) {
    const target = logTargetOf(
      kind === "party"
        ? { kind, invTpCd: typeCd, field: f === "amt" ? undefined : f }
        : { kind, costTpCd: typeCd, field: f === "amt" ? undefined : f }
    );
    log.add(shpmId, contNo, target, existing?.[f], values[f], { inserted: !existing });
  }
}

async function importOne(
  tx: sql.Transaction,
  prdLineCd: string,
  ownrEtpCd: string,
  s: ShipmentImport,
  actor: Actor,
  log: ChangeCollector
): Promise<{ shpmId: number; created: boolean }> {
  let shpmId = await findShipmentForImport(tx, prdLineCd, s);
  const created = shpmId == null;
  const contNo = String(s.master.contNo);
  const fields = Object.keys(s.master);

  if (shpmId == null) {
    const req = new sql.Request(tx)
      .input("ownrEtpCd", sql.VarChar(20), ownrEtpCd)
      .input("prdLineCd", sql.VarChar(20), prdLineCd)
      .input("regrId", sql.VarChar(30), actor.usrId);
    const bound = bindMasterFields(req, { currCd: "USD", ...s.master });
    const result = await req.query(
      `INSERT INTO FM.TB_SHPM_MST (OWNR_ETP_CD, PRD_LINE_CD, REGR_ID, ${bound.map((b) => b.column).join(", ")})
       OUTPUT INSERTED.SHPM_ID
       VALUES (@ownrEtpCd, @prdLineCd, @regrId, ${bound.map((b) => b.param).join(", ")})`
    );
    shpmId = result.recordset[0].SHPM_ID as number;
    for (const f of fields) log.add(shpmId, contNo, logTargetOf({ kind: "master", field: f }), null, s.master[f], { inserted: true });
  } else {
    const before = await new sql.Request(tx)
      .input("shpmId", sql.Int, shpmId)
      .query(`SELECT ${fields.map((f) => `${MASTER_FIELD_COLUMNS[f]} AS ${f}`).join(", ")} FROM FM.TB_SHPM_MST WHERE SHPM_ID = @shpmId`);
    const req = new sql.Request(tx).input("shpmId", sql.Int, shpmId).input("mdfrId", sql.VarChar(30), actor.usrId);
    const bound = bindMasterFields(req, s.master);
    await req.query(
      `UPDATE FM.TB_SHPM_MST SET ${bound.map((b) => `${b.column} = ${b.param}`).join(", ")},
              MDFR_ID = @mdfrId, MDFY_DT = GETDATE()
       WHERE SHPM_ID = @shpmId`
    );
    for (const f of fields) log.add(shpmId, contNo, logTargetOf({ kind: "master", field: f }), before.recordset[0]?.[f], s.master[f]);
  }

  for (const p of s.parties) await upsertLeg(tx, "party", shpmId, p.invTpCd, p.values, actor, log, contNo);
  for (const c of s.costs) await upsertLeg(tx, "cost", shpmId, c.costTpCd, c.values, actor, log, contNo);

  return { shpmId, created };
}

/** All-or-nothing: any failing row rolls the whole upload back and surfaces as ImportRowError. */
export async function importShipments(
  prdLineCd: string,
  ownrEtpCd: string,
  imports: ShipmentImport[],
  actor: Actor
): Promise<{ inserted: number; updated: number; changed: number }> {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();

  let inserted = 0;
  let updated = 0;
  const log = new ChangeCollector();
  const seen = new Map<number, number>(); // SHPM_ID -> Excel row that already wrote to it
  try {
    for (const s of imports) {
      try {
        const { shpmId, created } = await importOne(tx, prdLineCd, ownrEtpCd, s, actor, log);
        const prevRow = seen.get(shpmId);
        if (prevRow != null) throw new ImportRowError(s.rowNo, `${prevRow}행과 같은 건으로 인식됩니다. 중복 행을 확인해 주세요.`);
        seen.set(shpmId, s.rowNo);
        if (created) inserted++;
        else updated++;
      } catch (err) {
        if (err instanceof ImportRowError) throw err;
        throw new ImportRowError(s.rowNo, err instanceof Error ? err.message : String(err));
      }
    }
    if (log.entries.length > 0) await log.write(tx, randomUUID(), prdLineCd, "EXCEL", actor);
    await tx.commit();
  } catch (err) {
    await tx.rollback().catch(() => {});
    throw err;
  }
  return { inserted, updated, changed: log.entries.length };
}
