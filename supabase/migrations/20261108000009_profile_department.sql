-- The student's department, chosen at onboarding ("What are you studying?"). Courses already carry a
-- department; My courses shows the student's department's courses. Null = not chosen yet (students
-- who onboarded before this existed), which shows every course.
alter table public.profiles
  add column if not exists department text
  check (department in ('Computer Science', 'Engineering', 'Economics', 'Business Administration'));

-- Students set it themselves, like display_name and study_partner.
grant update (department) on public.profiles to authenticated;
