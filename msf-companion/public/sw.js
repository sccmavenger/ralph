// MSF Companion Service Worker with Push Notification support
const CACHE_NAME = "msf-companion-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Handle push notifications
self.addEventListener("push", (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    const title = data.title || "MSF Companion";
    const options = {
      body: data.body || "",
      icon: "/icons/icon-192x192.png",
      badge: "/icons/icon-72x72.png",
      data: {
        url: data.url || "/dashboard",
      },
      vibrate: [100, 50, 100],
    };

    event.waitUntil(self.registration.showNotification(title, options));
  } catch {
    // Fallback for text data
    event.waitUntil(
      self.registration.showNotification("MSF Companion", {
        body: event.data.text(),
        icon: "/icons/icon-192x192.png",
      })
    );
  }
});

// Handle notification click — opens the relevant page
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/dashboard";

  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      // Focus existing window if available
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      // Open new window
      return self.clients.openWindow(url);
    })
  );
});
