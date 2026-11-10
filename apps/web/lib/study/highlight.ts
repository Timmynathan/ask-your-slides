// A small syntax highlighter for the slide viewer's code and notebook views (PRD F11): comments,
// strings, numbers and keywords for C# and Python. No dependency; pure, unit-tested.

export type TokenKind = "comment" | "string" | "number" | "keyword" | "type" | "plain";
export interface Token {
  kind: TokenKind;
  text: string;
}

const KEYWORDS: Record<string, Set<string>> = {
  csharp: new Set(
    "abstract as base bool break byte case catch char class const continue default delegate do double else enum event false finally float for foreach get if in int interface internal is long namespace new null object out override private protected public readonly ref return sealed set static string struct switch this throw true try typeof uint using var virtual void while yield async await".split(" "),
  ),
  python: new Set(
    "and as assert async await break class continue def del elif else except False finally for from global if import in is lambda None nonlocal not or pass raise return True try while with yield print len range self".split(" "),
  ),
};
// Unity / .NET types students meet first; anything Capitalised is shown as a type too.
const COMMENT = { csharp: /^(\/\/.*|\/\*[\s\S]*?(\*\/|$))/, python: /^(#.*)/ } as const;
const STRING = /^("(?:\\.|[^"\\])*"?|'(?:\\.|[^'\\])*'?|@"[^"]*"?|f"(?:\\.|[^"\\])*"?|f'(?:\\.|[^'\\])*'?)/;
const NUMBER = /^\d+(\.\d+)?[fFdDmM]?/;
const WORD = /^[A-Za-z_]\w*/;

export function highlightLine(line: string, language: string): Token[] {
  const lang = language === "csharp" ? "csharp" : "python";
  const out: Token[] = [];
  let rest = line;
  const push = (kind: TokenKind, text: string) => {
    const last = out.at(-1);
    if (last && last.kind === kind && kind === "plain") last.text += text;
    else out.push({ kind, text });
  };
  while (rest) {
    let m: RegExpMatchArray | null;
    if ((m = rest.match(COMMENT[lang]))) push("comment", m[0]);
    else if ((m = rest.match(STRING))) push("string", m[0]);
    else if ((m = rest.match(NUMBER))) push("number", m[0]);
    else if ((m = rest.match(WORD))) {
      const w = m[0];
      push(KEYWORDS[lang].has(w) ? "keyword" : /^[A-Z]/.test(w) ? "type" : "plain", w);
    } else {
      m = [rest[0]] as unknown as RegExpMatchArray;
      push("plain", rest[0]);
    }
    rest = rest.slice(m[0].length);
  }
  return out;
}

export const TOKEN_CLASS: Record<TokenKind, string> = {
  comment: "text-emerald-700 dark:text-emerald-400 italic",
  string: "text-amber-700 dark:text-amber-300",
  number: "text-violet-700 dark:text-violet-300",
  keyword: "text-sky-700 dark:text-sky-300 font-medium",
  type: "text-teal-700 dark:text-teal-300",
  plain: "",
};
