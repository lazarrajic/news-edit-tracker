import { createHash } from 'node:crypto';

// protecting against any changes to letters with macrons. 
// standardising text captured so meaningless differences dont register as an edit. 
export function normalise(text) {
  return text
    .normalize('NFC')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .trim();
}
export function contentHash(headline, bodyText) {
  return createHash('sha256')
    .update(normalise(headline))
    .update('\n')
    .update(normalise(bodyText))
    .digest('hex');
}