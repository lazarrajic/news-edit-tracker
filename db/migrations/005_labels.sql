create table labels (
    id bigint generated always as identity primary key,

    -- no cascade unlike diffs, deleting labelled version should be refused. 
    from_version_id bigint not null references article_versions (id),
    to_version_id bigint not null references article_versions (id),

    edit_category text not null check (edit_category in
        ('trivial', 'stylistic', 'headline', 'addition', 'deletion', 'factual')),
    disclosure text not null check (disclosure in ('silent', 'annotated', 'unclear')),

    note text, 
    labelled_at timestamptz not null default now(),
    pass int not null default 1,
    unique (from_version_id, to_version_id, pass)

);

create index labels_pair_idx on labels (from_version_id, to_version_id);

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
alter table labels enable row level security;
