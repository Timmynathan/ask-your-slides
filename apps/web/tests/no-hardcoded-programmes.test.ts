import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { groupChoices, programmeFullName, programmeLabel } from "@/lib/programmes";

// PRD F11: programme names, departments and course lists come from the data (catalog.yaml →
// database), so adding a programme needs no code change. Comments may give examples.
const ROOT = path.resolve(import.meta.dirname, "..");
const NAMES = /Computer Science|Information Science|Media Studies|computer-science|information-science|\bISMS\b|Software Engineering/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
  });
}

const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

describe("no programme is named in the app's code", () => {
  it("app/, components/ and lib/ name no programme or department", () => {
    const offenders = ["app", "components", "lib"]
      .flatMap((d) => files(path.join(ROOT, d)))
      .filter((f) => NAMES.test(stripComments(readFileSync(f, "utf8"))))
      .map((f) => path.relative(ROOT, f));
    expect(offenders).toEqual([]);
  });
});

describe("programme choices", () => {
  it("groups levels per programme, in the order given, and labels short names", () => {
    const rows = [
      { programme: "a", name: "BSc A", short_name: null, department: "A", level: 400 },
      { programme: "b", name: "BSc B", short_name: "BB", department: "B", level: 400 },
      { programme: "a", name: "BSc A", short_name: null, department: "A", level: 300 },
    ];
    expect(groupChoices(rows)).toEqual([
      { programme: "a", name: "BSc A", shortName: null, department: "A", levels: [300, 400] },
      { programme: "b", name: "BSc B", shortName: "BB", department: "B", levels: [400] },
    ]);
    expect(programmeLabel({ name: "BSc Bee Studies", shortName: "BB" })).toBe("BSc BB"); // short enough for a phone
    expect(programmeFullName({ name: "BSc Bee Studies", shortName: "BB" })).toBe("Bee Studies"); // shown under the picker
    expect(programmeLabel({ name: "BSc A", shortName: null })).toBe("BSc A");
    expect(programmeFullName({ name: "BSc A", shortName: null })).toBeNull();
  });
});
