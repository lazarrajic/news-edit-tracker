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

// rss can give the same story a new guid so one edit can sit under 2 article rows 
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

section('category x disclosure');
console.log('               ' + DISCLOSURES.map((d) => d.padStart(10)).join('') + '     total');
for (const c of CATEGORIES) {
    const cells = DISCLOSURES.map((d) => String(edits.filter((e) => e.category === c && e.disclosure === d).length).padStart(10));
    console.log(`   ${c.padEnd(10)}  ${cells.join('')}${String(edits.filter((e) => e.category === c).length).padStart(10)}`);
}
const totals = DISCLOSURES.map((d) => String(edits.filter((e) => e.disclosure === d).length).padStart(10));
console.log(`   ${'TOTAL'.padEnd(10)}  ${totals.join('')}${String(edits.length).padStart(10)}`);

section('silent rate (95% wilson interval)');
rate('factual', (e) => e.category === 'factual');
rate('factual + deletion', (e) => e.category === 'factual' || e.category === 'deletion');
rate('every edit', () => true);


function section(title) {
    console.log(`\n${title}`);
}


function rate(name, include) {
    const group = edits.filter(include);
    const silent = group.filter((e) => e.disclosure === 'silent').length;
    const n = group.filter((e) => e.disclosure !== 'unclear').length;
    const unclear = group.length - n;
    const [lo, hi] = wilson(silent, n);
    console.log(`   ${name.padEnd(20)} ${silent}/${n} silent = ${pct(silent / n)}   CI ${pct(lo)}-${pct(hi)}` + (unclear ? `    (${unclear} unclear left out)` : ''));
}

// with only around 30 cases the simple formula gives a range thats too narrow
function wilson(k, n, z = 1.96) {
    const p = k / n;
    const centre = (p + (z * z) / (2 * n)) / (1 + (z * z) / n);
    const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / (1 + (z * z) / n);
    return [centre - half, centre + half];
}

function pct(v) {
    return `${Math.round(v * 100)}%`;
}