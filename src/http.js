export const USER_AGENT =
  'NZNewsEditTracker/0.1 (+Massey University 159.333 research project; lrajic997@gmail.com)';

export async function fetchPage(url) {
  const res = await fetch(url, { headers: { 'user-agent': USER_AGENT } });
  return {
    status: res.status,
    etag: res.headers.get('etag'),
    finalUrl: res.url, 
    html: res.ok ? await res.text() : null,
  };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
