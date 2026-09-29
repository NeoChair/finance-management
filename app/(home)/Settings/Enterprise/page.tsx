import SimpleCrudTable, { type CrudColumn } from "@/app/components/SimpleCrudTable";
import PageShell from "@/app/components/PageShell";

const COLUMNS: CrudColumn[] = [
  { key: "etpCd", label: "코드", width: "200px" },
  { key: "etpNm", label: "명칭" },
  { key: "loclNatnCd", label: "국가", width: "120px" },
  {
    key: "isUse",
    label: "사용 여부",
    width: "110px",
    options: [
      { value: "Y", label: "사용" },
      { value: "N", label: "미사용" },
    ],
    allowEmpty: false,
  },
  { key: "remk", label: "비고" },
];

export default function EnterpriseSettingsPage() {
  return (
    <PageShell>
      <SimpleCrudTable apiUrl="/api/settings/enterprises" idField="etpCd" columns={COLUMNS} />
    </PageShell>
  );
}
