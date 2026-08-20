import { createClient } from '@supabase/supabase-js';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
}

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function unwrap({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

export async function addNewArticles(rows) {
  return unwrap(
    await db
      .from('articles')
      .upsert(rows, { onConflict: 'outlet,guid', ignoreDuplicates: true })
      .select('id')
  );
}

export async function dueArticles(limit) {
  return unwrap(
    await db
      .from('articles')
      .select('id, url, published_at, first_seen_at')
      .not('next_check_at', 'is', null)
      .lte('next_check_at', new Date().toISOString())
      .order('next_check_at', { ascending: true })
      .limit(limit)
  );
}

export async function latestHash(articleId) {
  const rows = unwrap(
    await db
      .from('article_versions')
      .select('content_hash')
      .eq('article_id', articleId)
      .order('captured_at', { ascending: false })
      .limit(1)
  );
  return rows[0]?.content_hash ?? null;
}

export async function insertVersion(row) {
  const rows = unwrap(await db.from('article_versions').insert(row).select('id'));
  return rows[0].id;
}

export async function logFetch(row) {
  unwrap(await db.from('fetches').insert(row));
}

export async function updateArticle(id, patch) {
  unwrap(await db.from('articles').update(patch).eq('id', id));
}

// supabase caps reads at 1000 rows silently so keep asking until return <1000 = done. 
async function all(table, columns, order) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    let q = db.from(table).select(columns).range(from, from + 999);
    for (const col of order) q = q.order(col);
    const page = unwrap(await q);
    rows.push(...page);
    if (page.length <1000) return rows;
  }
}

export async function allVersions() {
  return all('article_versions', 'id, article_id, captured_at, headline, body_text', [
    'article_id',
    'captured_at',
  ]);
}

export async function diffedPairs(engineVersion) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const page = unwrap(
      await db
      .from('diffs')
      .select('from_version_id, to_version_id')
      .eq('engine_version', engineVersion)
      .range(from, from + 999)
    );
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return new Set(rows.map((r) => `${r.from_version_id}:${r.to_version_id}`));
}
    
export async function upsertDiff(row) {
  unwrap(await db.from('diffs').upsert(row, { onConflict: 'from_version_id,to_version_id' }));
}
