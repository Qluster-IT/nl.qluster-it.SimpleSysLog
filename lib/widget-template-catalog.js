'use strict';

const { decodeTemplate } = require('./widget-template');

const topicId = 162351;
const origin = 'https://community.homey.app';
const maxPosts = 2000;
const batchSize = 20;
const templatePattern = /\[twf:SimpleSysLog:LogViewer:(?:DESIGN|THEME|DESIGN,THEME):"[A-Za-z0-9+/]+={0,2}":\/twf\]/g;

async function requestJson(path, fetcher) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetcher(origin + path, { signal: controller.signal });
    if (!response.ok) throw new Error(`Community forum returned HTTP ${response.status}`);
    const text = await response.text();
    if (text.length > 10 * 1024 * 1024) throw new Error('Community forum response is too large');
    return JSON.parse(text);
  } finally {
    clearTimeout(timeout);
  }
}

function postImages(cooked) {
  const images = new Set();
  if (typeof cooked !== 'string') return [];
  for (const match of cooked.matchAll(/(?:<a\b[^>]*\shref="([^"]+)"[^>]*>\s*)?<img\b[^>]*\ssrc="([^"]+)"[^>]*>/gi)) {
    // Discourse lightboxes link the reduced image to its original upload.
    for (const source of [match[1], match[2]]) {
      if (!source) continue;
      let url;
      try {
        url = new URL(source.replace(/&amp;/g, '&'), origin);
      } catch (error) {
        if (!(error instanceof TypeError)) throw error;
        continue;
      }
      if (url.username || url.password) continue;
      if ((url.origin === origin && url.pathname.startsWith('/uploads/'))
        || (url.origin === 'https://us1.discourse-cdn.com' && url.pathname.startsWith('/flex025/uploads/athom/'))) {
        images.add(url.href);
        break;
      }
    }
  }
  return Array.from(images);
}

function entriesFromPost(post) {
  if (!post || !Number.isSafeInteger(post.id) || !Number.isSafeInteger(post.post_number)
    || typeof post.raw !== 'string' || post.hidden || post.deleted_at) return [];
  const matches = Array.from(post.raw.matchAll(templatePattern));
  if (!matches.length) return [];
  const heading = /^#\s+(.+)$/m.exec(post.raw);
  const title = heading ? heading[1].trim().slice(0, 200) : `Template ${post.post_number}`;
  const description = post.raw.replace(templatePattern, '').replace(/^#\s+.+$/m, '')
    .replace(/!\[[^\]\r\n]*\]\(upload:\/\/[^)\r\n]+\)/g, '')
    .replace(/^\s*(?:```.*|TWF:)\s*$/gm, '').trim().slice(0, 2000);
  const images = postImages(post.cooked);
  const likes = Array.isArray(post.actions_summary)
    ? (post.actions_summary.find(action => action.id === 2) || {}).count || 0 : 0;
  return matches.map((match, index) => ({
    id: `${post.id}:${index}`,
    postId: post.id,
    number: post.post_number,
    title,
    description,
    images,
    author: String(post.username || ''),
    createdAt: post.created_at,
    likes,
    text: match[0],
    template: decodeTemplate(match[0]),
    url: `${origin}/t/${topicId}/${post.post_number}`
  }));
}

async function getCatalog(fetcher = fetch) {
  const topic = await requestJson(`/t/${topicId}.json?include_raw=true`, fetcher);
  const stream = topic && topic.post_stream;
  if (!stream || !Array.isArray(stream.stream) || !Array.isArray(stream.posts)
    || stream.stream.some(id => !Number.isSafeInteger(id) || id <= 0)) {
    throw new Error('Invalid community topic response');
  }
  if (stream.stream.length > maxPosts) throw new Error('Community topic has too many posts');
  const posts = new Map(stream.posts.filter(post => post && Number.isSafeInteger(post.id)).map(post => [post.id, post]));
  const missing = stream.stream.filter(id => !posts.has(id));
  for (let offset = 0; offset < missing.length; offset += batchSize) {
    const ids = missing.slice(offset, offset + batchSize);
    const query = ids.map(id => `post_ids%5B%5D=${id}`).join('&');
    const response = await requestJson(`/t/${topicId}/posts.json?include_raw=true&${query}`, fetcher);
    if (!response.post_stream || !Array.isArray(response.post_stream.posts)) {
      throw new Error('Invalid community posts response');
    }
    for (const post of response.post_stream.posts) {
      if (post && ids.includes(post.id)) posts.set(post.id, post);
    }
    if (ids.some(id => !posts.has(id))) throw new Error('Community topic posts could not be loaded');
  }
  return stream.stream.slice().reverse().flatMap(id => {
    const post = posts.get(id);
    if (!post.hidden && !post.deleted_at && typeof post.raw !== 'string') {
      throw new Error('Community post content could not be loaded');
    }
    return entriesFromPost(post);
  });
}

module.exports = { getCatalog, entriesFromPost, topicId };
