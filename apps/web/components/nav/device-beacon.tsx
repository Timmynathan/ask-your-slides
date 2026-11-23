"use client";

import { useEffect } from "react";

// Tells the server, at most once a day per device, what kind of device this is (for the admin
// dashboard's Devices chart). Storage failures just mean it may send again; it never shows anything.
const KEY = "ays-device-seen";

export function DeviceBeacon() {
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    try {
      if (localStorage.getItem(KEY) === today) return;
    } catch {}
    void fetch("/api/device", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ touch: Math.min(20, navigator.maxTouchPoints || 0) }),
    })
      .then((r) => r.json())
      .then((j: { ok?: boolean }) => {
        if (!j.ok) return;
        try {
          localStorage.setItem(KEY, today);
        } catch {}
      })
      .catch(() => {});
  }, []);
  return null;
}
