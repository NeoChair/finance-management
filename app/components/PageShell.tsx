"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { sidebarMenu, type SidebarMenuItem } from "@/app/data/sidebarMenu";

function normalize(path: string): string {
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

function findTrail(pathname: string): SidebarMenuItem[] | null {
  for (const item of sidebarMenu) {
    if (item.page && normalize(item.page) === normalize(pathname)) return [item];
    if (item.children) {
      const child = item.children.find((c) => c.page && normalize(c.page) === normalize(pathname));
      if (child) return [item, child];
    }
  }
  return null;
}

// Shared shell for every menu page: breadcrumb + icon + big title (all derived from
// sidebarMenu.ts, so new pages get consistent, on-brand chrome for free just by being listed
// there) wrapping a card that holds the page's own toolbar/grid content.
export default function PageShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const trail = findTrail(pathname);
  const leaf = trail?.[trail.length - 1];
  const title = leaf?.text ?? "";
  const icon = leaf?.icon ?? "fa-solid fa-file-lines";

  return (
    <div className="flex flex-col gap-4 px-6 pb-6 pt-1 md:px-8 md:pb-8">
      <nav className="flex items-center gap-2 text-xs font-medium text-gray-400">
        <Link href="/home" className="flex items-center gap-1.5 hover:text-[#ff4b4b]">
          <i className="fa-solid fa-house text-[11px]" />
          <span>Home</span>
        </Link>
        {trail?.map((item, i) => (
          <span key={item.action ?? item.controller ?? item.text} className="flex items-center gap-2">
            <i className="fa-solid fa-chevron-right text-[9px] text-gray-300" />
            <span className={i === trail.length - 1 ? "font-semibold text-[#ff4b4b]" : "text-gray-400"}>{item.text}</span>
          </span>
        ))}
      </nav>

      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#ff4b4b]/10 text-lg text-[#ff4b4b]">
          <i className={icon} />
        </span>
        <h1 className="text-2xl font-bold text-gray-800">{title}</h1>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-[0_1px_3px_rgba(17,24,39,0.04)]">
        {children}
      </div>
    </div>
  );
}
