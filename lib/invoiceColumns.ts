import type { InvoiceCost, InvoiceRow } from "./invoice";

export type EditTarget =
  | { kind: "master"; field: string }
  | { kind: "party"; invTpCd: "NEO" | "FACTORY"; field?: PartyField }
  | { kind: "cost"; costTpCd: string; field?: PartyField };

/** Which party column of an invoice/cost line a cell edits; absent = the amount. */
export type PartyField = "sndrNm" | "rcvrNm";

/** Key identifying one DB column's value set, shared by the options API and the dropdowns:
 *  "master:suplFactNm", "party:NEO:sndrNm", "cost:DUTY:rcvrNm". */
export function optionKey(t: EditTarget): string {
  if (t.kind === "master") return `master:${t.field}`;
  if (t.kind === "party") return `party:${t.invTpCd}:${t.field ?? "amt"}`;
  return `cost:${t.costTpCd}:${t.field ?? "amt"}`;
}

export type InvoiceColumn = {
  key: string;
  label: string;
  align?: "right";
  /** Explicit cell format — avoids guessing from the label text. */
  format?: "date";
  /** Marks which column an expanded SKU sub-row's value goes into (see InvoiceTable). */
  skuField?: "sku" | "qty" | "amt";
  /** Present on amount/master columns that can be edited inline; absent = read-only. */
  editTarget?: EditTarget;
  /** Edited with a dropdown of the values already used in this same column (plus "직접 입력"). */
  select?: "used";
  getValue: (r: InvoiceRow) => string | number | null;
};

export type InvoiceSection = {
  /** null = ungrouped column, rendered with a single header cell spanning both header rows. */
  groupLabel: string | null;
  columns: InvoiceColumn[];
};

function cost(cd: string): (r: InvoiceRow) => InvoiceCost | undefined {
  return (r) => r.costs.find((c) => c.costTpCd === cd);
}

const ocean = cost("OCEAN_FREIGHT");
const duty = cost("DUTY");
const trucking = cost("TRUCKING");
const hdc = cost("HDC_CHG");
const ocfHdc = cost("OCF_HDC");
const linkone = cost("LINKONE_DEBIT");
const costCost = cost("COST");
const localChg = cost("LOCAL_CHG");
const isf = cost("ISF_FILING");
const customs = cost("CUSTOMS_ENTRY");
const handling = cost("HANDLING");
const cpsc = cost("CPSC_FILING");
const otherHandling = cost("OTHER_HANDLING");
const dreamLinkone = cost("DREAM_LINKONE");

function costAmtCol(key: string, label: string, costTpCd: string, getter: (r: InvoiceRow) => InvoiceCost | undefined): InvoiceColumn {
  return { key, label, align: "right", editTarget: { kind: "cost", costTpCd }, getValue: (r) => getter(r)?.amt ?? null };
}

// Column order, labels and grouping below mirror each source spreadsheet's own header rows
// (group row + column-name row), 1:1, skipping only the columns marked "To be deleted" in the
// source. Where a source column has no matching field in the FM schema, it's included with a
// blank getValue so the layout still matches — nothing is invented.
//
// editTarget marks which cells are inline-editable in the UI (amounts, the plain master fields,
// and the Shipper/Sender/Receiver/Buyer/Seller names, which use a dropdown of used values).
// Payment-date sub-fields stay read-only for now.

// ============ CHAIR_TYJ — sheet "TYJ" in 2026_CHAIR_TYJ_INV.xlsx ============
export const CHAIR_TYJ_SECTIONS: InvoiceSection[] = [
  {
    groupLabel: null,
    columns: [
      { key: "shipper", label: "SHIPPER", select: "used", editTarget: { kind: "master", field: "suplFactNm" }, getValue: (r) => r.suplFactNm },
      { key: "status", label: "Status", editTarget: { kind: "master", field: "sttsNm" }, getValue: (r) => r.sttsNm },
      { key: "hbl", label: "H-BL", editTarget: { kind: "master", field: "hblNo" }, getValue: (r) => r.hblNo },
      { key: "mbl", label: "M-BL", editTarget: { kind: "master", field: "mblNo" }, getValue: (r) => r.mblNo },
      { key: "cont", label: "CONTAINER", skuField: "sku", getValue: (r) => r.contNo },
      { key: "po", label: "PO No", editTarget: { kind: "master", field: "poNo" }, getValue: (r) => r.poNo },
      { key: "invNo", label: "INV NO", editTarget: { kind: "master", field: "invNo" }, getValue: (r) => r.invNo },
      { key: "invDate", label: "INV DATE", format: "date", editTarget: { kind: "master", field: "invDe" }, getValue: (r) => r.invDe },
      { key: "pod", label: "POD", editTarget: { kind: "master", field: "podNm" }, getValue: (r) => r.podNm },
      { key: "etd", label: "ETD", format: "date", editTarget: { kind: "master", field: "etd" }, getValue: (r) => r.etd },
      { key: "eta", label: "ETA", format: "date", editTarget: { kind: "master", field: "eta" }, getValue: (r) => r.eta },
      { key: "wh", label: "WH arrival", format: "date", editTarget: { kind: "master", field: "wrhsArrvDe" }, getValue: (r) => r.wrhsArrvDe },
      { key: "usd", label: "USD", align: "right", editTarget: { kind: "master", field: "usdExchRt" }, getValue: (r) => r.usdExchRt },
    ],
  },
  {
    groupLabel: "Product",
    columns: [
      { key: "prodAmt", label: "Amount", align: "right", skuField: "amt", getValue: (r) => r.amt },
      { key: "prodQty", label: "QTY", align: "right", skuField: "qty", getValue: (r) => r.qty },
      { key: "prodSender", label: "SENDER", select: "used", editTarget: { kind: "party", invTpCd: "NEO", field: "sndrNm" }, getValue: (r) => r.neoInv?.sndrNm ?? null },
      { key: "prodRcver", label: "RCVer", select: "used", editTarget: { kind: "party", invTpCd: "NEO", field: "rcvrNm" }, getValue: (r) => r.neoInv?.rcvrNm ?? null },
      { key: "prodPayDate", label: "Payment date", align: "right", format: "date", getValue: (r) => r.neoInv?.payDe ?? null },
    ],
  },
  {
    groupLabel: "Freight",
    columns: [
      costAmtCol("freightAmt", "Amount", "OCEAN_FREIGHT", ocean),
      { key: "freightSender", label: "SENDER", select: "used", editTarget: { kind: "cost", costTpCd: "OCEAN_FREIGHT", field: "sndrNm" }, getValue: (r) => ocean(r)?.sndrNm ?? null },
      { key: "freightRcver", label: "RCVer", select: "used", editTarget: { kind: "cost", costTpCd: "OCEAN_FREIGHT", field: "rcvrNm" }, getValue: (r) => ocean(r)?.rcvrNm ?? null },
      { key: "freightPayDate", label: "Payment date", align: "right", format: "date", getValue: (r) => ocean(r)?.payDe ?? null },
    ],
  },
  {
    groupLabel: "Duty",
    columns: [
      costAmtCol("dutyAmt", "Amount", "DUTY", duty),
      { key: "dutyRcvr", label: "Receiver", select: "used", editTarget: { kind: "cost", costTpCd: "DUTY", field: "rcvrNm" }, getValue: (r) => duty(r)?.rcvrNm ?? null },
      { key: "dutyPayDate", label: "Payment Date", align: "right", format: "date", getValue: (r) => duty(r)?.payDe ?? null },
    ],
  },
  {
    groupLabel: "TRUCKING",
    columns: [
      { key: "truckInvNo", label: "INVOICE NO", getValue: (r) => trucking(r)?.invNo ?? null },
      { key: "truckInvDate", label: "INVOICE DATE", align: "right", format: "date", getValue: (r) => trucking(r)?.invDe ?? null },
      costAmtCol("truckAmt", "AMOUNT", "TRUCKING", trucking),
      { key: "truckPayDate", label: "Payment Date", align: "right", format: "date", getValue: (r) => trucking(r)?.payDe ?? null },
    ],
  },
];

// ============ CHAIR — sheet "INV" in CHAIR_INV JIN JU.xlsx ============
export const CHAIR_SECTIONS: InvoiceSection[] = [
  {
    groupLabel: null,
    columns: [
      { key: "shipper", label: "SHIPPER", select: "used", editTarget: { kind: "master", field: "suplFactNm" }, getValue: (r) => r.suplFactNm },
      { key: "status", label: "Status", editTarget: { kind: "master", field: "sttsNm" }, getValue: (r) => r.sttsNm },
      { key: "hbl", label: "H-BL", editTarget: { kind: "master", field: "hblNo" }, getValue: (r) => r.hblNo },
      { key: "mbl", label: "M-BL", editTarget: { kind: "master", field: "mblNo" }, getValue: (r) => r.mblNo },
      { key: "cont", label: "CONTAINER", skuField: "sku", getValue: (r) => r.contNo },
      { key: "po", label: "PO No", editTarget: { kind: "master", field: "poNo" }, getValue: (r) => r.poNo },
      { key: "invNo", label: "INV NO", editTarget: { kind: "master", field: "invNo" }, getValue: (r) => r.invNo },
      { key: "invDate", label: "INV DATE", align: "right", format: "date", editTarget: { kind: "master", field: "invDe" }, getValue: (r) => r.invDe },
      { key: "pod", label: "POD", editTarget: { kind: "master", field: "podNm" }, getValue: (r) => r.podNm },
      { key: "etd", label: "ETD", format: "date", editTarget: { kind: "master", field: "etd" }, getValue: (r) => r.etd },
      { key: "eta", label: "ETA", format: "date", editTarget: { kind: "master", field: "eta" }, getValue: (r) => r.eta },
      { key: "wh", label: "WH arrival", format: "date", editTarget: { kind: "master", field: "wrhsArrvDe" }, getValue: (r) => r.wrhsArrvDe },
      { key: "usd", label: "USD", align: "right", editTarget: { kind: "master", field: "usdExchRt" }, getValue: (r) => r.usdExchRt },
    ],
  },
  {
    groupLabel: "NEO CHAIR -> HYGGE",
    columns: [
      { key: "neoAmt", label: "Amount", align: "right", skuField: "amt", getValue: (r) => r.amt },
      { key: "neoQty", label: "QTY", align: "right", skuField: "qty", getValue: (r) => r.qty },
      { key: "neoSender", label: "SENDER", select: "used", editTarget: { kind: "party", invTpCd: "NEO", field: "sndrNm" }, getValue: (r) => r.neoInv?.sndrNm ?? null },
      { key: "neoRcver", label: "RCVer", select: "used", editTarget: { kind: "party", invTpCd: "NEO", field: "rcvrNm" }, getValue: (r) => r.neoInv?.rcvrNm ?? null },
      { key: "neoPayDate", label: "Payment date", align: "right", format: "date", getValue: (r) => r.neoInv?.payDe ?? null },
    ],
  },
  {
    groupLabel: "HYGGE -> SHIPPER",
    columns: [
      { key: "hsAmt", label: "Amount", align: "right", editTarget: { kind: "party", invTpCd: "FACTORY" }, getValue: (r) => r.factoryInv?.amt ?? null },
      { key: "hsBuyer", label: "BUYER", select: "used", editTarget: { kind: "party", invTpCd: "FACTORY", field: "rcvrNm" }, getValue: (r) => r.factoryInv?.rcvrNm ?? null },
      { key: "hsSeller", label: "SELLER", select: "used", editTarget: { kind: "party", invTpCd: "FACTORY", field: "sndrNm" }, getValue: (r) => r.factoryInv?.sndrNm ?? null },
      { key: "hsPayDate", label: "Payment Date", align: "right", format: "date", getValue: (r) => r.factoryInv?.payDe ?? null },
    ],
  },
  {
    groupLabel: "NEO -> POD (Duty0%)",
    columns: [
      costAmtCol("dutyAmt", "Amount", "DUTY", duty),
      { key: "dutyRcvr", label: "Receiver", select: "used", editTarget: { kind: "cost", costTpCd: "DUTY", field: "rcvrNm" }, getValue: (r) => duty(r)?.rcvrNm ?? null },
      { key: "dutyPayDate", label: "Payment Date", align: "right", format: "date", getValue: (r) => duty(r)?.payDe ?? null },
    ],
  },
  {
    groupLabel: "NEO VN DEBIT(O/F+HDL)",
    columns: [
      costAmtCol("ofrt", "O/FRT", "OCEAN_FREIGHT", ocean),
      costAmtCol("hdcChg", "HDC CHG", "HDC_CHG", hdc),
      costAmtCol("ocfHdc", "OCF/HDC", "OCF_HDC", ocfHdc),
      { key: "ofrtRcvr", label: "Receiver", select: "used", editTarget: { kind: "cost", costTpCd: "OCEAN_FREIGHT", field: "rcvrNm" }, getValue: (r) => ocean(r)?.rcvrNm ?? null },
      { key: "ofrtPayDate", label: "Payment Date", align: "right", format: "date", getValue: (r) => ocean(r)?.payDe ?? null },
    ],
  },
  {
    groupLabel: "NEO CHAIR -> LINKONE GLS",
    columns: [
      costAmtCol("linkoneAmt", "LINKONE DEBIT", "LINKONE_DEBIT", linkone),
      { key: "linkoneRcvr", label: "Receiver", select: "used", editTarget: { kind: "cost", costTpCd: "LINKONE_DEBIT", field: "rcvrNm" }, getValue: (r) => linkone(r)?.rcvrNm ?? null },
      { key: "linkonePayDate", label: "Payment Date", align: "right", format: "date", getValue: (r) => linkone(r)?.payDe ?? null },
    ],
  },
  {
    groupLabel: "NEO CHAIR -> HYGGE ",
    columns: [
      costAmtCol("costAmt", "COST", "COST", costCost),
      { key: "costRcvr", label: "Receiver", select: "used", editTarget: { kind: "cost", costTpCd: "COST", field: "rcvrNm" }, getValue: (r) => costCost(r)?.rcvrNm ?? null },
      { key: "costPayDate", label: "Payment Date", align: "right", format: "date", getValue: (r) => costCost(r)?.payDe ?? null },
    ],
  },
  {
    groupLabel: null,
    columns: [{ key: "remark", label: "Remark", editTarget: { kind: "master", field: "rmrk" }, getValue: (r) => r.rmrk }],
  },
  {
    groupLabel: "TRUCKING",
    columns: [
      { key: "truckInvNo", label: "INVOICE NO", getValue: (r) => trucking(r)?.invNo ?? null },
      { key: "truckInvDate", label: "INVOICE DATE", align: "right", format: "date", getValue: (r) => trucking(r)?.invDe ?? null },
      costAmtCol("truckAmt", "AMOUNT", "TRUCKING", trucking),
      { key: "truckPayDate", label: "Payment Date", align: "right", format: "date", getValue: (r) => trucking(r)?.payDe ?? null },
    ],
  },
];

// ============ CHAIR-WF — "CHAIR-WF" block in Book2.xlsx (Wayfair chair shipments) ============
// Same shape as CHAIR, plus LOAD_TYPE/SUB PO (Wayfair PO splits ship as multiple sub-POs)
// and a "Total amount" sub-field under HYGGE -> SHIPPER.
export const CHAIR_WF_SECTIONS: InvoiceSection[] = [
  {
    groupLabel: null,
    columns: [
      { key: "shipper", label: "SHIPPER", select: "used", editTarget: { kind: "master", field: "suplFactNm" }, getValue: (r) => r.suplFactNm },
      { key: "loadType", label: "LOAD_TYPE", editTarget: { kind: "master", field: "loadType" }, getValue: (r) => r.loadType },
      { key: "status", label: "Status", editTarget: { kind: "master", field: "sttsNm" }, getValue: (r) => r.sttsNm },
      { key: "hbl", label: "H-BL", editTarget: { kind: "master", field: "hblNo" }, getValue: (r) => r.hblNo },
      { key: "mbl", label: "M-BL", editTarget: { kind: "master", field: "mblNo" }, getValue: (r) => r.mblNo },
      { key: "cont", label: "CONTAINER", skuField: "sku", getValue: (r) => r.contNo },
      { key: "po", label: "PO No", editTarget: { kind: "master", field: "poNo" }, getValue: (r) => r.poNo },
      { key: "subpo", label: "SUB PO", editTarget: { kind: "master", field: "subpoNo" }, getValue: (r) => r.subpoNo },
      { key: "invNo", label: "INV NO", editTarget: { kind: "master", field: "invNo" }, getValue: (r) => r.invNo },
      { key: "invDate", label: "INV DATE", align: "right", format: "date", editTarget: { kind: "master", field: "invDe" }, getValue: (r) => r.invDe },
      { key: "pod", label: "POD", editTarget: { kind: "master", field: "podNm" }, getValue: (r) => r.podNm },
      { key: "etd", label: "ETD", format: "date", editTarget: { kind: "master", field: "etd" }, getValue: (r) => r.etd },
      { key: "eta", label: "ETA", format: "date", editTarget: { kind: "master", field: "eta" }, getValue: (r) => r.eta },
      { key: "wh", label: "WH arrival", editTarget: { kind: "master", field: "wrhsArrvDe" }, getValue: (r) => r.wrhsArrvDe },
      { key: "usd", label: "USD", align: "right", editTarget: { kind: "master", field: "usdExchRt" }, getValue: (r) => r.usdExchRt },
    ],
  },
  {
    groupLabel: "NEO CHAIR -> HYGGE",
    columns: [
      { key: "neoAmt", label: "Amount", align: "right", skuField: "amt", getValue: (r) => r.amt },
      { key: "neoQty", label: "QTY", align: "right", skuField: "qty", getValue: (r) => r.qty },
      { key: "neoSender", label: "SENDER", select: "used", editTarget: { kind: "party", invTpCd: "NEO", field: "sndrNm" }, getValue: (r) => r.neoInv?.sndrNm ?? null },
      { key: "neoRcver", label: "RCVer", select: "used", editTarget: { kind: "party", invTpCd: "NEO", field: "rcvrNm" }, getValue: (r) => r.neoInv?.rcvrNm ?? null },
      { key: "neoPayDate", label: "Payment date", align: "right", format: "date", getValue: (r) => r.neoInv?.payDe ?? null },
    ],
  },
  {
    groupLabel: "HYGGE -> SHIPPER",
    columns: [
      { key: "hsAmt", label: "Amount", align: "right", editTarget: { kind: "party", invTpCd: "FACTORY" }, getValue: (r) => r.factoryInv?.amt ?? null },
      { key: "hsTotalAmt", label: "Total amount", align: "right", getValue: () => null },
      { key: "hsBuyer", label: "BUYER", select: "used", editTarget: { kind: "party", invTpCd: "FACTORY", field: "rcvrNm" }, getValue: (r) => r.factoryInv?.rcvrNm ?? null },
      { key: "hsSeller", label: "SELLER", select: "used", editTarget: { kind: "party", invTpCd: "FACTORY", field: "sndrNm" }, getValue: (r) => r.factoryInv?.sndrNm ?? null },
      { key: "hsPayDate", label: "Payment Date", align: "right", format: "date", getValue: (r) => r.factoryInv?.payDe ?? null },
    ],
  },
  {
    groupLabel: "NEO -> POD (Duty0%)",
    columns: [
      costAmtCol("dutyAmt", "NEO -> POD (Duty0%)", "DUTY", duty),
      { key: "dutyRcvr", label: "Receiver", select: "used", editTarget: { kind: "cost", costTpCd: "DUTY", field: "rcvrNm" }, getValue: (r) => duty(r)?.rcvrNm ?? null },
      { key: "dutyPayDate", label: "Payment Date", align: "right", format: "date", getValue: (r) => duty(r)?.payDe ?? null },
    ],
  },
  {
    groupLabel: "NEO VN DEBIT(O/F+HDL)",
    columns: [
      costAmtCol("ofrt", "O/FRT", "OCEAN_FREIGHT", ocean),
      costAmtCol("hdcChg", "HDC CHG", "HDC_CHG", hdc),
      costAmtCol("ocfHdc", "OCF/HDC", "OCF_HDC", ocfHdc),
      { key: "ofrtRcvr", label: "Receiver", select: "used", editTarget: { kind: "cost", costTpCd: "OCEAN_FREIGHT", field: "rcvrNm" }, getValue: (r) => ocean(r)?.rcvrNm ?? null },
      { key: "ofrtPayDate", label: "Payment Date", align: "right", format: "date", getValue: (r) => ocean(r)?.payDe ?? null },
    ],
  },
  {
    groupLabel: "NEO CHAIR -> LINKONE GLS",
    columns: [
      costAmtCol("linkoneAmt", "LINKONE DEBIT", "LINKONE_DEBIT", linkone),
      { key: "linkoneRcvr", label: "Receiver", select: "used", editTarget: { kind: "cost", costTpCd: "LINKONE_DEBIT", field: "rcvrNm" }, getValue: (r) => linkone(r)?.rcvrNm ?? null },
      { key: "linkonePayDate", label: "Payment Date", align: "right", format: "date", getValue: (r) => linkone(r)?.payDe ?? null },
    ],
  },
  {
    groupLabel: "NEO CHAIR -> HYGGE ",
    columns: [
      costAmtCol("costAmt", "COST", "COST", costCost),
      { key: "costRcvr", label: "Receiver", select: "used", editTarget: { kind: "cost", costTpCd: "COST", field: "rcvrNm" }, getValue: (r) => costCost(r)?.rcvrNm ?? null },
      { key: "costPayDate", label: "Payment Date", align: "right", format: "date", getValue: (r) => costCost(r)?.payDe ?? null },
    ],
  },
  {
    groupLabel: null,
    columns: [{ key: "remark", label: "Remark", editTarget: { kind: "master", field: "rmrk" }, getValue: (r) => r.rmrk }],
  },
];

// ============ MATTRESS — sheet "INV_MIDAS" in JKT SPRING MATTRESS_INV.xlsx ============
export const MATTRESS_SECTIONS: InvoiceSection[] = [
  {
    groupLabel: null,
    columns: [
      { key: "shipper", label: "SHIPPER", select: "used", editTarget: { kind: "master", field: "suplFactNm" }, getValue: (r) => r.suplFactNm },
      { key: "status", label: "Status", editTarget: { kind: "master", field: "sttsNm" }, getValue: (r) => r.sttsNm },
      { key: "hbl", label: "H-BL", editTarget: { kind: "master", field: "hblNo" }, getValue: (r) => r.hblNo },
      { key: "mbl", label: "M-BL", editTarget: { kind: "master", field: "mblNo" }, getValue: (r) => r.mblNo },
      { key: "cont", label: "CONTAINER", skuField: "sku", getValue: (r) => r.contNo },
      { key: "invNo", label: "INV NO", editTarget: { kind: "master", field: "invNo" }, getValue: (r) => r.invNo },
      { key: "po", label: "PO NO", editTarget: { kind: "master", field: "poNo" }, getValue: (r) => r.poNo },
      { key: "invDate", label: "INV DATE", align: "right", format: "date", editTarget: { kind: "master", field: "invDe" }, getValue: (r) => r.invDe },
      { key: "pod", label: "POD", editTarget: { kind: "master", field: "podNm" }, getValue: (r) => r.podNm },
      { key: "etd", label: "ETD", format: "date", editTarget: { kind: "master", field: "etd" }, getValue: (r) => r.etd },
      { key: "eta", label: "ETA", format: "date", editTarget: { kind: "master", field: "eta" }, getValue: (r) => r.eta },
      { key: "wh", label: "WH arrival", format: "date", editTarget: { kind: "master", field: "wrhsArrvDe" }, getValue: (r) => r.wrhsArrvDe },
      { key: "usd", label: "USD", align: "right", editTarget: { kind: "master", field: "usdExchRt" }, getValue: (r) => r.usdExchRt },
    ],
  },
  {
    groupLabel: "ORANGE -> HYGGE",
    columns: [
      { key: "ohAmt", label: "Amount", align: "right", skuField: "amt", getValue: (r) => r.amt },
      { key: "ohSender", label: "SENDER", select: "used", editTarget: { kind: "party", invTpCd: "NEO", field: "sndrNm" }, getValue: (r) => r.neoInv?.sndrNm ?? null },
      { key: "ohRcver", label: "RCVer", select: "used", editTarget: { kind: "party", invTpCd: "NEO", field: "rcvrNm" }, getValue: (r) => r.neoInv?.rcvrNm ?? null },
      { key: "ohPayDate", label: "Payment", align: "right", format: "date", getValue: (r) => r.neoInv?.payDe ?? null },
    ],
  },
  {
    groupLabel: "HYGEE -> DREAM FURNITURE",
    columns: [
      { key: "hdAmt", label: "Amount", align: "right", editTarget: { kind: "party", invTpCd: "FACTORY" }, getValue: (r) => r.factoryInv?.amt ?? null },
      { key: "hdQty", label: "QTY", align: "right", skuField: "qty", getValue: (r) => r.qty },
      { key: "hdSeller", label: "SELLER", select: "used", editTarget: { kind: "party", invTpCd: "FACTORY", field: "sndrNm" }, getValue: (r) => r.factoryInv?.sndrNm ?? null },
      { key: "hdPayDate", label: "Payment Date", align: "right", format: "date", getValue: (r) => r.factoryInv?.payDe ?? null },
    ],
  },
  {
    groupLabel: "NEO VN DEBIT(O/F+HDL)",
    columns: [
      costAmtCol("ofrt", "O/FRT", "OCEAN_FREIGHT", ocean),
      costAmtCol("localChg", "LOCAL CHG", "LOCAL_CHG", localChg),
      { key: "ofrtRcvr", label: "Receiver", select: "used", editTarget: { kind: "cost", costTpCd: "OCEAN_FREIGHT", field: "rcvrNm" }, getValue: (r) => ocean(r)?.rcvrNm ?? null },
      { key: "ofrtPayDate", label: "Payment Date", align: "right", format: "date", getValue: (r) => ocean(r)?.payDe ?? null },
    ],
  },
  {
    groupLabel: "DN LCC POL - (ORANGE -> APECS)",
    columns: [
      costAmtCol("linkoneAmt", "LINKONE DEBIT", "LINKONE_DEBIT", linkone),
      { key: "linkoneRcvr", label: "Receiver", select: "used", editTarget: { kind: "cost", costTpCd: "LINKONE_DEBIT", field: "rcvrNm" }, getValue: (r) => linkone(r)?.rcvrNm ?? null },
      { key: "linkonePayDate", label: "Payment Date", align: "right", format: "date", getValue: (r) => linkone(r)?.payDe ?? null },
    ],
  },
  {
    groupLabel: "ORANGE -> HYGGE ",
    columns: [
      costAmtCol("costAmt", "COST", "COST", costCost),
      { key: "costRcvr", label: "Receiver", select: "used", editTarget: { kind: "cost", costTpCd: "COST", field: "rcvrNm" }, getValue: (r) => costCost(r)?.rcvrNm ?? null },
      { key: "costPayDate", label: "Payment Date", align: "right", format: "date", getValue: (r) => costCost(r)?.payDe ?? null },
    ],
  },
  {
    groupLabel: null,
    columns: [{ key: "remark", label: "Remark", editTarget: { kind: "master", field: "rmrk" }, getValue: (r) => r.rmrk }],
  },
  {
    groupLabel: "DUTY (HYGGE -> DREAM)",
    columns: [
      costAmtCol("dutyAmt", "DUTY", "DUTY", duty),
      { key: "dutyPayDate", label: "Payment Date", align: "right", format: "date", getValue: (r) => duty(r)?.payDe ?? null },
    ],
  },
  {
    groupLabel: "ISF FILING FEE",
    columns: [
      costAmtCol("isfAmt", "Amount", "ISF_FILING", isf),
      { key: "isfPayDate", label: "Payment Date", align: "right", format: "date", getValue: (r) => isf(r)?.payDe ?? null },
    ],
  },
  {
    groupLabel: "CUSTOMS ENTRY FEE",
    columns: [
      costAmtCol("customsAmt", "Amount", "CUSTOMS_ENTRY", customs),
      { key: "customsPayDate", label: "Payment Date", align: "right", format: "date", getValue: (r) => customs(r)?.payDe ?? null },
    ],
  },
  {
    groupLabel: "HANDLING CHARGE",
    columns: [
      costAmtCol("handlingAmt", "Amount", "HANDLING", handling),
      { key: "handlingPayDate", label: "Payment Date", align: "right", format: "date", getValue: (r) => handling(r)?.payDe ?? null },
    ],
  },
  {
    groupLabel: "CPSC FILING",
    columns: [
      costAmtCol("cpscAmt", "Amount", "CPSC_FILING", cpsc),
      { key: "cpscPayDate", label: "Payment Date", align: "right", format: "date", getValue: (r) => cpsc(r)?.payDe ?? null },
      costAmtCol("dreamLinkoneAmt", "DREAM → linkone", "DREAM_LINKONE", dreamLinkone),
    ],
  },
  {
    groupLabel: "Other Handling Charge",
    columns: [
      { key: "ohcInvNo", label: "Inv #", getValue: (r) => otherHandling(r)?.invNo ?? null },
      costAmtCol("ohcAmt", "Amount", "OTHER_HANDLING", otherHandling),
      { key: "ohcPayDate", label: "Payment Date", align: "right", format: "date", getValue: (r) => otherHandling(r)?.payDe ?? null },
    ],
  },
  {
    groupLabel: "TRUCKING",
    columns: [
      { key: "truckInvNo", label: "INVOICE NO", getValue: (r) => trucking(r)?.invNo ?? null },
      { key: "truckInvDate", label: "INVOICE DATE", align: "right", format: "date", getValue: (r) => trucking(r)?.invDe ?? null },
      costAmtCol("truckAmt", "AMOUNT", "TRUCKING", trucking),
      { key: "truckPayDate", label: "Payment Date", align: "right", format: "date", getValue: (r) => trucking(r)?.payDe ?? null },
    ],
  },
];

export function getInvoiceSections(prdLineCd: string): InvoiceSection[] {
  if (prdLineCd === "CHAIR_TYJ") return CHAIR_TYJ_SECTIONS;
  if (prdLineCd === "CHAIR") return CHAIR_SECTIONS;
  if (prdLineCd === "CHAIR_WF") return CHAIR_WF_SECTIONS;
  if (prdLineCd === "MATTRESS") return MATTRESS_SECTIONS;
  return [];
}
