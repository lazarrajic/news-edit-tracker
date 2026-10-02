import { allLabels, diffsForReview, versionFacts, articleFacts } from './db.js';

const CATEGORIES = ['trivial', 'stylistic', 'addition', 'deletion', 'factual'];
const DISCLOSURES = ['silent', 'annotated', 'unclear'];
const CUTOFF = '2026-08-31T23:59:59Z';

const [labels, diffs, versions, articles] = await Promise.all([
    allLabels(),
    diffsForReview(),
    versionFacts(),
    articleFacts(),
    ]);

const version = new Map(versions.map((v) => [v.id, v]));
const article = new Map(articles.map((a) => [a.id, a]));
const pair = (x) => `${x.from_version_id}:${x.to_version_id}`;
const diffByPair = new Map(diffs.map((d) => [pair(d), d]));

const inWindow = diffs.filter((d) => version.get(d.to_version_id).captured_at <= CUTOFF);
const isLive = (d) => version.get(d.from_version_id).is_live_blog || version.get(d.to_version_id).is_live_blog;
const eligible = inWindow.filter((d) => !isLive(d));

const pass1 = labels.filter((l) => l.pass === 1);
const labelled = new Set(pass1.map(pair));
const unlabelled = eligible.filter((d) => !labelled.has(pair(d)));

// 2 article rows can hold the same edit 
const seen = new Map();
const duplicates = []; 
const edits = [];
for (const l of pass1) {
    const diff = diffByPair.get(pair(l));
    if (!diff) throw new Error(`label ${l.id} has no diff - diffs need recomputing`);
    const key = `${article.get(diff.article_id).url}|${JSON.stringify(diff.payload)}`;
    if (seen.has(key)) {
        duplicates.push(`${seen.get(key)}=${diff.id}`);
        continue;
    }
    seen.set(key, diff.id);
    edits.push({ diff, category: l.edit_category, disclosure: l.disclosure});
}

section('study window');
console.log(`   diffs up to ${CUTOFF.slice(0,10)}   ${inWindow.length}`);
console.log(`   live-blog diffs excluded    ${inWindow.length - eligible.length}`);
console.log(`   labelled (pass 1)  ${pass1.length} `);
console.log(`   duplicate edits dropped ${duplicates.length}    (diffs ${duplicates.join(',')})`);
console.log(`   edits analysed  ${edits.length}`);
if (unlabelled.length) console.log(`! ${unlabelled.length} eligible diffs never labelled: ${unlabelled.map((d) => d.id).join(', ')}`);

function section(title) {
    console.log(`\n${title}`);
}