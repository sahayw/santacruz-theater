/**
 * Proxy handler — fetches an arbitrary URL server-side so the admin editor
 * can retrieve show descriptions without hitting browser CORS restrictions.
 *
 * Usage: GET /.netlify/functions/fetch-page?url=<encoded-url>
 * Returns the raw HTML of the target page, or an error status.
 */
export const handler = async (event) => {
  const url = event.queryStringParameters?.url;
  if (!url) {
    return { statusCode: 400, body: 'Missing url parameter' };
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { statusCode: 400, body: 'Invalid URL' };
  }

  // Only allow http/https to prevent SSRF against internal resources
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { statusCode: 400, body: 'Only http/https URLs are supported' };
  }

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SCTheaterAdmin/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(8000),
      redirect: 'follow',
    });

    if (!response.ok) {
      return { statusCode: response.status, body: `Upstream returned ${response.status}` };
    }

    const html = await response.text();
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      body: html,
    };
  } catch (e) {
    return { statusCode: 502, body: `Fetch failed: ${e.message}` };
  }
};
