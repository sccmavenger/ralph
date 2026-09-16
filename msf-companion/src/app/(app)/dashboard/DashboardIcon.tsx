import type { ReactNode } from "react";

export type DashboardIconName = "gift" | "target" | "route" | "inventory" | "chat" | "roster" | "clock" | "refresh" | "home" | "more" | "planner";

const paths: Record<DashboardIconName, ReactNode> = {
  gift: <><path d="M3 8h18v4H3zM5 12v9h14v-9M12 8v13" /><path d="M12 8H8a3 3 0 1 1 3-3l1 3Zm0 0h4a3 3 0 1 0-3-3l-1 3Z" /></>,
  target: <><circle cx="11" cy="13" r="8" /><circle cx="11" cy="13" r="4" /><path d="m11 13 10-10M16 3h5v5" /></>,
  route: <><circle cx="5" cy="18" r="2" /><circle cx="19" cy="6" r="2" /><path d="M7 18h7a3 3 0 0 0 0-6h-4a3 3 0 0 1 0-6h7" /></>,
  inventory: <><path d="m12 2 9 5-9 5-9-5 9-5Zm-9 5v10l9 5 9-5V7M12 12v10M7 5l9 5" /></>,
  chat: <><path d="M21 11a9 9 0 0 1-9 9H3l2-5a9 9 0 1 1 16-4Z" /><path d="M8 10h8M8 14h5" /></>,
  roster: <><circle cx="9" cy="7" r="3" /><path d="M3 21v-4a6 6 0 0 1 12 0v4M17 4a3 3 0 0 1 0 6M18 13a5 5 0 0 1 3 4v4" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 6v6l4 2" /></>,
  refresh: <><path d="M20 5v6h-6M4 19v-6h6M5 8a8 8 0 0 1 13-3l2 3M4 16l2 3a8 8 0 0 0 13-3" /></>,
  home: <><path d="m3 10 9-8 9 8M5 8v13h5v-7h4v7h5V8" /></>,
  more: <><circle cx="4" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="20" cy="12" r="1" /></>,
  planner: <><path d="M8 4H5v18h14V4h-3M8 2h8v5H8zM8 12h8M8 17h6" /></>,
};

export default function DashboardIcon({ name, className }: { name: DashboardIconName; className?: string }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}
