import { diffArrays, diffWords } from 'diff';
import { normalise } from './normalise.js';

// if 2 para share >=50% of words they are the same para with edits. measurements showed = unrelated paras scored <0.2 - real edits >0.7
const SIMILARITY = 0.5; 
export const ENGINE_VERSION = `lcs-words-${SIMILARITY}`;

const words = (s) => s.split(/\s+/).filter(Boolean).length;

function similarity(a, b) {
  let same = 0;
  let total = 0;
  for (const part of diffWords(a, b)) {
    const n = words(part.value);
    total += n;
    if (!part.added && !part.removed) same += n;
  }
  return total === 0 ? 0 : same / total;
}
// diffArr sees edited para as delete + insert. this shows which are same para edited. 
function pairParagraphs(removed, added) {
  const candidates = [];
  removed.forEach((r, ri) =>
    added.forEach((a, ai) => {
      const score = similarity(r, a);
      if (score >= SIMILARITY) candidates.push({ ri, ai, score });
    })
  );
  candidates.sort((x, y) => y.score - x.score);

  const usedBefore = new Set();
  const usedAfter = new Set();
  const modified = [];
  for (const c of candidates) {
    if (usedBefore.has(c.ri) || usedAfter.has(c.ai)) continue;
    usedBefore.add(c.ri);
    usedAfter.add(c.ai);
    modified.push(c);
  }
  modified.sort((x, y) => x.ai - y.ai);

  return {
    modified,
    removedOnly: removed.map((p, i) => ({ p, i })).filter(({ i }) => !usedBefore.has(i)),
    addedOnly: added.map((p, i) => ({ p, i })).filter(({ i }) => !usedAfter.has(i)),
  };
}

export function diffVersions(before, after) {
  const headlineBefore = normalise(before.headline);
  const headlineAfter = normalise(after.headline);

  const a = normalise(before.body_text).split('\n\n');
  const b = normalise(after.body_text).split('\n\n');

  const operations = [];
  const counts = {
    paragraphsAdded: 0,
    paragraphsRemoved: 0,
    paragraphsModified: 0,
    charsAdded: 0,
    charsRemoved: 0,
  };

  const chunks = diffArrays(a, b);
  let bi = 0;
  let ai = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    if (!chunk.added && !chunk.removed) {
      bi += chunk.value.length;
      ai += chunk.value.length;
      continue;
    }

    const removed = chunk.removed ? chunk.value : [];
    let added = chunk.added ? chunk.value : [];
    if (chunk.removed && chunks[i + 1]?.added) {
      added = chunks[i + 1].value;
      i += 1;
    }

    const { modified, removedOnly, addedOnly } = pairParagraphs(removed, added);

    for (const m of modified) {
      const wordDiff = diffWords(removed[m.ri], added[m.ai]);
      operations.push({
        op: 'modify',
        index: ai + m.ai,
        before: removed[m.ri],
        after: added[m.ai],
        similarity: Number(m.score.toFixed(3)),
        words: wordDiff.filter((w) => w.added || w.removed),
      });
      counts.paragraphsModified += 1;
      for (const w of wordDiff) {
        if (w.added) counts.charsAdded += w.value.length;
        if (w.removed) counts.charsRemoved += w.value.length;
      }
    }

    for (const { p, i: idx } of removedOnly) {
      operations.push({ op: 'remove', index: bi + idx, text: p });
      counts.paragraphsRemoved += 1;
      counts.charsRemoved += p.length;
    }

    for (const { p, i: idx } of addedOnly) {
      operations.push({ op: 'add', index: ai + idx, text: p });
      counts.paragraphsAdded += 1;
      counts.charsAdded += p.length;
    }

    bi += removed.length;
    ai += added.length;
  }

  operations.sort((x, y) => x.index - y.index);

  return {
    engineVersion: ENGINE_VERSION,
    headlineChanged: headlineBefore !== headlineAfter,
    headline:
      headlineBefore === headlineAfter
        ? null
        : { before: headlineBefore, after: headlineAfter, words: diffWords(headlineBefore, headlineAfter).filter((w) => w.added || w.removed) },
    operations,
    counts,
  };
}
