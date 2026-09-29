import SimpleCrudTable from "@/app/components/SimpleCrudTable";
import PageShell from "@/app/components/PageShell";

const COLUMNS = [
  { key: "etpCd", label: "코드" },
  { key: "etpNm", label: "명칭" },
  { key: "loclNatnCd", label: "국가" },
];

export default function EnterpriseSettingsPage() {
  return (
    <PageShell>
      <SimpleCrudTable apiUrl="/api/settings/enterprises" idField="etpCd" columns={COLUMNS} />
    </PageShell>
  );
}
