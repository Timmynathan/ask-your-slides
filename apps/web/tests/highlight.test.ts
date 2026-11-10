import { describe, expect, it } from "vitest";
import { highlightLine } from "@/lib/study/highlight";

const kinds = (line: string, lang: string) => highlightLine(line, lang).filter((t) => t.kind !== "plain").map((t) => `${t.kind}:${t.text}`);

describe("highlightLine", () => {
  it("C#: keywords, types, strings, numbers, comments", () => {
    expect(kinds('public float speed = 5f; // "units"', "csharp")).toEqual(["keyword:public", "keyword:float", "number:5f", 'comment:// "units"']);
    expect(kinds('Debug.Log("Hit " + other.name);', "csharp")).toEqual(["type:Debug", "type:Log", 'string:"Hit "']);
  });
  it("Python: keywords and comments; the text is never changed", () => {
    const line = "import numpy as np  # arrays";
    expect(kinds(line, "python")).toEqual(["keyword:import", "keyword:as", "comment:# arrays"]);
    expect(highlightLine(line, "python").map((t) => t.text).join("")).toBe(line);
  });
});
