import Parser from 'rss-parser';
import { rnz } from './outlets/rnz.js';
import { contentHash } from './normalise.js';
import { nextCheckAt } from './schedule.js';
import { fetchPage, sleep, USER_AGENT } from './http.js';
import {
  addNewArticles,
  dueArticles,
  insertVersion,
  latestHash,
  logFetch,
  updateArticle,
} from './db.js';

const BUDGET_MS = 25 * 60_000;
const MAX = Number(process.argv.find((a) => a.startsWith('--max='))?.split('=')[1] ?? Infinity);

const outlet = rnz;
const deadline = Date.now() + BUDGET_MS;
const stats = { checked: 0, versions: 0, failed: 0 };

await discover();
await recheck();

console.log(
  `${outlet.slug}: ${stats.checked} checked, ${stats.versions} versions, ${stats.failed} failed`
);

if (stats.checked > 0 && stats.failed / stats.checked > 0.5) {
  console.error('over half of fetches failed');
  process.exit(1);
}


async function discover() {
  const parser = new Parser({ headers: { 'user-agent': USER_AGENT } });
  const now = new Date().toISOString();

  for (const feedUrl of outlet.feeds) {
    const feed = await parser.parseURL(feedUrl);
 
    const usable = feed.items.filter((item) => item.link && item.guid);
    const skips = {};
    const articles = usable.filter((item) => {
      const reason = outlet.skipReason(item);
      if (reason) skips[reason] = (skips[reason] ?? 0) + 1;
      return !reason;
    });

    const rows = articles.map((item) => ({
      outlet: outlet.slug,
      guid: item.guid,
      url: item.link,
      published_at: item.isoDate ?? null,
      next_check_at: now,
    }));
    const added = await addNewArticles(rows);
    const skipped = Object.entries(skips).map(([r, n]) => `${n} ${r}`).join(', ') || 'none';
    console.log(
      `${feedUrl}: ${feed.items.length} items, ${added.length} new, skipped: ${skipped}`
    );
    await sleep(outlet.crawlDelayMs);
  }
}

async function recheck() {
  while (Date.now() < deadline && stats.checked < MAX) {
    const batch = await dueArticles(Math.min(20, MAX - stats.checked));
    if (batch.length === 0) return;

    for (const article of batch) {
      if (Date.now() >= deadline || stats.checked >= MAX) return;
      await check(article);
      await sleep(outlet.crawlDelayMs);
    }
  }
}

async function check(article) {
  stats.checked += 1;
  const scheduled = nextCheckAt(article.published_at ?? article.first_seen_at);

  let page;
  try {
    page = await fetchPage(article.url);
  } catch (err) {
    stats.failed += 1;
    console.error(`fetch failed ${article.url}: ${err.message}`);
    await logFetch({ article_id: article.id, error: err.message });
    await updateArticle(article.id, { next_check_at: scheduled });
    return;
  }

  const patch = { next_check_at: scheduled };
  if (page.finalUrl !== article.url) patch.url = page.finalUrl;

  if (!page.html) {
    stats.failed += 1;
    console.error(`http ${page.status} ${article.url}`);
    await logFetch({ article_id: article.id, http_status: page.status, etag: page.etag });
    await updateArticle(article.id, patch);
    return;
  }

  let extracted;
  try {
    extracted = outlet.extract(page.html);
  } catch (err) {
    stats.failed += 1;
    console.error(`extract failed ${article.url}: ${err.message}`);
    await logFetch({
      article_id: article.id,
      http_status: page.status,
      etag: page.etag,
      error: err.message,
    });
    await updateArticle(article.id, patch);
    return;
  }

  const hash = contentHash(extracted.headline, extracted.bodyText);
  const previous = await latestHash(article.id);

  let versionId = null;
  if (hash !== previous) {
    versionId = await insertVersion({
      article_id: article.id,
      headline: extracted.headline,
      body_text: extracted.bodyText,
      body_html: extracted.bodyHtml,
      correction_note: extracted.correctionNote,
      content_hash: hash,
    });
    stats.versions += 1;
    console.log(`${previous ? 'EDIT' : 'first'}  ${extracted.headline}`);
  }

  await logFetch({
    article_id: article.id,
    http_status: page.status,
    etag: page.etag,
    content_hash: hash,
    version_id: versionId,
  });
  await updateArticle(article.id, patch);
}
