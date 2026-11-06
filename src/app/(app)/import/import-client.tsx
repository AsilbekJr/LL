"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpenText,
  AlertTriangle,
  Archive,
  CheckCircle2,
  Download,
  FileJson,
  Library,
  Loader2,
  RotateCcw,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Checkbox, Notice } from "@/components/ui/form-controls";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DictionaryBrowser } from "./dictionary-browser";
import { useExistingKeys, useExportBackup, useImportPack, useRestoreBackup } from "@/hooks/use-items";
import { dedupeItems } from "@/lib/items/dedupe";
import { backupFileName, backupSchema } from "@/lib/schemas/backup";
import { parsePack, sampleIndexSchema, type ParsedPack, type SampleEntry } from "@/lib/schemas/pack";
import { uz } from "@/lib/i18n/uz";
import { cn } from "@/lib/utils";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
type Msg = { tone: "success" | "danger"; text: string } | null;

async function readJsonFile(file: File): Promise<string> {
  if (file.size > MAX_FILE_BYTES) throw new Error(uz.import.tooLarge);
  return file.text();
}

function downloadJson(data: unknown, name: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ImportClient() {
  const t = uz.import;
  const [pack, setPack] = useState<ParsedPack | null>(null);
  const [msg, setMsg] = useState<Msg>(null);

  return (
    <div className="flex flex-col gap-5">
      {msg ? (
        <Notice tone={msg.tone} icon={msg.tone === "success" ? CheckCircle2 : AlertTriangle}>
          {msg.text}{" "}
          {msg.tone === "success" ? (
            <Link href="/kutubxona" className="underline underline-offset-2">
              {uz.add.toLibrary}
            </Link>
          ) : null}
        </Notice>
      ) : null}

      {pack ? (
        <PackPreview
          pack={pack}
          onCancel={() => setPack(null)}
          onDone={(text) => {
            setPack(null);
            setMsg({ tone: "success", text });
          }}
          onError={(text) => setMsg({ tone: "danger", text })}
        />
      ) : (
        <Tabs defaultValue="dictionary">
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="dictionary">
              <BookOpenText aria-hidden />
              {uz.vocab.tab}
            </TabsTrigger>
            <TabsTrigger value="samples">
              <Library aria-hidden />
              {t.samplesTab}
            </TabsTrigger>
            <TabsTrigger value="file">
              <FileJson aria-hidden />
              {t.fileTab}
            </TabsTrigger>
            <TabsTrigger value="backup">
              <Archive aria-hidden />
              {t.backupTab}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="dictionary">
            <DictionaryBrowser />
          </TabsContent>
          <TabsContent value="samples">
            <Samples
              onPick={(p) => (setMsg(null), setPack(p))}
              onError={(text) => setMsg({ tone: "danger", text })}
            />
          </TabsContent>
          <TabsContent value="file">
            <FilePick
              onPick={(p) => (setMsg(null), setPack(p))}
              onError={(text) => setMsg({ tone: "danger", text })}
            />
          </TabsContent>
          <TabsContent value="backup">
            <Backup onMessage={setMsg} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function Samples({ onPick, onError }: { onPick: (p: ParsedPack) => void; onError: (t: string) => void }) {
  const [loading, setLoading] = useState<string | null>(null);
  const index = useQuery({
    queryKey: ["samples"],
    queryFn: async () => sampleIndexSchema.parse(await (await fetch("/samples/index.json")).json()),
    staleTime: Infinity,
  });

  async function pick(entry: SampleEntry) {
    setLoading(entry.file);
    try {
      const r = parsePack(await (await fetch(`/samples/${entry.file}`)).text(), entry.name);
      if (r.ok) onPick(r.pack);
      else onError(r.error);
    } catch {
      onError(uz.common.errorBody);
    } finally {
      setLoading(null);
    }
  }

  if (index.isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2" aria-busy="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-sunken" />
        ))}
      </div>
    );
  }
  if (index.isError || !index.data) return <Notice tone="danger">{uz.common.errorBody}</Notice>;

  return (
    <>
      <p className="mb-4 text-sm text-muted-foreground">{uz.import.samplesHint}</p>
      <ul className="grid gap-3 sm:grid-cols-2">
        {index.data.map((p) => (
          <li key={p.file}>
            <button
              type="button"
              onClick={() => pick(p)}
              disabled={loading !== null}
              className="group flex h-full w-full items-start gap-4 rounded-2xl border bg-card p-4 text-left shadow-(--shadow-soft) transition-colors outline-none hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-60"
            >
              <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary-soft font-display text-lg font-semibold text-primary-soft-foreground">
                {loading === p.file ? <Loader2 className="size-5 animate-spin" aria-hidden /> : p.cefr_level}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{p.name.replace(/^[A-C][12] · /, "")}</span>
                <span className="mt-0.5 block text-sm text-muted-foreground">{p.description}</span>
                <span className="mt-2 block text-xs font-semibold text-primary">
                  {uz.import.words(p.count)}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function FilePick({ onPick, onError }: { onPick: (p: ParsedPack) => void; onError: (t: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  async function handle(file: File | undefined) {
    if (!file) return;
    try {
      const r = parsePack(await readJsonFile(file), file.name.replace(/\.json$/i, ""));
      if (r.ok) onPick(r.pack);
      else onError(r.error);
    } catch (e) {
      onError(e instanceof Error ? e.message : uz.common.errorBody);
    } finally {
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        onDragOver={(e) => (e.preventDefault(), setDragging(true))}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void handle(e.dataTransfer.files[0]);
        }}
        className={cn(
          "bg-ruled flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed bg-card px-6 py-10 text-center transition-colors",
          dragging && "border-primary bg-primary-soft/40",
        )}
      >
        <span className="grid size-14 place-items-center rounded-2xl bg-primary-soft text-primary-soft-foreground">
          <Upload className="size-6" aria-hidden />
        </span>
        <p className="font-semibold">{uz.import.fileLabel}</p>
        <input
          ref={input}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          id="pack-file"
          onChange={(e) => void handle(e.target.files?.[0])}
        />
        <Button asChild>
          <label htmlFor="pack-file" className="cursor-pointer">
            {uz.import.chooseFile}
          </label>
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        {uz.import.fileHint}{" "}
        <a
          href="/samples/template.json"
          download
          className="font-semibold text-primary underline underline-offset-2"
        >
          {uz.import.template}
        </a>
      </p>
    </div>
  );
}

function PackPreview({
  pack,
  onCancel,
  onDone,
  onError,
}: {
  pack: ParsedPack;
  onCancel: () => void;
  onDone: (text: string) => void;
  onError: (text: string) => void;
}) {
  const t = uz.import;
  const keys = useExistingKeys();
  const importPack = useImportPack();
  const [schedule, setSchedule] = useState(true);
  const split = useMemo(() => dedupeItems(pack.items, keys.data ?? new Set()), [pack.items, keys.data]);
  const existingSet = useMemo(() => new Set([...split.existing, ...split.repeated]), [split]);

  async function run() {
    try {
      const r = await importPack.mutateAsync({ pack: { ...pack, items: split.fresh }, schedule });
      onDone(t.done(r.inserted, r.duplicates + split.existing.length + split.repeated.length));
    } catch (e) {
      onError(e instanceof Error ? e.message : uz.common.errorBody);
    }
  }

  return (
    <section aria-labelledby="pack-title" className="rounded-2xl border bg-card shadow-(--shadow-lift)">
      <div className="border-b px-5 py-4">
        <h2 id="pack-title" className="font-display text-xl font-semibold">
          {t.previewTitle(pack.name)}
        </h2>
        {pack.description ? <p className="mt-1 text-sm text-muted-foreground">{pack.description}</p> : null}
        <p className="mt-2 text-sm font-semibold" aria-live="polite">
          {keys.isLoading
            ? uz.common.loading
            : t.previewCounts(split.fresh.length, existingSet.size, pack.errors.length)}
        </p>
      </div>

      <ul className="max-h-96 divide-y overflow-y-auto">
        {pack.items.slice(0, 200).map((i, idx) => {
          const dup = existingSet.has(i);
          return (
            <li key={idx} className={cn("flex items-center gap-3 px-5 py-3", dup && "opacity-55")}>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold" lang="en">
                  {i.english}
                </span>
                <span className="block truncate text-sm text-muted-foreground">{i.uzbek}</span>
              </span>
              {dup ? (
                <Badge>{uz.add.already(1)}</Badge>
              ) : (
                <Badge tone="primary">{uz.items.types[i.type]}</Badge>
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col gap-4 border-t p-5">
        <Checkbox
          label={uz.items.scheduleNow}
          description={uz.items.scheduleNowHint}
          checked={schedule}
          onChange={(e) => setSchedule(e.target.checked)}
        />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onCancel} disabled={importPack.isPending}>
            {t.cancel}
          </Button>
          <Button onClick={run} disabled={!split.fresh.length || importPack.isPending || keys.isLoading}>
            {importPack.isPending ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <Download aria-hidden />
            )}
            {t.importBtn(split.fresh.length)}
          </Button>
        </div>
      </div>
    </section>
  );
}

function Backup({ onMessage }: { onMessage: (m: Msg) => void }) {
  const t = uz.import;
  const exp = useExportBackup();
  const restore = useRestoreBackup();
  const [withSettings, setWithSettings] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function doExport() {
    onMessage(null);
    try {
      const file = await exp.mutateAsync();
      downloadJson(file, backupFileName(new Date()));
      onMessage({ tone: "success", text: t.exported });
    } catch (e) {
      onMessage({ tone: "danger", text: e instanceof Error ? e.message : uz.common.errorBody });
    }
  }

  async function doRestore(file: File | undefined) {
    if (!file) return;
    onMessage(null);
    try {
      let json: unknown;
      try {
        json = JSON.parse(await readJsonFile(file));
      } catch (e) {
        throw e instanceof Error && e.message === t.tooLarge ? e : new Error(t.backupInvalid);
      }
      const parsed = backupSchema.safeParse(json);
      if (!parsed.success) throw new Error(t.backupInvalid);
      const r = await restore.mutateAsync({ file: parsed.data, settings: withSettings });
      onMessage({ tone: "success", text: t.restored(r.items, r.skippedItems) });
    } catch (e) {
      onMessage({ tone: "danger", text: e instanceof Error ? e.message : uz.common.errorBody });
    } finally {
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <section className="flex flex-col gap-3 rounded-2xl border bg-card p-5 shadow-(--shadow-soft)">
        <h2 className="font-display text-lg font-semibold">{t.backupExportTitle}</h2>
        <p className="flex-1 text-sm text-muted-foreground">{t.backupExportBody}</p>
        <Button onClick={doExport} disabled={exp.isPending}>
          {exp.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Download aria-hidden />}
          {t.backupExport}
        </Button>
      </section>
      <section className="flex flex-col gap-3 rounded-2xl border bg-card p-5 shadow-(--shadow-soft)">
        <h2 className="font-display text-lg font-semibold">{t.backupRestoreTitle}</h2>
        <p className="flex-1 text-sm text-muted-foreground">{t.backupRestoreBody}</p>
        <Checkbox
          label={t.backupRestoreSettings}
          checked={withSettings}
          onChange={(e) => setWithSettings(e.target.checked)}
        />
        <input
          ref={input}
          id="backup-file"
          type="file"
          accept="application/json,.json"
          className="sr-only"
          onChange={(e) => void doRestore(e.target.files?.[0])}
        />
        <Button asChild variant="outline" aria-disabled={restore.isPending}>
          <label
            htmlFor="backup-file"
            className={cn("cursor-pointer", restore.isPending && "pointer-events-none opacity-50")}
          >
            {restore.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <RotateCcw aria-hidden />}
            {t.backupRestore}
          </label>
        </Button>
      </section>
    </div>
  );
}
