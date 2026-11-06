import type { Route } from "next";
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  GraduationCap,
  Home,
  Menu,
  Mic,
  PlusCircle,
  Settings,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { uz } from "@/lib/i18n/uz";

export interface NavItem {
  href: Route;
  label: string;
  icon: LucideIcon;
}

/** Full list — desktop sidebar. */
export const NAV_ITEMS: NavItem[] = [
  { href: "/bugun", label: uz.nav.today, icon: Home },
  { href: "/qoshish", label: uz.nav.add, icon: PlusCircle },
  { href: "/kutubxona", label: uz.nav.library, icon: BookOpen },
  { href: "/yodlanganlar", label: uz.nav.mastered, icon: GraduationCap },
  { href: "/kalendar", label: uz.nav.calendar, icon: CalendarDays },
  { href: "/nutq", label: uz.nav.speaking, icon: Mic },
  { href: "/import", label: uz.nav.import, icon: Upload },
  { href: "/statistika", label: uz.nav.stats, icon: BarChart3 },
  { href: "/sozlamalar", label: uz.nav.settings, icon: Settings },
];

/** Mobile bottom tabs — max 5 for thumb reach; the rest live under "Ko'proq". */
export const TAB_ITEMS: NavItem[] = [
  { href: "/bugun", label: uz.nav.today, icon: Home },
  { href: "/qoshish", label: uz.nav.add, icon: PlusCircle },
  { href: "/kutubxona", label: uz.nav.library, icon: BookOpen },
  { href: "/kalendar", label: uz.nav.calendar, icon: CalendarDays },
  { href: "/koproq", label: uz.nav.more, icon: Menu },
];

export const MORE_ITEMS: NavItem[] = NAV_ITEMS.filter((i) => !TAB_ITEMS.some((t) => t.href === i.href));

export function isActive(pathname: string, href: string): boolean {
  if (href === "/koproq") return MORE_ITEMS.some((i) => pathname.startsWith(i.href)) || pathname === "/koproq";
  return pathname === href || pathname.startsWith(`${href}/`);
}
