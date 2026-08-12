create table diffs (
    id             bigint generated always as identity primary key,
    article_id     bigint not null references articles (id) on delete cascade,

    from_version_id bigint not null references article_versions (id) on delete cascade,
    to_version_id   bigint not null references article_versions (id) on delete cascade,

    computed_at    timestamptz not null default now(),
    engine_version text not null,

    headline_changed boolean not null,

    paragraphs_added    int not null,
    paragraphs_removed  int not null,
    paragraphs_modified int not null,
    chars_added         int not null,
    chars_removed       int not null,


    payload jsonb not null,


    unique (from_version_id, to_version_id)
);

create index diffs_article_idx on diffs (article_id);

create index diffs_size_idx on diffs (chars_added, chars_removed);

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
alter table diffs enable row level security;