"""Cost estimate for the past-papers pipeline (PRD §9.4), nothing submitted.

    npm run ingest:past:estimate

- Extraction (PAST_Q_MODEL): exact input tokens (count_tokens) for papers not stored yet; papers
  byte-identical to one already extracted for another course are reused for $0.
- Analysis (PAST_ANSWER_MODEL): exact input tokens for questions already extracted; for papers not extracted yet, the
  question count is projected from the extracted papers' questions per page, and the tokens per
  question from their real requests.
Output tokens are a guess (structured JSON + thinking at medium effort).
"""

from __future__ import annotations

import sys

import batch
import past_analysis as pa
import past_papers as pp
from config import DATA, PAST_ANSWER_MODEL, PAST_Q_MODEL
from manifest import load
from store import Store


def main() -> int:
    store = Store()
    courses = load(DATA)
    ext_in = ext_out = 0
    ana_in = ana_out = 0
    measured_q = measured_pages = 0
    per_q_in: list[int] = []
    rows = []
    pending_pages = 0
    reused = 0
    for c in courses:
        cid = store.course_id(c)
        if cid is None:
            continue
        topics = pa.course_topics(store, cid)
        jobs = pa.load_jobs(store, cid)
        for j in jobs:
            pa.retrieve(store, j)
            j.params = pa.build_params(c, topics, j)
        if jobs:
            tin, tout = pa.estimate_tokens(jobs)
            ana_in += tin
            ana_out += tout
            per_q_in += [tin // len(jobs)] * len(jobs)
            pages = store.db.execute("select coalesce(sum(pages), 0) as n from past_papers where course_id = %s and status = 'ok'", (cid,)).fetchone()["n"]
            measured_q += len(jobs)
            measured_pages += pages
            rows.append((f"{c.code} (extracted)", "analysis", len(jobs), tin, tout))
        for p in c.past_papers:
            if pp.stored_fingerprint(store, cid, p.rel_file) is not None:
                continue
            job = pp.make_job(c, p)
            if pp.find_reuse(store, job, cid):
                reused += 1
                pending_pages += job.pages  # its questions still get analysed for this course
                rows.append((f"{c.code} {p.file.name}", "reused", job.pages, 0, 0))
                continue
            tin = batch.count_input_tokens(job.params)
            tout = 1500 * job.pages + 4000
            ext_in += tin
            ext_out += tout
            pending_pages += job.pages
            rows.append((f"{c.code} {p.file.name}", "extraction", job.pages, tin, tout))

    q_per_page = measured_q / measured_pages if measured_pages else 5
    avg_in = sum(per_q_in) / len(per_q_in) if per_q_in else 6000
    proj_q = round(pending_pages * q_per_page)
    proj_in = int(proj_q * avg_in)
    proj_out = proj_q * (900 + 120 * 7 + 1500)

    model = {"extraction": PAST_Q_MODEL, "reused": PAST_Q_MODEL, "analysis": PAST_ANSWER_MODEL}
    for m in sorted({PAST_Q_MODEL, PAST_ANSWER_MODEL}):
        pin, pout = batch.price(m)
        print(f"{m}: Batches API, ${pin / 2:.2f} / ${pout / 2:.2f} per M in/out")
    print(f"\n{'':<46}{'step':<12}{'n':>5}{'in':>10}{'out (est)':>11}{'$':>8}")
    for name, step, n, tin, tout in rows:
        print(f"{name:<46}{step:<12}{n:>5}{tin:>10,}{tout:>11,}{batch.batch_cost(model[step], tin, tout):>8.3f}")
    print(f"{f'Analysis of the other papers (~{q_per_page:.1f} questions/page × {pending_pages} pages)':<46}{'projected':<12}{proj_q:>5}"
          f"{proj_in:>10,}{proj_out:>11,}{batch.batch_cost(PAST_ANSWER_MODEL, proj_in, proj_out):>8.3f}")
    ext = batch.batch_cost(PAST_Q_MODEL, ext_in, ext_out)
    ana = batch.batch_cost(PAST_ANSWER_MODEL, ana_in + proj_in, ana_out + proj_out)
    print(f"\nStep 1, extraction ({PAST_Q_MODEL}): ≈ ${ext:.2f}   ({reused} identical paper(s) reused for $0)")
    print(f"Step 2, answers ({PAST_ANSWER_MODEL}): ≈ ${ana:.2f}   (rough until step 1 has run: projected from questions per page)")
    print(f"Total ≈ ${ext + ana:.2f}")
    print("Plus Voyage embeddings for ~1 query and 1 document per question: well under $0.01.")
    store.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
