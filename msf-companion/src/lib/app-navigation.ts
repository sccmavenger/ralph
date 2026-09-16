export const PRIMARY_NAVIGATION = [
  { label: "Today", href: "/dashboard", icon: "home" },
  { label: "Roster", href: "/roster", icon: "roster" },
  { label: "Resources", href: "/inventory", icon: "inventory" },
  { label: "Planner", href: "/planner", icon: "planner" },
] as const;

export const MORE_NAVIGATION = [
  { label: "Heroes", href: "/heroes" },
  { label: "Teams", href: "/teams" },
  { label: "Analyze", href: "/analyze" },
  { label: "AI Advisor", href: "/advisor" },
  { label: "Profile", href: "/profile" },
  { label: "FAQ", href: "/faq" },
] as const;

/** Match complete route segments, never unrelated prefixes such as /roster-tools. */
export function isNavigationRoute(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function activeNavigationHref(pathname: string): string | null {
  return PRIMARY_NAVIGATION.find((entry) => isNavigationRoute(pathname, entry.href))?.href ?? null;
}
