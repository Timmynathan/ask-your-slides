-- Department per course (e.g. "Computer Science"), so nothing in the app hard-codes one.
-- Set by ingestion from data/courses.yaml. Existing rows are the final-year CS courses.
alter table public.courses add column department text;
update public.courses set department = 'Computer Science' where department is null;
alter table public.courses alter column department set not null;
