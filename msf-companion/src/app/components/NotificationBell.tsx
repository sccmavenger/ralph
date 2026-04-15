"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  linkUrl: string | null;
  read: boolean;
  createdAt: string;
}

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const bellRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const loadNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      if (res.ok) {
        const data = (await res.json()) as {
          notifications: Notification[];
          unreadCount: number;
        };
        setNotifications(data.notifications);
        setUnreadCount(data.unreadCount);
      }
    } catch {
      // Non-blocking
    }
  }, []);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  // Close panel when clicking outside
  useEffect(() => {
    if (!isOpen) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (
        panelRef.current && !panelRef.current.contains(target) &&
        bellRef.current && !bellRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen]);

  const markAsRead = async (id: string) => {
    try {
      await fetch(`/api/notifications/${id}`, { method: "PATCH" });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      // Non-blocking
    }
  };

  const panel = isOpen
    ? createPortal(
        <div
          ref={panelRef}
          className="fixed left-2 right-2 top-14 max-h-80 overflow-y-auto rounded-xl border border-[var(--color-surface-light)] bg-[var(--color-surface)] shadow-2xl z-[60]"
          data-testid="notification-panel"
        >
          <div className="flex items-center justify-between border-b border-[var(--color-surface-light)] px-4 py-3">
            <h3 className="text-sm font-semibold text-[var(--color-foreground)]">
              Notifications
            </h3>
            <button
              onClick={() => setIsOpen(false)}
              className="text-[var(--color-muted)] hover:text-[var(--color-foreground)] text-lg leading-none"
              aria-label="Close notifications"
            >
              ✕
            </button>
          </div>
          {notifications.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-[var(--color-muted)]">
              No notifications yet
            </p>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                className={`border-b border-[var(--color-surface-light)] px-4 py-3 transition-opacity ${
                  n.read ? "opacity-50" : ""
                }`}
                data-testid="notification-item"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--color-foreground)] truncate">
                      {n.title}
                    </p>
                    <p className="text-xs text-[var(--color-muted)] mt-0.5">
                      {n.message}
                    </p>
                    {n.linkUrl && (
                      <a
                        href={n.linkUrl}
                        className="text-xs text-[var(--color-accent)] hover:underline mt-1 inline-block"
                      >
                        View →
                      </a>
                    )}
                  </div>
                  {!n.read && (
                    <button
                      onClick={() => markAsRead(n.id)}
                      className="text-xs text-[var(--color-muted)] hover:text-[var(--color-foreground)] shrink-0"
                      data-testid="dismiss-notification"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>,
        document.body
      )
    : null;

  return (
    <div className="relative">
      <button
        ref={bellRef}
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-[var(--color-muted)] hover:text-[var(--color-foreground)] transition-colors"
        data-testid="notification-bell"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white"
            data-testid="notification-badge"
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>
      {panel}
    </div>
  );
}
