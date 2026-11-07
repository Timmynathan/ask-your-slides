"""Load and validate data/courses.yaml + data/manifest.yaml.

manifest.yaml is the source of truth for structure: course -> topics -> materials, each material
with a kind. courses.yaml gives course titles, lecturers and sidebar order.

Validation collects every problem and fails before anything is uploaded, so a typo in the manifest
never leaves a half-ingested course.
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass
from pathlib import Path

import yaml

KINDS = ("slides", "notes", "reading", "practical", "outline", "other")
SKIPPED = "skipped"
SUPPORTED_SUFFIXES = {".pdf", ".pptx", ".ppt"}
CODE_RE = re.compile(r"^[A-Z]{3}[0-9]{3}$")


class ManifestError(Exception):
    def __init__(self, problems: list[str]):
        super().__init__("\n".join(f"  - {p}" for p in problems))
        self.problems = problems


@dataclass(frozen=True)
class Topic:
    order: int
    title: str


@dataclass(frozen=True)
class Material:
    course: str
    order: int  # manifest lms_order; unique per course; used for sorting and slide keys
    cmid: int  # LMS id; the material's stable identity across re-runs
    section: str | None
    file: Path
    rel_file: str  # as written in the manifest, e.g. slides/CSC420/01-...pdf
    topic: str | None  # None = course-level
    kind: str
    review: str | None
    title_override: str | None


@dataclass(frozen=True)
class Course:
    code: str
    title: str
    lecturer: str | None
    sort_order: int
    lms_id: int | None
    topics: tuple[Topic, ...]
    materials: tuple[Material, ...]  # kind: skipped already removed
    skipped: tuple[dict, ...]


def load(data_dir: Path) -> list[Course]:
    problems: list[str] = []
    courses_yaml = _read_yaml(data_dir / "courses.yaml", problems)
    manifest_yaml = _read_yaml(data_dir / "manifest.yaml", problems)
    if problems:
        raise ManifestError(problems)

    if not isinstance(courses_yaml, list):
        raise ManifestError(["courses.yaml must be a list of courses"])
    course_info: dict[str, tuple[int, dict]] = {}
    for i, c in enumerate(courses_yaml):
        code = str(c.get("code", ""))
        if not CODE_RE.match(code):
            problems.append(f"courses.yaml: bad course code {code!r} (expected e.g. CSC420)")
        elif code in course_info:
            problems.append(f"courses.yaml: {code} listed twice")
        elif not c.get("title"):
            problems.append(f"courses.yaml: {code} has no title")
        else:
            course_info[code] = (i + 1, c)

    manifest_courses = (manifest_yaml or {}).get("courses")
    if not isinstance(manifest_courses, dict):
        raise ManifestError(problems + ["manifest.yaml: missing 'courses' mapping"])

    seen_cmids: dict[int, str] = {}
    data_root = Path(os.path.abspath(data_dir))
    courses: list[Course] = []
    for code, cfg in manifest_courses.items():
        where = f"manifest.yaml {code}"
        if code not in course_info:
            problems.append(f"{where}: course is not in courses.yaml")
            continue
        topics: list[Topic] = []
        for t in cfg.get("topics") or []:
            topics.append(Topic(order=int(t["order"]), title=str(t["title"]).strip()))
        _check_unique(problems, where, "topic order", [t.order for t in topics])
        _check_unique(problems, where, "topic title", [t.title for t in topics])
        topic_titles = {t.title for t in topics}

        materials: list[Material] = []
        skipped: list[dict] = []
        for row in cfg.get("materials") or []:
            order = row.get("lms_order")
            mwhere = f"{where} lms_order {order}"
            kind = row.get("kind")
            if kind == SKIPPED:
                skipped.append(row)
                continue
            if kind not in KINDS:
                problems.append(f"{mwhere}: unknown kind {kind!r} (expected one of {', '.join(KINDS)}, skipped)")
                continue
            if not isinstance(order, int):
                problems.append(f"{mwhere}: lms_order must be a number")
                continue
            cmid = row.get("lms_cmid")
            if not isinstance(cmid, int):
                problems.append(f"{mwhere}: lms_cmid must be a number")
                continue
            if cmid in seen_cmids:
                problems.append(f"{mwhere}: lms_cmid {cmid} also used by {seen_cmids[cmid]}")
            seen_cmids[cmid] = mwhere

            rel = row.get("file")
            if not rel:
                problems.append(f"{mwhere}: kind {kind} needs a file (use kind: skipped for files not downloaded)")
                continue
            # abspath, not resolve: blocks '../' escapes without following symlinks.
            path = Path(os.path.abspath(data_root / rel))
            if data_root not in path.parents:
                problems.append(f"{mwhere}: file {rel} is outside data/")
                continue
            if not path.is_file():
                problems.append(f"{mwhere}: file not found: {rel}")
                continue
            if path.suffix.lower() not in SUPPORTED_SUFFIXES:
                problems.append(f"{mwhere}: unsupported file type {path.suffix} ({rel})")
                continue

            topic = row.get("topic")
            if topic is not None and topic not in topic_titles:
                problems.append(f"{mwhere}: topic {topic!r} is not in {code}'s topic list")
                continue

            materials.append(
                Material(
                    course=code,
                    order=order,
                    cmid=cmid,
                    section=row.get("lms_section"),
                    file=path,
                    rel_file=rel,
                    topic=topic,
                    kind=kind,
                    review=row.get("review"),
                    title_override=row.get("title"),
                )
            )
        _check_unique(problems, where, "lms_order", [m.order for m in materials])

        sort_order, info = course_info[code]
        courses.append(
            Course(
                code=code,
                title=str(info["title"]).strip(),
                lecturer=info.get("lecturer") or None,
                sort_order=sort_order,
                lms_id=info.get("lms_id"),
                topics=tuple(sorted(topics, key=lambda t: t.order)),
                materials=tuple(sorted(materials, key=lambda m: m.order)),
                skipped=tuple(skipped),
            )
        )

    if problems:
        raise ManifestError(problems)
    return sorted(courses, key=lambda c: c.sort_order)


def title_from_filename(stem: str) -> str:
    """'02-PAU-CSC420-Lecture1-Transactions-Indexing' -> 'Transactions Indexing'.

    Drops the order prefix, 'PAU', course codes and a leading 'Lecture N' when a real title
    follows it. A manifest row's `title:` overrides this.
    """
    s = re.sub(r"^\d+[-_ ]+", "", stem)
    words = [w for w in re.split(r"[-_ ]+", s) if w]
    words = [w for w in words if w.lower() != "pau" and not re.fullmatch(r"[A-Za-z]{3}\d{3}", w)]
    if words and re.fullmatch(r"(?i)lecture\d*", words[0]):
        rest = words[1:]
        if words[0].lower() == "lecture" and rest and rest[0].isdigit():
            rest = rest[1:]
        meaningful = [w for w in rest if w.lower() not in {"notes", "slides"}]
        if meaningful:
            words = rest
    title = " ".join(words) or stem
    return title[0].upper() + title[1:]


def _read_yaml(path: Path, problems: list[str]):
    if not path.is_file():
        problems.append(f"{path.name} not found in {path.parent}")
        return None
    try:
        return yaml.safe_load(path.read_text(encoding="utf-8"))
    except yaml.YAMLError as e:
        problems.append(f"{path.name}: invalid YAML: {e}")
        return None


def _check_unique(problems: list[str], where: str, label: str, values: list) -> None:
    dupes = sorted({v for v in values if values.count(v) > 1}, key=str)
    if dupes:
        problems.append(f"{where}: duplicate {label}: {', '.join(map(str, dupes))}")
