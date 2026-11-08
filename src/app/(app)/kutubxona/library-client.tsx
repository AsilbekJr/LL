"use client";

import { useDeferredValue, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  BookOpen,
  CalendarPlus,
  CheckCircle2,
  Loader2,
  Pause,
  Play,
  Plus,
  Search,
  SearchX,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { BottomActionBar } from "@/components/common/bottom-action-bar";
import { EmptyState } from "@/components/common/empty-state";
import { ItemForm } from "@/components/items/item-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Badge, Notice, Select } from "@/components/ui/form-controls";
import { Input } from "@/components/ui/input";
import { useBulkAction, useLibrary, useToday, useUpdateItem } from "@/hooks/use-items";
import {
  collectTags,
  filterLibrary,
  isItemOverdue,
  itemStatus,
  type ItemStatus,
  type LibraryFilter,
  type LibraryItem,
  type LibrarySort,
} from "@/lib/items/library";
import { CEFR_LEVELS, ITEM_TYPES } from "@/lib/schemas/item";
import { todayInTz } from "@/lib/srs/dates";
import { uz } from "@/lib/i18n/uz";
import { cn } from "@/lib/utils";

const PAGE = 50;
const STATUSES: ItemStatus[] = ["library", "new", "learning", "mastered", "suspended"];
const STATUS_TONE = {
  library: "neutral",
  new: "primary",
  learning: "highlight",
  mastered: "success",
  suspended: "warning",
} as const;

type Bulk = "schedule" | "suspend" | "resume" | "delete";

export function LibraryClient() {
  const t = uz.library;
  const library = useLibrary();
  const todayQ = useToday();
  const today = todayQ.data ?? todayInTz();
  const bulk = useBulkAction();

  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [filter, setFilter] = useState<Omit<LibraryFilter, "query">>({});
  const [sort, setSort] = useState<LibrarySort>("newest");
  const [showFilters, setShowFilters] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<LibraryItem | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  const items = useMemo(() => library.data ?? [], [library.data]);
  const tags = useMemo(() => collectTags(items), [items]);
  const results = useMemo(
    () => filterLibrary(items, { ...filter, query: deferredQuery }, today, sort),
    [items, filter, deferredQuery, today, sort],
  );
  const activeFilters = Object.values(filter).filter((v) => v && v !== "all").length;

  function setF<K extends keyof typeof filter>(key: K, value: (typeof filter)[K]) {
    setFilter((f) => ({ ...f, [key]: value }));
    setLimit(PAGE);
  }

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function run(action: Bulk) {
    setMessage(null);
    try {
      await bulk.mutateAsync({ action, ids: [...selected] });
      setMessage({ tone: "success", text: t.done[action] });
      setSelected(new Set());
      setConfirmDelete(false);
    } catch (e) {
      setMessage({ tone: "danger", text: e instanceof Error ? e.message : uz.common.errorBody });
    }
  }

  if (library.isLoading) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        <span className="sr-only">{uz.common.loading}</span>
        <div className="h-12 animate-pulse rounded-lg bg-sunken" />
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-[4.5rem] animate-pulse rounded-xl bg-sunken" />
        ))}
      </div>
    );
  }

  if (library.isError) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title={uz.common.errorTitle}
        description={uz.common.errorBody}
        action={<Button onClick={() => library.refetch()}>{uz.common.retry}</Button>}
      />
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={BookOpen}
        title={t.emptyTitle}
        description={t.emptyBody}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button asChild>
              <Link href="/qoshish">
                <Plus aria-hidden />
                {uz.today.addWord}
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/import">{uz.today.importPack}</Link>
            </Button>
          </div>
        }
      />
    );
  }

  const visible = results.slice(0, limit);
  const allVisibleSelected = visible.length > 0 && visible.every((i) => selected.has(i.id));

  return (
    <div className={cn("flex flex-col gap-4", selected.size > 0 && "pb-24")}>
      {/* Search + controls */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(PAGE);
            }}
            placeholder={t.search}
            aria-label={t.search}
            className="pl-10"
          />
        </div>
        <Button
          variant="outline"
          size="icon"
          className="size-12 shrink-0"
          aria-expanded={showFilters}
          aria-controls="library-filters"
          aria-label={t.filters}
          onClick={() => setShowFilters((s) => !s)}
        >
          <SlidersHorizontal aria-hidden />
          {activeFilters ? (
            <span className="absolute -top-1 -right-1 grid size-5 place-items-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
              {activeFilters}
            </span>
          ) : null}
        </Button>
      </div>

      {/* Status chips: the most used filter stays one tap away */}
      <div className="-mx-5 flex [scrollbar-width:none] gap-2 overflow-x-auto px-5 pb-1 md:mx-0 md:px-0">
        {(["all", ...STATUSES] as const).map((s) => {
          const active = (filter.status ?? "all") === s;
          return (
            <button
              key={s}
              type="button"
              aria-pressed={active}
              onClick={() => setF("status", s)}
              className={cn(
                "h-9 shrink-0 rounded-full border px-3.5 text-sm font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {s === "all" ? t.all : uz.items.status[s]}
            </button>
          );
        })}
      </div>

      <div
        id="library-filters"
        hidden={!showFilters}
        className="grid gap-3 rounded-2xl border bg-card p-4 shadow-(--shadow-soft) sm:grid-cols-4"
      >
        <Select
          aria-label={uz.items.type}
          value={filter.type ?? "all"}
          onChange={(e) => setF("type", e.target.value as LibraryFilter["type"])}
        >
          <option value="all">
            {uz.items.type}: {t.all}
          </option>
          {ITEM_TYPES.map((ty) => (
            <option key={ty} value={ty}>
              {uz.items.types[ty]}
            </option>
          ))}
        </Select>
        <Select
          aria-label={uz.items.level}
          value={filter.cefr ?? "all"}
          onChange={(e) => setF("cefr", e.target.value as LibraryFilter["cefr"])}
        >
          <option value="all">
            {uz.items.level}: {t.all}
          </option>
          {CEFR_LEVELS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </Select>
        <Select
          aria-label={uz.items.tags}
          value={filter.tag ?? "all"}
          onChange={(e) => setF("tag", e.target.value)}
        >
          <option value="all">
            {uz.items.tags}: {t.all}
          </option>
          {tags.map((tag) => (
            <option key={tag} value={tag}>
              #{tag}
            </option>
          ))}
        </Select>
        <Select aria-label="Saralash" value={sort} onChange={(e) => setSort(e.target.value as LibrarySort)}>
          {(Object.keys(t.sort) as LibrarySort[]).map((s) => (
            <option key={s} value={s}>
              {t.sort[s]}
            </option>
          ))}
        </Select>
        <label className="flex items-center gap-2 text-sm font-semibold sm:col-span-3">
          <input
            type="checkbox"
            className="size-5 accent-primary"
            checked={filter.overdueOnly ?? false}
            onChange={(e) => setF("overdueOnly", e.target.checked)}
          />
          {t.overdueOnly}
        </label>
        {activeFilters ? (
          <Button
            variant="ghost"
            size="sm"
            className="justify-self-start sm:justify-self-end"
            onClick={() => setFilter({})}
          >
            {t.resetFilters}
          </Button>
        ) : null}
      </div>

      {message ? (
        <Notice tone={message.tone} icon={message.tone === "success" ? CheckCircle2 : AlertTriangle}>
          {message.text}
        </Notice>
      ) : null}

      <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
        <span aria-live="polite">{t.results(results.length)}</span>
        {visible.length ? (
          <button
            type="button"
            className="rounded font-semibold text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
            onClick={() =>
              setSelected((s) => {
                const next = new Set(s);
                for (const i of visible) {
                  if (allVisibleSelected) next.delete(i.id);
                  else next.add(i.id);
                }
                return next;
              })
            }
          >
            {allVisibleSelected ? t.clear : t.selectAll}
          </button>
        ) : null}
      </div>

      {results.length === 0 ? (
        <EmptyState icon={SearchX} title={t.noResults} description={t.noResultsBody} />
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((item) => (
            <LibraryRow
              key={item.id}
              item={item}
              today={today}
              selected={selected.has(item.id)}
              onToggle={() => toggle(item.id)}
              onOpen={() => setEditing(item)}
            />
          ))}
        </ul>
      )}

      {results.length > limit ? (
        <Button variant="outline" onClick={() => setLimit((l) => l + PAGE)}>
          {t.showMore} ({results.length - limit})
        </Button>
      ) : null}

      {/* Bulk action bar */}
      {selected.size > 0 ? (
        <BottomActionBar role="toolbar" label={t.selected(selected.size)} className="gap-1 p-2">
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="grid size-10 shrink-0 place-items-center rounded-lg text-muted-foreground outline-none hover:bg-sunken focus-visible:ring-2 focus-visible:ring-ring/50"
            aria-label={t.clear}
          >
            <X className="size-5" aria-hidden />
          </button>
          <span className="mr-auto px-1 text-sm font-semibold tabular-nums">{t.selected(selected.size)}</span>
          <BulkButton
            icon={CalendarPlus}
            label={t.schedule}
            onClick={() => run("schedule")}
            busy={bulk.isPending}
          />
          <BulkButton icon={Pause} label={t.suspend} onClick={() => run("suspend")} busy={bulk.isPending} />
          <BulkButton icon={Play} label={t.resume} onClick={() => run("resume")} busy={bulk.isPending} />
          <BulkButton
            icon={Trash2}
            label={t.delete}
            danger
            onClick={() => setConfirmDelete(true)}
            busy={bulk.isPending}
          />
        </BottomActionBar>
      ) : null}

      <EditDialog
        item={editing}
        onClose={() => setEditing(null)}
        onSaved={() => setMessage({ tone: "success", text: t.done.edit })}
      />

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent title={t.deleteTitle(selected.size)} description={t.deleteBody}>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <DialogClose asChild>
              <Button variant="outline">{uz.import.cancel}</Button>
            </DialogClose>
            <Button variant="destructive" disabled={bulk.isPending} onClick={() => run("delete")}>
              {bulk.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Trash2 aria-hidden />}
              {t.delete}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LibraryRow({
  item,
  today,
  selected,
  onToggle,
  onOpen,
}: {
  item: LibraryItem;
  today: string;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const status = itemStatus(item.cards);
  const overdue = isItemOverdue(item.cards, today);
  return (
    <li
      className={cn(
        "flex items-stretch rounded-xl border bg-card shadow-(--shadow-soft) transition-colors",
        selected && "border-primary/50 bg-primary-soft/40",
      )}
    >
      <label className="grid w-12 shrink-0 cursor-pointer place-items-center">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          aria-label={item.english}
          className="size-5 cursor-pointer accent-primary"
        />
      </label>
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-r-xl py-3 pr-4 text-left outline-none hover:bg-sunken/60 focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold" lang="en">
            {item.english}
          </span>
          <span className="block truncate text-sm text-muted-foreground">{item.uzbek}</span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <span className="flex gap-1">
            {overdue ? <Badge tone="danger">{uz.items.overdue}</Badge> : null}
            <Badge tone={STATUS_TONE[status]}>{uz.items.status[status]}</Badge>
          </span>
          {item.cefr_level || item.tags.length ? (
            <span className="max-w-40 truncate text-xs text-muted-foreground">
              {[item.cefr_level, ...item.tags.map((tg) => `#${tg}`)].filter(Boolean).join(" · ")}
            </span>
          ) : null}
        </span>
      </button>
    </li>
  );
}

function BulkButton({
  icon: Icon,
  label,
  onClick,
  danger,
  busy,
}: {
  icon: typeof Pause;
  label: string;
  onClick: () => void;
  danger?: boolean;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      title={label}
      className={cn(
        "flex h-12 min-w-12 flex-col items-center justify-center gap-0.5 rounded-lg px-2 text-[11px] font-semibold outline-none hover:bg-sunken focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50 sm:flex-row sm:gap-1.5 sm:px-3 sm:text-sm",
        danger ? "text-destructive hover:bg-destructive-soft" : "text-foreground",
      )}
    >
      <Icon className="size-[18px]" aria-hidden />
      <span className="sr-only sm:not-sr-only">{label}</span>
    </button>
  );
}

function EditDialog({
  item,
  onClose,
  onSaved,
}: {
  item: LibraryItem | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const update = useUpdateItem();
  return (
    <Dialog open={item !== null} onOpenChange={(open) => !open && onClose()}>
      {item ? (
        <DialogContent title={uz.library.edit} description={item.english}>
          <ItemForm
            key={item.id}
            initial={item}
            submitLabel={uz.library.save}
            onSubmit={async (draft) => {
              await update.mutateAsync({ id: item.id, draft });
              onSaved();
              onClose();
            }}
          />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
