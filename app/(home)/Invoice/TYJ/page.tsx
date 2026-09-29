import InvoiceTable from "@/app/components/InvoiceTable";
import PageShell from "@/app/components/PageShell";

export default function InvoiceTYJPage() {
  return (
    <PageShell>
      <InvoiceTable apiUrl="/api/invoice/tyj" fileName="invoice_tyj" prdLineCd="CHAIR_TYJ" />
    </PageShell>
  );
}
