"use client";

import { useState, type ReactNode } from "react";
import type { InvoiceRow } from "@/lib/invoice";
import type { InvoiceColumn, InvoiceSection } from "@/lib/invoiceColumns";

const UNSET = "(미지정)";

function money(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

type Totals = { total: number; unpaid: number };
type Category = Totals & { key: string; label: string; hasReceiver: boolean; byReceiver: Map<string, Totals> };

// Every table section holding an amount is one category (Product, Freight, Duty, Trucking …).
// A section's own RCVer/Receiver/BUYER column splits it by receiver, and its Payment date
// decides paid vs unpaid. Senders aren't summarised: most sections don't record one.
function categories(sections: InvoiceSection[]) {
  return sections.flatMap((s) => {
    const amounts = s.columns.filter((c) => c.editTarget && c.editTarget.kind !== "master" && !c.editTarget.field);
    if (amounts.length === 0) return [];
    const field = (f: string) => s.columns.find((c) => c.editTarget && c.editTarget.kind !== "master" && c.editTarget.field === f);
    // A section with several amounts (O/FRT + HDC CHG + OCF/HDC) is labelled by its group.
    const label = s.groupLabel?.trim() || amounts[0].label;
    // Labels can repeat once trimmed (CHAIR has two "NEO CHAIR -> HYGGE" groups), so key by column.
    return [{ key: amounts[0].key, label, amounts, receiver: field("rcvrNm"), payDate: field("payDe") }];
  });
}

/** Amount subtotals per category and receiver, over the rows the table currently shows (its
 *  filters applied). */
export default function SettlementSummary({
  rows,
  sections,
  valueOf,
  actions,
}: {
  rows: InvoiceRow[];
  sections: InvoiceSection[];
  /** The value a cell shows (including unsaved edits). */
  valueOf: (col: InvoiceColumn, row: InvoiceRow) => string | number | null;
  /** Table view controls shown at the right end of this line (e.g. Expand All). */
  actions?: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  const list: Category[] = [];
  for (const spec of categories(sections)) {
    const cat: Category = { key: spec.key, label: spec.label, hasReceiver: !!spec.receiver, total: 0, unpaid: 0, byReceiver: new Map() };
    for (const row of rows) {
      const amt = spec.amounts.reduce((sum, c) => sum + Number(valueOf(c, row) ?? 0), 0);
      const named = spec.receiver ? String(valueOf(spec.receiver, row) ?? "").trim() : "";
      // A $0 line still lists its receiver, so e.g. "→ JoyHome $0.00" shows the amount is
      // simply not entered yet rather than the receiver vanishing.
      if (!amt && !named) continue;
      const unpaid = !spec.payDate || !valueOf(spec.payDate, row);
      cat.total += amt;
      if (unpaid) cat.unpaid += amt;
      if (spec.receiver) {
        const who = named || UNSET;
        const t = cat.byReceiver.get(who) ?? { total: 0, unpaid: 0 };
        t.total += amt;
        if (unpaid) t.unpaid += amt;
        cat.byReceiver.set(who, t);
      }
    }
    // Every category stays visible, even at $0 — a missing card reads as "removed".
    list.push(cat);
  }
  const total = list.reduce((sum, c) => sum + c.total, 0);
  const unpaid = list.reduce((sum, c) => sum + c.unpaid, 0);

  return (
    <div className="border-b border-gray-100 px-5 py-2">
      <div className="flex min-h-6 items-center justify-between gap-2">
        <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 hover:text-[#ff4b4b]">
          <i className={`fa-solid fa-chevron-right text-[9px] transition-transform ${open ? "rotate-90" : ""}`} />
          금액 요약
          <span className="font-normal text-gray-400">
            · {rows.length}건 · 합계 {money(total)}
            {unpaid > 0 && <span className="text-[#ff4b4b]"> · 미지급 {money(unpaid)}</span>}
          </span>
        </button>
        {actions}
      </div>
      {open && (
        <div className="mt-2 grid gap-1.5 [grid-template-columns:repeat(auto-fill,minmax(200px,1fr))]">
          {list.map((c) => {
            const receivers = [...c.byReceiver].sort((a, b) => b[1].total - a[1].total);
            // One receiver: name it next to the title instead of repeating the same figures.
            const single = receivers.length === 1 ? receivers[0][0] : null;
            return (
              <div key={c.key}className={`rounded-lg border border-gray-100 bg-gray-50/60 px-3 py-2 text-xs ${c.total ? "" : "opacity-50"}`}>
                <p className="truncate text-gray-500">
                  {c.label}
                  {single && <span className="text-gray-400"> → {single}</span>}
                </p>
                <p className="mt-0.5 flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-gray-800">{money(c.total)}</span>
                  {c.unpaid > 0 && <span className="text-[11px] text-[#ff4b4b]">미지급 {money(c.unpaid)}</span>}
                </p>
                {receivers.length > 1 && (
                  <ul className="mt-1 space-y-0.5 border-t border-gray-100 pt-1 text-[11px] text-gray-500">
                    {receivers.map(([who, t]) => (
                      <li key={who} className="flex justify-between gap-2" title={t.unpaid > 0 ? `미지급 ${money(t.unpaid)}` : undefined}>
                        <span className="truncate">→ {who}</span>
                        <span className={`shrink-0 ${t.unpaid > 0 ? "text-[#ff4b4b]" : ""}`}>{money(t.total)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
