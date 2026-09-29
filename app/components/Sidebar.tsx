"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { sidebarMenu, type SidebarMenuItem } from "@/app/data/sidebarMenu";

function SidebarArrowIcon({ className = "" }) {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor" className={className}>
            <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6-6-6z" />
        </svg>
    );
}

function ChevronIcon({ open }: { open: boolean }) {
    return (
        <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            focusable="false"
            fill="currentColor"
            className={`h-4 w-4 shrink-0 transition-transform duration-150 ${open ? "rotate-90" : ""}`}
        >
            <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6-6-6z" />
        </svg>
    );
}

const MIN_WIDTH = 260;
const MAX_WIDTH = 480;
const DEFAULT_WIDTH = 280;

function normalize(path: string): string {
    return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

function containsActivePath(item: SidebarMenuItem, pathname: string): boolean {
    if (item.page && normalize(item.page) === normalize(pathname)) return true;
    return item.children?.some((child) => containsActivePath(child, pathname)) ?? false;
}

function NavLeaf({ item, pathname }: { item: SidebarMenuItem; pathname: string }) {
    const active = !!item.page && normalize(item.page) === normalize(pathname);
    return (
        <Link
            href={item.page ?? "#"}
            className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
                active
                    ? "bg-[#ff4b4b]/10 font-medium text-[#ff4b4b]"
                    : "text-gray-700 hover:bg-gray-200/70"
            }`}
        >
            {item.icon && <i className={`${item.icon} w-4 shrink-0 text-center`} aria-hidden="true" />}
            <span className="truncate">{item.text}</span>
        </Link>
    );
}

function NavGroup({ item, pathname }: { item: SidebarMenuItem; pathname: string }) {
    const [manuallyOpen, setManuallyOpen] = useState<boolean | null>(null);
    const open = manuallyOpen ?? containsActivePath(item, pathname);

    return (
        <div className="flex flex-col">
            <button
                type="button"
                onClick={() => setManuallyOpen(!open)}
                className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200/70"
            >
                {item.icon && <i className={`${item.icon} w-4 shrink-0 text-center`} aria-hidden="true" />}
                <span className="flex-1 truncate text-left">{item.text}</span>
                <ChevronIcon open={open} />
            </button>

            {open && (
                <div className="ml-4 mt-1 flex flex-col gap-0.5 border-l border-gray-300 pl-3">
                    {item.children?.map((child, idx) => (
                        <NavLeaf key={child.action ?? idx} item={child} pathname={pathname} />
                    ))}
                </div>
            )}
        </div>
    );
}

function NavItem({ item, pathname }: { item: SidebarMenuItem; pathname: string }) {
    if (item.is_divider) {
        return <hr className="my-2 border-gray-300" />;
    }
    if (item.is_header) {
        return (
            <div className="mt-4 mb-1 px-3 text-xs font-semibold tracking-wide text-gray-400 uppercase first:mt-0">
                {item.text}
            </div>
        );
    }
    if (item.controller) {
        return <NavGroup item={item} pathname={pathname} />;
    }
    return <NavLeaf item={item} pathname={pathname} />;
}

export default function Sidebar() {
    const pathname = usePathname();
    const [width, setWidth] = useState(DEFAULT_WIDTH);
    const [collapsed, setCollapsed] = useState(false);
    const isResizing = useRef(false);

    useEffect(() => {
        function handleMouseMove(e: MouseEvent) {
            if (!isResizing.current) return;
            const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, e.clientX));
            setWidth(newWidth);
        }
        function handleMouseUp() {
            isResizing.current = false;
        }
        document.addEventListener("mousemove", handleMouseMove);
        document.addEventListener("mouseup", handleMouseUp);
        return () => {
            document.removeEventListener("mousemove", handleMouseMove);
            document.removeEventListener("mouseup", handleMouseUp);
        };
    }, []);

    const menu = useMemo(() => sidebarMenu, []);

    return (
        <div
            className={`relative h-screen flex-shrink-0 overflow-hidden transition-[width,background-color] duration-75 ease-in-out ${
                collapsed ? "bg-white" : "bg-[#f0f2f6]"
            }`}
            style={{ width: collapsed ? 48 : width }}
        >
            <div
                className={`absolute inset-0 flex items-start justify-center pt-4 transition-opacity duration-75 ease-in-out ${
                    collapsed ? "opacity-100" : "pointer-events-none opacity-0"
                }`}
            >
                <button
                    type="button"
                    onClick={() => setCollapsed(false)}
                    aria-label="사이드바 펼치기"
                    className="flex h-10 w-10 items-center justify-center rounded-md text-gray-500 hover:bg-gray-200 hover:text-gray-800"
                >
                    <SidebarArrowIcon className="h-7 w-7" />
                </button>
            </div>

            <div
                className={`h-full overflow-y-auto px-4 py-6 transition-opacity duration-75 ease-in-out ${
                    collapsed ? "pointer-events-none opacity-0" : "opacity-100"
                }`}
                style={{ width }}
            >
                <div className="mb-2 flex items-center justify-between px-1">
                    <Link href="/home" className="text-lg font-bold text-gray-800 hover:text-[#ff4b4b]">
                        NeoChair
                    </Link>
                    <button
                        type="button"
                        onClick={() => setCollapsed(true)}
                        aria-label="사이드바 접기"
                        className="flex h-10 w-10 items-center justify-center rounded-md text-gray-500 font-medium hover:bg-gray-200 hover:text-gray-800"
                    >
                        ✕
                    </button>
                </div>

                <div
                    onMouseDown={() => {
                        isResizing.current = true;
                    }}
                    className="absolute top-0 right-0 h-full w-1 cursor-col-resize hover:bg-[#ff4b4b]/40"
                />

                <nav className="flex flex-col gap-0.5 pt-5">
                    {menu.map((item, idx) => (
                        <NavItem key={item.action ?? item.controller ?? item.text ?? idx} item={item} pathname={pathname} />
                    ))}
                </nav>
            </div>
        </div>
    );
}
