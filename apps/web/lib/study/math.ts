// Maths in answers (calculation courses, Nov 2026): $$…$$ only, inline or on its own line.
// Single dollars stay text, so "$500" or "a $2 fee" in a finance answer is never read as maths.
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import type { Options } from "react-markdown";

export const MATH_REMARK: NonNullable<Options["remarkPlugins"]> = [remarkGfm, [remarkMath, { singleDollarTextMath: false }]];
// throwOnError false: a half-streamed or malformed formula shows as red source text, never a crash.
export const MATH_REHYPE: NonNullable<Options["rehypePlugins"]> = [[rehypeKatex, { throwOnError: false, strict: "ignore", output: "html" }]];
