"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  addItems,
  deleteItems,
  exportBackup,
  fetchExistingKeys,
  fetchLibrary,
  fetchToday,
  importPack,
  restoreBackup,
  resumeItems,
  scheduleItems,
  suspendItems,
  updateItem,
} from "@/lib/items/api";
import type { ItemDraft } from "@/lib/schemas/item";
import type { ParsedPack } from "@/lib/schemas/pack";
import type { backupSchema } from "@/lib/schemas/backup";
import type { z } from "zod";

export const itemKeys = {
  library: ["library"] as const,
  existing: ["library", "keys"] as const,
  today: ["today"] as const,
};

const sb = () => getSupabaseBrowserClient();

export function useLibrary() {
  return useQuery({ queryKey: itemKeys.library, queryFn: () => fetchLibrary(sb()) });
}

export function useExistingKeys() {
  return useQuery({ queryKey: itemKeys.existing, queryFn: () => fetchExistingKeys(sb()) });
}

export function useToday() {
  return useQuery({ queryKey: itemKeys.today, queryFn: () => fetchToday(sb()), staleTime: 60_000 });
}

/** After any write: refetch library data and refresh server components (Today counts). */
function useInvalidate() {
  const qc = useQueryClient();
  const router = useRouter();
  return async () => {
    await qc.invalidateQueries({ queryKey: itemKeys.library });
    router.refresh();
  };
}

export function useAddItems() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (v: { drafts: ItemDraft[]; schedule: boolean }) =>
      addItems(sb(), v.drafts, { schedule: v.schedule }),
    onSuccess: invalidate,
  });
}

export function useUpdateItem() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (v: { id: string; draft: ItemDraft }) => updateItem(sb(), v.id, v.draft),
    onSuccess: invalidate,
  });
}

type BulkAction = "schedule" | "suspend" | "resume" | "delete";

export function useBulkAction() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ action, ids }: { action: BulkAction; ids: string[] }) => {
      switch (action) {
        case "schedule":
          return void (await scheduleItems(sb(), ids));
        case "suspend":
          return suspendItems(sb(), ids);
        case "resume":
          return resumeItems(sb(), ids);
        case "delete":
          return deleteItems(sb(), ids);
      }
    },
    onSuccess: invalidate,
  });
}

export function useImportPack() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (v: { pack: ParsedPack; schedule: boolean }) =>
      importPack(sb(), v.pack, { schedule: v.schedule }),
    onSuccess: invalidate,
  });
}

export function useExportBackup() {
  return useMutation({ mutationFn: () => exportBackup(sb()) });
}

export function useRestoreBackup() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (v: { file: z.infer<typeof backupSchema>; settings: boolean }) =>
      restoreBackup(sb(), v.file, { settings: v.settings }),
    onSuccess: invalidate,
  });
}
