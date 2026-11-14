"""Clean past-paper page photos for students to see (PRD F10, owner 14 Nov 2026): the original PAU
paper, looking properly scanned, with nothing a student wrote on it.

1. Straighten: find the sheet's outline and flatten the perspective (phone photos taken at an angle).
2. Coloured ink (blue/red/green pens) is removed pixel by pixel: the papers are printed in black, so
   saturated strokes are always handwriting. Black print crossed by a stroke is kept.
3. Erase boxes (from the vision pass, ink_boxes): handwriting in dark pen or pencil. Inside a box every
   dark stroke is removed except printed words (Tesseract, confident) so underlined text survives;
   "personal" boxes (names, matric numbers, signatures) are filled white with no exceptions.
4. Scan look: the background is flattened to white (shadows, creases and paper colour go), print is
   darkened, output is greyscale.

All of it is local and free; only the vision pass that finds the boxes costs money (past_ink.py).
"""

from __future__ import annotations

import io
import subprocess
from dataclasses import dataclass

import cv2
import numpy as np
from PIL import Image


@dataclass
class Box:
    x0: float
    y0: float
    x1: float
    y1: float  # fractions of the page (0–1), after straightening
    kind: str  # "personal" | "writing"


def decode(jpeg: bytes) -> np.ndarray:
    return cv2.imdecode(np.frombuffer(jpeg, np.uint8), cv2.IMREAD_COLOR)


def _order(pts: np.ndarray) -> np.ndarray:
    s, d = pts.sum(1), np.diff(pts, axis=1).ravel()
    return np.array([pts[np.argmin(s)], pts[np.argmin(d)], pts[np.argmax(s)], pts[np.argmax(d)]], np.float32)


def straighten(img: np.ndarray) -> np.ndarray:
    """Warp the sheet flat when its four corners are clearly visible and it fills most of the photo;
    otherwise (a flat scan, or a sheet cut off at the edges) leave the image as it is."""
    h, w = img.shape[:2]
    small = cv2.resize(img, (w // 4, h // 4))
    gray = cv2.GaussianBlur(cv2.cvtColor(small, cv2.COLOR_BGR2GRAY), (5, 5), 0)
    # The sheet is the big bright area: threshold it rather than chase edges through the text.
    _, mask = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((15, 15), np.uint8))
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return img
    c = max(contours, key=cv2.contourArea)
    area = cv2.contourArea(c) / (small.shape[0] * small.shape[1])
    quad = cv2.approxPolyDP(c, 0.02 * cv2.arcLength(c, True), True)
    if len(quad) != 4 or not 0.4 < area < 0.97:
        return img
    pts = _order(quad.reshape(4, 2).astype(np.float32) * 4)
    tl, tr, br, bl = pts
    width = int(max(np.linalg.norm(tr - tl), np.linalg.norm(br - bl)))
    height = int(max(np.linalg.norm(bl - tl), np.linalg.norm(br - tr)))
    if width < w * 0.5 or height < h * 0.5:
        return img
    m = cv2.getPerspectiveTransform(pts, np.array([[0, 0], [width, 0], [width, height], [0, height]], np.float32))
    return cv2.warpPerspective(img, m, (width, height), flags=cv2.INTER_CUBIC, borderValue=(255, 255, 255))


def colour_ink(img: np.ndarray, blue: float = 5.0, red: float = 7.0) -> np.ndarray:
    """Mask of coloured pen strokes (blue, red), widened slightly to take their soft edges. Judged
    against the paper around each stroke (Lab colour), so faint blue biro on a yellowish photo still
    counts, while black print (neutral, like the paper) never does."""
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB).astype(np.float32)
    L, a, b = lab[..., 0], lab[..., 1], lab[..., 2]
    k = max(31, (min(img.shape[:2]) // 25) | 1)
    bgL = cv2.medianBlur(cv2.dilate(L.astype(np.uint8), np.ones((7, 7), np.uint8)), k).astype(np.float32)
    bga = cv2.medianBlur(a.astype(np.uint8), k).astype(np.float32)
    bgb = cv2.medianBlur(b.astype(np.uint8), k).astype(np.float32)
    stroke = L < bgL - 12  # darker than the paper here
    tinted = ((bgb - b) > blue) | ((a - bga) > red)
    mask = (stroke & tinted).astype(np.uint8) * 255
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
    return cv2.dilate(mask, np.ones((3, 3), np.uint8))


def printed_words(gray: np.ndarray, min_conf: int = 75) -> np.ndarray:
    """Mask of confidently read printed words (Tesseract), so erasing never takes the paper's text."""
    ok, png = cv2.imencode(".png", gray)
    out = subprocess.run(["tesseract", "stdin", "stdout", "--psm", "11", "tsv"], input=png.tobytes(), capture_output=True, check=False)
    mask = np.zeros(gray.shape, np.uint8)
    for line in out.stdout.decode("utf-8", "ignore").splitlines()[1:]:
        f = line.split("\t")
        if len(f) < 12 or not f[11].strip():
            continue
        conf, word = float(f[10]), f[11].strip()
        # Handwriting is read with low confidence, or as junk; printed words are long and clean.
        if conf < min_conf or (len(word) < 3 and not word.isdigit()):
            continue
        x, y, w, h = (int(f[i]) for i in (6, 7, 8, 9))
        mask[y : y + h, x : x + w] = 255
    return mask


def flatten(gray: np.ndarray) -> np.ndarray:
    """White background, dark print: divide by the page's own lighting, then lift the paper to white."""
    k = max(31, (min(gray.shape) // 20) | 1)
    bg = cv2.medianBlur(cv2.dilate(gray, np.ones((9, 9), np.uint8)), k)
    norm = cv2.divide(gray, bg, scale=255)
    # Levels: paper (≥ 225) → white, print pushed darker; a gentle curve keeps thin strokes readable.
    lut = np.clip((np.arange(256) - 90) * 255.0 / (225 - 90), 0, 255)
    lut = (255 * (lut / 255) ** 1.25).astype(np.uint8)
    return cv2.LUT(norm, lut)


def clean(jpeg: bytes, boxes: list[Box] | None = None) -> np.ndarray:
    """One page photo → a clean greyscale scan (numpy array)."""
    img = straighten(decode(jpeg))
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    page = flatten(gray)
    erase = colour_ink(img)
    # Black print under a coloured stroke stays: very dark, unsaturated pixels are never erased.
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB).astype(np.int16)
    print_px = ((lab[..., 0] < 70) & (np.abs(lab[..., 1] - 128) < 6) & (np.abs(lab[..., 2] - 128) < 6)).astype(np.uint8) * 255
    erase = cv2.bitwise_and(erase, cv2.bitwise_not(print_px))
    page[erase > 0] = 255
    if boxes:
        h, w = page.shape
        words = printed_words(page)
        for b in boxes:
            x0, y0 = max(0, int(b.x0 * w) - 4), max(0, int(b.y0 * h) - 4)
            x1, y1 = min(w, int(b.x1 * w) + 4), min(h, int(b.y1 * h) + 4)
            if b.kind == "personal":
                page[y0:y1, x0:x1] = 255
            else:
                region = page[y0:y1, x0:x1]
                keep = words[y0:y1, x0:x1] > 0
                region[~keep & (region < 200)] = 255
    return page


def ink_strokes(img: np.ndarray, page: np.ndarray, words: np.ndarray, tint: float = 3.0) -> np.ndarray:
    """Coloured pen, judged per stroke: each connected mark's average colour against the paper around
    it. A blue or red stroke averages blue or red; a black printed letter's camera fringes average out
    to neutral. Marks that are mostly confidently read printed words are never removed."""
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB).astype(np.float32)
    k = max(31, (min(img.shape[:2]) // 25) | 1)
    db = cv2.medianBlur(lab[..., 2].astype(np.uint8), k).astype(np.float32) - lab[..., 2]  # + = bluer than the paper
    da = lab[..., 1] - cv2.medianBlur(lab[..., 1].astype(np.uint8), k).astype(np.float32)  # + = redder
    dark = (page < 200).astype(np.uint8)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(dark, 8)
    flat = labels.ravel()
    count = np.bincount(flat, minlength=n).astype(np.float32) + 1e-6
    blue = np.bincount(flat, db.ravel(), n) / count
    red = np.bincount(flat, da.ravel(), n) / count
    printed = np.bincount(flat, (words > 0).ravel().astype(np.float32), n) / count
    pen = ((blue > tint) | (red > tint + 2)) & (printed < 0.5)
    pen[0] = False
    # A circled letter merges with its circle: inside a pen mark, black neutral pixels are print.
    black = (page < 110) & (np.abs(db) < 2.5) & (np.abs(da) < 2.5)
    return pen[labels] & ~black


def _despeckle(page: np.ndarray, max_area: int = 14, gap: int = 9) -> np.ndarray:
    """Remove tiny marks with nothing else near them (leftovers of erased ink). Small letters, dots on
    i's and full stops always have neighbours, so they stay."""
    dark = (page < 170).astype(np.uint8)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(dark, 8)
    k = 2 * gap + 1
    density = cv2.boxFilter(dark.astype(np.float32), -1, (k, k), normalize=False)
    peak = np.zeros(n, np.float32)
    np.maximum.at(peak, labels.ravel(), density.ravel())
    area = stats[:, cv2.CC_STAT_AREA]
    alone = (area <= max_area) & (peak <= area + 1)
    alone[0] = False
    out = page.copy()
    out[alone[labels]] = 255
    return out


def clean_blocks(jpeg: bytes, ink: dict) -> np.ndarray:
    """One page photo + the vision pass's blocks (past_ink.py) → a clean greyscale scan.
    - Only printed blocks survive; letters crossing a block's edge are kept whole.
    - Coloured ink is erased, except on printed words the OCR reads confidently (a phone camera puts
      colour fringes on black letters) and on the logo.
    - Personal details (names, matric numbers, signatures) are whited out with no exceptions."""
    img = straighten(decode(jpeg))
    h, w = img.shape[:2]
    page = flatten(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY))
    words = cv2.dilate(printed_words(page, min_conf=60), np.ones((5, 5), np.uint8))
    ink_mask = cv2.bitwise_and(colour_ink(img), cv2.bitwise_not(words))
    ink_mask[ink_strokes(img, page, words)] = 255
    keep = np.zeros((h, w), np.uint8)
    pad = max(8, w // 150)
    for b in ink["blocks"]:
        x0, y0, x1, y1 = b["box"]
        if b["kind"] == "logo":  # the emblem's wordmark ("PAN-ATLANTIC UNIVERSITY") sits beside it
            grow = (x1 - x0) * 1.5
            x0, x1 = max(0.0, x0 - grow), min(1.0, x1 + grow)
        X0, Y0 = max(0, int(x0 * w) - pad), max(0, int(y0 * h) - pad)
        X1, Y1 = min(w, int(x1 * w) + pad), min(h, int(y1 * h) + pad)
        keep[Y0:Y1, X0:X1] = 255
        if b["kind"] == "logo":
            ink_mask[Y0:Y1, X0:X1] = 0  # a coloured logo keeps its colour strokes
    # Whole letters: any printed-sized mark that touches a block is kept entirely.
    dark = (page < 170).astype(np.uint8)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(dark, 8)
    touching = np.unique(labels[(keep > 0) & (dark > 0)])
    limit = max(40, h // 25)
    ok = [l for l in touching if l and stats[l, cv2.CC_STAT_HEIGHT] <= limit and stats[l, cv2.CC_STAT_WIDTH] <= w // 3]
    keep[np.isin(labels, ok)] = 255
    out = np.full_like(page, 255)
    out[keep > 0] = page[keep > 0]
    out[ink_mask > 0] = 255
    for x0, y0, x1, y1 in ink["personal"]:
        out[max(0, int(y0 * h) - pad) : int(y1 * h) + pad, max(0, int(x0 * w) - pad) : int(x1 * w) + pad] = 255
    return _despeckle(out)


def to_webp(page: np.ndarray, long_edge: int = 1600, quality: int = 70) -> bytes:
    h, w = page.shape[:2]
    scale = long_edge / max(h, w)
    if scale < 1:
        page = cv2.resize(page, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
    buf = io.BytesIO()
    Image.fromarray(page).save(buf, "WEBP", quality=quality, method=6)
    return buf.getvalue()
