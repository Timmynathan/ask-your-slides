"use client";

// Simple graphs and flowcharts in answers (owner, 22 Nov 2026). The model writes a ```mermaid block
// (a flowchart, or an xychart-beta line/bar graph); this draws it. Mermaid is loaded only when an
// answer has a diagram. While the answer is still streaming the block is incomplete, so a failed
// draw waits quietly ("Drawing…") and only gives up once the text has stopped changing.
import { useEffect, useId, useState } from "react";

type MermaidApi = typeof import("mermaid").default;
let loading: Promise<MermaidApi> | null = null;
function mermaid(): Promise<MermaidApi> {
  loading ??= import("mermaid").then((m) => {
    m.default.initialize({
      startOnLoad: false,
      securityLevel: "strict", // labels are sanitised; no clicks or scripts
      theme: "base",
      fontFamily: "var(--font-inter), system-ui, sans-serif",
      xyChart: { width: 640, height: 380, titleFontSize: 18, xAxis: { labelFontSize: 14, titleFontSize: 15 }, yAxis: { labelFontSize: 14, titleFontSize: 15 } },
      flowchart: { nodeSpacing: 40, rankSpacing: 50, padding: 12 },
      themeVariables: {
        primaryColor: "#eef1fb",
        primaryBorderColor: "#1b2a6b",
        primaryTextColor: "#191919",
        lineColor: "#1b2a6b",
        fontSize: "14px",
        xyChart: { plotColorPalette: "#1b2a6b, #e0702b, #2a9d8f, #8e44ad", titleColor: "#191919", xAxisLabelColor: "#555", yAxisLabelColor: "#555", xAxisTitleColor: "#191919", yAxisTitleColor: "#191919" },
      },
    });
    return m.default;
  });
  return loading;
}

const GIVE_UP_MS = 2500; // the block hasn't changed for this long: it is finished, and broken

export function Diagram({ code }: { code: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let giveUp: ReturnType<typeof setTimeout> | undefined;
    const draw = setTimeout(async () => {
      try {
        const m = await mermaid();
        await m.parse(code); // throws on a syntax error (e.g. a block still streaming)
        const { svg: out } = await m.render(`d${id}${Date.now()}`, code);
        if (!cancelled) {
          setSvg(out);
          setFailed(false);
        }
      } catch {
        if (!cancelled) giveUp = setTimeout(() => !cancelled && setFailed(true), GIVE_UP_MS);
      }
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(draw);
      clearTimeout(giveUp);
    };
  }, [code, id]);

  if (svg) {
    return (
      <figure className="my-4 overflow-x-auto rounded-2xl bg-card p-4 ring-1 ring-line">
        {/* Mermaid's own output, sanitised (securityLevel strict). */}
        {/* Full width so Mermaid's svg (width 100%, max-width its natural size) keeps its size. */}
        <div className="w-full [&_svg]:mx-auto [&_svg]:block [&_svg]:h-auto" dangerouslySetInnerHTML={{ __html: svg }} />
      </figure>
    );
  }
  return (
    <div className="my-4 grid h-28 place-items-center rounded-2xl bg-sunken/60 text-[13.5px] text-muted">
      {failed ? "This diagram couldn't be drawn. The explanation above still covers it." : "Drawing…"}
    </div>
  );
}
