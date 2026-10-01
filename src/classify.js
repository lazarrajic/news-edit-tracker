import { findCorrectionNote } from "./outlets/rnz.js";


// one side has to outweigh the other this many times to count as mostly add/removed
const DOMINANT = 2; 
// a small edit in a paragraph, not a rewrite. 
const TARGETED = 0.8;
const HEADLINE_TARGETED_WORDS = 4;

// <=2 letters = mispelling.
const SPELLING = 2;

const MALE = new Set(['he', 'him', 'his', 'himself']);
const FEMALE = new Set(['she', 'her', 'hers', 'herself']);

const isNotice = (p) => findCorrectionNote([p]) !== null;

// from a list of changed bits pull out the single workds on one side
const tokens = (parts, side) => parts.filter((p) => p[side]).flatMap((p) => p.value.split(/\s+/)).filter(Boolean);
const hasDigit = (t) => /\d/.test(t);

// keep only the digits
const digits = (ts) => ts.join('').replace(/\D/g, '')

const bare = (t) => t.replace(/[^\p{L}\p{N}]/gu, '');
const isCapitalised = (t) => /^\p{Lu}/u.test(bare(t));

const word = (t) => bare(t).toLowerCase();

// how many single letter changes turn a into b.
function distance(a,b) {
    let prev = Array.from({length: b.length + 1}, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        const cur = [i];
        for (let j = 1; j <= b.length; j++) {
            cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        }
        prev = cur;
    }
    return prev[b.length];
}

// every word that went out came back with only small spelling change 
const respelled = (out, inn) => out.length === inn.length && out.every((t, i) => distance(word(t), word(inn[i])) <= SPELLING);

// one changed spot: what words went out, what came in
function swap(parts) {
    const out = tokens(parts, 'removed');
    const inn = tokens(parts, 'added');
    const outSet = new Set(out.map(word));
    const inSet = new Set(inn.map(word));
    // capitalised words that left and didn't come back, and ones that are new
    const namesOut = out.filter((t) => isCapitalised(t) && !inSet.has(word(t)));
    const namesIn = inn.filter((t) => isCapitalised(t) && !outSet.has(word(t)));
    return {
        numberSwap: out.some(hasDigit) && inn.some(hasDigit) && digits(out) !== digits(inn),
        nameSwap: namesOut.length > 0 && namesIn.length > 0 && !respelled(namesOut, namesIn),
        pronounSwap:
            (out.some((t) => MALE.has(word(t))) && inn.some((t) => FEMALE.has(word(t)))) ||
            (out.some((t) => FEMALE.has(word(t))) && inn.some((t) => MALE.has(word(t)))),
        typo: respelled(out, inn),
        words: out.length + inn.length,
    };
}

// notice paragraph is the discolure. if rules can see it they find declared ones easy and miss silent ones - trying to avoid bias. 
export function withoutNotices(payload) {
    return { 
        headline: payload.headline,
        operations: payload.operations.filter((op) => 
        op.op === 'modify' ? !isNotice(op.before) && !isNotice(op.after) : !isNotice(op.text)),
    };
}

export function features(payload) {
    const { headline, operations } = withoutNotices(payload);
    const modifies = operations.filter((op) => op.op === 'modify');
    const swaps = modifies.map((op) => swap(op.words));
    const targeted = modifies.filter((op) => op.similarity >= TARGETED).map((op) => swap(op.words));
    if (headline) {
        const h = swap(headline.words);
        swaps.push(h);
        if (h.words <= HEADLINE_TARGETED_WORDS) targeted.push(h);
}


    let charsAdded = 0;
    let charsRemoved = 0;
    for (const op of operations) {
        if (op.op === 'add') charsAdded += op.text.length;
        if (op.op === 'remove') charsRemoved += op.text.length;
        if (op.op === 'modify') {
            for(const w of op.words) {
                if (w.added) charsAdded += w.value.length;
                if (w.removed) charsRemoved += w.value.length;
            }
        }
    }
    return {
        pronounSwap: targeted.some((s) => s.pronounSwap),
        onlyTypo: swaps.length > 0 && modifies.length === operations.length && swaps.every((s) => s.typo),
        nameSwap: targeted.some((s) => s.nameSwap),
        numberSwap: swaps.some((s) => s.numberSwap),
        empty: operations.length === 0 && !headline,
        headlineOnly: operations.length === 0 && !!headline, 
        charsAdded,
        charsRemoved,
    };
}

export function classify(f) {
    if (f.numberSwap || f.nameSwap || f.pronounSwap) return 'factual';
    if (f.onlyTypo) return 'trivial';
    if (f.empty || f.headlineOnly) return 'stylistic';
    if (f.charsAdded > DOMINANT * f.charsRemoved) return 'addition';
    if (f.charsRemoved > DOMINANT * f.charsAdded) return 'deletion';
    return 'stylistic';
}
  