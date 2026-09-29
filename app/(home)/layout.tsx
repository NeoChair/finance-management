import Sidebar from "@/app/components/Sidebar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full w-full">
      <link
        rel="stylesheet"
        href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css"
        precedence="high"
      />
      <Sidebar />
      <main className="min-h-screen flex-1 overflow-y-auto bg-[#f0f2f6]">{children}</main>
    </div>
  );
}
