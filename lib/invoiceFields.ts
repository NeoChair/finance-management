// Field → DB column maps shared by the server (SQL) and the client (matching change-log entries
// to table cells). No DB imports here, so client components can use it.

export const MASTER_FIELD_COLUMNS: Record<string, string> = {
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
export type PartyField = "sndrNm" | "rcvrNm" | "invNo" | "invDe" | "payDe";

export const PARTY_FIELD_COLUMNS: Record<PartyField, string> = {
  sndrNm: "SNDR_NM",
  rcvrNm: "RCVR_NM",
  invNo: "INV_NO",
  invDe: "INV_DE",
  payDe: "PAY_DE",
};

export type SkuField = "skuCd" | "qty" | "unitPrc" | "amt" | "cbm";

export const SKU_FIELD_COLUMNS: Record<SkuField, string> = {
  skuCd: "SKU_CD",
  qty: "QTY",
  unitPrc: "UNIT_PRC",
  amt: "AMT",
  cbm: "CBM",
};

/** Change-log target tables (TB_SHPM_CHG_LOG.TRGT_TBL). */
export type LogTable = "SHPM_MST" | "INV_MST" | "SHPM_COST_DTL" | "SHPM_DTL";

/** Identifies one stored value: the table, the line within the shipment (invoice type, cost
 *  type or SKU line id; "" for the master row) and the DB column. */
export type LogTarget = { tbl: LogTable; key: string; col: string };

type Target =
  | { kind: "master"; field: string }
  | { kind: "party"; invTpCd: string; field?: PartyField }
  | { kind: "cost"; costTpCd: string; field?: PartyField };

export function logTargetOf(t: Target): LogTarget {
  if (t.kind === "master") return { tbl: "SHPM_MST", key: "", col: MASTER_FIELD_COLUMNS[t.field] };
  const col = t.field ? PARTY_FIELD_COLUMNS[t.field] : "AMT";
  return t.kind === "party" ? { tbl: "INV_MST", key: t.invTpCd, col } : { tbl: "SHPM_COST_DTL", key: t.costTpCd, col };
}

export function skuLogTarget(shpmDtlId: number, field: SkuField): LogTarget {
  return { tbl: "SHPM_DTL", key: String(shpmDtlId), col: SKU_FIELD_COLUMNS[field] };
}

/** Lookup key for one cell's value: "shpmId|tbl|key|col". */
export function logCellKey(shpmId: number, t: LogTarget): string {
  return `${shpmId}|${t.tbl}|${t.key}|${t.col}`;
}

/** One change-log row as served to the client. Values are the stored text (dates YYYYMMDD). */
export type ChangeLogEntry = {
  logId: number;
  saveId: string;
  shpmId: number;
  contNo: string | null;
  tbl: LogTable;
  key: string;
  col: string;
  skuCd: string | null;
  chgTpCd: "I" | "U" | "D";
  bfrVal: string | null;
  aftVal: string | null;
  srcCd: "WEB" | "EXCEL";
  usrId: string;
  usrNm: string | null;
  savedAt: string;
};
