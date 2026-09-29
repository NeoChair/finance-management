import InvoiceTable from "@/app/components/InvoiceTable";
import PageShell from "@/app/components/PageShell";

export default function InvoiceChairWFPage() {
  return (
    <PageShell>
      <InvoiceTable apiUrl="/api/invoice/chair-wf" fileName="invoice_chair_wf" prdLineCd="CHAIR_WF" />
    </PageShell>
  );
}
