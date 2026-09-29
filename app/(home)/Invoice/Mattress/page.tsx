import InvoiceTable from "@/app/components/InvoiceTable";
import PageShell from "@/app/components/PageShell";

export default function InvoiceMattressPage() {
  return (
    <PageShell>
      <InvoiceTable apiUrl="/api/invoice/mattress" fileName="invoice_mattress" prdLineCd="MATTRESS" />
    </PageShell>
  );
}
