import type { Route } from "next";
import {
  BarChart3,
  BookHeart,
  BookOpen,
  Home,
  Menu,
  Mic,
  Plus,
  PlusCircle,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { uz } from "@/lib/i18n/uz";

export interface NavItem {
  href: Route;
  label: string;
  icon: LucideIcon;
}

/**
 * Full list — desktop sidebar. Kept short on purpose: the daily path
 * (review → kun yakuni → nutq) starts on "Bugun"; Import lives in Settings.
 */
export const NAV_ITEMS: NavItem[] = [
  { href: "/bugun", label: uz.nav.today, icon: Home },
  { href: "/qoshish", label: uz.nav.add, icon: PlusCircle },
  { href: "/kutubxona", label: uz.nav.library, icon: BookOpen },
  { href: "/nutq", label: uz.nav.speaking, icon: Mic },
  { href: "/hikoya", label: uz.nav.story, icon: BookHeart },
  { href: "/statistika", label: uz.nav.stats, icon: BarChart3 },
  { href: "/sozlamalar", label: uz.nav.settings, icon: Settings },
];

/**
 * Mobile bottom tabs — max 5 for thumb reach; the rest live under "Ko'proq".
 * "Qo'shish" sits in the middle and is rendered as the primary action.
 */
export const TAB_ITEMS: NavItem[] = [
  { href: "/bugun", label: uz.nav.today, icon: Home },
  { href: "/kutubxona", label: uz.nav.library, icon: BookOpen },
  { href: "/qoshish", label: uz.nav.add, icon: Plus },
  { href: "/nutq", label: uz.nav.speaking, icon: Mic },
  { href: "/koproq", label: uz.nav.more, icon: Menu },
];

export const PRIMARY_TAB: Route = "/qoshish";

export const MORE_ITEMS: NavItem[] = NAV_ITEMS.filter((i) => !TAB_ITEMS.some((t) => t.href === i.href));

export function isActive(pathname: string, href: string): boolean {
  if (href === "/koproq")
    return MORE_ITEMS.some((i) => pathname.startsWith(i.href)) || pathname === "/koproq";
  return pathname === href || pathname.startsWith(`${href}/`);
}
