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

// notice only counts if new in this version, else old correction makes every later edit on that article look declared
const detected = (d) => {
    const note = version.get(d.to_version_id).correction_note;
    return Boolean(note) && note !== version.get(d.from_version_id).correction_note;
};

section('notice detector vs hand label');
const both = edits.filter((e) => e.disclosure === 'annotated' && detected(e.diff));
const handOnly = edits.filter((e) => e.disclosure === 'annotated' && !detected(e.diff));
const detectorOnly = edits.filter((e) => e.disclosure !== 'annotated' && detected(e.diff));
console.log(`   both say annotated          ${both.length}`);
console.log(`   only my label says so       ${handOnly.length}${ids(handOnly)}`);
console.log(`   only the detector says so   ${detectorOnly.length}${ids(detectorOnly)}`);


const windowVersions = versions.filter((v) => v.captured_at <= CUTOFF);
// first time i saw each article, needed for both the article count and the capture delay
const firstCapture = new Map();
for (const v of windowVersions) {
    if (!firstCapture.has(v.article_id) || v.captured_at < firstCapture.get(v.article_id)) {
        firstCapture.set(v.article_id, v.captured_at);
    }
}
section('corpus in window');
console.log(`   versions            ${windowVersions.length}`);
console.log(`   articles            ${firstCapture.size}`);
const perArticle = count(edits.map((e) => e.diff.article_id));
const edited = Object.keys(perArticle).length;
console.log(`   articles ever edited            ${edited}   (${pct(edited / firstCapture.size)})`);
const timesEdited = count(Object.values(perArticle));
for (const n of Object.keys(timesEdited).sort((a,b) => a - b)) {
    console.log(`   edited ${n}x            ${timesEdited[n]}`);
}
const urls = count([...firstCapture.keys()].map((id) => article.get(id).url));
// same story under two article rows because rss reissued the guid
console.log(`   urls tracked under two rows ${Object.values(urls).filter((n) => n > 1).length}`);

// edits made before my first capture cant be seen so the silent rate is a minimum
section('publication -> first capture (hours)');
const gaps = [...firstCapture].filter(([id]) => article.get(id).published_at).map(([id, at]) => (new Date(at) - new Date(article.get(id).published_at)) / 3_600_000).sort((a,b) => a - b);
console.log(`   articles with a publish time ${gaps.length} of ${firstCapture.size}`);
console.log(`   median ${quantile(gaps, 0.5).toFixed(1)}    75th ${quantile(gaps, 0.75).toFixed(1)} 90th ${quantile(gaps, 0.9).toFixed(1)}  max ${gaps.at(-1).toFixed(1)}`);
console.log(`   within 1h ${pct(gaps.filter((g) => g <= 1).length / gaps.length)}   within 3h ${pct(gaps.filter((g) => g <= 3).length / gaps.length)}`);



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

function ids(items){
    return items.length ? ` (diffs ${items.map((e) => e.diff.id).join(', ')})` : '';
}

function quantile(sorted, q) {
    return sorted[Math.floor(q * (sorted.length - 1))];
}

function count(xs) {
    const out = {};
    for (const x of xs) out[x] = (out[x] ?? 0) + 1;
    return out;
}