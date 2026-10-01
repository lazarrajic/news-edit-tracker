import { findCorrectionNote } from "./outlets/rnz.js";


// one side has to outweigh the other this many times to count as mostly add/removed
const DOMINANT = 2; 

const isNotice = (p) => findCorrectionNote([p]) !== null;

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
        empty: operations.length === 0 && !headline,
        headlineOnly: operations.length === 0 && !!headline, 
        charsAdded,
        charsRemoved,
    };
}

export function classify(f) {
    if (f.empty || f.headlineOnly) return 'stylistic';
    if (f.charsAdded > DOMINANT * f.charsRemoved) return 'addition';
    if (f.charsRemoved > DOMINANT * f.charsAdded) return 'deletion';
    return 'stylistic';
}
  