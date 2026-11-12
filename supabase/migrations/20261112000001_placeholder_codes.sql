-- More programmes (Nov 2026): some LMS courses show no course code, so the catalog gives them a
-- placeholder (IOH-ETHICS, BUA-COMPANY-LAW) and course.yaml says code_confirmed: false. The app
-- shows only the title for those.
--
-- Code: a real code (CSC420, GET501) or a placeholder whose parts start with a letter, so a slide
-- key CODE-<order>-<number> still splits unambiguously. Keep in step with ingestion/manifest.py
-- (CODE_RE) and apps/web/lib/study/course-code.ts.

alter table public.courses drop constraint if exists courses_code_check;
alter table public.courses add constraint courses_code_check
  check (code ~ '^[A-Z]{2,4}([0-9]{3}|(-[A-Z][A-Z0-9]*)+)$');

alter table public.slides drop constraint if exists slides_slide_key_check;
alter table public.slides add constraint slides_slide_key_check
  check (slide_key ~ '^[A-Z]{2,4}([0-9]{3}|(-[A-Z][A-Z0-9]*)+)-[0-9]{2,3}-[0-9]{1,3}$');

-- false = placeholder code: never shown to students.
alter table public.courses add column code_confirmed boolean not null default true;
