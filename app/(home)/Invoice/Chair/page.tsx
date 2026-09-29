import InvoiceTable from "@/app/components/InvoiceTable";
import PageShell from "@/app/components/PageShell";

export default function InvoiceChairPage() {
  return (
    <PageShell>
      <InvoiceTable apiUrl="/api/invoice/chair" fileName="invoice_chair" prdLineCd="CHAIR" />
    </PageShell>
  );
}
