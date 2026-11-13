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

test('unmatched app and hostname searches skip logbook reads and preserve empty export output', async t => {
  const log = await createLog(t);
  log.LogApps.push('Known app');
  log.LogHostnames.push('known-host');
  let reads = 0;
  log.LogBooks['2026/01/02'] = {
    async getLogs() {
      reads++;
      return [];
    }
  };

  assert.deepEqual(await log.getLogs({ app: 'missing', take: 50 }), { logs: [] });
  assert.deepEqual(await log.getLogs({ hostname: 'missing', message: 'text' }), { logs: [] });
  assert.deepEqual(await log.getLogs({ app: 'known', hostname: 'missing', returnType: 'json' }), { json: '[]' });
  assert.equal(reads, 0);

  await log.getLogs({ app: 'KNOWN', hostname: 'KNOWN' });
  assert.equal(reads, 1);
});

test('cursor lookups close their index files on match, nonmatch, and invalid headers', async t => {
  const log = await createLog(t);
  const timestamp = new Date(2026, 0, 2, 12, 0, 0);
  await log.writeLine({ message: 'cursor', severity: 6, timestamp });
  const book = log.getLogBook(timestamp);
  await Promise.all([flush(book.indexStream), flush(book.logStream)]);
  let opened = 0;
  let closed = 0;
  const indexFDs = new Set();
  const open = fs.open.bind(fs);
  const close = fs.close.bind(fs);
  t.mock.method(fs, 'open', (...args) => {
    const callback = args.pop();
    return open(...args, (error, fd) => {
      if (!error && args[0] === book.indexFile) {
        opened++;
        indexFDs.add(fd);
      }
      callback(error, fd);
    });
  });
  t.mock.method(fs, 'close', (fd, callback) => close(fd, error => {
    if (!error && indexFDs.delete(fd)) closed++;
    callback(error);
  }));

  assert.equal(await book.cursorRowMatches({}, 0), true);
  assert.equal(await book.cursorRowMatches({ severity: 5 }, 0), false);
  assert.equal(await book.cursorRowMatches({}, 100), false);
  fs.writeFileSync(book.indexFile, 'invalid header\n');
  await assert.rejects(book.cursorRowMatches({}, 0), /Invalid log index header/);
  await assert.rejects(book.getLogs(), /Invalid log index header/);
  assert.equal(opened, 5);
  assert.equal(closed, opened);
});

test('chunked indexes preserve split rows, CRLF, and an unterminated final row', async t => {
  const log = await createLog(t);
  const book = log.getLogBook(new Date(2026, 0, 2, 12));
  fs.mkdirSync(book.path, { recursive: true });
  const text = '#SimpleSysLogIndexV2\r\n0;0;4;0;;;;\r\n\n1;4;4;1;\u00a06;;;';
  fs.writeFileSync(book.indexFile, text);
  const chunks = [];
  for await (const chunk of book.readIndexChunks(Buffer.alloc(1))) chunks.push(chunk);
  assert.equal(chunks.join(''), text);
});

test('index readers close files after read errors and report close errors', async t => {
  const log = await createLog(t);
  const book = log.getLogBook(new Date(2026, 0, 2, 12));
  fs.mkdirSync(book.path, { recursive: true });
  fs.writeFileSync(book.indexFile, 'first\nsecond\n');
  let closed = 0;
  const indexFDs = new Set();
  const open = fs.open.bind(fs);
  const read = fs.read.bind(fs);
  const close = fs.close.bind(fs);
  let failRead = true;
  let reads = 0;
  t.mock.method(fs, 'open', (...args) => {
    const callback = args.pop();
    return open(...args, (error, fd) => {
      if (!error && args[0] === book.indexFile) indexFDs.add(fd);
      callback(error, fd);
    });
  });
  t.mock.method(fs, 'read', (fd, buffer, offset, length, position, callback) => {
    if (indexFDs.has(fd) && failRead && reads++) return process.nextTick(callback, new Error('test index read failure'));
    return read(fd, buffer, offset, length, position, callback);
  });
  t.mock.method(fs, 'close', (fd, callback) => close(fd, error => {
    const isIndex = indexFDs.delete(fd);
    if (!error && isIndex) closed++;
    callback(error || (isIndex && !failRead ? new Error('test index close failure') : null));
  }));
  await assert.rejects(async () => {
    for await (const chunk of book.readIndexChunks(Buffer.alloc(6))) {
      assert.equal(chunk, 'first\n');
    }
  }, /test index read failure/);
  failRead = false;
  await assert.rejects(async () => {
    for await (const chunk of book.readIndexChunks()) assert.equal(chunk, 'first\nsecond\n');
  }, /test index close failure/);
  assert.equal(closed, 2);
});

test('paged and export queries reuse one index buffer per request, isolated from concurrent queries', async t => {
  const log = await createLog(t);
  for (let day = 1; day <= 4; day++) {
    await log.writeLine({ message: `day ${day} café 🌙`, timestamp: new Date(2026, 0, day, 12) });
  }
  const expected = JSON.parse((await log.getLogs({ returnType: 'json' })).json);
  const buffers = new Set();
  for (const book of Object.values(log.LogBooks)) {
    const readIndexChunks = book.readIndexChunks.bind(book);
    t.mock.method(book, 'readIndexChunks', buffer => {
      buffers.add(buffer);
      return readIndexChunks(buffer);
    });
  }

  const first = await log.getLogs({ take: 2, skip: 1 });
  assert.deepEqual(first.logs.map(entry => entry.message), expected.slice(1, 3).map(entry => entry.message));
  assert.equal(buffers.size, 1);
  const [firstBuffer] = buffers;
  assert.ok(Buffer.isBuffer(firstBuffer));
  assert.ok(firstBuffer.length <= 16384);
  buffers.clear();

  const [paged, exported] = await Promise.all([
    log.getLogs({ take: 2, skip: 1 }),
    log.getLogs({ returnType: 'json' })
  ]);
  assert.deepEqual(paged, first);
  assert.deepEqual(JSON.parse(exported.json), expected);
  assert.equal(buffers.size, 2);
  assert.equal(buffers.has(firstBuffer), false);
});

test('warm paging skips daily indexes that cannot improve the page, without pruning exports', async t => {
  const log = await createLog(t);
  for (let day = 1; day <= 6; day++) {
    for (let entry = 0; entry < 2; entry++) {
      await log.writeLine({
        message: `day ${day} entry ${entry}`, severity: entry ? 5 : 6,
        timestamp: new Date(2026, 0, day, 12, 0, entry)
      });
    }
  }
  let reads = 0;
  for (const book of Object.values(log.LogBooks)) {
    const readIndexChunks = book.readIndexChunks.bind(book);
    t.mock.method(book, 'readIndexChunks', buffer => {
      reads++;
      return readIndexChunks(buffer);
    });
  }
  const cold = await log.getLogs({ take: 2 });
  assert.equal(reads, 6);
  reads = 0;
  assert.deepEqual(await log.getLogs({ take: 2 }), cold);
  assert.equal(reads, 1);
  t.diagnostic('Repeated newest-page queries read 1 daily index instead of 6');

  reads = 0;
  const filtered = await log.getLogs({ take: 2, severity: 6 });
  assert.deepEqual(filtered.logs.map(entry => entry.message), ['day 6 entry 0', 'day 5 entry 0']);
  assert.equal(reads, 2);
  reads = 0;
  const exported = await log.getLogs({ returnType: 'json' });
  assert.equal(JSON.parse(exported.json).length, 12);
  assert.equal(reads, 6);
});

test('timestamp bounds include filtered-out and out-of-day records, invalidate on appends, and preserve ties', async t => {
  const log = await createLog(t);
  const oldDate = new Date(2026, 0, 2, 12);
  const newDate = new Date(2026, 0, 3, 12);
  await log.writeLine({ message: 'older', severity: 6, timestamp: oldDate });
  await log.writeLine({ message: 'newer', severity: 6, timestamp: newDate });
  const oldBook = log.getLogBook(oldDate);
  const newBook = log.getLogBook(newDate);
  await oldBook.writeLine({ message: 'hidden future', severity: 5, timestamp: new Date(2026, 0, 4, 12) });
  assert.equal((await log.getLogs({ take: 1, severity: 6 })).logs[0].message, 'newer');
  assert.equal((await log.getLogs({ take: 1 })).logs[0].message, 'hidden future');

  const future = new Date(2026, 0, 5, 12);
  await oldBook.writeLine({ message: 'later future', timestamp: future });
  assert.equal(oldBook.maxIndexedTimestamp, undefined);
  assert.equal((await log.getLogs({ take: 1 })).logs[0].message, 'later future');
  await newBook.writeLine({ message: 'tie in newer book', timestamp: future });
  assert.equal((await log.getLogs({ take: 1 })).logs[0].message, 'tie in newer book');
});

test('a queued write invalidates timestamp bounds before index initialization resumes', async t => {
  const log = await createLog(t);
  const oldDate = new Date(2026, 0, 2, 12);
  await log.writeLine({ message: 'older', timestamp: oldDate });
  await log.writeLine({ message: 'newer', timestamp: new Date(2026, 0, 3, 12) });
  await log.getLogs({ take: 1 });
  const book = log.getLogBook(oldDate);
  assert.notEqual(book.maxIndexedTimestamp, undefined);
  const ensureIndexFormat = book.ensureIndexFormat.bind(book);
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  book.ensureIndexFormat = async () => {
    await gate;
    return ensureIndexFormat();
  };
  const writing = book.writeLine({ message: 'queued future', timestamp: new Date(2026, 0, 4, 12) });
  try {
    assert.equal(book.maxIndexedTimestamp, undefined);
    assert.equal((await log.getLogs({ take: 1 })).logs[0].message, 'newer');
    assert.equal(book.maxIndexedTimestamp, undefined);
  } finally {
    release();
    await writing;
  }
  assert.equal((await log.getLogs({ take: 1 })).logs[0].message, 'queued future');
});

test('an append after index EOF prevents caching an incomplete timestamp bound', async t => {
  const log = await createLog(t);
  const oldDate = new Date(2026, 0, 2, 12);
  await log.writeLine({ message: 'older', timestamp: oldDate });
  await log.writeLine({ message: 'newer', timestamp: new Date(2026, 0, 3, 12) });
  await log.getLogs({ take: 1 });
  const book = log.getLogBook(oldDate);
  await book.writeLine({ message: 'older append', timestamp: oldDate });
  const readIndexChunks = book.readIndexChunks.bind(book);
  const reader = t.mock.method(book, 'readIndexChunks', async function* (buffer) {
    for await (const chunk of readIndexChunks(buffer)) yield chunk;
    await book.writeLine({ message: 'concurrent future', timestamp: new Date(2026, 0, 4, 12) });
  });
  assert.equal((await log.getLogs({ take: 1 })).logs[0].message, 'newer');
  assert.equal(book.maxIndexedTimestamp, undefined);
  reader.mock.restore();
  assert.equal((await log.getLogs({ take: 1 })).logs[0].message, 'concurrent future');
});

test('numeric index scanning preserves legacy integer parsing and rejects invalid offsets', async t => {
  const log = await createLog(t);
  const timestamp = new Date(2026, 0, 2, 12);
  await log.writeLine({ message: 'numeric fields', app: 'app', hostname: 'host', timestamp });
  const book = log.getLogBook(timestamp);
  await Promise.all([flush(book.indexStream), flush(book.logStream)]);
  const length = fs.statSync(book.file + '.log').size;
  const variations = [
    { time: '-1234', severity: '+6', facility: '18suffix', app: '0', hostname: '0' },
    { time: ' +1234', severity: ' 6', facility: '', app: 'undefined', hostname: '' },
    { time: '0000000000000001', severity: '6', facility: '-0', app: '0suffix', hostname: '0' }
  ];
  for (const fields of variations) {
    fs.writeFileSync(book.indexFile,
      `#SimpleSysLogIndexV2\r\n0;0;${length};${fields.time};${fields.severity};${fields.facility};${fields.app};${fields.hostname}`);
    const [entry] = await book.getLogs();
    assert.equal(entry.message, 'numeric fields');
    assert.equal(entry.timestamp.getTime(), book.datestarttime + Number.parseInt(fields.time, 10));
    for (const key of ['severity', 'facility']) {
      const expected = Number.parseInt(fields[key], 10);
      if (Number.isNaN(expected)) assert.equal(Object.hasOwn(entry, key), false);
      else assert.equal(entry[key], expected);
    }
    assert.equal(Object.hasOwn(entry, 'app'), !Number.isNaN(Number.parseInt(fields.app, 10)));
    assert.equal(Object.hasOwn(entry, 'hostname'), !Number.isNaN(Number.parseInt(fields.hostname, 10)));
  }
  fs.writeFileSync(book.indexFile, `#SimpleSysLogIndexV2\n0;9007199254740992;${length};0;;;;\n`);
  await assert.rejects(book.getLogs(), /Invalid log index values/);
  await assert.rejects(book.cursorRowMatches({ message: 'numeric' }, 0), /Invalid log index values/);
  assert.equal(book.fdRead, null);
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

test('bounded paging reuses candidates without retaining optional fields from replaced rows', async t => {
  const log = await createLog(t);
  const timestamp = new Date(2026, 0, 2, 12, 0, 0);
  for (let index = 0; index < 200; index++) {
    const extra = index % 4 === 0 ? { severity: 6, facility: 18, app: 'app', hostname: 'host' } : {};
    await log.writeLine({
      message: `entry ${index}`,
      timestamp: new Date(timestamp.getTime() + index * 1000),
      ...extra
    });
  }
  const book = log.getLogBook(timestamp);
  await Promise.all([flush(book.indexStream), flush(book.logStream)]);
  const expected = (await book.getLogs()).reverse().slice(5, 15);
  const getLogs = book.getLogs.bind(book);
  const candidates = new Set();
  let additions = 0;
  book.getLogs = (options, collector) => {
    const add = collector.heap.add.bind(collector.heap);
    collector.heap.add = candidate => {
      additions++;
      candidates.add(candidate);
      assert.equal(typeof candidate.timestamp, 'number');
      assert.equal(Object.hasOwn(candidate, 'id'), false);
      assert.equal(Object.hasOwn(candidate, 'app'), false);
      assert.equal(Object.hasOwn(candidate, 'hostname'), false);
      add(candidate);
    };
    return getLogs(options, collector);
  };

  const result = await log.getLogs({ skip: 5, take: 10, maxSizeKb: 900 });

  assert.deepEqual(result.logs, expected);
  assert.equal(additions, 200);
  assert.equal(candidates.size, 15);
  assert.ok(result.logs.every(entry => entry.timestamp instanceof Date));
});

test('compact paging candidates can replace and coexist with legacy log objects', async t => {
  const log = await createLog(t);
  const timestamp = new Date(2026, 0, 2, 12);
  await log.writeLine({ message: 'first', timestamp });
  await log.writeLine({ message: 'second', timestamp: new Date(timestamp.getTime() + 1000) });
  const book = log.getLogBook(timestamp);
  await Promise.all([flush(book.indexStream), flush(book.logStream)]);
  const legacyTimestamp = new Date(timestamp.getTime() - 1000);
  const legacy = { id: 'legacy$0', timestamp: legacyTimestamp, message: 'legacy' };
  addLogBook(log, '9999/01/01', [legacy]);

  const latest = await log.getLogs({ take: 1 });
  assert.deepEqual(latest.logs.map(entry => entry.message), ['second']);
  assert.equal(legacy.timestamp, legacyTimestamp);
  assert.equal(legacy.timestamp.getTime(), timestamp.getTime() - 1000);

  const all = await log.getLogs({ take: 3 });
  assert.deepEqual(all.logs.map(entry => entry.message), ['second', 'first', 'legacy']);
  assert.ok(all.logs.every(entry => entry.timestamp instanceof Date));
});

test('bounded candidate pruning preserves timestamp ties and late-written newer entries', async t => {
  const log = await createLog(t);
  const timestamp = new Date(2026, 0, 2, 12, 0, 0);
  const offsets = [5000, 5000, 1000, 2000, 5000, 9000, 0, 6000, ...Array(100).fill(0)];
  for (let index = 0; index < offsets.length; index++) {
    await log.writeLine({
      message: `entry ${index}`,
      timestamp: new Date(timestamp.getTime() + offsets[index])
    });
  }
  const book = log.getLogBook(timestamp);
  await Promise.all([flush(book.indexStream), flush(book.logStream)]);
  const getLogs = book.getLogs.bind(book);
  let candidates = 0;
  book.getLogs = (options, collector) => {
    const add = collector.heap.add.bind(collector.heap);
    collector.heap.add = candidate => {
      candidates++;
      add(candidate);
    };
    return getLogs(options, collector);
  };

  const result = await log.getLogs({ skip: 2, take: 3, maxSizeKb: 900 });

  assert.deepEqual(result.logs.map(item => item.message), ['entry 0', 'entry 1', 'entry 4']);
  assert.ok(candidates < 10, `Expected pruning before candidate allocation, got ${candidates}`);
});

test('adjacent Unicode records share bounded read buffers without changing filtered results', async t => {
  const log = await createLog(t);
  const timestamp = new Date(2026, 0, 2, 12, 0, 0);
  const messages = Array.from({ length: 160 }, (_, index) => `${index}: ${'café 🌙 '.repeat(100)}`);
  for (let index = 0; index < messages.length; index++) {
    await log.writeLine({
      message: messages[index],
      severity: index % 2,
      timestamp: new Date(timestamp.getTime() + index * 1000)
    });
  }
  const book = log.getLogBook(timestamp);
  await Promise.all([flush(book.indexStream), flush(book.logStream)]);
  const readBuffer = book.readBuffer.bind(book);
  const buffers = new Set();
  let reads = 0;
  book.readBuffer = (start, length, buffer) => {
    reads++;
    assert.ok(length <= 65536);
    buffers.add(buffer);
    return readBuffer(start, length, buffer);
  };

  const result = await log.getLogs({ take: messages.length, maxSizeKb: 900 });

  assert.deepEqual(result.logs.map(item => item.message), messages.slice().reverse());
  assert.ok(reads < 10, `Expected batched reads, got ${reads}`);
  assert.equal(buffers.size, 1);
  assert.equal(book.fdRead, null);
  t.diagnostic(`Read ${messages.length} adjacent messages using ${reads} disk reads and one reusable buffer`);

  const filtered = await log.getLogs({ severity: 1, take: messages.length, maxSizeKb: 900 });
  assert.deepEqual(filtered.logs.map(item => item.message), messages.filter((_, index) => index % 2 === 1).reverse());
});

test('a truncated batched record does not hide preceding readable records', async t => {
  const log = await createLog(t);
  const timestamp = new Date(2026, 0, 2, 12, 0, 0);
  await log.writeLine({ message: 'readable', timestamp });
  await log.writeLine({ message: 'truncated', timestamp: new Date(timestamp.getTime() + 1000) });
  const book = log.getLogBook(timestamp);
  await Promise.all([flush(book.indexStream), flush(book.logStream)]);
  fs.truncateSync(book.file + '.log', Buffer.byteLength('"readable"\n"trunc', 'utf8'));

  const result = await log.getLogs({ take: 2 });

  assert.equal(result.logs.length, 2);
  assert.equal(result.logs[1].message, 'readable');
  assert.equal(result.logs[0].message, undefined);
  assert.equal(book.fdRead, null);
});

test('message searches read bounded batches and preserve Unicode matches, pagination, and cursors', async t => {
  const log = await createLog(t);
  const timestamp = new Date(2026, 0, 2, 12, 0, 0);
  const messages = Array.from({ length: 210 }, (_, index) => {
    const text = index % 17 === 0 ? `Match CAFÉ ${index}` : `unrelated ${index}`;
    return text + 'x'.repeat(index === 140 ? 100000 : index > 145 ? 10000 : 100);
  });
  for (let index = 0; index < messages.length; index++) {
    await log.writeLine({ message: messages[index], timestamp: new Date(timestamp.getTime() + index * 1000) });
  }
  const book = log.getLogBook(timestamp);
  await Promise.all([flush(book.indexStream), flush(book.logStream)]);
  const readMessages = book.readMessages.bind(book);
  let batches = 0;
  book.readMessages = async records => {
    batches++;
    assert.ok(records.length <= 64, `Search retained ${records.length} records before filtering`);
    const bytes = records.reduce((sum, record) => sum + record.length, 0);
    assert.ok(bytes <= 65536 || records.length === 1, `Search batch exceeds byte budget: ${bytes}`);
    return readMessages(records);
  };
  const matchingMessages = messages.filter((_, index) => index % 17 === 0);

  const all = await book.getLogs({ message: 'café' });
  assert.deepEqual(all.map(item => item.message), matchingMessages);
  assert.ok(batches > 3);
  assert.equal(book.fdRead, null);

  const page = await log.getLogs({ message: 'café', skip: 2, take: 3, maxSizeKb: 900 });
  assert.deepEqual(page.logs.map(item => item.message), matchingMessages.slice().reverse().slice(2, 5));

  const cursor = await log.getLogs({ message: 'café', lastLog: `${book.id}$170`, take: 3 });
  assert.deepEqual(cursor.logs.map(item => item.message), [messages[204], messages[187], messages[170]]);
  const filteredCursor = await log.getLogs({ message: 'café', lastLog: `${book.id}$171`, take: 3 });
  assert.deepEqual(filteredCursor.logs.map(item => item.message), [messages[204], messages[187], messages[170]]);

  assert.deepEqual(await book.getLogs({ message: 'not present' }), []);
  assert.equal(book.fdRead, null);
});

test('paged text searches retain only bounded metadata, not every matching message', async t => {
  const log = await createLog(t);
  const timestamp = new Date(2026, 0, 2, 12);
  const entries = Array.from({ length: 400 }, (_, index) => ({
    message: `${index % 3 ? 'MATCH café' : 'unrelated'} ${index} ${'x'.repeat(2048)}`,
    severity: index % 2,
    timestamp: new Date(timestamp.getTime() + ((index * 137) % 400) * 1000)
  }));
  for (const entry of entries) await log.writeLine(entry);
  const book = log.getLogBook(timestamp);
  await Promise.all([flush(book.indexStream), flush(book.logStream)]);
  const expected = entries
    .filter(entry => entry.severity === 1 && entry.message.startsWith('MATCH'))
    .sort((left, right) => right.timestamp - left.timestamp)
    .slice(20, 30)
    .map(entry => entry.message);
  const getLogs = book.getLogs.bind(book);
  let matchesExamined = 0;
  let maxCandidates = 0;
  book.getLogs = (options, collector) => {
    assert.ok(collector, 'Text-filtered paging should use the bounded reader');
    const add = collector.heap.add.bind(collector.heap);
    collector.heap.add = candidate => {
      matchesExamined++;
      assert.equal(Object.hasOwn(candidate, 'message'), false);
      add(candidate);
      maxCandidates = Math.max(maxCandidates, collector.heap.items.length);
      assert.ok(collector.heap.items.every(item => !Object.hasOwn(item, 'message')));
    };
    return getLogs(options, collector);
  };

  const result = await log.getLogs({ message: 'match CAFÉ', severity: 1, skip: 20, take: 10, maxSizeKb: 900 });

  assert.deepEqual(result.logs.map(entry => entry.message), expected);
  assert.ok(result.logs.every(entry =>
    Object.keys(entry).sort().join(',') === 'id,message,severity,timestamp'));
  assert.ok(matchesExamined > 30);
  assert.equal(maxCandidates, 30);
  assert.equal(book.fdRead, null);
});

test('message search closes its read descriptor if a later index row is invalid', async t => {
  const log = await createLog(t);
  const timestamp = new Date(2026, 0, 2, 12, 0, 0);
  for (let index = 0; index < 70; index++) {
    await log.writeLine({ message: 'searchable', timestamp });
  }
  const book = log.getLogBook(timestamp);
  await Promise.all([flush(book.indexStream), flush(book.logStream)]);
  fs.appendFileSync(book.indexFile, 'invalid row\n');

  await assert.rejects(book.getLogs({ message: 'searchable' }), /Invalid log index row/);
  assert.equal(book.fdRead, null);
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

test('retention deletes all expired dates without closing retained writers', async t => {
  const log = await createLog(t);
  const today = new Date();
  const timestamp = daysAgo => new Date(today.getFullYear(), today.getMonth(), today.getDate() - daysAgo, 12);
  for (const days of [30, 10, 8, 7, 0]) {
    await log.writeLine({ message: `day-${days}`, timestamp: timestamp(days) });
  }
  const retained = [log.getLogBook(timestamp(7)), log.getLogBook(timestamp(0))];
  const expired = [log.getLogBook(timestamp(30)), log.getLogBook(timestamp(10)), log.getLogBook(timestamp(8))];
  const writer = retained[1].logStream;
  const indexWriter = retained[1].indexStream;
  for (const book of retained) t.mock.method(book, 'destroy', () => assert.fail('Retained book was closed'));
  await log.clearLog(7);
  for (const book of expired) {
    assert.equal(log.LogBooks[book.id], undefined);
    assert.equal(fs.existsSync(book.file + '.log'), false);
    assert.equal(fs.existsSync(book.v2IndexFile), false);
  }
  assert.equal(retained[1].logStream, writer);
  assert.equal(retained[1].indexStream, indexWriter);
  assert.equal(log.logCount, 3);
  await log.clearLog(7);
  assert.equal(log.logCount, 3);
  assert.equal(retained[1].logStream, writer);
  await log.writeLine({ message: 'still writable', timestamp: today });
  const { logs } = await log.getLogs({ take: 20 });
  assert.ok(logs.some(entry => entry.message === 'still writable'));
  assert.ok(logs.some(entry => entry.message === 'day-7'));
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

test('historical logbooks release writers and reopen safely for backdated appends', async t => {
  const log = await createLog(t);
  const books = [];
  const streams = [];
  for (let day = 1; day <= 24; day++) {
    const timestamp = new Date(2026, 0, day, 12);
    await log.writeLine({ message: `day ${day}`, timestamp });
    const book = log.getLogBook(timestamp);
    books.push(book);
    streams.push(book.logStream, book.indexStream);
    const activeStreams = Object.values(log.LogBooks).flatMap(item =>
      [item.logStream, item.indexStream].filter(Boolean));
    assert.equal(activeStreams.length, 2);
  }
  assert.ok(streams.slice(0, -2).every(stream => stream.closed));
  assert.deepEqual((await books[0].getLogs()).map(entry => entry.message), ['day 1']);

  await log.writeLine({ message: 'backdated café 🌙', timestamp: new Date(2026, 0, 1, 12, 0, 1) });
  const entries = await books[0].getLogs();
  assert.deepEqual(entries.map(entry => entry.message), ['day 1', 'backdated café 🌙']);
  assert.deepEqual(entries.map(entry => entry.id), [`${books[0].id}$0`, `${books[0].id}$1`]);
  assert.equal(books[23].logStream, null);
  assert.equal(books[23].indexStream, null);
});

test('switching logbooks does not close a writer with pending log data', async t => {
  const log = await createLog(t);
  const timestamp = new Date(2026, 0, 2, 12);
  await log.writeLine({ message: 'seed', timestamp });
  const book = log.getLogBook(timestamp);
  const logStream = book.logStream;
  const indexStream = book.indexStream;
  const ensureIndexFormat = book.ensureIndexFormat.bind(book);
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  book.ensureIndexFormat = async () => {
    await gate;
    return ensureIndexFormat();
  };
  const pendingWrite = log.writeLine({ message: 'pending', timestamp });
  try {
    assert.equal(book.pendingWrites, 1);
    await log.writeLine({ message: 'next day', timestamp: new Date(2026, 0, 3, 12) });
    assert.equal(book.logStream, logStream);
    assert.equal(book.indexStream, indexStream);
    assert.equal(logStream.writableEnded, false);
  } finally {
    release();
    await pendingWrite;
  }

  assert.equal(book.pendingWrites, 0);
  assert.equal(logStream.closed, true);
  assert.equal(indexStream.closed, true);
  assert.equal(book.logStream, null);
  assert.deepEqual((await book.getLogs()).map(entry => entry.message), ['seed', 'pending']);
});

test('day switches preserve call order and backdated writes wait for closing files', async t => {
  const log = await createLog(t);
  const timestamp = new Date(2026, 0, 2, 12);
  await log.writeLine({ message: 'seed', timestamp });
  const book = log.getLogBook(timestamp);
  const stream = book.logStream;
  const end = stream.end.bind(stream);
  let release;
  stream.end = (...args) => {
    release = () => end(...args);
    return stream;
  };
  const writes = [];
  const nextTimestamp = new Date(2026, 0, 3, 12);
  try {
    writes.push(log.writeLine({ message: 'first', timestamp: nextTimestamp }));
    await log.writeLine({ message: 'second', timestamp: nextTimestamp });
    writes.push(log.writeLine({ message: 'backdated', timestamp }));
    assert.equal(book.pendingWrites, 1);
    assert.equal(book.logStream, null);
    assert.ok(book.closingWriteStreams);
  } finally {
    if (release) release();
    await Promise.all(writes);
  }

  assert.deepEqual((await log.getLogBook(nextTimestamp).getLogs()).map(entry => entry.message),
    ['first', 'second']);
  assert.deepEqual((await book.getLogs()).map(entry => entry.message), ['seed', 'backdated']);
  assert.equal(stream.closed, true);
});

test('writer close failures are reported after both files are released', async t => {
  const log = await createLog(t);
  const timestamp = new Date(2026, 0, 2, 12);
  await log.writeLine({ message: 'seed', timestamp });
  const book = log.getLogBook(timestamp);
  const logStream = book.logStream;
  const indexStream = book.indexStream;
  const failure = new Error('injected writer close failure');
  logStream.end = () => logStream.destroy(failure);

  await assert.rejects(book.closeIdleWriteStreams(), error => error === failure);
  assert.equal(logStream.closed, true);
  assert.equal(indexStream.closed, true);
  assert.equal(book.closingWriteStreams, null);
});

test('legacy writers preserve Unicode lengths and metadata after closing and reopening', async t => {
  const log = await createLog(t);
  const timestamp = new Date(2026, 0, 2, 12);
  const book = log.getLogBook(timestamp);
  book.indexVersion = 1;
  book.indexFile = book.legacyIndexFile;
  const entry = { message: 'legacy café', timestamp, severity: 6, facility: 18, app: 'app', hostname: 'host' };
  await log.writeLine(entry);
  await log.writeLine({ message: 'next day', timestamp: new Date(2026, 0, 3, 12) });
  assert.equal(book.logStream, null);

  await log.writeLine({ ...entry, message: 'legacy 🌙' });
  const entries = await book.getLogs();
  assert.deepEqual(entries.map(item => item.message), ['legacy café', 'legacy 🌙']);
  assert.ok(entries.every(item =>
    item.severity === 6 && item.facility === 18 && item.app === 'app' && item.hostname === 'host'));
});
