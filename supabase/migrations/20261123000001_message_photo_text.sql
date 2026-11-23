-- Chat memory (owner, 23 Nov 2026): photos sent in a chat aren't kept, but the text read from them is,
-- so a follow-up ("now do Question 3") still has the paper. Filled in after the answer by a quick read
-- (lib/uploads/read-photos.ts); only ever sent back to the model as part of this chat's history.
alter table public.messages add column if not exists photo_text text;
