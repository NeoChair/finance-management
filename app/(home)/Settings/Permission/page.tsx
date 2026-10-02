import PageShell from "@/app/components/PageShell";
import PermissionManager from "@/app/components/PermissionManager";
import { getSessionUser } from "@/lib/currentUser";
import { isAdmin } from "@/lib/userPerms";

export default async function PermissionSettingsPage() {
  const user = await getSessionUser();
  return (
    <PageShell>
      {user && isAdmin(user) ? (
        <PermissionManager />
      ) : (
        <p className="px-5 py-10 text-center text-sm text-gray-400">시스템 관리자만 사용할 수 있는 화면입니다.</p>
      )}
    </PageShell>
  );
}
