"use client";

/**
 * v2.7.0: StatsBarManager — کامپوننت مدیریت کارت‌های آمار
 *
 * تغییرات v2.7.0:
 *  - حذف محدودیت MAX_ACTIVE (هر تعداد کارت مجاز است)
 *  - حذف drag-and-drop از صفحه اصلی (فقط در دیالوگ ویرایش قابل جابجایی است)
 *  - کارت‌ها عرض بیشتری دارند (200px به‌جای 176px)
 *
 * قابلیت‌ها (v2.6.0):
 *  - انتخاب کارت‌ها در دیالوگ تنظیمات (بدون محدودیت تعداد)
 *  - drag-and-drop فقط در دیالوگ ویرایش (با dnd-kit)
 *  - ذخیره per-user در localStorage با کلید powerline_stats_<userId>_<layoutKey>
 *  - کارت‌ها با گرادیان و سایه زیبا
 *  - تمام کارت‌ها در یک خط قرار می‌گیرند (flex با overflow-x-auto)
 */

import { useState, useMemo, useEffect, useRef } from "react";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, type DragEndEvent, type Modifier,
} from "@dnd-kit/core";
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates,
  verticalListSortingStrategy, useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Settings as SettingsIcon, GripVertical, Check, Eye } from "lucide-react";

export interface StatsCardDef {
  /** شناسه یکتای کارت */
  id: string;
  /** عنوان کارت که زیر عدد نمایش داده می‌شود */
  label: string;
  /** مقدار کارت (می‌تواند عدد، رشته یا JSX باشد) */
  value: React.ReactNode;
  /** آیکون کارت (lucide-react) */
  icon?: React.ReactNode;
  /**
   * تم رنگی کارت — این رنگ برای گرادیان پس‌زمینه و آیکون استفاده می‌شود
   */
  color: "indigo" | "blue" | "emerald" | "amber" | "purple" | "red" | "green" | "slate";
  /** اگر کارت کلیک‌پذیر باشد (مثل فیلتر سلامت داده) */
  onClick?: () => void;
  /** آیا کارت در حالت فعال است (مثلاً فیلتر روشن) */
  active?: boolean;
}

interface StatsBarManagerProps {
  /** شناسه چیدمان per-user (مثل "lines" یا "towers") */
  layoutKey: string;
  /** لیست همه کارت‌های موجود (به ترتیب پیش‌فرض) */
  cards: StatsCardDef[];
  /** کارت‌های پیش‌فرض فعال (در صورت نبود ذخیره localStorage) */
  defaultActiveIds?: string[];
}

// v2.7.2: محدودیت تعداد کارت‌های فعال — ۶ کارت
const MAX_ACTIVE = 6;

// نگاشت رنگ → کلاس‌های tailwind برای گرادیان و آیکون
const COLOR_THEMES: Record<StatsCardDef["color"], {
  card: string;
  icon: string;
}> = {
  indigo: {
    card: "bg-gradient-to-br from-indigo-50 via-white to-indigo-100/60 dark:from-indigo-950/40 dark:via-slate-900 dark:to-indigo-950/60 border-indigo-200/70 dark:border-indigo-800/60 shadow-indigo-200/40 dark:shadow-indigo-950/30",
    icon: "bg-gradient-to-br from-indigo-500 to-indigo-600 text-white shadow-md shadow-indigo-500/30",
  },
  blue: {
    card: "bg-gradient-to-br from-blue-50 via-white to-blue-100/60 dark:from-blue-950/40 dark:via-slate-900 dark:to-blue-950/60 border-blue-200/70 dark:border-blue-800/60 shadow-blue-200/40 dark:shadow-blue-950/30",
    icon: "bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-md shadow-blue-500/30",
  },
  emerald: {
    card: "bg-gradient-to-br from-emerald-50 via-white to-emerald-100/60 dark:from-emerald-950/40 dark:via-slate-900 dark:to-emerald-950/60 border-emerald-200/70 dark:border-emerald-800/60 shadow-emerald-200/40 dark:shadow-emerald-950/30",
    icon: "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-md shadow-emerald-500/30",
  },
  amber: {
    card: "bg-gradient-to-br from-amber-50 via-white to-amber-100/60 dark:from-amber-950/40 dark:via-slate-900 dark:to-amber-950/60 border-amber-200/70 dark:border-amber-800/60 shadow-amber-200/40 dark:shadow-amber-950/30",
    icon: "bg-gradient-to-br from-amber-500 to-amber-600 text-white shadow-md shadow-amber-500/30",
  },
  purple: {
    card: "bg-gradient-to-br from-purple-50 via-white to-purple-100/60 dark:from-purple-950/40 dark:via-slate-900 dark:to-purple-950/60 border-purple-200/70 dark:border-purple-800/60 shadow-purple-200/40 dark:shadow-purple-950/30",
    icon: "bg-gradient-to-br from-purple-500 to-purple-600 text-white shadow-md shadow-purple-500/30",
  },
  red: {
    card: "bg-gradient-to-br from-red-50 via-white to-red-100/60 dark:from-red-950/40 dark:via-slate-900 dark:to-red-950/60 border-red-200/70 dark:border-red-800/60 shadow-red-200/40 dark:shadow-red-950/30",
    icon: "bg-gradient-to-br from-red-500 to-red-600 text-white shadow-md shadow-red-500/30",
  },
  green: {
    card: "bg-gradient-to-br from-green-50 via-white to-green-100/60 dark:from-green-950/40 dark:via-slate-900 dark:to-green-950/60 border-green-200/70 dark:border-green-800/60 shadow-green-200/40 dark:shadow-green-950/30",
    icon: "bg-gradient-to-br from-green-500 to-green-600 text-white shadow-md shadow-green-500/30",
  },
  slate: {
    card: "bg-gradient-to-br from-slate-50 via-white to-slate-100/60 dark:from-slate-800/40 dark:via-slate-900 dark:to-slate-800/60 border-slate-200/70 dark:border-slate-700/60 shadow-slate-200/40 dark:shadow-slate-950/30",
    icon: "bg-gradient-to-br from-slate-500 to-slate-600 text-white shadow-md shadow-slate-500/30",
  },
};

function getStorageKey(layoutKey: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const userRaw = localStorage.getItem("powerline_user");
    const userId = userRaw ? (JSON.parse(userRaw)?.id ?? "guest") : "guest";
    return `powerline_stats_${userId}_${layoutKey}`;
  } catch {
    return null;
  }
}

function loadLayout(layoutKey: string): { order: string[]; active: string[] } | null {
  const key = getStorageKey(layoutKey);
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

function saveLayout(layoutKey: string, order: string[], active: string[]) {
  const key = getStorageKey(layoutKey);
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify({ order, active }));
  } catch { /* localStorage in unavailable */ }
}

export function StatsBarManager({ layoutKey, cards, defaultActiveIds }: StatsBarManagerProps) {
  const allCardIds = useMemo(() => cards.map(c => c.id), [cards]);

  const saved = useMemo(() => loadLayout(layoutKey), [layoutKey]);

  const [order, setOrder] = useState<string[]>(() => {
    if (saved?.order) {
      const existing = saved.order.filter(k => allCardIds.includes(k));
      const added = allCardIds.filter(k => !existing.includes(k));
      return [...existing, ...added];
    }
    return allCardIds;
  });
  // v2.7.0: حذف محدودیت MAX_ACTIVE — هر تعداد کارت مجاز است
  // v2.7.2: محدودیت به ۶ کارت بازگشت
  const [active, setActive] = useState<string[]>(() => {
    if (saved?.active) return saved.active.filter(k => allCardIds.includes(k)).slice(0, MAX_ACTIVE);
    if (defaultActiveIds && defaultActiveIds.length > 0) {
      return defaultActiveIds.slice(0, MAX_ACTIVE);
    }
    return allCardIds.slice(0, MAX_ACTIVE);
  });
  const [showEditor, setShowEditor] = useState(false);

  useEffect(() => {
    saveLayout(layoutKey, order, active);
  }, [layoutKey, order, active]);

  useEffect(() => {
    setOrder(prevOrder => {
      const existing = prevOrder.filter(k => allCardIds.includes(k));
      const added = allCardIds.filter(k => !existing.includes(k));
      return [...existing, ...added];
    });
    // v2.7.2: اطمینان از اینکه تعداد فعال‌ها از MAX_ACTIVE بیشتر نشود
    setActive(prevActive => {
      const filtered = prevActive.filter(k => allCardIds.includes(k));
      return filtered.length > MAX_ACTIVE ? filtered.slice(0, MAX_ACTIVE) : filtered;
    });
  }, [allCardIds]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active: draggedActive, over } = event;
    if (!over || draggedActive.id === over.id) return;
    setOrder(prev => {
      const oldIndex = prev.indexOf(draggedActive.id as string);
      const newIndex = prev.indexOf(over.id as string);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  };

  // ترتیب کارت‌های فعال برای نمایش
  const activeCards = order
    .map(id => cards.find(c => c.id === id))
    .filter((c): c is StatsCardDef => !!c && active.includes(c.id));

  const allCardIdsOrdered = order;

  return (
    <div className="space-y-1" dir="rtl">
      {/* نوار کارت‌های فعال — v2.8.0: padding کم‌تر برای فاصله کم‌تر با هدر و جدول */}
      <div className="flex items-stretch gap-2 overflow-x-auto pb-1 pt-0.5 scrollbar-hover">
        {activeCards.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-sm text-slate-400 py-6 px-4 rounded-lg border-2 border-dashed border-slate-200 dark:border-slate-700">
            هیچ کارتی فعال نیست — برای افزودن کارت، روی دکمه «ویرایش کارت‌ها» بزنید
          </div>
        ) : (
          activeCards.map(card => (
            <StaticStatCard
              key={card.id}
              card={card}
            />
          ))
        )}

        {/* دکمه ویرایش — به‌عنوان کارت مجزا در انتها */}
        <button
          type="button"
          onClick={() => setShowEditor(true)}
          title="ویرایش کارت‌ها — انتخاب و جابجایی"
          className="shrink-0 w-14 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-600 hover:bg-indigo-50/40 dark:hover:bg-indigo-950/20 flex flex-col items-center justify-center gap-1 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all"
        >
          <SettingsIcon className="w-4 h-4" />
          <span className="text-[9px] font-medium">ویرایش</span>
        </button>
      </div>

      {/* دیالوگ ویرایش کارت‌ها — drag-and-drop فقط اینجا فعال است */}
      <StatsEditor
        open={showEditor}
        onOpenChange={setShowEditor}
        allCardIds={allCardIdsOrdered}
        cards={cards}
        active={active}
        setActive={setActive}
        order={order}
        setOrder={setOrder}
        sensors={sensors}
        onDragEnd={handleDragEnd}
        defaultActiveIds={defaultActiveIds}
      />
    </div>
  );
}

// ─── کارت نمایشی (بدون drag) — v2.7.2: انیمیشن بدون translate (جلوگیری از برش) ───
function StaticStatCard({ card }: { card: StatsCardDef }) {
  const theme = COLOR_THEMES[card.color];
  const isClickable = !!card.onClick;

  return (
    <div
      className={cn(
        "group relative shrink-0 w-[220px] min-h-[76px] rounded-xl border p-2.5 flex items-center gap-2.5 transition-all duration-200 shadow-sm hover:shadow-md",
        theme.card,
        isClickable && "cursor-pointer",
        card.active && "ring-2 ring-offset-1 ring-amber-400",
      )}
      onClick={() => { if (isClickable) card.onClick!(); }}
    >
      {card.icon && (
        <div className={cn(
          "shrink-0 w-9 h-9 rounded-lg flex items-center justify-center",
          theme.icon,
        )}>
          {card.icon}
        </div>
      )}

      <div className="min-w-0 flex-1 py-0.5">
        <div className="text-[10px] text-slate-600 dark:text-slate-300 truncate leading-tight mb-1.5">
          {card.label}
        </div>
        <div className="text-sm font-bold text-slate-800 dark:text-slate-100 nums-fa leading-tight">
          {card.value}
        </div>
      </div>
    </div>
  );
}

// ─── دیالوگ ویرایش کارت‌ها ───
function StatsEditor({
  open, onOpenChange, allCardIds, cards, active, setActive, order, setOrder, sensors, onDragEnd, defaultActiveIds,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allCardIds: string[];
  cards: StatsCardDef[];
  active: string[];
  setActive: (updater: (prev: string[]) => string[]) => void;
  order: string[];
  setOrder: (updater: (prev: string[]) => string[]) => void;
  sensors: ReturnType<typeof useSensors>;
  onDragEnd: (event: DragEndEvent) => void;
  defaultActiveIds?: string[];
}) {
  // v2.7.0: حذف محدودیت MAX_ACTIVE — همه کارت‌ها قابل فعال‌سازی هستند
  // v2.7.2: محدودیت به ۶ کارت بازگشت
  const toggleCard = (id: string) => {
    setActive(prev => {
      if (prev.includes(id)) {
        return prev.filter(x => x !== id);
      }
      // فقط MAX_ACTIVE کارت مجاز است
      if (prev.length >= MAX_ACTIVE) {
        return prev; // تغییر ندهد — باید اول یک کارت را غیرفعال کند
      }
      return [...prev, id];
    });
  };

  const activeCount = active.length;
  const isMaxed = activeCount >= MAX_ACTIVE;

  // v3.3.0: مسیر حرکت کارت‌ها محدود شد — فقط بالا/پایین؛
  // کارت اول فقط پایین می‌رود و کارت آخر فقط بالا (درخواست کاربر)
  const dragIndexRef = useRef<number>(-1);
  const verticalPathModifier: Modifier = ({ transform }) => {
    const idx = dragIndexRef.current;
    let y = transform.y;
    // کارت بالای لیست نمی‌تواند بالاتر از جای خودش برود (فقط پایین)
    if (idx === 0 && y < 0) y = 0;
    // کارت پایین لیست فقط بالا
    if (idx === allCardIds.length - 1 && y > 0) y = 0;
    // حرکت افقی کاملاً غیرفعال
    return { ...transform, x: 0, y };
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SettingsIcon className="w-5 h-5 text-indigo-600" />
            ویرایش کارت‌های آمار
          </DialogTitle>
          <DialogDescription>
            کارت‌های مورد نظر را انتخاب کنید (حداکثر {MAX_ACTIVE.toLocaleString("fa-IR")} کارت) و برای تغییر ترتیب، آن‌ها را با ماوس بکشید.
          </DialogDescription>
        </DialogHeader>

        {/* شمارنده فعال‌ها — v2.7.2: با محدودیت ۶ کارت */}
        <div className={cn(
          "rounded-lg px-3 py-2 text-xs flex items-center justify-between border",
          isMaxed
            ? "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/30 dark:border-amber-900/60 dark:text-amber-400"
            : "bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-950/30 dark:border-indigo-900/60 dark:text-indigo-400"
        )}>
          <span className="flex items-center gap-1.5">
            <Eye className="w-3.5 h-3.5" />
            کارت‌های فعال:
          </span>
          <span className="font-bold nums-fa">
            {activeCount.toLocaleString("fa-IR")} / {MAX_ACTIVE.toLocaleString("fa-IR")}
          </span>
        </div>

        {/* لیست کارت‌ها — v3.3.0: همه کارت‌ها (فعال و غیرفعال) قابل drag هستند و فقط عمودی حرکت می‌کنند */}
        <div className="max-h-[60vh] overflow-y-auto -mx-1 px-1 space-y-1">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[verticalPathModifier]}
            onDragStart={({ active: a }) => { dragIndexRef.current = allCardIds.indexOf(String(a.id)); }}
            onDragEnd={(e) => { dragIndexRef.current = -1; onDragEnd(e); }}
          >
            <SortableContext items={allCardIds} strategy={verticalListSortingStrategy}>
              {allCardIds.map(id => {
                const card = cards.find(c => c.id === id);
                if (!card) return null;
                const isActive = active.includes(id);
                return (
                  <EditorRow
                    key={id}
                    card={card}
                    isActive={isActive}
                    onToggle={() => toggleCard(id)}
                    checkboxDisabled={isMaxed && !isActive}
                  />
                );
              })}
            </SortableContext>
          </DndContext>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setActive(() => cards.map(c => c.id));
              setOrder(() => cards.map(c => c.id));
            }}
            className="text-xs"
          >
            فعال‌سازی همه
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setActive(() => (defaultActiveIds && defaultActiveIds.length > 0 ? [...defaultActiveIds] : cards.slice(0, 5).map(c => c.id)));
              setOrder(() => cards.map(c => c.id));
            }}
            className="text-xs"
          >
            بازنشانی به پیش‌فرض
          </Button>
          <Button type="button" onClick={() => onOpenChange(false)}>
            <Check className="w-4 h-4 ml-1" />
            ذخیره
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditorRow({
  card, isActive, onToggle, checkboxDisabled,
}: {
  card: StatsCardDef;
  isActive: boolean;
  onToggle: () => void;
  /** v3.3.0: فقط چک‌باکس غیرفعال می‌شود (سقف ۶ کارت) — خود کارت کم‌رنگ یا غیرقابل جابجایی نمی‌شود */
  checkboxDisabled?: boolean;
}) {
  const theme = COLOR_THEMES[card.color];

  // v3.3.0: همه کارت‌ها قابل جابجایی هستند (فعال و غیرفعال)
  const sortable = useSortable({ id: card.id });
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = sortable;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    // v3.3.0: کارت‌های غیرفعال کم‌رنگ نمی‌شوند — فقط تیک ندارند (درخواست کاربر)
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-2 rounded-lg border p-2 transition-all",
        isActive ? theme.card : "bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700",
        isDragging && "ring-2 ring-indigo-400 shadow-lg",
      )}
    >
      {/* checkbox */}
      <Checkbox
        checked={isActive}
        onCheckedChange={onToggle}
        disabled={checkboxDisabled}
        className="shrink-0"
      />

      {/* drag handle — v3.3.0: همیشه نمایش داده می‌شود (کارتهای غیرفعال هم جابجا می‌شوند) */}
      <button
        type="button"
        {...listeners}
        {...attributes}
        onClick={(e) => e.stopPropagation()}
        className="shrink-0 text-slate-400 hover:text-indigo-600 cursor-grab active:cursor-grabbing"
        title="بکشید — فقط بالا و پایین"
      >
        <GripVertical className="w-4 h-4" />
      </button>

      {/* icon */}
      {card.icon && (
        <div className={cn(
          "shrink-0 w-7 h-7 rounded-md flex items-center justify-center",
          isActive ? theme.icon : "bg-slate-200 dark:bg-slate-700 text-slate-500",
        )}>
          {card.icon}
        </div>
      )}

      {/* label + value */}
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate">{card.label}</div>
        <div className="text-[10px] text-slate-500 truncate nums-fa">{card.value}</div>
      </div>

      {isActive && (
        <Check className="w-4 h-4 text-emerald-500 shrink-0" />
      )}
    </div>
  );
}
