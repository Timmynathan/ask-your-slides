// Turns a browser's user-agent text (plus whether the screen is touch) into three plain labels for the
// admin dashboard: kind (phone / tablet / laptop), operating system and browser. Nothing else is kept.

export type DeviceKind = "phone" | "tablet" | "laptop";
export interface Device {
  kind: DeviceKind;
  os: string;
  browser: string;
}

export function readDevice(ua: string, touchPoints = 0): Device {
  const s = ua || "";
  // iPads on iPadOS 13+ say "Macintosh"; a Mac has no touch screen, so touch points give them away.
  const ipad = /iPad/.test(s) || (/Macintosh/.test(s) && touchPoints > 1);
  let os = "Other";
  if (ipad) os = "iPadOS";
  else if (/iPhone|iPod/.test(s)) os = "iOS";
  else if (/Android/.test(s)) os = "Android";
  else if (/CrOS/.test(s)) os = "ChromeOS";
  else if (/Windows/.test(s)) os = "Windows";
  else if (/Macintosh|Mac OS X/.test(s)) os = "macOS";
  else if (/Linux/.test(s)) os = "Linux";

  let kind: DeviceKind = "laptop";
  if (ipad || /Tablet/.test(s) || (os === "Android" && !/Mobile/.test(s))) kind = "tablet";
  else if (/iPhone|iPod|Mobile|Android/.test(s)) kind = "phone";

  let browser = "Other";
  if (/Instagram/.test(s)) browser = "Instagram app";
  else if (/WhatsApp/.test(s)) browser = "WhatsApp app";
  else if (/Snapchat/.test(s)) browser = "Snapchat app";
  else if (/FBAN|FBAV|FB_IAB/.test(s)) browser = "Facebook app";
  else if (/LinkedInApp/.test(s)) browser = "LinkedIn app";
  else if (/TikTok|musical_ly|BytedanceWebview/.test(s)) browser = "TikTok app";
  else if (/SamsungBrowser/.test(s)) browser = "Samsung Internet";
  else if (/OPR\/|Opera|OPiOS/.test(s)) browser = "Opera";
  else if (/Edg(e|A|iOS)?\//.test(s)) browser = "Edge";
  else if (/Firefox|FxiOS/.test(s)) browser = "Firefox";
  else if (/Chrome|CriOS/.test(s)) browser = "Chrome";
  else if (/Safari/.test(s)) browser = "Safari";
  return { kind, os, browser };
}
