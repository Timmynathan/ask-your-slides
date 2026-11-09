"""Load and validate the course data under data/.

Layout (one folder per institution; folders starting with "_" or "." are ignored):

  data/<institution>/catalog.yaml                      schools → programmes → levels → semesters → course codes
  data/<institution>/<school>/<programme>/<level>-level/<CODE>/
      course.yaml                                      identity: code, title, department, aliases, current_session
      <session>/manifest.yaml (+ <session>/slides/)    topics and materials for that session (source of truth)
      past_papers.yaml (+ past_papers/)                optional

A course is unique per (institution, programme, code): the same code (e.g. INS401) can exist in
several programmes with different files. Paths inside each YAML are relative to that file's folder.

Validation collects every problem and fails before anything is uploaded, so a typo never leaves a
half-ingested course.
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
SLUG_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
SESSION_RE = re.compile(r"^(\d{4})-(\d{4})$")
SEMESTER_RE = re.compile(r"^semester_([12])$")
PAPER_TYPES = ("exam", "test", "quiz", "project", "assignment", "other")


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
    course: str  # course code
    order: int  # manifest lms_order; unique per course; used for sorting and slide keys
    cmid: int  # LMS id; the material's stable identity within its course
    section: str | None
    file: Path
    rel_file: str  # relative to data/, e.g. pau/sst/computer-science/400-level/CSC420/2026-2027/slides/01-...pdf
    topic: str | None  # None = course-level
    kind: str
    review: str | None
    title_override: str | None


@dataclass(frozen=True)
class PastPaper:
    file: Path
    rel_file: str  # relative to data/
    session: str  # as written, e.g. 2025/2026
    type: str
    code_on_paper: str | None
    scanned: bool


@dataclass(frozen=True)
class Course:
    institution: str
    school: str
    programme: str
    code: str
    title: str
    department: str
    level: int
    semester: int
    session: str  # the session whose manifest is loaded (course.yaml current_session)
    aliases: tuple[str, ...]  # older codes for the same course, e.g. CSC403 → CSC420
    lecturer: str | None
    lms_course_id: int | None
    sort_order: int  # catalog order
    dir: Path
    topics: tuple[Topic, ...]
    materials: tuple[Material, ...]  # kind: skipped already removed
    skipped: tuple[dict, ...]
    past_papers: tuple[PastPaper, ...]

    @property
    def key(self) -> str:
        """Unique name: institution/programme/CODE."""
        return f"{self.institution}/{self.programme}/{self.code}"

    def matches(self, selector: str) -> bool:
        """CODE, programme/CODE or institution/programme/CODE (codes case-insensitive)."""
        parts = selector.strip().strip("/").split("/")
        parts[-1] = parts[-1].upper()
        return self.key.split("/")[-len(parts):] == parts


def load(data_dir: Path) -> list[Course]:
    """Every course in every data/<institution>/catalog.yaml, in catalog order."""
    data_root = Path(os.path.abspath(data_dir))
    problems: list[str] = []
    courses: list[Course] = []
    institutions = sorted(p for p in data_root.iterdir() if p.is_dir() and not _ignored(p.name)) if data_root.is_dir() else []
    catalogs = [p for p in institutions if (p / "catalog.yaml").is_file()]
    if not catalogs:
        raise ManifestError([f"no data/<institution>/catalog.yaml found in {data_root}"])
    for inst_dir in catalogs:
        courses += _load_institution(data_root, inst_dir, problems, start=len(courses))
    keys = [c.key for c in courses]
    _check_unique(problems, "catalog", "course", keys)
    if problems:
        raise ManifestError(problems)
    return courses


def _load_institution(data_root: Path, inst_dir: Path, problems: list[str], start: int) -> list[Course]:
    where = f"{inst_dir.name}/catalog.yaml"
    catalog = _read_yaml(inst_dir / "catalog.yaml", problems)
    if not isinstance(catalog, dict):
        if catalog is not None:
            problems.append(f"{where}: must be a mapping with institution and schools")
        return []
    inst = str((catalog.get("institution") or {}).get("id") or "")
    if inst != inst_dir.name:
        problems.append(f"{where}: institution.id is {inst!r} but the folder is {inst_dir.name!r}")
        return []

    courses: list[Course] = []
    listed: set[Path] = set()
    for school in catalog.get("schools") or []:
        sid = str(school.get("id") or "")
        if not SLUG_RE.match(sid):
            problems.append(f"{where}: bad school id {sid!r} (lowercase-with-dashes, e.g. sst)")
            continue
        for prog in school.get("programmes") or []:
            pid = str(prog.get("id") or "")
            if not SLUG_RE.match(pid):
                problems.append(f"{where}: bad programme id {pid!r} in {sid} (e.g. computer-science)")
                continue
            for level, semesters in (prog.get("levels") or {}).items():
                if not isinstance(level, int) or level % 100 or not 100 <= level <= 900:
                    problems.append(f"{where}: {pid}: bad level {level!r} (e.g. 400)")
                    continue
                for sem_key, sem in (semesters or {}).items():
                    m = SEMESTER_RE.match(str(sem_key))
                    if not m or not isinstance(sem, dict):
                        problems.append(f"{where}: {pid} {level}: bad semester {sem_key!r} (semester_1 or semester_2)")
                        continue
                    session = str(sem.get("session") or "")
                    if not _valid_session(session):
                        problems.append(f"{where}: {pid} {level} {sem_key}: bad session {session!r} (e.g. 2026-2027)")
                        continue
                    for code in sem.get("courses") or []:
                        code = str(code)
                        cwhere = f"{inst}/{pid}/{code}"
                        if not CODE_RE.match(code):
                            problems.append(f"{where}: {pid} {level}: bad course code {code!r} (e.g. CSC420)")
                            continue
                        course_dir = inst_dir / sid / pid / f"{level}-level" / code
                        listed.add(course_dir)
                        if not (course_dir / "course.yaml").is_file():
                            problems.append(f"{cwhere}: listed in the catalog but {_rel(data_root, course_dir)}/course.yaml is missing")
                            continue
                        course = _load_course(
                            data_root, course_dir, problems, cwhere,
                            expect={"institution": inst, "school": sid, "programme": pid, "code": code,
                                    "level": level, "semester": int(m.group(1))},
                            session=session, sort_order=start + len(courses) + 1,
                        )
                        if course:
                            courses.append(course)

    # A course folder on disk that the catalog doesn't list is almost always a forgotten catalog line.
    for course_yaml in inst_dir.rglob("course.yaml"):
        rel_parts = course_yaml.relative_to(inst_dir).parts
        if any(_ignored(p) for p in rel_parts):
            continue
        if course_yaml.parent not in listed:
            problems.append(f"{_rel(data_root, course_yaml.parent)}: has a course.yaml but isn't in {where} "
                            "(add it there, or rename the folder to start with _ to park it)")
    return courses


def _load_course(data_root: Path, course_dir: Path, problems: list[str], where: str, expect: dict,
                 session: str, sort_order: int) -> Course | None:
    n_before = len(problems)
    info = _read_yaml(course_dir / "course.yaml", problems)
    if not isinstance(info, dict):
        if info is not None:
            problems.append(f"{where}: course.yaml must be a mapping")
        return None
    for field, want in expect.items():
        got = info.get(field)
        if got is not None and str(got) != str(want):
            problems.append(f"{where}: course.yaml says {field}: {got!r} but its place in the catalog/folders says {want!r}")
    if not str(info.get("title") or "").strip():
        problems.append(f"{where}: course.yaml has no title")
    department = str(info.get("department") or "").strip()
    if not department:
        problems.append(f"{where}: course.yaml has no department (e.g. department: Computer Science)")
    current = str(info.get("current_session") or session)
    if current != session:
        problems.append(f"{where}: course.yaml current_session {current!r} but the catalog says {session!r}")
    aliases = [str(a) for a in info.get("aliases") or []]
    for a in aliases:
        if not CODE_RE.match(a):
            problems.append(f"{where}: bad alias {a!r} (an old course code, e.g. CSC403)")
    if expect["code"] in aliases:
        problems.append(f"{where}: aliases include the course's own code")
    lms_id = info.get("lms_course_id")
    if lms_id is not None and not isinstance(lms_id, int):
        problems.append(f"{where}: lms_course_id must be a number")
    if len(problems) > n_before:
        return None

    session_dir = course_dir / session
    manifest = _read_yaml(session_dir / "manifest.yaml", problems, missing=f"{where}: {session}/manifest.yaml not found")
    if not isinstance(manifest, dict):
        if manifest is not None:
            problems.append(f"{where}: {session}/manifest.yaml must be a mapping")
        return None
    mwhere = f"{where} {session}/manifest.yaml"
    if manifest.get("course") not in (None, expect["code"]):
        problems.append(f"{mwhere}: course is {manifest.get('course')!r}, expected {expect['code']}")
    if manifest.get("session") not in (None, session):
        problems.append(f"{mwhere}: session is {manifest.get('session')!r}, expected {session}")

    topics = [Topic(order=int(t["order"]), title=str(t["title"]).strip()) for t in manifest.get("topics") or []]
    _check_unique(problems, mwhere, "topic order", [t.order for t in topics])
    _check_unique(problems, mwhere, "topic title", [t.title for t in topics])
    topic_titles = {t.title for t in topics}

    materials: list[Material] = []
    skipped: list[dict] = []
    seen_cmids: dict[int, str] = {}
    for row in manifest.get("materials") or []:
        order = row.get("lms_order")
        rwhere = f"{mwhere} lms_order {order}"
        kind = row.get("kind")
        if kind == SKIPPED:
            skipped.append(row)
            continue
        if kind not in KINDS:
            problems.append(f"{rwhere}: unknown kind {kind!r} (expected one of {', '.join(KINDS)}, skipped)")
            continue
        if not isinstance(order, int):
            problems.append(f"{rwhere}: lms_order must be a number")
            continue
        cmid = row.get("lms_cmid")
        if not isinstance(cmid, int):
            problems.append(f"{rwhere}: lms_cmid must be a number")
            continue
        if cmid in seen_cmids:
            problems.append(f"{rwhere}: lms_cmid {cmid} also used by {seen_cmids[cmid]}")
        seen_cmids[cmid] = rwhere

        rel = row.get("file")
        if not rel:
            problems.append(f"{rwhere}: kind {kind} needs a file (use kind: skipped for files not downloaded)")
            continue
        path = _inside(course_dir, session_dir, str(rel), problems, rwhere)
        if path is None:
            continue
        if path.suffix.lower() not in SUPPORTED_SUFFIXES:
            problems.append(f"{rwhere}: unsupported file type {path.suffix} ({rel})")
            continue
        topic = row.get("topic")
        if topic is not None and topic not in topic_titles:
            problems.append(f"{rwhere}: topic {topic!r} is not in {expect['code']}'s topic list")
            continue
        materials.append(Material(
            course=expect["code"], order=order, cmid=cmid, section=row.get("lms_section"), file=path,
            rel_file=_rel(data_root, path), topic=topic, kind=kind, review=row.get("review"),
            title_override=row.get("title"),
        ))
    _check_unique(problems, mwhere, "lms_order", [m.order for m in materials])

    past_papers = _load_past_papers(data_root, course_dir, problems, where)

    if len(problems) > n_before:
        return None
    return Course(
        institution=expect["institution"], school=expect["school"], programme=expect["programme"], code=expect["code"],
        title=str(info["title"]).strip(), department=department, level=expect["level"], semester=expect["semester"],
        session=session, aliases=tuple(aliases), lecturer=info.get("lecturer") or None, lms_course_id=lms_id,
        sort_order=sort_order, dir=course_dir,
        topics=tuple(sorted(topics, key=lambda t: t.order)),
        materials=tuple(sorted(materials, key=lambda m: m.order)),
        skipped=tuple(skipped), past_papers=past_papers,
    )


def _load_past_papers(data_root: Path, course_dir: Path, problems: list[str], where: str) -> tuple[PastPaper, ...]:
    path = course_dir / "past_papers.yaml"
    if not path.is_file():
        return ()
    rows = _read_yaml(path, problems)
    pwhere = f"{where} past_papers.yaml"
    if rows is None:
        return ()
    if not isinstance(rows, list):
        problems.append(f"{pwhere}: must be a list of papers")
        return ()
    papers: list[PastPaper] = []
    for i, row in enumerate(rows, 1):
        rwhere = f"{pwhere} #{i}"
        if not isinstance(row, dict) or not row.get("file"):
            problems.append(f"{rwhere}: needs a file")
            continue
        file = _inside(course_dir, course_dir, str(row["file"]), problems, rwhere)
        if file is None:
            continue
        if file.suffix.lower() not in SUPPORTED_SUFFIXES:
            problems.append(f"{rwhere}: unsupported file type {file.suffix}")
            continue
        kind = row.get("type")
        if kind not in PAPER_TYPES:
            problems.append(f"{rwhere}: unknown type {kind!r} (expected one of {', '.join(PAPER_TYPES)})")
            continue
        session = str(row.get("session") or "")
        if not _valid_session(session.replace("/", "-")):
            problems.append(f"{rwhere}: bad session {session!r} (e.g. 2025/2026)")
            continue
        papers.append(PastPaper(
            file=file, rel_file=_rel(data_root, file), session=session, type=kind,
            code_on_paper=row.get("code_on_paper"), scanned=bool(row.get("scanned")),
        ))
    _check_unique(problems, pwhere, "file", [p.rel_file for p in papers])
    return tuple(papers)


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


def _ignored(name: str) -> bool:
    return name.startswith(("_", "."))


def _valid_session(s: str) -> bool:
    m = SESSION_RE.match(s)
    return bool(m) and int(m.group(2)) == int(m.group(1)) + 1


def _inside(course_dir: Path, base: Path, rel: str, problems: list[str], where: str) -> Path | None:
    """rel resolved against base; must be an existing file inside the course folder."""
    # abspath, not resolve: blocks '../' escapes without following symlinks.
    path = Path(os.path.abspath(base / rel))
    if course_dir not in path.parents:
        problems.append(f"{where}: file {rel} is outside the course folder")
        return None
    if not path.is_file():
        problems.append(f"{where}: file not found: {rel}")
        return None
    return path


def _rel(data_root: Path, path: Path) -> str:
    return path.relative_to(data_root).as_posix()


def _read_yaml(path: Path, problems: list[str], missing: str | None = None):
    if not path.is_file():
        problems.append(missing or f"{path.name} not found in {path.parent}")
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
