create table articles (
    id            bigint generated always as identity primary key,
    outlet        text not null check (outlet in ('rnz', 'stuff', 'nzherald', 'newsroom')),

    -- Id is guid not URL protecting against url changes.
    guid          text not null,
    url           text not null,

    published_at  timestamptz,
    first_seen_at timestamptz not null default now(),
    next_check_at timestamptz,  -- null when the article leaves the tracking window

    unique (outlet, guid)
);

create index articles_due_idx on articles (next_check_at) where next_check_at is not null;

create table article_versions (
    id           bigint generated always as identity primary key,
    article_id   bigint not null references articles (id) on delete cascade,
    captured_at  timestamptz not null default now(),

    headline     text not null,
    body_text    text not null,
    body_html    text not null, 
    correction_note text,

    content_hash text not null
);

-- keep articles edited and reverted
create index article_versions_article_idx on article_versions (article_id, captured_at);

-- Save every fetch, even if unchanged. 
create table fetches (
    id           bigint generated always as identity primary key,
    article_id   bigint not null references articles (id) on delete cascade,
    fetched_at   timestamptz not null default now(),

    http_status  int,
    etag         text,
    content_hash text,
    version_id   bigint references article_versions (id) on delete set null,
    error        text
);

create index fetches_article_idx on fetches (article_id, fetched_at desc);

alter table articles enable row level security;
alter table article_versions enable row level security;
alter table fetches enable row level security;
