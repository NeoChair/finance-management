import SimpleCrudTable from "@/app/components/SimpleCrudTable";
import PageShell from "@/app/components/PageShell";

const COLUMNS = [
  { key: "wrhsCd", label: "창고 코드" },
  { key: "wrhsNm", label: "창고명" },
  { key: "wrhsAlasCd", label: "별칭" },
  { key: "wrhsStatCd", label: "상태" },
];

export default function WarehouseSettingsPage() {
  return (
    <PageShell>
      <SimpleCrudTable apiUrl="/api/settings/warehouses" idField="wrhsCd" columns={COLUMNS} />
    </PageShell>
  );
}
