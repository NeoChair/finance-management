import { redirect } from "next/navigation";
import Sidebar from "@/app/components/Sidebar";
import ProfileMenu from "@/app/components/ProfileMenu";
import { UserProvider } from "@/app/components/UserProvider";
import { getSessionUser } from "@/lib/currentUser";
import { getEditPerms, isAdmin } from "@/lib/userPerms";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // proxy.ts already redirects logged-out visitors; this covers an expired token as well.
  const session = await getSessionUser();
  if (!session) redirect("/");
  // Only the profile fields go to the client (not the token's iat/exp).
  const user = { usrId: session.usrId, usrNm: session.usrNm, usrTypCd: session.usrTypCd, ownrEtpCd: session.ownrEtpCd, etpCd: session.etpCd ?? null, email: session.email };
  // Read on every navigation, so a permission change applies on the user's next page load.
  // If it can't be read, fall back to read-only — the server re-checks every write anyway.
  const perms = await getEditPerms(user).catch((err) => {
    console.error("[layout] permission load error:", err);
    return { admin: isAdmin(user), codes: [] };
  });

  return (
    <UserProvider user={user} perms={perms}>
      <div className="flex min-h-full w-full">
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css"
          precedence="high"
        />
        <Sidebar />
        <main className="min-h-screen flex-1 overflow-y-auto bg-[#f0f2f6]">
          <header className="flex justify-end px-6 pt-4 md:px-8">
            <ProfileMenu />
          </header>
          {children}
        </main>
      </div>
    </UserProvider>
  );
}
