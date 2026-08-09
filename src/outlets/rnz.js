import * as cheerio from 'cheerio';

const RENDER_ONLY_ATTRS = [
  'srcset', 'sizes', 'loading', 'decoding', 'fetchpriority', 'width', 'height', 'style',
];

const NEVER_CONTENT = 'script, style, noscript';

// exclude from body text but keep in store html. counting captions later without recollecting. 
const NOT_BODY_TEXT = 'figure, figcaption, aside, nav, article';
const NOTICE_PREFIX = /^(correction|clarification|editor'?s note|update)\b\s*[:—–-]/i;

// make up for variety of correction notices. 
const stripLeadingMarks = (p) => p.replace(/^[^\p{L}]+/u, '');

const MIN_BODY_CHARS = 200;

// live updated articles change continuosly which would break the edit tracker. 
const LIVE_TITLE = /^\s*live\s*:/i;
const EXCLUDED_SECTIONS = /\/(programmes|news\/chinese_english)\//;

export function skipReason(item) {
    if (LIVE_TITLE.test(item.title ?? '')) return 'live';
    if (EXCLUDED_SECTIONS.test(item.link ?? '')) return 'not in scope';
    return null;
}

export const rnz = {
  slug: 'rnz',
  feeds: ['https://www.rnz.co.nz/rss/national.xml'],
  crawlDelayMs: 7000, 
  skipReason,
  extract,
};

export function extract(html) {
  const $ = cheerio.load(html);

  const h1 = $('h1').first();
 
  const container = h1.closest('article');
  if (h1.length === 0 || container.length === 0) {
    throw new Error('no <h1> inside an <article> — page layout has changed');
  }

  container.find(NEVER_CONTENT).remove();
  container.find(RENDER_ONLY_ATTRS.map((a) => `[${a}]`).join(',')).each((_, el) => {
    RENDER_ONLY_ATTRS.forEach((a) => $(el).removeAttr(a));
  });

  // text come from copy so stored html keeps what the tex drops. 
  const textRoot = container.clone();
  textRoot.find(NOT_BODY_TEXT).remove();
  const paragraphs = textRoot
    .find('p')
    .map((_, el) => $(el).text().trim())
    .get()
    .filter(Boolean);

  const headline = h1.text().trim();
  const bodyText = paragraphs.join('\n\n');
  if (!headline || bodyText.length < MIN_BODY_CHARS) {
    throw new Error(
      `extraction too thin: headline ${headline.length} chars, body ${bodyText.length} chars`
    );
  }

  return {
    headline,
    bodyText,
    bodyHtml: container.html(),
    correctionNote: findCorrectionNote(paragraphs),
  };
}

export function findCorrectionNote(paragraphs) {
  const candidates = [...paragraphs.slice(0, 3), paragraphs.at(-1)];
  return candidates.find((p) => p && NOTICE_PREFIX.test(stripLeadingMarks(p))) ?? null;
}
