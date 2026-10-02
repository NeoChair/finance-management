"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

const BLANK_LABEL = "(빈 셀)";
const MENU_W = 240;

// Excel-style AutoFilter dropdown: a search box over a checklist of the column's distinct values.
// `selected` null means "no filter" (everything shown). Applying with every value checked clears
// the filter again, like Excel.
export default function ColumnFilterMenu({
  anchor,
  values,
  selected,
  onApply,
  onClose,
}: {
  anchor: DOMRect;
  values: string[];
  selected: string[] | null;
  onApply: (selected: string[] | null) => void;
  onClose: () => void;
}) {
  const [checked, setChecked] = useState<Set<string>>(() => new Set(selected ?? values));
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: anchor.left, top: anchor.bottom + 4 });

  // Keep the menu on screen: shift left at the right edge, open upwards near the bottom.
  useLayoutEffect(() => {
    const h = ref.current?.offsetHeight ?? 0;
    const left = Math.max(8, Math.min(anchor.left, window.innerWidth - MENU_W - 8));
    const below = anchor.bottom + 4;
    const top = below + h > window.innerHeight - 8 ? Math.max(8, anchor.top - h - 4) : below;
    setPos({ left, top });
  }, [anchor]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      const t = e.target as Element;
      // Filter buttons toggle/switch the menu themselves on click.
      if (ref.current && !ref.current.contains(t) && !t.closest?.("[data-filter-anchor]")) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    // The menu is fixed-positioned, so it would drift away from its column on scroll.
    function onScroll(e: Event) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  const q = search.trim().toLowerCase();
  const visible = q ? values.filter((v) => (v || BLANK_LABEL).toLowerCase().includes(q)) : values;
  const allVisibleChecked = visible.length > 0 && visible.every((v) => checked.has(v));

  function toggle(v: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });
  }

  function toggleAllVisible() {
    setChecked((prev) => {
      const next = new Set(prev);
      for (const v of visible) {
        if (allVisibleChecked) next.delete(v);
        else next.add(v);
      }
      return next;
    });
  }

  function apply() {
    // While searching, Excel applies only the matching values that are ticked.
    const picked = (q ? visible : values).filter((v) => checked.has(v));
    onApply(!q && picked.length === values.length ? null : picked);
  }

  return (
    <div
      ref={ref}
      className="fixed z-50 flex flex-col rounded-lg border border-gray-200 bg-white text-[12px] font-normal text-gray-700 shadow-lg"
      style={{ left: pos.left, top: pos.top, width: MENU_W }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="border-b border-gray-100 p-2">
        <input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") apply();
          }}
          placeholder="검색"
          className="h-7 w-full rounded-md border border-gray-200 px-2 outline-none focus:border-[#ff4b4b]"
        />
      </div>
      <div className="max-h-64 overflow-auto py-1">
        <label className="flex cursor-pointer items-center gap-2 px-3 py-1 hover:bg-gray-50">
          <input type="checkbox" className="accent-[#ff4b4b]" checked={allVisibleChecked} onChange={toggleAllVisible} />
          <span className="font-medium">{q ? "(검색 결과 모두 선택)" : "(모두 선택)"}</span>
        </label>
        {visible.map((v) => (
          <label key={v} className="flex cursor-pointer items-center gap-2 px-3 py-1 hover:bg-gray-50">
            <input type="checkbox" className="accent-[#ff4b4b]" checked={checked.has(v)} onChange={() => toggle(v)} />
            <span className={`truncate ${v ? "" : "text-gray-400"}`}>{v || BLANK_LABEL}</span>
          </label>
        ))}
        {visible.length === 0 && <p className="px-3 py-2 text-gray-400">일치하는 항목이 없습니다</p>}
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-gray-100 p-2">
        <button
          onClick={() => onApply(null)}
          disabled={selected == null}
          className="text-[11px] text-gray-400 hover:text-[#ff4b4b] disabled:invisible"
        >
          필터 지우기
        </button>
        <div className="flex gap-1.5">
          <button onClick={onClose} className="h-7 rounded-md border border-gray-200 px-3 hover:bg-gray-50">
            취소
          </button>
          <button
            onClick={apply}
            disabled={visible.every((v) => !checked.has(v))}
            className="h-7 rounded-md bg-[#ff4b4b] px-3 text-white hover:bg-[#e43f3f] disabled:opacity-40"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}
