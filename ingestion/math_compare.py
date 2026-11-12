"""Which model should transcribe formula pages of calculation courses? (PRD F11, Nov 2026)

Picks ~3 formula / worked-solution pages per calculation course (calculation_heavy: true), runs the
maths prompt with two models, and writes a side-by-side page (slide image + both transcriptions,
formulas rendered) to data/_reports/math-compare.html for the owner to judge.

  uv run math_compare.py                 # pick pages, print the cost estimate, call nothing
  uv run math_compare.py --run           # call both models (cached: re-runs are free)
  uv run math_compare.py --run --per-course 3 --models claude-haiku-5-5,claude-sonnet-5-5
"""

from __future__ import annotations

import argparse
import base64
import html
import io
import json
import sys
from concurrent.futures import ThreadPoolExecutor

import batch
import pdf_extract
import pptx_extract
import vision
from config import DATA, ROOT
from ingest import where_prefix
from manifest import load
from PIL import Image

FORMULA_REASONS = {"equation", "image", "embedded object", "chart", "diagram or table"}
EST_IN, EST_OUT = 2_000, 450
OUT = ROOT / "data" / "_reports" / "math-compare.html"


def pick(per_course: int):
    """Formula-looking pages, spread over each calculation course's slides (equations first)."""
    out = []
    for c in load(DATA):
        if not c.calculation_heavy:
            continue
        found = []
        for m in c.materials:
            if m.file_type not in ("pdf", "pptx") or m.kind not in ("slides", "notes"):
                continue
            pdf = pdf_extract.read_pdf(pdf_extract.to_pdf(m.file))
            if m.file_type == "pptx":
                slides = pptx_extract.extract(m.file)
                if len(slides) != len(pdf):
                    continue
                tpl = pptx_extract.repeated_images(slides)
                pages = [(i + 1, pptx_extract.visual_reason(s, tpl), s.body, pdf[i].png) for i, s in enumerate(slides)]
            else:
                tpl = pdf_extract.repeated_images(pdf)
                pages = [(p.number, pdf_extract.visual_reason(p, tpl), p.text, p.png) for p in pdf]
            for n, reason, body, png in pages:
                if reason in FORMULA_REASONS:
                    found.append((0 if reason == "equation" else 1, c, m, n, reason, body, png))
        # Equation pages first, then pictures/charts; spread the picks over that list.
        found.sort(key=lambda f: (f[0], f[2].order, f[3]))
        if len(found) > per_course:
            idx = sorted({round(i * (len(found) - 1) / max(1, per_course - 1)) for i in range(per_course)})
            found = [found[i] for i in idx]
        out += [f[1:] for f in found]
    return out


def webp_data_uri(png: bytes) -> str:
    buf = io.BytesIO()
    Image.open(io.BytesIO(png)).convert("RGB").save(buf, "WEBP", quality=70)
    return "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--run", action="store_true", help="call the models (otherwise only the estimate)")
    ap.add_argument("--per-course", type=int, default=3)
    ap.add_argument("--models", default="claude-haiku-5-5,claude-sonnet-5-5")
    args = ap.parse_args()
    models = [m.strip() for m in args.models.split(",") if m.strip()]

    pages = pick(args.per_course)
    print(f"{len(pages)} pages from {len({p[0].key for p in pages})} calculation courses")
    total = 0.0
    for model in models:
        todo = sum(1 for c, m, n, _, body, png in pages
                   if not vision.cached_path(png, f"{where_prefix(c, m)}, page {n}", body, math=True, model=model))
        pin, pout = batch.price(model)
        usd = todo * (EST_IN * pin + EST_OUT * pout) / 1e6
        total += usd
        print(f"  {model}: {todo} calls to make (rest cached) ≈ ${usd:.3f}")
    print(f"  total ≈ ${total:.2f}")
    if not args.run:
        print("Estimate only. Add --run to call the models.")
        return 0

    def one(job):
        (c, m, n, reason, body, png), model = job
        return vision.describe(png, f"{where_prefix(c, m)}, page {n}", body, math=True, model=model)

    jobs = [(p, model) for p in pages for model in models]
    with ThreadPoolExecutor(6) as pool:
        results = list(pool.map(one, jobs))
    spent = 0.0
    for (_, model), r in zip(jobs, results):
        pin, pout = batch.price(model)
        spent += (r.input_tokens * pin + r.output_tokens * pout) / 1e6
    print(f"spent ${spent:.3f}")

    by = {(id(p), model): r for (p, model), r in zip(jobs, results)}
    rows = []
    for p in pages:
        c, m, n, reason, body, png = p
        cells = "".join(
            f'<div class="t"><h3>{html.escape(model)}</h3><div class="md">{html.escape((by[(id(p), model)].text or "NONE"))}</div></div>'
            for model in models
        )
        rows.append(
            f'<section><h2>{html.escape(c.title)} · {html.escape(m.file.name)} · page {n} <small>({html.escape(reason)})</small></h2>'
            f'<div class="row"><img src="{webp_data_uri(png)}" alt="page {n}">{cells}</div></section>'
        )
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(PAGE.replace("{rows}", "\n".join(rows)).replace("{n}", str(len(pages))))
    (OUT.parent / "math-compare.json").write_text(json.dumps(
        [{"course": p[0].key, "file": p[1].file.name, "page": p[2], **{m: by[(id(p), m)].text for m in models}} for p in pages], indent=1))
    print(f"wrote {OUT}")
    return 0


PAGE = """<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Formula transcription comparison</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css">
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js"></script>
<style>body{font:15px/1.5 system-ui,sans-serif;margin:0 auto;max-width:1500px;padding:16px;background:#fff;color:#191919}
section{border-top:1px solid #ddd;padding:16px 0}h2{font-size:16px}small{color:#666;font-weight:400}
.row{display:grid;grid-template-columns:minmax(0,1.2fr) repeat(2,minmax(0,1fr));gap:16px;align-items:start}
img{width:100%;border:1px solid #ddd}.t h3{font-size:13px;margin:0 0 6px;color:#0e1664}
.md{white-space:normal;font-size:14px;overflow-x:auto}.md table{border-collapse:collapse}.md td,.md th{border:1px solid #ccc;padding:2px 6px}
@media(max-width:800px){.row{grid-template-columns:1fr}}</style></head><body>
<h1>Formula pages: which model transcribes them better?</h1>
<p>{n} pages from the calculation courses. Left: the slide. Right: each model's transcription with the maths prompt. Look for wrong symbols, missing steps and changed numbers.</p>
{rows}
<script>addEventListener("DOMContentLoaded",()=>{document.querySelectorAll(".md").forEach(el=>{el.innerHTML=marked.parse(el.textContent);
renderMathInElement(el,{delimiters:[{left:"$$",right:"$$",display:false}],throwOnError:false})})})</script></body></html>"""

if __name__ == "__main__":
    sys.exit(main())
