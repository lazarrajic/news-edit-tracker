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
