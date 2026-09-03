import * as cheerio from 'cheerio';

const RENDER_ONLY_ATTRS = [
  'srcset', 'sizes', 'loading', 'decoding', 'fetchpriority', 'width', 'height', 'style',
];

const NEVER_CONTENT = 'script, style, noscript';

// exclude from body text but keep in store html. counting captions later without recollecting. 
const NOT_BODY_TEXT = 'figure, figcaption, aside, nav, article';
const NOTICE_PREFIX = /^(correction|clarification|editor'?s note|update)\b\s*[:—–-]/i;
// discovered most notices are plain sentence not "Correction:". 
const NOTICE_SELF_REF =
  /\bthis (story|article)\b|\bthe headline (on|of) this\b|\bin this (story|article)\b/i;
const NOTICE_CHANGE = /\b(updated?|corrected?|amended?|clarif(y|ied|ication))\b/i;
const NOTICE_PRIOR_VERSION = /\ban? (earlier|previous) version of this (story|article)\b/i;

const stripLeadingMarks = (p) => p.replace(/^[^\p{L}]+/u, '');

const MIN_BODY_CHARS = 200;

// live updated articles change continuosly which would break the edit tracker. 
const LIVE_BLOG_EMBED = '#liveblog-iframe';
const LIVE_TITLE = /^\s*live\b[^:]{0,20}:/i;
const EXCLUDED_SECTIONS = /\/(programmes|news\/chinese_english)\//;

export function skipReason(item) {
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
    isLiveBlog: isLiveBlog(container, headline),
  };
}
export function isLiveBlog(container, headline) {
  return container.find(LIVE_BLOG_EMBED).length > 0 || LIVE_TITLE.test(headline);
}

export function findCorrectionNote(paragraphs) {
  const candidates = [...paragraphs.slice(0, 3), paragraphs.at(-1)];
  return candidates.find((p) => p && isNotice(p)) ?? null;
}
function isNotice(p) {
  return (
    NOTICE_PREFIX.test(stripLeadingMarks(p)) ||
    NOTICE_PRIOR_VERSION.test(p) ||
    (NOTICE_SELF_REF.test(p) && NOTICE_CHANGE.test(p))
  );
}

