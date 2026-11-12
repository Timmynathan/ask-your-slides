"""Convert stored slide images from PNG to WebP (quality 75, full width) to fit Supabase's free 1 GB.

  uv run convert_webp.py            # count PNGs and estimate the saving; changes nothing
  uv run convert_webp.py --run      # convert: upload .webp → point the slide row at it → delete the .png

Safe while students use the app: the slide viewer signs both .webp and .png, and each image's row is
switched only after its WebP is uploaded. Re-runnable: rows already on .webp are skipped.
"""

from __future__ import annotations

import argparse
import sys
from concurrent.futures import ThreadPoolExecutor

from config import BUCKET
from store import Store, to_webp


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--run", action="store_true")
    ap.add_argument("--workers", type=int, default=8)
    args = ap.parse_args()
    store = Store()
    try:
        rows = store.db.execute(
            "select id, image_path from slides where image_path like %s order by image_path", ("%.png",)
        ).fetchall()
        paths = sorted({r["image_path"] for r in rows})
        print(f"{len(rows)} slide rows use {len(paths)} PNG images")
        if not args.run:
            print("Estimate only: WebP is ~30% of the PNG size. Add --run to convert.")
            return 0

        def convert(path: str) -> tuple[str, int, int]:
            r = store.http.get(f"/object/{BUCKET}/{path}")
            r.raise_for_status()
            webp = to_webp(r.content)
            new = path[:-4] + ".webp"
            up = store.http.post(f"/object/{BUCKET}/{new}", content=webp,
                                 headers={"Content-Type": "image/webp", "x-upsert": "true", "cache-control": "3600"})
            if up.status_code >= 300:
                raise RuntimeError(f"upload {new} failed: {up.status_code} {up.text[:200]}")
            return path, len(r.content), len(webp)

        before = after = 0
        done: list[str] = []
        with ThreadPoolExecutor(args.workers) as pool:
            for i, (path, a, b) in enumerate(pool.map(convert, paths), 1):
                before, after = before + a, after + b
                done.append(path)
                if i % 250 == 0:
                    print(f"  {i}/{len(paths)} uploaded")
        # Point rows at the WebP only after every upload succeeded, then remove the PNGs.
        with store.db.transaction():
            store.db.execute(
                "update slides set image_path = left(image_path, length(image_path) - 4) || '.webp' "
                "where image_path = any(%s)", (done,)
            )
        store.delete_images(done)
        print(f"converted {len(done)} images: {before / 1e9:.3f} GB → {after / 1e9:.3f} GB")
        return 0
    finally:
        store.close()


if __name__ == "__main__":
    sys.exit(main())
