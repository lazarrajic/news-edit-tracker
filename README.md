# NZ News Edit Tracker

Software that collects RNZ articles and every later version of them, finds each edit, and labels it on two separate scales: how substantive the change was, and whether it came with a correction notice.

## Requirements

- Node.js 22.9 or newer (needed for --env-file-if-exists)
- A Supabase project (free tier)

## Install

```
git clone https://github.com/lazarrajic/news-edit-tracker.git
cd news-edit-tracker
npm install
```

## Database setup

Every change to the database is a numbered SQL migration file. Run them in the Supabase SQL Editor, in order:

```
db/migrations/001_init.sql to 006_drop_headline_category.sql
```

## Configuration

```
cp .env.example .env
```

Fill in SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from your Supabase project settings.

## Running it

Each stage reads what the previous stage stored in the database, so they run in this order:

```
npm run poll                     collect: discover new articles and re-check due ones
npm run flag-live                flag live-blog versions
npm run backfill-notices         re-run the correction notice detector over every stored version
npm run diff                     compare each version with the one before it
npm run review [band] [limit]    label one edit at a time in the terminal
npm run evaluate [train|test]    score the classifier
npm run analyse                  recompute every result from the database
```

## Scheduled collection

The collector runs as a GitHub Actions workflow (.github/workflows/collect.yml), epast. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY as repository secrets.

## Reproducing the results

Labelling, evaluation and analysis are tied to the study window (31 July to 31 Augels in the original database. A fresh install can collect and diff, but it won'treproduce the results. The results are in the report.
