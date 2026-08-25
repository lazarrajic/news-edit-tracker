// backfill for versions collected before the flag existed. body_html is stored in full so it works. 
import * as cheerio from 'cheerio';
import { isLiveBlog } from './outlets/rnz.js';
import { allVersionsHtml, setLiveBlogFlags } from './db.js';

const versions = await allVersionsHtml();

const live =[];
const notLive = [];
const articles = new Set();
let changed = 0;

for (const v of versions) {
    const flag = isLiveBlog(cheerio.load(v.body_html).root(), v.headline);
    (flag ? live : notLive).push(v.id);
    if(flag) articles.add(v.article_id);
    if (flag !== v.is_live_blog) changed += 1;
}
 
await setLiveBlogFlags(live, true);
await setLiveBlogFlags(notLive, false);

console.log(
  `${versions.length} versions scanned, ${live.length} live-blog versions ` +
  `over ${articles.size} articles, ${changed} changed`
);