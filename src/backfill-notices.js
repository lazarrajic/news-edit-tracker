// running new correction_note over every stroed version. old one only matched labelled notices not ones written in a sentence. 
import { findCorrectionNote } from './outlets/rnz.js';
import { allVersionText, setCorrectionNote } from './db.js';

const versions = await allVersionText();

let found = 0;
let added = 0;
let removed = 0;

for (const v of versions) {
    const note = findCorrectionNote(v.body_text.split('\n\n'));
    if (note) found += 1;
    if (note === v.correction_note) continue;

    await setCorrectionNote(v.id, note);
    if (note) added += 1;
    else removed += 1;
}

console.log(
  `${versions.length} versions scanned, ${found} with correction notes, ` +
  `${added} newly found, ${removed} removed`
);