import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import { describe, expect, it } from "vitest";
import { MATH_REHYPE, MATH_REMARK } from "@/lib/study/math";

const render = (md: string) => renderToStaticMarkup(createElement(ReactMarkdown, { remarkPlugins: MATH_REMARK, rehypePlugins: MATH_REHYPE }, md));

describe("maths in answers", () => {
  it("renders $$…$$ inline and on its own line with KaTeX", () => {
    expect(render("So $$K_e = \\frac{D_1}{P_0} + g$$ here.")).toContain('class="katex"');
    expect(render("$$\nWACC = \\sum w_i k_i\n$$")).toContain("katex-display");
  });

  it("leaves money alone: single dollars are text", () => {
    const html = render("The prize is $1,000,000 a year or $10,000,000 today.");
    expect(html).not.toContain("katex");
    expect(html).toContain("$1,000,000 a year or $10,000,000 today");
  });

  it("a half-streamed or broken formula never throws", () => {
    expect(() => render("Then $$\\frac{1}{")).not.toThrow();
    expect(() => render("$$\\badcommand{x}$$")).not.toThrow();
  });
});
