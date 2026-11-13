'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { finished } = require('node:stream/promises');
const test = require('node:test');
const { BL } = require('betterlogiclibrary');
const { Log } = require('../lib/Log');

function cloneDeep(value) {
  if (value instanceof Date) return new Date(value);
  if (Array.isArray(value)) return value.map(cloneDeep);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneDeep(item)]));
  }
  return value;
}

BL._ = {
  cloneDeep,
  orderBy(items, key, direction) {
    const multiplier = direction === 'desc' ? -1 : 1;
    return items.slice().sort((left, right) => {
      const a = key ? left[key] : left;
      const b = key ? right[key] : right;
      return (a < b ? -1 : a > b ? 1 : 0) * multiplier;
    });
  },
  drop(items, count = 1) {
    return items.slice(Math.max(0, count));
  },
  take(items, count = 1) {
    return items.slice(0, Math.max(0, count));
  },
  sumBy(items, key) {
    return items.reduce((sum, item) => sum + (item[key] || 0), 0);
  }
};

BL.datetime = {
  asLocale: date => date,
  toString: (format, date) => date.toISOString()
};

BL.homey = {
  app: {
    addLogToDB() {},
    settings: {}
  },
  api: {
    realtime() {}
  },
  error() {}
};

async function createLog(t, prepare) {
  const filePath = fs.mkdtempSync(path.join(os.tmpdir(), 'simple-sys-log-'));
  const log = new Log({ filePath: filePath + path.sep });
  if (prepare) await prepare(filePath + path.sep, log);
  await log.init();
  BL.homey.app.Log = log;

  t.after(async () => {
    const books = Object.values(log.LogBooks);
    const streams = [
      log.stream,
      log.appsStream,
      log.hostnameStream,
      log.countStream,
      ...books.flatMap(book => [book.logStream, book.indexStream])
    ].filter(Boolean);
    for (const stream of streams) {
      if (!stream.writableEnded && !stream.destroyed) stream.end();
    }
    await Promise.all(streams.map(stream => finished(stream)));
    for (const book of books) {
      if (book.fdRead && Number.isInteger(book.fdRead)) fs.closeSync(book.fdRead);
    }
    fs.rmSync(filePath, { recursive: true, force: true });
  });

  return log;
}

function addLogBook(log, id, entries, date = new Date('2026-01-02T00:00:00.000Z')) {
  log.LogBooks[id] = {
    date,
    async getLogs(options) {
      this.lastOptions = options;
      return entries.slice();
    }
  };
}

function flush(stream) {
  return new Promise((resolve, reject) => {
    stream.write('', error => error ? reject(error) : resolve());
  });
}

test('hostname filtering searches hostnames without requiring an app filter', async t => {
  const log = await createLog(t);
  log.LogApps.push('Unrelated app');
  log.LogHostnames.push('router-01', 'gateway');

  const id = '2026/01/02';
  const entry = {
    id: `${id}$0`,
    timestamp: new Date('2026-01-02T12:00:00.000Z'),
    hostname: 'router-01',
    message: 'connected'
  };
  addLogBook(log, id, [entry]);

  const result = await log.getLogs({ hostname: 'ROUTER' });

  assert.deepEqual(log.LogBooks[id].lastOptions.hostnames, [0]);
  assert.deepEqual(result.logs.map(item => item.id), [entry.id]);
});

test('lastLog includes the matching entry and later-written entries', async t => {
  const log = await createLog(t);
  const id = '2026/01/02';
  const entries = [
    { id: `${id}$0`, timestamp: new Date('2026-01-02T10:00:00.000Z'), message: 'oldest' },
    { id: `${id}$1`, timestamp: new Date('2026-01-02T11:00:00.000Z'), message: 'cursor' },
    { id: `${id}$2`, timestamp: new Date('2026-01-02T12:00:00.000Z'), message: 'newest' }
  ];
  addLogBook(log, id, entries);

  const result = await log.getLogs({ lastLog: `${id}$1` });

  assert.deepEqual(result.logs.map(item => item.id), [`${id}$2`, `${id}$1`]);
});

test('bounded pagination includes backdated entries from older logbooks', async t => {
  const log = await createLog(t);
  const newerBook = '2026/01/03';
  const olderBook = '2026/01/02';
  const newest = { id: `${newerBook}$0`, timestamp: new Date('2026-01-03T12:00:00.000Z'), message: 'newest' };
  const backdated = { id: `${newerBook}$1`, timestamp: new Date('2026-01-02T20:00:00.000Z'), message: 'backdated' };
  const between = { id: `${olderBook}$0`, timestamp: new Date('2026-01-02T22:00:00.000Z'), message: 'between' };
  addLogBook(log, newerBook, [newest, backdated], new Date('2026-01-03T00:00:00.000Z'));
  addLogBook(log, olderBook, [between]);

  const result = await log.getLogs({ take: 2 });

  assert.deepEqual(result.logs.map(item => item.id), [newest.id, between.id]);
});

test('bounded pagination remains active when the API size cap is set', async t => {
  const log = await createLog(t);
  const timestamp = new Date(2026, 0, 2, 12, 0, 0);
  await log.writeLine({ message: 'first', timestamp });
  await log.writeLine({ message: 'second', timestamp: new Date(timestamp.getTime() + 1000) });
  const book = log.getLogBook(timestamp);
  await Promise.all([flush(book.indexStream), flush(book.logStream)]);
  const getLogs = book.getLogs.bind(book);
  let usedBoundedReader = false;
  book.getLogs = (options, collector) => {
    usedBoundedReader = Boolean(collector);
    return getLogs(options, collector);
  };

  const result = await log.getLogs({ take: 2, maxSizeKb: 900 });

  assert.equal(usedBoundedReader, true);
  assert.equal(result.logs.length, 2);
});

test('bounded pagination does not skip earlier matches when the cursor is filtered out', async t => {
  const log = await createLog(t);
  const date = new Date(2026, 0, 2, 0, 0, 0);
  const timestamps = [
    new Date(2026, 0, 2, 10, 0, 0),
    new Date(2026, 0, 2, 11, 0, 0),
    new Date(2026, 0, 2, 12, 0, 0)
  ];
  await log.writeLine({ message: 'match before', severity: 6, timestamp: timestamps[0] });
  await log.writeLine({ message: 'filtered cursor', severity: 5, timestamp: timestamps[1] });
  await log.writeLine({ message: 'match after', severity: 6, timestamp: timestamps[2] });
  const book = log.getLogBook(date);
  await flush(book.indexStream);
  await flush(book.logStream);

  const result = await log.getLogs({ severity: 6, lastLog: `${book.id}$1`, take: 2 });

  assert.deepEqual(result.logs.map(item => item.message), ['match after', 'match before']);
});

test('legacy indexes migrate without losing Unicode messages', async t => {
  const message = `${'x'.repeat(150 * 1024)} café 🌙`;
  const timestamp = new Date(2026, 0, 2, 12, 0, 0);
  let bookId;
  const log = await createLog(t, (filePath, instance) => {
    bookId = instance.getLogBookDate(timestamp);
    const bookFile = filePath + bookId;
    const messageRow = JSON.stringify(message) + '\n';
    const offset = timestamp.getTime() - new Date(timestamp.getFullYear(), timestamp.getMonth(), timestamp.getDate()).getTime();
    fs.mkdirSync(path.dirname(bookFile), { recursive: true });
    fs.writeFileSync(filePath + 'log.index', `f:${JSON.stringify(bookId)},d:${timestamp.getTime()}\n`, 'utf8');
    fs.writeFileSync(bookFile + '.log', messageRow, 'utf8');
    fs.writeFileSync(bookFile + '.index', `${messageRow.length};${offset};;;;\n`, 'utf8');
  });
  const book = log.LogBooks[bookId];
  assert.equal(book.indexVersion, 2);
  assert.equal(fs.existsSync(book.legacyIndexFile), false);
  const logs = await book.getLogs();

  assert.equal(logs.length, 1);
  assert.equal(logs[0].message, message);
  assert.equal(fs.readFileSync(book.v2IndexFile, 'utf8').split('\n')[0], '#SimpleSysLogIndexV2');
  assert.equal(fs.existsSync(book.legacyIndexFile), false);
});

test('v2 indexes resume row numbers and byte offsets after reopening', async t => {
  const log = await createLog(t);
  const timestamp = new Date(2026, 0, 2, 12, 0, 0);
  await log.writeLine({ message: 'Before reopen: café 🌙', timestamp });
  const book = log.getLogBook(timestamp);
  await Promise.all([flush(book.indexStream), flush(book.logStream)]);

  await book.destroy();
  book.indexVersion = 0;
  book.indexFile = book.legacyIndexFile;
  book.entryCount = 0;
  book.bytePosition = 0;
  await book.writeLine({ message: 'After reopen: €', timestamp: new Date(timestamp.getTime() + 1000) });
  await Promise.all([flush(book.indexStream), flush(book.logStream)]);

  const logs = await book.getLogs();

  assert.deepEqual(logs.map(item => item.id), [`${book.id}$0`, `${book.id}$1`]);
  assert.deepEqual(logs.map(item => item.message), ['Before reopen: café 🌙', 'After reopen: €']);
});

test('failed legacy migration leaves the legacy index readable', async t => {
  const message = 'Keep this legacy record';
  const timestamp = new Date(2026, 0, 2, 12, 0, 0);
  let bookId;
  const log = await createLog(t, (filePath, instance) => {
    bookId = instance.getLogBookDate(timestamp);
    const bookFile = filePath + bookId;
    const messageRow = JSON.stringify(message) + '\n';
    const offset = timestamp.getTime() - new Date(timestamp.getFullYear(), timestamp.getMonth(), timestamp.getDate()).getTime();
    fs.mkdirSync(path.dirname(bookFile), { recursive: true });
    fs.writeFileSync(filePath + 'log.index', `f:${JSON.stringify(bookId)},d:${timestamp.getTime()}\n`, 'utf8');
    fs.writeFileSync(bookFile + '.log', messageRow, 'utf8');
    fs.writeFileSync(bookFile + '.index', `${messageRow.length};${offset};;;;\n${messageRow.length};${offset};;;;\n`, 'utf8');
  });
  const book = log.LogBooks[bookId];
  assert.equal(book.indexVersion, 1);
  const logs = await book.getLogs();

  assert.equal(logs.length, 2);
  assert.equal(logs[0].message, message);
  assert.equal(book.indexVersion, 1);
  assert.equal(fs.existsSync(book.legacyIndexFile), true);
  assert.equal(fs.existsSync(book.v2IndexFile), false);
});

test('clearing old v2 logbooks removes their files and preserves the count', async t => {
  const log = await createLog(t);
  const book = log.getLogBook(new Date(2000, 0, 2, 0, 0, 0));
  book.date = new Date(2000, 0, 2, 0, 0, 0);
  fs.mkdirSync(path.dirname(book.file), { recursive: true });
  fs.writeFileSync(book.v2IndexFile, '#SimpleSysLogIndexV2\n0;0;2;0;;;;\n1;2;2;1;;;;\n', 'utf8');
  fs.writeFileSync(book.file + '.log', 'a\nb\n', 'utf8');

  const countFile = path.join(path.dirname(log.stream.path), 'log.count');
  log.countStream.destroy();
  log.countStream = null;
  fs.writeFileSync(countFile, '   ', 'utf8');
  log.logCount = 3;

  await log.clearLog(1);
  await flush(log.countStream);

  assert.equal(fs.existsSync(book.v2IndexFile), false);
  assert.equal(fs.existsSync(book.file + '.log'), false);
  assert.equal(fs.statSync(countFile).size, 2);
});

test('writing reuses app and hostname indexes', async t => {
  const log = await createLog(t);
  const firstMessage = `${'x'.repeat(70 * 1024)} café 🌙`;
  const secondMessage = 'Unicode test: café 🌙';
  const entry = {
    message: firstMessage,
    app: 'Repeated app',
    hostname: 'repeated-host',
    timestamp: new Date('2026-01-02T12:00:00.000Z')
  };

  await log.writeLine(entry);
  await log.writeLine({ ...entry, message: secondMessage, timestamp: new Date('2026-01-02T12:01:00.000Z') });

  assert.deepEqual(log.LogApps, ['Repeated app']);
  assert.deepEqual(log.LogHostnames, ['repeated-host']);

  const book = Object.values(log.LogBooks)[0];
  await Promise.all([
    flush(log.appsStream),
    flush(log.hostnameStream),
    flush(book.indexStream)
  ]);
  book.getLogFile = () => {
    throw new Error('The streaming reader should not load the complete log file');
  };
  const result = await log.getLogs({ app: 'Repeated' });

  assert.deepEqual(result.logs.map(item => item.message), [secondMessage, firstMessage]);
});
