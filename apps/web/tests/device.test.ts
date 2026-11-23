import { describe, expect, it } from "vitest";
import { readDevice } from "@/lib/device";

describe("readDevice", () => {
  it("reads common phones, tablets and laptops", () => {
    expect(readDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1")).toEqual({ kind: "phone", os: "iOS", browser: "Safari" });
    expect(readDevice("Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0 Mobile Safari/537.36")).toEqual({ kind: "phone", os: "Android", browser: "Samsung Internet" });
    expect(readDevice("Mozilla/5.0 (Linux; Android 13; Infinix X6833B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36")).toEqual({ kind: "phone", os: "Android", browser: "Chrome" });
    expect(readDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36 Edg/131.0")).toEqual({ kind: "laptop", os: "Windows", browser: "Edge" });
    expect(readDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15")).toEqual({ kind: "laptop", os: "macOS", browser: "Safari" });
  });
  it("tells an iPad (which says Macintosh) from a Mac by touch", () => {
    const ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15";
    expect(readDevice(ua, 5)).toEqual({ kind: "tablet", os: "iPadOS", browser: "Safari" });
    expect(readDevice("Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36").kind).toBe("tablet");
  });
  it("names in-app browsers", () => {
    expect(readDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0").browser).toBe("Instagram app");
    expect(readDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1 CriOS/131").browser).toBe("Chrome");
  });
});
