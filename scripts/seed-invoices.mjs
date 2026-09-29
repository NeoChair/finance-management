import fs from "fs";
import sql from "mssql";

const env = {};
fs.readFileSync(".env.local", "utf8").split("\n").forEach((line) => {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
});

function money(v) {
  if (v == null || v === "") return null;
  const s = String(v).trim();
  if (s === "" || s === "-" || s === "_") return null;
  const n = parseFloat(s.replace(/[$,\s]/g, ""));
  return Number.isNaN(n) ? null : n;
}

function qty(v) {
  if (v == null || v === "") return null;
  const n = parseInt(String(v).replace(/[,\s]/g, ""), 10);
  return Number.isNaN(n) ? null : n;
}

// Handles "5/15/26" (M/D/YY), "25.01.03" (YY.MM.DD), "06/11/2026" (MM/DD/YYYY).
// Multi-line cells (e.g. "25.04.15\r\n25.04.07") use only the first line. Non-date text
// (e.g. "DONE") falls through to null.
function parseDate(v) {
  if (!v) return null;
  const s = String(v).split(/\r?\n/)[0].trim();
  if (!s) return null;

  let m = s.match(/^(\d{2})\.(\d{1,2})\.(\d{1,2})$/);
  if (m) {
    const [, yy, mo, d] = m;
    return `20${yy}${mo.padStart(2, "0")}${d.padStart(2, "0")}`;
  }
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (m) {
    const [, mo, d, yy] = m;
    return `20${yy}${mo.padStart(2, "0")}${d.padStart(2, "0")}`;
  }
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const [, mo, d, yyyy] = m;
    return `${yyyy}${mo.padStart(2, "0")}${d.padStart(2, "0")}`;
  }
  return null;
}

// Takes only the first line of a multi-line cell (e.g. two invoice numbers stacked in one cell).
function text(v) {
  if (v == null) return null;
  const s = String(v).split(/\r?\n/)[0].trim();
  return s === "" ? null : s;
}

// Joins a multi-line cell into one line (for receiver names like "CGF/MSK\nNEOVNM").
function joinLines(v) {
  if (v == null) return null;
  const s = String(v).split(/\r?\n/).map((x) => x.trim()).filter(Boolean).join(" ");
  return s === "" ? null : s;
}

const OWNR_ETP_CD = "KR-DT-HG";
const REGR_ID = "seed_script";

// Data below is transcribed from Book2.xlsx (the live working draft), which is more recent than
// the original per-brand source files. costs[]: { cd, amt, sndrNm?, rcvrNm?, payDe?, invNo?, invDe? }
const shipments = [
  // ============ CHAIR_TYJ ============
  {
    prdLineCd: "CHAIR_TYJ", suplFactNm: "TYJ", sttsNm: null, loadType: null, subpoNo: null, currCd: "USD",
    hblNo: null, mblNo: "WHLC031G530551", contNo: "WHSU5699509", poNo: "PO-TYJ-26-MIX-16-1",
    podNm: null, etd: null, eta: parseDate("5/15/26"), wrhsArrvDe: parseDate("5/22/26"),
    usdExchRt: null, qty: qty("545"), amt: money("$21,842.65"), rmrk: null,
    neoInv: { sndrNm: "NEO CHAIR", rcvrNm: "JoyHome", payDe: parseDate("6/8/26") },
    factoryInv: null,
    costs: [
      { cd: "OCEAN_FREIGHT", amt: money("$2,100.00"), sndrNm: "NEO CHAIR", rcvrNm: "JoyHome", payDe: parseDate("6/8/26") },
      { cd: "DUTY", amt: money("$2,100.00"), rcvrNm: "JoyHome", payDe: parseDate("6/8/26") },
      { cd: "TRUCKING", amt: money("$485.00"), invNo: "INV-17620", invDe: parseDate("06/11/2026"), payDe: parseDate("07/30/2026") },
    ],
    skuDetails: [
      { skuCd: "VNT-BK", qty: 90, unitPrc: 37.65, amt: 3388.24 },
      { skuCd: "VNT-BR", qty: 145, unitPrc: 37.65, amt: 5458.82 },
      { skuCd: "VNT-GY", qty: 25, unitPrc: 37.65, amt: 941.18 },
      { skuCd: "VNT-IV", qty: 10, unitPrc: 37.65, amt: 376.47 },
      { skuCd: "VNTH-BK", qty: 10, unitPrc: 42.65, amt: 426.47 },
      { skuCd: "VNTH-BR", qty: 15, unitPrc: 42.65, amt: 639.71 },
      { skuCd: "VNTH-GY", qty: 5, unitPrc: 42.65, amt: 213.24 },
      { skuCd: "VNTH-DB", qty: 15, unitPrc: 42.65, amt: 639.71 },
      { skuCd: "CHMN-BK-N", qty: 180, unitPrc: 42.21, amt: 7597.06 },
      { skuCd: "CHMN-BR-N", qty: 50, unitPrc: 43.24, amt: 2161.75 },
    ],
  },
  {
    prdLineCd: "CHAIR_TYJ", suplFactNm: "TYJ", sttsNm: null, loadType: null, subpoNo: null, currCd: "USD",
    hblNo: null, mblNo: "HLCUNG12508TYQZ6", contNo: "FANU3543796", poNo: "PO-TYJ-26-MIX-15-1",
    podNm: null, etd: null, eta: parseDate("5/21/26"), wrhsArrvDe: parseDate("5/29/26"),
    usdExchRt: null, qty: qty("540"), amt: money("$21,661.00"), rmrk: null,
    neoInv: { sndrNm: "NEO CHAIR", rcvrNm: "JoyHome", payDe: parseDate("6/8/26") },
    factoryInv: null,
    costs: [
      { cd: "OCEAN_FREIGHT", amt: money("$3,000.00"), sndrNm: "NEO CHAIR", rcvrNm: "JoyHome", payDe: parseDate("6/8/26") },
      { cd: "DUTY", amt: money("$2,100.00"), rcvrNm: "JoyHome", payDe: parseDate("6/8/26") },
      { cd: "TRUCKING", amt: money("$1,250.00"), invNo: "CS003I260500456", invDe: parseDate("05/31/2026"), payDe: parseDate("07/17/2026") },
    ],
    skuDetails: [
      { skuCd: "VNT-BK", qty: 100, unitPrc: 37.65, amt: 3764.70 },
      { skuCd: "VNT-BR", qty: 125, unitPrc: 37.65, amt: 4705.87 },
      { skuCd: "VNT-GY", qty: 30, unitPrc: 37.65, amt: 1129.41 },
      { skuCd: "VNT-IV", qty: 10, unitPrc: 37.65, amt: 376.46 },
      { skuCd: "VNTH-BK", qty: 15, unitPrc: 42.65, amt: 639.71 },
      { skuCd: "VNTH-BR", qty: 15, unitPrc: 42.65, amt: 639.71 },
      { skuCd: "VNTH-GY", qty: 15, unitPrc: 42.65, amt: 639.71 },
      { skuCd: "VNTH-DB", qty: 15, unitPrc: 42.65, amt: 639.71 },
      { skuCd: "CHMN-BK-N", qty: 165, unitPrc: 42.21, amt: 6963.96 },
      { skuCd: "CHMN-BR-N", qty: 50, unitPrc: 43.24, amt: 2161.76 },
    ],
  },
  // ============ CHAIR ============
  {
    prdLineCd: "CHAIR", suplFactNm: "HERUI", sttsNm: "SUR", loadType: null, subpoNo: null, currCd: "USD",
    hblNo: "NEOSGN26080569", mblNo: "CMDUSGN3380580", contNo: "CMAU3914724", poNo: "PO-HF-26-MIX-32-9",
    podNm: "LOS ANGELES", etd: parseDate("26.09.07"), eta: parseDate("26.09.28"), wrhsArrvDe: null,
    usdExchRt: money("1,414.90"), qty: qty("616"), amt: money("$10,592.62"), rmrk: null,
    neoInv: { sndrNm: "NEO", rcvrNm: "HYGGE" },
    factoryInv: { sndrNm: "HERUI", rcvrNm: "HYGGE", invNo: text("AS PO"), invDe: parseDate("26.08.14"), amt: money("$25,220.52") },
    costs: [{ cd: "OCF_HDC", amt: money("$4,885.00"), rcvrNm: "NEOVNM" }],
    skuDetails: [],
  },
  {
    prdLineCd: "CHAIR", suplFactNm: "HERUI", sttsNm: null, loadType: null, subpoNo: null, currCd: "USD",
    hblNo: "NEOSGN26080569", mblNo: "CMDUSGN3380580", contNo: "SEKU6072357", poNo: "PO-HF-26-MIX-32-10",
    podNm: "LOS ANGELES", etd: parseDate("26.09.07"), eta: parseDate("26.09.28"), wrhsArrvDe: null,
    usdExchRt: money("1,414.90"), qty: qty("464"), amt: money("$10,396.56"), rmrk: null,
    neoInv: { sndrNm: "NEO", rcvrNm: "HYGGE" },
    factoryInv: { sndrNm: "HERUI", rcvrNm: "HYGGE", invNo: text("AS PO"), invDe: parseDate("26.08.14"), amt: money("$23,103.46") },
    costs: [{ cd: "OCF_HDC", amt: money("$4,885.00"), rcvrNm: "NEOVNM" }],
    skuDetails: [],
  },
  {
    prdLineCd: "CHAIR", suplFactNm: "HERUI", sttsNm: null, loadType: null, subpoNo: null, currCd: "USD",
    hblNo: "NEOSGN26080569", mblNo: "CMDUSGN3380580", contNo: "TCKU6499794", poNo: "PO-HF-26-MIX-32-11",
    podNm: "LOS ANGELES", etd: parseDate("26.09.07"), eta: parseDate("26.09.28"), wrhsArrvDe: null,
    usdExchRt: money("1,414.90"), qty: qty("549"), amt: money("$10,141.34"), rmrk: null,
    neoInv: { sndrNm: "NEO", rcvrNm: "HYGGE" },
    factoryInv: { sndrNm: "HERUI", rcvrNm: "HYGGE", invNo: text("AS PO"), invDe: parseDate("26.08.14"), amt: money("$21,577.32") },
    costs: [{ cd: "OCF_HDC", amt: money("$4,885.00"), rcvrNm: "NEOVNM" }],
    skuDetails: [],
  },
  {
    prdLineCd: "CHAIR", suplFactNm: "HERUI", sttsNm: null, loadType: null, subpoNo: null, currCd: "USD",
    hblNo: "NEOSGN26080569", mblNo: "CMDUSGN3380580", contNo: "TXGU6921130", poNo: "PO-HF-26-MIX-32-19",
    podNm: "LOS ANGELES", etd: parseDate("26.09.07"), eta: parseDate("26.09.28"), wrhsArrvDe: null,
    usdExchRt: money("1,414.90"), qty: qty("448"), amt: money("$10,157.25"), rmrk: null,
    neoInv: { sndrNm: "NEO", rcvrNm: "HYGGE" },
    factoryInv: { sndrNm: "HERUI", rcvrNm: "HYGGE", invNo: text("AS PO"), invDe: parseDate("26.08.14"), amt: money("$24,183.92") },
    costs: [{ cd: "OCF_HDC", amt: money("$4,885.00"), rcvrNm: "NEOVNM" }],
    skuDetails: [],
  },
  {
    prdLineCd: "CHAIR", suplFactNm: "GREAT", sttsNm: "SUR,/B,/F", loadType: null, subpoNo: null, currCd: "USD",
    hblNo: "NEOSGN26080570", mblNo: "YMJAE490412669", contNo: "BEAU4517112", poNo: "PO-MT-26-MIX-31-3",
    podNm: "SAVANNAH", etd: parseDate("26.09.10"), eta: parseDate("26.10.23"), wrhsArrvDe: null,
    usdExchRt: money("1,414.90"), qty: qty("984"), amt: money("$10,090.72"), rmrk: null,
    neoInv: { sndrNm: "NEO", rcvrNm: "HYGGE" },
    factoryInv: { sndrNm: "GREAT", rcvrNm: "HYGGE", invNo: "GR-1131", invDe: parseDate("26.08.15"), amt: money("$16,275.36") },
    costs: [{ cd: "OCF_HDC", amt: money("$4,680.00"), rcvrNm: "NEOVNM" }],
    skuDetails: [],
  },
  {
    prdLineCd: "CHAIR", suplFactNm: "GREAT", sttsNm: null, loadType: null, subpoNo: null, currCd: "USD",
    hblNo: "NEOSGN26080570", mblNo: "YMJAE490412669", contNo: "TGBU6314787", poNo: "PO-MT-26-MIX-31-4",
    podNm: "SAVANNAH", etd: parseDate("26.09.10"), eta: parseDate("26.10.23"), wrhsArrvDe: null,
    usdExchRt: money("1,414.90"), qty: qty("937"), amt: money("$10,052.22"), rmrk: null,
    neoInv: { sndrNm: "NEO", rcvrNm: "HYGGE" },
    factoryInv: { sndrNm: "GREAT", rcvrNm: "HYGGE", invNo: "GR-1132", invDe: parseDate("26.08.14"), amt: money("$15,955.90") },
    costs: [{ cd: "OCF_HDC", amt: money("$4,680.00"), rcvrNm: "NEOVNM" }],
    skuDetails: [],
  },
  // ============ CHAIR_WF (Wayfair) ============
  {
    prdLineCd: "CHAIR_WF", suplFactNm: "GREAT", sttsNm: "SUR,/B", loadType: "LCL", subpoNo: null, currCd: "USD",
    hblNo: "CGGMSGN5460053", mblNo: "MAEU267777794", contNo: "MRSU7123533", poNo: "PO-MT-WF-26-15-1",
    podNm: "LA", etd: parseDate("26.04.18"), eta: parseDate("26.05.19"), wrhsArrvDe: null,
    usdExchRt: null, qty: qty("100"), amt: money("$1,481.80"), rmrk: null,
    neoInv: { sndrNm: "NEO", rcvrNm: "HYGGE" },
    factoryInv: { sndrNm: "GREAT", rcvrNm: "HYGGE", invNo: "GR-933", invDe: parseDate("26.04.06"), amt: money("$1,481.80") },
    costs: [{ cd: "DUTY", amt: money("$233.63"), rcvrNm: "Maersk", payDe: parseDate("26.05.28") }],
    skuDetails: [],
  },
  {
    prdLineCd: "CHAIR_WF", suplFactNm: "GREAT", sttsNm: "SUR,/B", loadType: "LCL", subpoNo: null, currCd: "USD",
    hblNo: "CGGMSGN5459992", mblNo: "HLCUSGN2603AVRZ5", contNo: "HAMU4051989", poNo: "PO-MT-WF-26-15-2",
    podNm: "LA", etd: parseDate("26.04.18"), eta: parseDate("26.05.25"), wrhsArrvDe: null,
    usdExchRt: null, qty: qty("182"), amt: money("$3,080.84"), rmrk: null,
    neoInv: { sndrNm: "NEO", rcvrNm: "HYGGE" },
    // Source invoice date "08.06.06" looks like a typo in the original sheet — kept as-is (not corrected).
    factoryInv: { sndrNm: "GREAT", rcvrNm: "HYGGE", invNo: "GR-934", invDe: parseDate("08.06.06"), amt: money("$3,080.84") },
    costs: [{ cd: "DUTY", amt: money("$395.53"), rcvrNm: "Maersk", payDe: parseDate("26.07.02") }],
    skuDetails: [],
  },
  {
    prdLineCd: "CHAIR_WF", suplFactNm: "HERUI", sttsNm: "SUR/ B", loadType: "LCL", subpoNo: null, currCd: "USD",
    hblNo: "CGGMSGN5454916", mblNo: "WHS-50192-42998546", contNo: "MRSU5449048", poNo: "PO-HR-WF-26-15-1",
    podNm: "NEWARK", etd: parseDate("26.04.12"), eta: parseDate("26.05.19"), wrhsArrvDe: null,
    usdExchRt: null, qty: qty("71"), amt: money("$1,622.25"), rmrk: null,
    neoInv: { sndrNm: "NEO", rcvrNm: "HYGGE" },
    factoryInv: { sndrNm: "HERUI", rcvrNm: "HYGGE", invNo: text("AS PO"), invDe: parseDate("26.04.07"), amt: money("$1,622.25") },
    costs: [{ cd: "DUTY", amt: money("$247.81"), rcvrNm: "Maersk", payDe: parseDate("26.05.28") }],
    skuDetails: [],
  },
  {
    prdLineCd: "CHAIR_WF", suplFactNm: "GREAT", sttsNm: "SUR", loadType: "LCL", subpoNo: "WHS-50192-44882265", currCd: "USD",
    hblNo: "CGGMSGN5536055", mblNo: null, contNo: "MRKU5231074", poNo: "WHS-50192-44882265",
    podNm: "NEWARK", etd: parseDate("26.07.03"), eta: parseDate("26.08.09"), wrhsArrvDe: null,
    usdExchRt: null, qty: null, amt: money("$3,577.60"), rmrk: null,
    neoInv: { sndrNm: "NEO", rcvrNm: "HYGGE" },
    factoryInv: { sndrNm: "GREAT", rcvrNm: "HYGGE", invNo: null, invDe: parseDate("26.06.23"), amt: null },
    costs: [{ cd: "DUTY", amt: money("$541.88"), rcvrNm: "Maersk", payDe: parseDate("26.08.28") }],
    skuDetails: [],
  },
  // ============ MATTRESS ============
  {
    prdLineCd: "MATTRESS", suplFactNm: "CGF-MIDAS", sttsNm: "SUR,CO/A", loadType: null, subpoNo: null, currCd: "USD",
    hblNo: "CGGMJKT3316110", mblNo: "HLCUJK1260766523", contNo: "HAMU2588428", poNo: "WHS-50192-45002793",
    podNm: "NEW YORK", etd: parseDate("26.08.18"), eta: parseDate("26.10.11"), wrhsArrvDe: null,
    usdExchRt: money("1,420.10"), qty: qty("428"), amt: money("$23,198.33"), rmrk: null,
    neoInv: { sndrNm: "ORANGE", rcvrNm: "HYGGE" },
    factoryInv: { sndrNm: "DREAM", rcvrNm: null, invNo: "DMIN-I-260810H", invDe: parseDate("26.08.10"), amt: money("$42,178.79") },
    costs: [{ cd: "LOCAL_CHG", amt: money("$70.00"), rcvrNm: joinLines("CGF/MSK\nNEOVNM") }],
    skuDetails: [],
  },
  {
    prdLineCd: "MATTRESS", suplFactNm: "CGF-MIDAS", sttsNm: "SUR,CO/A", loadType: null, subpoNo: null, currCd: "USD",
    hblNo: "CGGMJKT3316109", mblNo: "MAEU274871323", contNo: "MRSU6218207", poNo: "WHS-50192-45002796",
    podNm: "BALTIMORE", etd: parseDate("26.08.18"), eta: parseDate("26.10.07"), wrhsArrvDe: null,
    usdExchRt: money("1,420.10"), qty: qty("428"), amt: money("$23,198.26"), rmrk: null,
    neoInv: { sndrNm: "ORANGE", rcvrNm: "HYGGE" },
    factoryInv: { sndrNm: "DREAM", rcvrNm: null, invNo: "DMIN-I-260810J", invDe: parseDate("26.08.10"), amt: money("$42,178.65") },
    costs: [{ cd: "LOCAL_CHG", amt: money("$70.00"), rcvrNm: joinLines("CGF/MSK\nNEOVNM") }],
    skuDetails: [],
  },
  {
    prdLineCd: "MATTRESS", suplFactNm: "MIDAS", sttsNm: "SUR,CO/A", loadType: null, subpoNo: null, currCd: "USD",
    hblNo: "GLVSJKLA26070008", mblNo: "YMJAW425919532", contNo: "YMMU6657509", poNo: "PO-MD-26-30-6",
    podNm: "LAX", etd: parseDate("26.08.29"), eta: parseDate("26.10.06"), wrhsArrvDe: null,
    usdExchRt: money("1,383.10"), qty: qty("651"), amt: money("$20,331.31"), rmrk: null,
    neoInv: { sndrNm: "ORANGE", rcvrNm: "HYGGE" },
    factoryInv: { sndrNm: "DREAM", rcvrNm: null, invNo: text("DMIN-I-260826A\nDFHK-I-260826A"), invDe: parseDate("26.08.26"), amt: money("$36,966.01") },
    costs: [],
    skuDetails: [],
  },
  {
    prdLineCd: "MATTRESS", suplFactNm: "MIDAS", sttsNm: "SUR,CO/A", loadType: null, subpoNo: null, currCd: "USD",
    hblNo: "GLVSJKNY26080004", mblNo: "SSPHJKT8130711", contNo: "TCNU4348598", poNo: "PO-MD-26-30-7",
    podNm: "NEW YORK", etd: parseDate("26.08.18"), eta: parseDate("26.10.22"), wrhsArrvDe: null,
    usdExchRt: money("1,414.90"), qty: qty("545"), amt: money("$20,982.20"), rmrk: null,
    neoInv: { sndrNm: "ORANGE", rcvrNm: "HYGGE" },
    factoryInv: { sndrNm: "DREAM", rcvrNm: null, invNo: text("DMIN-I-260814A\nDFHK-I-260814A"), invDe: parseDate("26.08.14"), amt: money("$38,149.45") },
    costs: [],
    skuDetails: [],
  },
  {
    prdLineCd: "MATTRESS", suplFactNm: "MIDAS", sttsNm: "SUR,CO/A", loadType: null, subpoNo: null, currCd: "USD",
    hblNo: "GLVSJKNY26080005", mblNo: "SSPHJKT8130713", contNo: "JXLU6639811", poNo: "PO-MD-26-30-8",
    podNm: "NEW YORK", etd: parseDate("26.08.18"), eta: parseDate("26.10.22"), wrhsArrvDe: null,
    usdExchRt: money("1,414.90"), qty: qty("545"), amt: money("$20,982.20"), rmrk: null,
    neoInv: { sndrNm: "ORANGE", rcvrNm: "HYGGE" },
    factoryInv: { sndrNm: "DREAM", rcvrNm: null, invNo: text("DMIN-I-260814B\nDFHK-I-260814B"), invDe: parseDate("26.08.14"), amt: money("$38,149.45") },
    costs: [],
    skuDetails: [],
  },
];

async function main() {
  const pool = await sql.connect({
    server: env.DB_SERVER,
    port: Number(env.DB_PORT),
    database: env.DB_NAME,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    options: { encrypt: false, trustServerCertificate: true },
  });

  for (const s of shipments) {
    const shpmResult = await pool.request()
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
      .input("currCd", sql.Char(3), s.currCd)
      .input("rmrk", sql.NVarChar(500), s.rmrk)
      .input("regrId", sql.VarChar(30), REGR_ID)
      .query(`
        INSERT INTO FM.TB_SHPM_MST
          (OWNR_ETP_CD, PRD_LINE_CD, SUPL_FACT_NM, STTS_NM, LOAD_TYPE, HBL_NO, MBL_NO, CONT_NO,
           PO_NO, SUBPO_NO, POD_NM, ETD, ETA, WRHS_ARRV_DE, USD_EXCH_RT, CURR_CD, RMRK, REGR_ID)
        OUTPUT INSERTED.SHPM_ID
        VALUES
          (@ownrEtpCd, @prdLineCd, @suplFactNm, @sttsNm, @loadType, @hblNo, @mblNo, @contNo,
           @poNo, @subpoNo, @podNm, @etd, @eta, @wrhsArrvDe, @usdExchRt, @currCd, @rmrk, @regrId)
      `);
    const shpmId = shpmResult.recordset[0].SHPM_ID;

    await pool.request()
      .input("shpmId", sql.Int, shpmId)
      .input("qty", sql.Int, s.qty ?? 0) // QTY is NOT NULL; source doesn't report a qty for every row (e.g. WHS-50192-44882265)
      .input("amt", sql.Decimal(18, 4), s.amt)
      .input("regrId", sql.VarChar(30), REGR_ID)
      .query(`
        INSERT INTO FM.TB_SHPM_DTL (SHPM_ID, INV_TP_CD, SKU_CD, QTY, AMT, REGR_ID)
        VALUES (@shpmId, 'NEO', 'TOTAL', @qty, @amt, @regrId)
      `);

    for (const skuItem of s.skuDetails ?? []) {
      await pool.request()
        .input("shpmId", sql.Int, shpmId)
        .input("skuCd", sql.VarChar(50), skuItem.skuCd)
        .input("qty", sql.Int, skuItem.qty)
        .input("unitPrc", sql.Decimal(18, 4), skuItem.unitPrc ?? null)
        .input("amt", sql.Decimal(18, 4), skuItem.amt)
        .input("regrId", sql.VarChar(30), REGR_ID)
        .query(`
          INSERT INTO FM.TB_SHPM_DTL (SHPM_ID, INV_TP_CD, SKU_CD, QTY, UNIT_PRC, AMT, REGR_ID)
          VALUES (@shpmId, 'FACTORY', @skuCd, @qty, @unitPrc, @amt, @regrId)
        `);
    }

    if (s.neoInv) {
      await pool.request()
        .input("shpmId", sql.Int, shpmId)
        .input("sndrNm", sql.NVarChar(50), s.neoInv.sndrNm ?? null)
        .input("rcvrNm", sql.NVarChar(50), s.neoInv.rcvrNm ?? null)
        .input("payDe", sql.VarChar(8), s.neoInv.payDe ?? null)
        .input("invNo", sql.VarChar(50), s.neoInv.invNo ?? null)
        .input("invDe", sql.VarChar(8), s.neoInv.invDe ?? null)
        .input("amt", sql.Decimal(18, 4), s.neoInv.amt ?? null)
        .input("regrId", sql.VarChar(30), REGR_ID)
        .query(`
          INSERT INTO FM.TB_INV_MST (SHPM_ID, INV_TP_CD, INV_NO, INV_DE, SNDR_NM, RCVR_NM, CURR_CD, PAY_DE, AMT, REGR_ID)
          VALUES (@shpmId, 'NEO', @invNo, @invDe, @sndrNm, @rcvrNm, 'USD', @payDe, @amt, @regrId)
        `);
    }

    if (s.factoryInv) {
      await pool.request()
        .input("shpmId", sql.Int, shpmId)
        .input("sndrNm", sql.NVarChar(50), s.factoryInv.sndrNm ?? null)
        .input("rcvrNm", sql.NVarChar(50), s.factoryInv.rcvrNm ?? null)
        .input("payDe", sql.VarChar(8), s.factoryInv.payDe ?? null)
        .input("invNo", sql.VarChar(50), s.factoryInv.invNo ?? null)
        .input("invDe", sql.VarChar(8), s.factoryInv.invDe ?? null)
        .input("amt", sql.Decimal(18, 4), s.factoryInv.amt ?? null)
        .input("regrId", sql.VarChar(30), REGR_ID)
        .query(`
          INSERT INTO FM.TB_INV_MST (SHPM_ID, INV_TP_CD, INV_NO, INV_DE, SNDR_NM, RCVR_NM, CURR_CD, PAY_DE, AMT, REGR_ID)
          VALUES (@shpmId, 'FACTORY', @invNo, @invDe, @sndrNm, @rcvrNm, 'USD', @payDe, @amt, @regrId)
        `);
    }

    for (const c of s.costs) {
      if (c.amt == null) continue;
      await pool.request()
        .input("shpmId", sql.Int, shpmId)
        .input("costTpCd", sql.VarChar(30), c.cd)
        .input("amt", sql.Decimal(18, 2), c.amt)
        .input("sndrNm", sql.NVarChar(50), c.sndrNm ?? null)
        .input("rcvrNm", sql.NVarChar(50), c.rcvrNm ?? null)
        .input("invNo", sql.VarChar(50), c.invNo ?? null)
        .input("invDe", sql.VarChar(8), c.invDe ?? null)
        .input("payDe", sql.VarChar(8), c.payDe ?? null)
        .input("regrId", sql.VarChar(30), REGR_ID)
        .query(`
          INSERT INTO FM.TB_SHPM_COST_DTL (SHPM_ID, COST_TP_CD, AMT, CURR_CD, SNDR_NM, RCVR_NM, INV_NO, INV_DE, PAY_DE, REGR_ID)
          VALUES (@shpmId, @costTpCd, @amt, 'USD', @sndrNm, @rcvrNm, @invNo, @invDe, @payDe, @regrId)
        `);
    }

    console.log(`Seeded ${s.prdLineCd} ${s.poNo} -> SHPM_ID=${shpmId}`);
  }

  await pool.close();
}

main().catch((err) => {
  console.error("SEED ERROR:", err);
  process.exit(1);
});
