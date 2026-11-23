-- Which prompt produced each answer (owner, 23 Nov 2026): a fingerprint of the fixed prompt (core rules,
-- calculation rules, turn reminder, tool descriptions; lib/agent/prompt-version.ts) and the situation
-- notes added that turn, so answer quality can be compared before and after a prompt change.
alter table public.traces add column if not exists prompt_version text;
alter table public.traces add column if not exists prompt_notes text[];
create index if not exists traces_prompt_version_idx on public.traces (prompt_version, created_at);
