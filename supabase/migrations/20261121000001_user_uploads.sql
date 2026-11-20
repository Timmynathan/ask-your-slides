-- Students' own uploads (owner, 20 Nov 2026): photos of tests and notes, or PDFs, for one of their
-- courses. The app reads each page into text (Claude), splits it into chunks with embeddings (Voyage),
-- and that student's chats in that course search them alongside the slides. Private to the student:
-- they can read and delete their own; only the server (service role) writes. Files live in the private
-- "uploads" bucket under <user_id>/<upload_id>/.

create table public.user_uploads (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  course_id   uuid not null references public.courses(id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 120),
  kind        text not null check (kind in ('photos', 'pdf')),
  files       text[] not null default '{}',   -- storage paths, in page order
  pages       int not null default 0,
  status      text not null default 'uploading' check (status in ('uploading', 'reading', 'ready', 'failed')),
  error       text,
  cost_usd    numeric(10, 5),
  created_at  timestamptz not null default now()
);
create index user_uploads_user_idx on public.user_uploads (user_id, created_at desc);

create table public.user_upload_chunks (
  id          uuid primary key default gen_random_uuid(),
  upload_id   uuid not null references public.user_uploads(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  course_id   uuid not null references public.courses(id) on delete cascade,
  page        int not null,
  chunk_text  text not null,
  embedding   extensions.vector(1024) not null
);
create index user_upload_chunks_lookup_idx on public.user_upload_chunks (user_id, course_id);

alter table public.user_uploads enable row level security;
alter table public.user_upload_chunks enable row level security;
create policy "own uploads: read" on public.user_uploads for select to authenticated using (user_id = auth.uid());
create policy "own uploads: delete" on public.user_uploads for delete to authenticated using (user_id = auth.uid());
grant select, delete on public.user_uploads to authenticated;
-- Chunks are read only by the server (the chat), never by the browser.

-- The student's own notes for a course that best match a question (vector search; the server passes
-- the student, so this is callable by the service role only).
create or replace function public.match_user_notes(
  p_user_id uuid,
  p_course_id uuid,
  p_query_embedding extensions.vector(1024),
  p_k int default 3
)
returns table (upload_id uuid, title text, kind text, page int, chunk_text text, similarity double precision)
language sql
stable
set search_path = ''
as $$
  select c.upload_id, u.title, u.kind, c.page, c.chunk_text,
         1 - (c.embedding operator(extensions.<=>) p_query_embedding) as similarity
  from public.user_upload_chunks c
  join public.user_uploads u on u.id = c.upload_id and u.status = 'ready'
  where c.user_id = p_user_id and c.course_id = p_course_id
  order by c.embedding operator(extensions.<=>) p_query_embedding
  limit greatest(1, least(p_k, 8));
$$;
revoke all on function public.match_user_notes(uuid, uuid, extensions.vector, int) from public, anon, authenticated;

-- The private bucket for the files themselves (the server uploads via signed URLs and reads them back).
insert into storage.buckets (id, name, public, file_size_limit)
values ('uploads', 'uploads', false, 15728640)
on conflict (id) do nothing;
