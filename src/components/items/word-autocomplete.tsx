"use client";

import { useMemo, useState, type ComponentProps } from "react";
import { useCombobox } from "downshift";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/form-controls";
import { loadAll, suggest, type VocabEntry } from "@/lib/vocab/dictionary";
import { uz } from "@/lib/i18n/uz";
import { cn } from "@/lib/utils";

/**
 * English input with suggestions from the built-in CEFR dictionary
 * (Downshift combobox: arrow keys, Enter, Escape, screen-reader support).
 * Picking a word fills the English text and hands the whole entry to
 * `onPick` (Uzbek translation, level, part of speech).
 */
export function WordAutocomplete({
  id,
  value,
  onChange,
  onPick,
  onBlur,
  inputRef,
  ...rest
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onPick: (entry: VocabEntry) => void;
  onBlur?: () => void;
  inputRef?: React.Ref<HTMLInputElement>;
} & Pick<ComponentProps<"input">, "aria-invalid" | "aria-describedby" | "placeholder" | "autoFocus">) {
  const [entries, setEntries] = useState<VocabEntry[] | null>(null);
  const items = useMemo(() => (entries ? suggest(value, entries, 8) : []), [value, entries]);

  function ensureLoaded() {
    if (entries === null) void loadAll().then(setEntries, () => setEntries(null));
  }

  const { isOpen, highlightedIndex, getMenuProps, getInputProps, getItemProps } = useCombobox<VocabEntry>({
    items,
    inputId: id,
    labelId: id ? `${id}-label` : undefined,
    inputValue: value,
    selectedItem: null,
    itemToString: (e) => e?.english ?? "",
    onInputValueChange: ({ inputValue, type }) => {
      // Selecting an item also changes the input value; onSelectedItemChange handles that.
      if (
        type !== useCombobox.stateChangeTypes.ItemClick &&
        type !== useCombobox.stateChangeTypes.InputKeyDownEnter
      ) {
        onChange(inputValue ?? "");
      }
    },
    onSelectedItemChange: ({ selectedItem }) => {
      if (!selectedItem) return;
      onChange(selectedItem.english);
      onPick(selectedItem);
    },
  });

  const open = isOpen && items.length > 0;

  return (
    <div className="relative">
      <Input
        {...getInputProps({
          ref: inputRef,
          onFocus: ensureLoaded,
          onBlur,
          autoComplete: "off",
          autoCapitalize: "none",
          spellCheck: true,
          lang: "en",
          ...rest,
        })}
      />
      <ul
        {...getMenuProps()}
        className={cn(
          "absolute inset-x-0 top-full z-30 mt-1 max-h-80 overflow-y-auto rounded-xl border bg-popover p-1 shadow-(--shadow-lift)",
          !open && "hidden",
        )}
      >
        {open
          ? items.map((item, index) => (
              <li
                key={`${item.level}-${item.english}`}
                {...getItemProps({ item, index })}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2",
                  highlightedIndex === index && "bg-primary-soft",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold" lang="en">
                    {item.english}
                  </span>
                  <span className="block truncate text-sm text-muted-foreground" lang="uz">
                    {item.uzbek}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-0.5">
                  <Badge tone="primary">{item.level}</Badge>
                  <span className="text-[11px] text-muted-foreground">{item.pos}</span>
                </span>
              </li>
            ))
          : null}
      </ul>
      {open ? <p className="sr-only">{uz.items.suggestionsHint}</p> : null}
    </div>
  );
}
