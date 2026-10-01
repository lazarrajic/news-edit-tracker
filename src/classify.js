import { findCorrectionNote } from "./outlets/rnz.js";


// one side has to outweigh the other this many times to count as mostly add/removed
const DOMINANT = 2; 
// a small edit in a paragraph, not a rewrite. 
const TARGETED = 0.8;
const HEADLINE_TARGETED_WORDS = 4;

const isNotice = (p) => findCorrectionNote([p]) !== null;

// from a list of changed bits pull out the single workds on one side
const tokens = (parts, side) => parts.filter((p) => p[side]).flatMap((p) => p.value.split(/\s+/)).filter(Boolean);
const hasDigit = (t) => /\d/.test(t);

// keep only the digits
const digits = (ts) => ts.join('').replace(/\D/g, '')

const bare = (t) => t.replace(/[^\p{L}\p{N}]/gu, '');
const isCapitalised = (t) => /^\p{Lu}/u.test(bare(t));

// one changed spot: what words went out, what came in
function swap(parts) {
    const out = tokens(parts, 'removed');
    const inn = tokens(parts, 'added');
    // lowercased so "Government" -> "government" is not a name changing
    const outSet = new Set(out.map((t) => bare(t).toLowerCase()));
    const inSet = new Set(inn.map((t) => bare(t).toLowerCase()));
    return {
        numberSwap: out.some(hasDigit) && inn.some(hasDigit) && digits(out) !== digits(inn),
        nameSwap:
            out.some((t) => isCapitalised(t) && !inSet.has(bare(t).toLowerCase())) &&
            inn.some((t) => isCapitalised(t) && !outSet.has(bare(t).toLowerCase())),
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
        nameSwap: targeted.some((s) => s.nameSwap),
        numberSwap: swaps.some((s) => s.numberSwap),
        empty: operations.length === 0 && !headline,
        headlineOnly: operations.length === 0 && !!headline, 
        charsAdded,
        charsRemoved,
    };
}

export function classify(f) {
    if (f.numberSwap || f.nameSwap) return 'factual';
    if (f.empty || f.headlineOnly) return 'stylistic';
    if (f.charsAdded > DOMINANT * f.charsRemoved) return 'addition';
    if (f.charsRemoved > DOMINANT * f.charsAdded) return 'deletion';
    return 'stylistic';
}
  