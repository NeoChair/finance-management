// Imports the invoice ledgers (원장 엑셀) into FM.TB_SHPM_MST / TB_SHPM_DTL / TB_INV_MST / TB_SHPM_COST_DTL.
//
//   node scripts/import-excel.mjs [--limit=100] [--dir="C:/.../Finance"] [--dry]
//
// --dry parses the sheets and prints the first record of each product line without touching the DB.
//
// WIPES every row in those four tables first (code masters are untouched), then loads up to
// `limit` data rows of each sheet below. Everything runs in one transaction — any error rolls back.
//
// Each sheet is described by a mapping table: `master` maps the fixed shipment columns, and each
// entry in `costs` is one section of the sheet (one COST_TP_CD). Adding a section = adding a line.
//
// `sku` points at the per-SKU invoice data for that ledger (joined by container no.). Its lines go
// into TB_SHPM_DTL as INV_TP_CD='NEO', and the ledger row's product Amount/QTY on screen is their
// SUM. When a sheet has `sku`, only ledger rows whose container has SKU lines are imported.
import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";
import sql from "mssql";

const env = {};
fs.readFileSync(".env.local", "utf8").split("\n").forEach((line) => {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
});

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")).map(([k, ...v]) => [k, v.join("=")])
);
const LIMIT = Number(args.limit ?? 100);
const DIR = args.dir ?? "C:/Users/HGUser/Desktop/폴더/Finance";

const OWNR_ETP_CD = "KR-DT-HG";
const REGR_ID = "excel_import";

// ---------------------------------------------------------------- sheet mappings

const SHEETS = [
  {
    file: "발주파일/2025 @ CHAIR_INV_2026_0921 JIN JU.xlsx",
    sheet: "INV",
    prdLineCd: "CHAIR",
    firstRow: 7,
    sku: { file: "Inv/@ ALL_CHAIR_INV_DATA_2026_0925.xlsx", sheet: "Sheet1", firstRow: 3, cont: "C", sku: "J", mdl: "M", qty: "P", unitPrc: "U", amt: "W" },
    master: {
      suplFactNm: "B", sttsNm: "C", hblNo: "D", mblNo: "E", contNo: "F", poNo: "G",
      invNo: "H", invDe: "I", podNm: "J", etd: "K", eta: "L", wrhsArrvDe: "M", usdExchRt: "N", rmrk: "AY",
    },
    neo: { amt: "O", sndr: "Q", rcvr: "R", payDe: "S" },
    factory: { amt: "X", rcvr: "AC", sndr: "AD", payDe: "AE" },
    ofBlock: { of: "AK", second: "AL", secondCd: "HDC_CHG", ocfHdc: "AM", rcvr: "AN", payDe: "AO" },
    costs: [
      { cd: "DUTY", amt: "AH", rcvr: "AI", payDe: "AJ", sndr: "=NEO" },
      { cd: "LINKONE_DEBIT", amt: "AS", rcvr: "AT", payDe: "AU", sndr: "=NEO CHAIR" },
      { cd: "COST", amt: "AV", rcvr: "AW", payDe: "AX", sndr: "=NEO CHAIR" },
      { cd: "TRUCKING", invNo: "AZ", invDe: "BA", amt: "BB", payDe: "BC" },
    ],
  },
  {
    file: "발주파일/2025 @ CHAIR_INV_2026_0921 JIN JU.xlsx",
    sheet: "VN-WAYFAIR",
    prdLineCd: "CHAIR_WF",
    firstRow: 5,
    master: {
      suplFactNm: "B", loadType: "C", sttsNm: "D", hblNo: "E", mblNo: "F", contNo: "G", poNo: "H",
      invNo: "I", invDe: "J", podNm: "K", etd: "L", eta: "M", wrhsArrvDe: "N", usdExchRt: "O", rmrk: "BA",
    },
    // Wayfair rows put the PO-/WHS- numbers in either the M-BL or the PO column — sort them out by prefix.
    splitWayfairPo: true,
    neo: { amt: "P", sndr: "S", rcvr: "T", payDe: "U" },
    factory: { amt: "Z", rcvr: "AE", sndr: "AF", payDe: "AG" },
    ofBlock: { of: "AM", second: "AN", secondCd: "HDC_CHG", ocfHdc: "AO", rcvr: "AP", payDe: "AQ" },
    costs: [
      { cd: "DUTY", amt: "AJ", rcvr: "AK", payDe: "AL", sndr: "=NEO" },
      { cd: "LINKONE_DEBIT", amt: "AU", rcvr: "AV", payDe: "AW", sndr: "=NEO CHAIR" },
      { cd: "COST", amt: "AX", rcvr: "AY", payDe: "AZ", sndr: "=NEO CHAIR" },
    ],
  },
  {
    file: "발주파일/2025 @ JKT SPRING MATTRESS_INV_2026_0921 JIN JU LU.xlsx",
    sheet: "INV_MIDAS",
    prdLineCd: "MATTRESS",
    firstRow: 7,
    sku: { file: "Inv/@ ALL_HYB_INV_DATA_2026_0925.xlsx", sheet: "Sheet1", firstRow: 3, cont: "C", sku: "J", mdl: "M", qty: "P", unitPrc: "U", amt: "W" },
    master: {
      suplFactNm: "B", sttsNm: "C", hblNo: "D", mblNo: "E", contNo: "F", invNo: "G", poNo: "H",
      invDe: "I", podNm: "J", etd: "K", eta: "L", wrhsArrvDe: "M", usdExchRt: "N", rmrk: "AU",
    },
    neo: { amt: "O", sndr: "P", rcvr: "Q", payDe: "R" },
    factory: { amt: "W", rcvr: "AC", sndr: "AD", payDe: "AE" },
    ofBlock: { of: "AK", second: "AL", secondCd: "LOCAL_CHG", rcvr: "AM", payDe: "AN" },
    costs: [
      { cd: "LINKONE_DEBIT", amt: "AO", rcvr: "AP", payDe: "AQ", sndr: "=ORANGE" },
      { cd: "COST", amt: "AR", rcvr: "AS", payDe: "AT", sndr: "=ORANGE" },
      { cd: "DUTY", amt: "AV", payDe: "AW", sndr: "=HYGGE", rcvr: "=DREAM" },
      { cd: "ISF_FILING", amt: "BB", payDe: "BC", sndr: "=HYGGE", rcvr: "=DREAM" },
      { cd: "CUSTOMS_ENTRY", amt: "BD", payDe: "BE", sndr: "=HYGGE", rcvr: "=DREAM" },
      { cd: "HANDLING", amt: "BF", payDe: "BG", sndr: "=HYGGE", rcvr: "=DREAM" },
      { cd: "CPSC_FILING", amt: "BH", payDe: "BI", sndr: "=HYGGE", rcvr: "=DREAM" },
      { cd: "DREAM_LINKONE", amt: "BJ", sndr: "=DREAM", rcvr: "=LINKONE" },
      { cd: "OTHER_HANDLING", invNo: "BK", amt: "BL", payDe: "BM", sndr: "=ORANGE", rcvr: "=Linkone" },
      { cd: "TRUCKING", invNo: "BN", invDe: "BO", amt: "BP", payDe: "BQ" },
    ],
  },
  {
    file: "발주파일/2026_CHAIR_TYJ_INV_2026_0918 (1).xlsx",
    sheet: "TYJ",
    prdLineCd: "CHAIR_TYJ",
    firstRow: 4,
    sku: { file: "발주파일/2026_CHAIR_TYJ_INV_2026_0918 (1).xlsx", sheet: "TYJ_Raw", firstRow: 3, cont: "D", sku: "K", qty: "Q", unitPrc: "V", amt: "X" },
    master: {
      suplFactNm: "B", sttsNm: ["C", "D"], hblNo: "E", mblNo: "F", contNo: "G", poNo: "H",
      invNo: "I", invDe: "J", podNm: "K", etd: "L", eta: "M", wrhsArrvDe: "N", usdExchRt: "O",
    },
    neo: { amt: "P", sndr: "R", rcvr: "S", payDe: "T" },
    costs: [
      { cd: "OCEAN_FREIGHT", amt: "U", sndr: "V", rcvr: "W", payDe: "X" },
      { cd: "DUTY", amt: "Y", rcvr: "Z", payDe: "AA" },
      { cd: "TRUCKING", invNo: "AC", invDe: "AD", amt: "AE", payDe: "AF" },
    ],
  },
];

// ---------------------------------------------------------------- cell parsing

function raw(v) {
  if (v == null) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === "object") {
    if ("error" in v) return null; // #REF!, #N/A …
    if ("result" in v) return raw(v.result); // formula → cached value
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("text" in v) return v.text; // hyperlink
    return null;
  }
  if (typeof v === "string" && v.trim().startsWith("#")) return null; // "#REF!" typed as text
  return v;
}

const lines = (v) => (v == null ? [] : String(v).split(/\r?\n/).map((s) => s.trim()).filter(Boolean));

function text(v, max = 50) {
  v = raw(v);
  if (v == null) return null;
  const s = lines(v instanceof Date ? ymd(v) : v).join(" / ");
  return s === "" ? null : s.slice(0, max);
}

function money(v) {
  v = raw(v);
  if (v == null || v instanceof Date) return null;
  if (typeof v === "number") return v;
  const n = parseFloat(String(v).replace(/[$,\s]/g, ""));
  return Number.isNaN(n) ? null : n;
}

function ymd(d) {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}

// Date cells, Excel serials, "25.01.03" (YY.MM.DD), "5/15/26", "06/11/2026", "2026-06-08".
// `line` picks one line out of a stacked cell ("25.04.15\n25.04.07"). Non-dates ("DONE", "-") → null.
function date(v, line = 0) {
  v = raw(v);
  if (v == null) return null;
  if (v instanceof Date) return ymd(v);
  if (typeof v === "number") return v > 20000 && v < 80000 ? ymd(new Date(Date.UTC(1899, 11, 30) + v * 86400000)) : null;
  const ls = lines(v);
  const s = ls[line] ?? ls[0];
  if (!s) return null;
  let m;
  if ((m = s.match(/^(\d{2})\.(\d{1,2})\.(\d{1,2})$/))) return `20${m[1]}${m[2].padStart(2, "0")}${m[3].padStart(2, "0")}`;
  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/))) return `20${m[3]}${m[1].padStart(2, "0")}${m[2].padStart(2, "0")}`;
  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) return `${m[3]}${m[1].padStart(2, "0")}${m[2].padStart(2, "0")}`;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) return `${m[1]}${m[2].padStart(2, "0")}${m[3].padStart(2, "0")}`;
  return null;
}

// ---------------------------------------------------------------- row → records

function readSheetRow(row, cfg) {
  const cell = (col) => row.getCell(col).value;
  // Amounts merged down several container rows (one invoice covering a whole H-BL) are counted
  // once, on the first row of the merge; the other rows get no amount. Text/date cells in a
  // merge (receiver, payment date) are still shared by every row.
  const num = (col) => {
    const c = row.getCell(col);
    return c.isMerged && c.master.address !== c.address ? null : money(c.value);
  };
  const M = cfg.master;

  const s = {
    prdLineCd: cfg.prdLineCd,
    suplFactNm: text(cell(M.suplFactNm)),
    sttsNm: Array.isArray(M.sttsNm) ? M.sttsNm.map((c) => text(cell(c))).filter(Boolean).join(",") || null : text(cell(M.sttsNm), 100),
    loadType: M.loadType ? text(cell(M.loadType), 20) : null,
    hblNo: text(cell(M.hblNo)),
    mblNo: text(cell(M.mblNo)),
    contNo: text(cell(M.contNo), 30),
    poNo: text(cell(M.poNo)),
    subpoNo: null,
    invNo: text(cell(M.invNo)),
    invDe: date(cell(M.invDe)),
    podNm: text(cell(M.podNm)),
    etd: date(cell(M.etd)),
    eta: date(cell(M.eta)),
    wrhsArrvDe: date(cell(M.wrhsArrvDe)),
    usdExchRt: money(cell(M.usdExchRt)),
    rmrk: M.rmrk && raw(cell(M.rmrk)) !== 0 ? text(cell(M.rmrk), 500) : null,
    costs: [],
  };

  if (cfg.splitWayfairPo) {
    const vals = [s.mblNo, s.poNo];
    const po = vals.find((v) => v?.startsWith("PO-"));
    const whs = vals.find((v) => v?.startsWith("WHS-"));
    if (s.mblNo?.startsWith("PO-") || s.mblNo?.startsWith("WHS-")) s.mblNo = null;
    s.poNo = po ?? null;
    s.subpoNo = whs ?? null;
  }

  // The ledger's own product Amount stays on TB_INV_MST (NEO) for reconciliation; what the screen
  // shows is SUM(SKU lines).
  const N = cfg.neo;
  s.neoInv = { sndrNm: text(cell(N.sndr)), rcvrNm: text(cell(N.rcvr)), payDe: date(cell(N.payDe)), amt: num(N.amt) };

  if (cfg.factory) {
    const F = cfg.factory;
    s.factoryInv = { sndrNm: text(cell(F.sndr)), rcvrNm: text(cell(F.rcvr)), payDe: date(cell(F.payDe)), amt: num(F.amt) };
  }

  // O/F + second charge (HDC or LOCAL) share one Receiver/Payment cell; when it's stacked
  // ("GLOVIS\nNEOVNM"), line 1 belongs to O/F and line 2 to the second charge.
  if (cfg.ofBlock) {
    const B = cfg.ofBlock;
    const rcvrs = lines(raw(cell(B.rcvr)));
    const both = [
      { cd: "OCEAN_FREIGHT", amt: num(B.of), line: 0 },
      { cd: B.secondCd, amt: num(B.second), line: 1 },
      ...(B.ocfHdc ? [{ cd: "OCF_HDC", amt: num(B.ocfHdc), line: 0 }] : []),
    ];
    for (const c of both) {
      if (!c.amt) continue;
      s.costs.push({
        cd: c.cd,
        amt: c.amt,
        sndrNm: null,
        rcvrNm: (rcvrs[c.line] ?? rcvrs[0] ?? null)?.slice(0, 50) ?? null,
        payDe: date(cell(B.payDe), c.line),
        invNo: null,
        invDe: null,
      });
    }
  }

  for (const c of cfg.costs) {
    const amt = num(c.amt);
    if (!amt) continue; // blank or 0 → no cost line
    // "=NAME" is a fixed party taken from the section title; anything else is a column letter.
    const fixedOrCell = (spec) => (spec == null ? null : spec.startsWith("=") ? spec.slice(1) : text(cell(spec)));
    s.costs.push({
      cd: c.cd,
      amt,
      sndrNm: fixedOrCell(c.sndr),
      rcvrNm: fixedOrCell(c.rcvr),
      payDe: c.payDe ? date(cell(c.payDe)) : null,
      invNo: c.invNo ? text(cell(c.invNo)) : null,
      invDe: c.invDe ? date(cell(c.invDe)) : null,
    });
  }
  return s;
}

const workbooks = new Map();
async function worksheet(file, sheet) {
  if (!workbooks.has(file)) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(path.join(DIR, file));
    workbooks.set(file, wb);
  }
  const ws = workbooks.get(file).getWorksheet(sheet);
  if (!ws) throw new Error(`Sheet "${sheet}" not found in ${file}`);
  return ws;
}

// " TCLU1544429 / ML-ID1414429 (40'HC) " → "TCLU1544429"
const contKey = (v) => {
  const s = text(v, 200);
  return s ? s.split(/[\s/]+/).find(Boolean).toUpperCase() : null;
};

// SKU lines grouped by container no.
async function readSkuLines(S) {
  const ws = await worksheet(S.file, S.sheet);
  const byCont = new Map();
  for (let r = S.firstRow; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const key = contKey(row.getCell(S.cont).value);
    const skuCd = text(row.getCell(S.sku).value);
    if (!key || !skuCd) continue;
    const list = byCont.get(key) ?? [];
    list.push({
      skuCd,
      mdlNm: S.mdl ? text(row.getCell(S.mdl).value, 100) : null,
      qty: Math.round(money(row.getCell(S.qty).value) ?? 0),
      unitPrc: money(row.getCell(S.unitPrc).value),
      amt: money(row.getCell(S.amt).value) ?? 0,
    });
    byCont.set(key, list);
  }
  return byCont;
}

async function readSheet(cfg) {
  const ws = await worksheet(cfg.file, cfg.sheet);
  const skuByCont = cfg.sku ? await readSkuLines(cfg.sku) : null;
  const out = [];
  for (let r = cfg.firstRow; r <= ws.rowCount && out.length < LIMIT; r++) {
    const row = ws.getRow(r);
    // A data row has a PO or a container; blank spacers and subtotal rows don't.
    if (raw(row.getCell(cfg.master.poNo).value) == null && raw(row.getCell(cfg.master.contNo).value) == null) continue;
    let skuLines = [];
    if (skuByCont) {
      const key = contKey(row.getCell(cfg.master.contNo).value);
      if (!key || !skuByCont.has(key)) continue;
      skuLines = skuByCont.get(key);
      skuByCont.delete(key); // a container repeated further down the ledger doesn't get the lines twice
    }
    out.push({ excelRow: r, ...readSheetRow(row, cfg), skuLines });
  }
  return out;
}

// ---------------------------------------------------------------- DB

async function insertShipment(tx, s) {
  const req = () => new sql.Request(tx);
  const { recordset } = await req()
    .input("ownrEtpCd", sql.VarChar(20), OWNR_ETP_CD)
    .input("prdLineCd", sql.VarChar(20), s.prdLineCd)
    .input("suplFactNm", sql.NVarChar(50), s.suplFactNm)
    .input("sttsNm", sql.NVarChar(100), s.sttsNm)
    .input("loadType", sql.VarChar(20), s.loadType)
    .input("hblNo", sql.VarChar(50), s.hblNo)
    .input("mblNo", sql.VarChar(50), s.mblNo)
    .input("contNo", sql.VarChar(30), s.contNo)
    .input("poNo", sql.VarChar(50), s.poNo)
    .input("subpoNo", sql.VarChar(50), s.subpoNo)
    .input("podNm", sql.NVarChar(50), s.podNm)
    .input("etd", sql.VarChar(8), s.etd)
    .input("eta", sql.VarChar(8), s.eta)
    .input("wrhsArrvDe", sql.VarChar(8), s.wrhsArrvDe)
    .input("usdExchRt", sql.Decimal(18, 4), s.usdExchRt)
    .input("invNo", sql.VarChar(50), s.invNo)
    .input("invDe", sql.VarChar(8), s.invDe)
    .input("rmrk", sql.NVarChar(500), s.rmrk)
    .input("regrId", sql.VarChar(30), REGR_ID)
    .query(`
      INSERT INTO FM.TB_SHPM_MST
        (OWNR_ETP_CD, PRD_LINE_CD, SUPL_FACT_NM, STTS_NM, LOAD_TYPE, HBL_NO, MBL_NO, CONT_NO, PO_NO, SUBPO_NO,
         POD_NM, ETD, ETA, WRHS_ARRV_DE, USD_EXCH_RT, INV_NO, INV_DE, CURR_CD, RMRK, REGR_ID)
      OUTPUT INSERTED.SHPM_ID
      VALUES
        (@ownrEtpCd, @prdLineCd, @suplFactNm, @sttsNm, @loadType, @hblNo, @mblNo, @contNo, @poNo, @subpoNo,
         @podNm, @etd, @eta, @wrhsArrvDe, @usdExchRt, @invNo, @invDe, 'USD', @rmrk, @regrId)`);
  const shpmId = recordset[0].SHPM_ID;

  for (const l of s.skuLines) {
    await req()
      .input("shpmId", sql.Int, shpmId)
      .input("skuCd", sql.VarChar(50), l.skuCd)
      .input("mdlNm", sql.NVarChar(100), l.mdlNm)
      .input("qty", sql.Int, l.qty)
      .input("unitPrc", sql.Decimal(18, 4), l.unitPrc)
      .input("amt", sql.Decimal(18, 4), l.amt)
      .input("regrId", sql.VarChar(30), REGR_ID)
      .query(`INSERT INTO FM.TB_SHPM_DTL (SHPM_ID, INV_TP_CD, SKU_CD, MDL_NM, QTY, UNIT_PRC, AMT, REGR_ID)
              VALUES (@shpmId, 'NEO', @skuCd, @mdlNm, @qty, @unitPrc, @amt, @regrId)`);
  }

  for (const [tp, inv] of [["NEO", s.neoInv], ["FACTORY", s.factoryInv]]) {
    if (!inv || (inv.amt == null && !inv.sndrNm && !inv.rcvrNm && !inv.payDe)) continue;
    await req()
      .input("shpmId", sql.Int, shpmId)
      .input("tp", sql.VarChar(10), tp)
      .input("sndrNm", sql.NVarChar(50), inv.sndrNm)
      .input("rcvrNm", sql.NVarChar(50), inv.rcvrNm)
      .input("payDe", sql.VarChar(8), inv.payDe)
      .input("amt", sql.Decimal(18, 4), inv.amt)
      .input("regrId", sql.VarChar(30), REGR_ID)
      .query(`INSERT INTO FM.TB_INV_MST (SHPM_ID, INV_TP_CD, SNDR_NM, RCVR_NM, CURR_CD, PAY_DE, AMT, REGR_ID)
              VALUES (@shpmId, @tp, @sndrNm, @rcvrNm, 'USD', @payDe, @amt, @regrId)`);
  }

  for (const c of s.costs) {
    await req()
      .input("shpmId", sql.Int, shpmId)
      .input("cd", sql.VarChar(30), c.cd)
      .input("amt", sql.Decimal(18, 2), c.amt)
      .input("sndrNm", sql.NVarChar(50), c.sndrNm)
      .input("rcvrNm", sql.NVarChar(50), c.rcvrNm)
      .input("invNo", sql.VarChar(50), c.invNo)
      .input("invDe", sql.VarChar(8), c.invDe)
      .input("payDe", sql.VarChar(8), c.payDe)
      .input("regrId", sql.VarChar(30), REGR_ID)
      .query(`INSERT INTO FM.TB_SHPM_COST_DTL (SHPM_ID, COST_TP_CD, AMT, CURR_CD, SNDR_NM, RCVR_NM, INV_NO, INV_DE, PAY_DE, REGR_ID)
              VALUES (@shpmId, @cd, @amt, 'USD', @sndrNm, @rcvrNm, @invNo, @invDe, @payDe, @regrId)`);
  }
  return shpmId;
}

async function main() {
  const parsed = [];
  for (const cfg of SHEETS) {
    const rows = await readSheet(cfg);
    console.log(`${cfg.prdLineCd.padEnd(10)} ${cfg.sheet.padEnd(11)} ${rows.length} rows (Excel ${rows[0]?.excelRow}–${rows.at(-1)?.excelRow})`);
    parsed.push(...rows);
  }
  if ("dry" in args) {
    for (const cd of new Set(SHEETS.map((c) => c.prdLineCd))) {
      console.log(JSON.stringify(parsed.find((s) => s.prdLineCd === cd), null, 1));
    }
    return;
  }

  const pool = await sql.connect({
    server: env.DB_SERVER,
    port: Number(env.DB_PORT),
    database: env.DB_NAME,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    options: { encrypt: false, trustServerCertificate: true },
  });
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    for (const t of ["TB_SHPM_COST_DTL", "TB_INV_MST", "TB_SHPM_DTL", "TB_SHPM_MST"]) {
      const r = await new sql.Request(tx).query(`DELETE FROM FM.${t}`);
      console.log(`deleted ${r.rowsAffected[0]} from FM.${t}`);
    }
    let costCount = 0;
    let skuCount = 0;
    for (const s of parsed) {
      try {
        await insertShipment(tx, s);
      } catch (e) {
        throw new Error(`${s.prdLineCd} Excel row ${s.excelRow} (${s.poNo}): ${e.message}`);
      }
      costCount += s.costs.length;
      skuCount += s.skuLines.length;
    }
    await tx.commit();
    console.log(`inserted ${parsed.length} shipments, ${skuCount} SKU lines, ${costCount} cost lines`);
  } catch (e) {
    // SQL Server may already have aborted the transaction; don't let that mask the real error.
    await tx.rollback().catch(() => {});
    throw e;
  } finally {
    await pool.close();
  }
}

main().catch((err) => {
  console.error("IMPORT ERROR (rolled back):", err.message);
  process.exit(1);
});
