import { diffVersions, ENGINE_VERSION } from './diff.js';
import { allVersions, diffedPairs, upsertDiff } from './db.js';

const versions = await allVersions();
const done = await diffedPairs(ENGINE_VERSION);

const byArticle = {};
for (const v of versions) (byArticle[v.article_id] ??= []).push(v);

let computed = 0;
let skipped = 0;

for (const [articleId, vs] of Object.entries(byArticle)) {
  // Oldest first, each pair is the state before and after an edit.
  vs.sort((x, y) => x.captured_at.localeCompare(y.captured_at));

  for (let i = 1; i < vs.length; i++) {
    const before = vs[i - 1];
    const after = vs[i];

    if (done.has(`${before.id}:${after.id}`)) {
      skipped += 1;
      continue;
    }

    const d = diffVersions(before, after);

    await upsertDiff({
      article_id: Number(articleId),
      from_version_id: before.id,
      to_version_id: after.id,
      // recomp row shows recomp date not when first made.
      computed_at: new Date().toISOString(),
      engine_version: d.engineVersion,
      headline_changed: d.headlineChanged,
      paragraphs_added: d.counts.paragraphsAdded,
      paragraphs_removed: d.counts.paragraphsRemoved,
      paragraphs_modified: d.counts.paragraphsModified,
      chars_added: d.counts.charsAdded,
      chars_removed: d.counts.charsRemoved,
      payload: { headline: d.headline, operations: d.operations },
    });

    computed += 1;
  }
}

console.log(`${ENGINE_VERSION}: ${computed} computed, ${skipped} already current`);
