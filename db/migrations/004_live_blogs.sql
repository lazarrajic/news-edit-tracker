-- flagging live articles over deleting so they can be tracked. version vs article: checks against the stored articles version as they can start as regular articles and then chagne into a live a few version apart. 
alter table article_versions
    add column is_live_blog boolean not null default false;
