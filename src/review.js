import { diffWords } from 'diff';
import { createInterface } from 'node:readline/promises';
import {
  diffsForReview,
  labelledPairs,
  liveBlogVersions,
  insertLabel,
  versionTimes,
  articleURLs,
} from './db.js';

const CATEGORIES = {
  t: 'trivial',
  s: 'stylistic',
  a: 'addition',
  d: 'deletion',
  f: 'factual',
};

const DISCLOSURE = { s: `silent`, a: `annotated`, u: `unclear`};

//labelling set to stop at one month worth of data. colelctor keeps running but those are out of scope.
const CUTOFF = '2026-08-31T23:59:59Z';

// bands so i can label by kind of edit not id order.
const BANDS = { 
    headline: (d) => d.headline_changed && !d.paragraphs_modified && !d.paragraphs_added && !d.paragraphs_removed, 
    reword: (d) => d.paragraphs_modified >0, 
    addition: (d) => d.paragraphs_added > 0 && !d.paragraphs_modified && !d.paragraphs_removed, 
    deletion: (d) => d.paragraphs_removed > 0 && !d.paragraphs_modified, 
    all: () => true,
};

const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

// payload only has changed words, i need to see unchanged ones on screen too.
function inline(before, after) {
    return diffWords(before, after).map((p) => (p.added ? green(p.value) : p.removed ? red(p.value) : p.value)).join('');

}

function render(diff, times, urls, position) {
    const { headline, operations } = diff.payload;
    const from = times.get(diff.from_version_id)?.slice(0,16).replace('T', ' ');
    const to = times.get(diff.to_version_id)?.slice(0,16).replace('T', ' ');

    console.clear();
    console.log(bold(`── ${position} ── diff ${diff.id}`));
    console.log(dim(`${urls.get(diff.article_id) ?? ''}`));
    console.log(dim(`${from}  →  ${to}`));
    console.log();

    if (headline) {
    console.log(bold('HEADLINE'));
    console.log(`  ${inline(headline.before, headline.after)}`);
    console.log();
  }

   for (const op of operations) {
    if (op.op === 'modify') {
      console.log(bold(`¶${op.index} modified`) + dim(` similarity ${op.similarity}`));
      console.log(`  ${inline(op.before, op.after)}`);
    } else if (op.op === 'add') {
      console.log(bold(`¶${op.index} added`));
      console.log(`  ${green(op.text)}`);
    } else {
      console.log(bold(`¶${op.index} removed`));
      console.log(`  ${red(op.text)}`);
    }
    console.log();
  }

  console.log(dim(`+${diff.chars_added} / -${diff.chars_removed} chars`));
}

function keypress(valid) {
    return new Promise((resolve) => {
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.setEncoding('utf8');

        const done = (value) => {
            process.stdin.off('data', onData);
            process.stdin.setRawMode(false);
            process.stdin.pause();
            resolve(value);
        }

        const onData = (key) => {
            if (key === '\u0003') {
                done(null);
                process.exit(130);
            }
            const k = key.toLowerCase();
            if (valid.includes(k)) done(k);
        }
        process.stdin.on('data', onData);
    })
}
    async function readNote() {
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        const note = await rl.question('  note: ');
        rl.close();
        return note.trim() || null;
    }


const [bandName = 'all', limitArg] = process.argv.slice(2);
const band = BANDS[bandName];
if (!band) throw new Error(`unknown band '${bandName}' — one of ${Object.keys(BANDS).join(', ')}`);
const limit = Number(limitArg) || Infinity;

const PASS = Number(process.env.LABEL_PASS ?? 1);

const [diffs, done, live, times, urls] = await Promise.all([
    diffsForReview(),
    labelledPairs(PASS),
    liveBlogVersions(),
    versionTimes(),
    articleURLs(),
]);

const isLive = (d) => live.has(d.from_version_id) || live.has(d.to_version_id);
const excluded = diffs.filter(isLive).length;

const queue = diffs.filter((d) => !isLive(d)).filter((d) => times.get(d.to_version_id) <= CUTOFF).filter(band).filter((d) => !done.has(`${d.from_version_id}:${d.to_version_id}`)).slice(0, limit);
console.log(`${excluded} live-blog diffs excluded`);
console.log(`${queue.length} unlabelled in band '${bandName}' (pass ${PASS})`);
if (!queue.length) process.exit(0);

let labelled = 0;

for (const [i, diff] of queue.entries()) {
  render(diff, times, urls, `${i + 1}/${queue.length}`);

  console.log();
  console.log('  [t]rivial [s]tylistic [a]ddition [d]eletion [f]actual   [space] skip  [q] quit');
  const c = await keypress([...Object.keys(CATEGORIES), ' ', 'q']);
  if (c === 'q') break;
  if (c === ' ') continue;

  console.log('  [s]ilent [a]nnotated [u]nclear');
  const p = await keypress([...Object.keys(DISCLOSURE), 'q']);
  if (p === 'q') break;

  console.log('  [n] add a note, any other key to continue');
  const wantsNote = await keypress(['n', ' ', '\r']);
  const note = wantsNote === 'n' ? await readNote() : null;

  await insertLabel({
    from_version_id: diff.from_version_id,
    to_version_id: diff.to_version_id,
    edit_category: CATEGORIES[c],
    disclosure: DISCLOSURE[p],
    note,
    pass: PASS,
  });

  labelled += 1;
}

console.log(`\n${labelled} labelled this session`);
process.exit(0);
