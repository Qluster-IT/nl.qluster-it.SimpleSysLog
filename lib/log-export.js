'use strict';

const http = require('node:http');
const { isIPv4 } = require('node:net');
const { BL } = require('betterlogiclibrary');

const CONTENT_TYPES = new Map([
  ['csv', 'text/csv'],
  ['xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  ['json', 'text/json']
]);

async function exportMetadata(app, format) {
  const contentType = CONTENT_TYPES.get(format);
  if (!contentType) throw new Error('Unsupported log export format.');
  const configured = app.settings && app.settings[`${format}Filename`];
  const filename = configured ? await BL.decode(configured) : `Logs ${BL.datetime.toString('datetimeshort')}.${format}`;
  return { contentType, filename };
}

function publishExport(upload, contentType, body) {
  // Keep status checking here for installations using older BLL download helpers.
  return new Promise((resolve, reject) => {
    const request = http.request(upload, {
      method: 'POST',
      signal: AbortSignal.timeout(60_000),
      headers: {
        Accept: contentType,
        'Content-Type': 'application/octet-stream',
        'Content-Length': body.length
      }
    }, response => {
      response.on('error', () => reject(new Error('The log export upload was interrupted.')));
      response.on('end', () => {
        if (response.statusCode >= 200 && response.statusCode < 300) resolve();
        else reject(new Error(`Better Logic Library rejected the log export upload (HTTP ${response.statusCode}).`));
      });
      response.resume();
    });
    request.on('error', error => reject(new Error(error.name === 'AbortError'
      ? 'The log export upload timed out.' : 'The log export could not be uploaded to Better Logic Library.')));
    request.end(body);
  });
}

async function getLogExportUrls(app, format) {
  if (!app.Log) throw new Error(app.homey.__('bllNotStartedYet'));

  const metadata = await exportMetadata(app, format);
  const logs = await app.Log.getLogs({ returnType: format });
  const content = logs && logs[format];
  if (format === 'xlsx' ? !(content instanceof Uint8Array) || !content.byteLength : typeof content !== 'string') {
    throw new Error('The log export generator returned no file.');
  }
  const body = format === 'xlsx' ? Buffer.from(content.buffer, content.byteOffset, content.byteLength) : Buffer.from(content);
  const link = await BL.getDownloadUrl(metadata);
  if (!link || !isIPv4(link.host) || !/^\/getfile\/[a-f0-9]+\/$/i.test(link.path)) {
    throw new Error('Better Logic Library did not provide a local log export link.');
  }
  let upload;
  try {
    upload = new URL(link.url);
  } catch {
    throw new Error('Better Logic Library returned an invalid local log export link.');
  }
  const filePath = `/app/net.i-dev.betterlogic/userdata${link.path}`;
  const sslOrigin = `https://${link.host.replace(/\./g, '-')}.homey.homeylocal.com`;
  if (upload.protocol !== 'http:' || upload.hostname !== link.host || upload.pathname !== link.path
      || upload.username || upload.password || upload.search || upload.hash
      || typeof link.localUrl !== 'string' || !link.localUrl.startsWith(sslOrigin + filePath)
      || typeof link.filename !== 'string' || !link.filename || /[/\\]/.test(link.filename)
      || link.filename === '.' || link.filename === '..') {
    throw new Error('Better Logic Library returned an invalid local log export link.');
  }

  const downloadPath = filePath + encodeURIComponent(link.filename);
  await publishExport(upload, metadata.contentType, body);
  // Both downloads use the hosted userdata file, not BLL's internal upload port.
  return { localUrl: `http://${link.host}${downloadPath}`, localSslUrl: sslOrigin + downloadPath };
}

module.exports = { exportMetadata, getLogExportUrls };
