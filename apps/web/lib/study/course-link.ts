// Course links. A course is unique per (institution, programme, code): the same code can exist in
// several programmes. Links stay short (/study/CSC420) and add ?programme= only when the code is
// shared, so existing links keep working.

export interface LinkableCourse {
  code: string;
  programme: string;
}

/** Query parameters that pick this course; empty when its code is unique in `all`. */
export function courseParams(course: LinkableCourse, all: LinkableCourse[]): URLSearchParams {
  const shared = all.some((c) => c.code === course.code && c.programme !== course.programme);
  return new URLSearchParams(shared ? { programme: course.programme } : {});
}

export function courseHref(course: LinkableCourse, all: LinkableCourse[], extra?: Record<string, string>): string {
  const params = courseParams(course, all);
  for (const [k, v] of Object.entries(extra ?? {})) params.set(k, v);
  const qs = params.toString();
  return `/study/${course.code}${qs ? `?${qs}` : ""}`;
}

/** Which course /study/CODE means: ?programme= if given, else the student's department, else the first. */
export function resolveCourse<T extends LinkableCourse & { department: string }>(
  courses: T[],
  code: string,
  programme: string | undefined,
  department: string | null | undefined,
): T | undefined {
  const matches = courses.filter((c) => c.code === code);
  return (
    (programme && matches.find((c) => c.programme === programme)) ||
    (department && matches.find((c) => c.department === department)) ||
    matches[0]
  );
}
