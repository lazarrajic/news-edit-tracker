const classify = () => 'addition';

import { categoryLabels, diffsForReview, versionTimes, articleURLs } from './db.js';

const CATEGORIES = ['trivial', 'stylistic', 'addition', 'deletion', 'factual'];

//split by time not random. 
const SPLIT = '2026-08-21T00:00:00Z';

const which = process.argv[2] ?? 'train';
if (!['train', 'test'].includes(which)) throw new Error(`${which} - use train or test`);

const [labels, diffs, times, urls] = await Promise.all([
    categoryLabels(1),
    diffsForReview(),
    versionTimes(),
    articleURLs(),
]);

const diffByPair = new Map(diffs.map((d) => [`${d.from_version_id}:${d.to_version_id}`, d]));

// rss guids ger reissued so one real edit can sit under two article rows. same url and same change means it was one edit. 
const seen = new Map();
const duplicates = [];
const rows = [];
for (const l of labels) {
    const diff = diffByPair.get(`${l.from_version_id}:${l.to_version_id}`);
    if (!diff) throw new Error(`label ${l.id} has no diff`);
    const key = `${urls.get(diff.article_id)}|${JSON.stringify(diff.payload)}`;
    if (seen.has(key)) {
        duplicates.push(`${seen.get(key)}=${diff.id}`);
        continue;
    }
    seen.set(key, diff.id);
    rows.push({diff, truth: l.edit_category, train: times.get(diff.to_version_id) < SPLIT});
}

//the baseline always comes from the training part, even when scoring test part. 
const trainCounts = count(rows.filter((r) => r.train).map((r) => r.truth));
const majority = CATEGORIES.reduce((a, b) => (trainCounts[b] > trainCounts[a] ? b : a));

const scored = rows.filter((r) => r.train === (which === 'train')).map((r) => ({...r, guess: classify(r.diff.payload)}));

console.log(`${labels.length} labels, ${duplicates.length} duplicates dropped (diffs ${duplicates.join(', ')}), ${rows.length} edits`);
console.log(`scoring ${which}: ${scored.length} edits\n`);

console.log('per category rules baseline (always ' + majority + ')');
console.log(' n precision recall precision recall');

for (const c of CATEGORIES) {
const r = score(scored, c, (x) => x.guess);
const b = score(scored, c, () => majority);
console.log(`  ${c.padEnd(10)} ${String(r.n).padStart(3)}   ${pct(r.precision)}  ${pct(r.recall)}   ${pct(b.precision)}  ${pct(b.recall)}`);
}

// console.log(`${labels.length} labels, ${duplicates.length} duplicates dropped (diffs ${duplicates.join(', ')}), ${rows.length} edits`);
// console.log(`scoring ${which}: ${scored.length} edits\n`);

console.log('\nconfusion - rows are your label, columns are what the rules said');
console.log( ' ' + CATEGORIES.map((c) => c.slice(0, 5).padStart(6)).join(''));
for (const truth of CATEGORIES) {
    const cells = CATEGORIES.map((g) =>
    String(scored.filter((x) => x.truth === truth && x.guess === g).length).padStart(6)
);
console.log(`${truth.padEnd(10)}${cells.join('')}`);
}

// rare class carries the finding, so every mistake on it gets looked at by hand 
console.log('\nfactual mistakes');
for (const x of scored.filter((x) => (x.truth === 'factual') !== (x.guess === 'factual'))) {
    console.log(` diff ${x.diff.id} you: ${x.truth.padEnd(9)} rules: ${x.guess.padEnd(9)} url: ${urls.get(x.diff.article_id)}`);
}

function score(items, c, guessOf) {
    const tp = items.filter((x) => x.truth === c && guessOf(x) === c).length;
    const predicted = items.filter((x) => guessOf(x) === c).length;
    const n = items.filter((x) => x.truth === c).length;
    return { n, precision: predicted ? tp / predicted : null, recall: n ? tp / n : null };
}

function count(xs) {
    return Object.fromEntries(CATEGORIES.map((c) => [c, xs.filter((x) => x === c).length]));
}

function pct(v) {
    return v === null ? '    -' : `${Math.round(v * 100)}%`.padStart(4);
}