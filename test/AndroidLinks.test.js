'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const {
  AndroidLinkFeed, SECRET_SETTING, createLinks, linkFilterStateId, localHostname, normalizeLinkConfig,
  resetSecret, signLinkConfig, verifyLink
} = require('../lib/android-links');
const api = require('../api');

function fakeHomey() {
  const settings = new Map();
  return {
    manifest: { id: 'nl.nielsdeklerk.log' },
    settings: { get: key => settings.get(key), set: (key, value) => settings.set(key, value) },
    cloud: {
      getLocalAddress: async () => '192.168.1.242:80',
      getHomeyId: async () => 'abc123'
    },
    __: () => undefined,
    setTimeout,
    clearTimeout
  };
}

test('android links are signed, reject tampering, and stop working after a reset', () => {
  const homey = fakeHomey();
  const { payload, signature } = signLinkConfig(homey, { entryCount: 10, minSeverity: 3, appFilter: ' Flow ', facility: 'all' });
  const config = verifyLink(homey, payload, signature);
  assert.equal(config.entryCount, 10);
  assert.equal(config.minSeverity, 3);
  assert.equal(config.appFilter, 'Flow');
  assert.equal(config.facility, undefined);

  const tampered = Buffer.from(JSON.stringify({ ...config, minSeverity: 7 })).toString('base64url');
  assert.throws(() => verifyLink(homey, tampered, signature), /invalid or has been reset/);
  assert.throws(() => verifyLink(homey, payload, 'short'), /invalid or has been reset/);

  const secret = homey.settings.get(SECRET_SETTING);
  resetSecret(homey);
  assert.notEqual(homey.settings.get(SECRET_SETTING), secret);
  assert.throws(() => verifyLink(homey, payload, signature), /invalid or has been reset/);
});

test('android link config rejects invalid settings and keeps only active filters', () => {
  assert.throws(() => normalizeLinkConfig({ entryCount: 0 }), /entry count/);
  assert.throws(() => normalizeLinkConfig({ appFilter: 'x'.repeat(201) }), /at most 200/);
  const config = normalizeLinkConfig({ minSeverity: '', facility: 23, hostnameFilter: '  ', colorMode: 'dark' });
  assert.equal(config.minSeverity, undefined);
  assert.equal(config.facility, 23);
  assert.equal(config.hostnameFilter, undefined);
  assert.equal(config.colorMode, 'dark');
  assert.equal(config.searchMode, 'advanced');
  assert.equal(normalizeLinkConfig({ searchMode: 'simple' }).searchMode, 'simple');
  assert.equal(config.showFilters, true);
  assert.equal(config.paging, false);
  assert.equal(normalizeLinkConfig({ searchMode: 'none', paging: true, showFilters: false }).searchMode, 'none');
  assert.equal(normalizeLinkConfig({ v: 1, searchMode: 'simple', showSearch: false }).searchMode, 'none');
  assert.equal(normalizeLinkConfig({ filterStateId: 'homey-widget-1' }).filterStateId, 'homey-widget-1');
  assert.throws(() => normalizeLinkConfig({ filterStateId: '../widget' }), /widget instance ID/);
});

test('Android filter state uses app-side storage scoped to the originating widget instance', () => {
  const homey = fakeHomey();
  const first = signLinkConfig(homey, { filterStateId: 'homey-widget-1' });
  const second = signLinkConfig(homey, { filterStateId: 'homey-widget-2' });
  assert.equal(linkFilterStateId(first.payload, verifyLink(homey, first.payload, first.signature)), 'homey-widget-1');
  assert.deepEqual(api.getAndroidFilterState({ homey, query: { ssl: first.payload, sig: first.signature } }),
    { levels: [], from: null, to: null });
  assert.deepEqual(api.setAndroidFilterState({
    homey, query: { ssl: first.payload, sig: first.signature },
    body: { levels: [3, 6], from: '2026-11-17', to: '2026-11-18' }
  }), { saved: true });
  assert.deepEqual(api.getAndroidFilterState({ homey, query: { ssl: first.payload, sig: first.signature } }),
    { levels: [3, 6], from: '2026-11-17', to: '2026-11-18' });
  assert.deepEqual(api.getAndroidFilterState({ homey, query: { ssl: second.payload, sig: second.signature } }),
    { levels: [], from: null, to: null });
  assert.throws(() => api.getAndroidFilterState({ homey, query: { ssl: first.payload, sig: 'x'.repeat(43) } }),
    /invalid or has been reset/);
});

test('signed update settings default to live, validate periodic intervals, and do not activate an unused live feed', async () => {
  const homey = fakeHomey();
  homey.app = {
    androidLinkFeed: new AndroidLinkFeed(),
    Log: { getLogs: async () => ({ logs: [] }) }
  };
  assert.equal(normalizeLinkConfig({}).updateMode, 'live');
  assert.equal(normalizeLinkConfig({ updateMode: 'periodic' }).refreshInterval, 10);
  for (const refreshInterval of [1, '2', 2147483]) {
    const signed = signLinkConfig(homey, { updateMode: 'periodic', refreshInterval });
    const config = verifyLink(homey, signed.payload, signed.signature);
    assert.equal(config.updateMode, 'periodic');
    assert.equal(config.refreshInterval, Number(refreshInterval));
  }
  for (const refreshInterval of [0, -1, 0.5, '', 'bad', Infinity, 2147484, null, true, [1]]) {
    assert.throws(() => normalizeLinkConfig({ updateMode: 'periodic', refreshInterval }), /refresh interval/);
  }
  assert.throws(() => normalizeLinkConfig({ updateMode: 'other' }), /update mode/);
  const periodic = signLinkConfig(homey, { updateMode: 'periodic', refreshInterval: 5 });
  await api.getAndroidLogs({
    homey, query: { ssl: periodic.payload, sig: periodic.signature, updateMode: 'live' }
  });
  assert.equal(homey.app.androidLinkFeed.isActive(), false);
  const live = signLinkConfig(homey, {});
  await api.getAndroidLogs({
    homey, query: { ssl: live.payload, sig: live.signature, updateMode: 'periodic' }
  });
  assert.equal(homey.app.androidLinkFeed.isActive(), true, 'unsigned query parameters cannot change update mode');
});

test('levels chosen in a wrapper replace the link minimum level for live entries', () => {
  const { matchesLinkFilters } = require('../lib/android-links');
  assert.equal(matchesLinkFilters({ minSeverity: 4 }, { severity: 7 }), false);
  assert.equal(matchesLinkFilters({ minSeverity: 4 }, { severity: 7 }, [6, 7]), true);
  assert.equal(matchesLinkFilters({ minSeverity: 4 }, { severity: 3 }, [6, 7]), false);
});

test('android links point to the widget locally and through the cloud with a local hint', async () => {
  assert.equal(localHostname('192.168.1.242:80'), '192-168-1-242.homey.homeylocal.com');
  assert.equal(localHostname('homey.local'), null);
  const links = await createLinks(fakeHomey(), {});
  assert.match(links.local,
    /^https:\/\/192-168-1-242\.homey\.homeylocal\.com\/app\/nl\.nielsdeklerk\.log\/widgets\/log_viewer\/index\.html\?ssl=[\w-]+&sig=[\w-]{43}$/);
  assert.match(links.automatic, /^https:\/\/abc123\.connect\.athom\.com\/app\/.+&local=192-168-1-242\.homey\.homeylocal\.com$/);
});

test('android link feed answers waiting requests with matching entries, timeouts, and reloads', async () => {
  let time = 0;
  const feed = new AndroidLinkFeed({ now: () => time, idleMs: 1000, maxEntries: 2, instance: 'first' });
  const timers = [];
  const options = matches => ({
    instance: 'first',
    matches,
    timeoutMs: 20000,
    setTimeout: callback => { timers.push(callback); return callback; },
    clearTimeout: timer => { timers.splice(timers.indexOf(timer), 1); }
  });
  feed.publish({ message: 'not buffered while idle' });
  const start = feed.touch();
  assert.equal(start, 1);

  const waiting = feed.wait({ after: start, ...options(log => log.severity <= 3) });
  feed.publish({ message: 'filtered', severity: 6 });
  feed.publish({ message: 'delivered', severity: 3 });
  assert.deepEqual(await waiting, { seq: 3, logs: [{ message: 'delivered', severity: 3 }] });
  assert.equal(timers.length, 0);

  const immediate = await feed.wait({ after: start, ...options(() => true) });
  assert.equal(immediate.logs.length, 2);

  const timeout = feed.wait({ after: 3, ...options(() => true) });
  timers[0]();
  assert.deepEqual(await timeout, { seq: 3, logs: [] });

  assert.equal((await feed.wait({ after: 99, ...options(() => true) })).reload, true);
  assert.equal((await feed.wait({ after: 3, ...options(() => true), instance: 'previous' })).reload, true);
  feed.publish({ message: 'drops the oldest buffered entry' });
  assert.equal((await feed.wait({ after: 1, ...options(() => true) })).reload, true);
  time = 5000;
  feed.publish({ message: 'after the idle window' });
  assert.equal((await feed.wait({ after: 3, ...options(() => true) })).reload, true);
});

test('android updates endpoint verifies the link, filters entries, and adds the link timestamp format', async () => {
  const homey = fakeHomey();
  homey.app = { androidLinkFeed: new AndroidLinkFeed(), Log: {}, apiReady: false };
  const { payload, signature } = signLinkConfig(homey, { minSeverity: 3, datetimeFormat: 'datetime' });
  assert.deepEqual(await api.getAndroidUpdates({ homey, query: { ssl: payload, sig: signature, after: '0' } }), { ready: false });
  homey.app.apiReady = true;
  homey.app.androidLinkFeed.markReady();
  await assert.rejects(api.getAndroidUpdates({ homey, query: { ssl: payload, sig: 'x'.repeat(43), after: '0' } }),
    /invalid or has been reset/);

  const after = homey.app.androidLinkFeed.touch();
  const instance = homey.app.androidLinkFeed.instance;
  const pending = api.getAndroidUpdates({ homey, query: { ssl: payload, sig: signature, after: String(after), instance } });
  homey.app.androidLinkFeed.publish({ severity: 6, message: 'debug', timestamp_formatted: {} });
  homey.app.androidLinkFeed.publish({ severity: 3, message: 'error', timestamp_formatted: { datetime: 'formatted' } });
  const result = await pending;
  assert.equal(result.available, true);
  assert.deepEqual(result.logs.map(log => log.message), ['error']);
  assert.equal(result.logs[0].timestamp_formatted.datetime, 'formatted');

  const reload = await api.getAndroidUpdates({ homey, query: { ssl: payload, sig: signature, after: '999', instance } });
  assert.deepEqual(reload, { reload: true });
  const reinstalled = await api.getAndroidUpdates({ homey, query: { ssl: payload, sig: signature, after: '3', instance: 'before-reinstall' } });
  assert.deepEqual(reinstalled, { reload: true });
});

test('android updates apply the selected inclusive date range to live entries', async () => {
  const { BL } = require('betterlogiclibrary');
  const previousDateTime = BL._datetime;
  BL._datetime = {
    asLocale: date => new Date(date),
    toString: (_format, date) => new Date(date).toISOString()
  };
  try {
    const homey = fakeHomey();
    homey.app = { androidLinkFeed: new AndroidLinkFeed(), Log: {}, apiReady: true };
    homey.app.androidLinkFeed.markReady();
    const { payload, signature } = signLinkConfig(homey, { datetimeFormat: 'datetime' });
    const after = homey.app.androidLinkFeed.touch();
    const instance = homey.app.androidLinkFeed.instance;
    const pending = api.getAndroidUpdates({
      homey, query: { ssl: payload, sig: signature, after: String(after), instance, dateFrom: '2026-11-17', dateTo: '2026-11-17' }
    });
    homey.app.androidLinkFeed.publish({ timestamp: '2026-11-16T12:00:00.000Z', severity: 3, message: 'before' });
    homey.app.androidLinkFeed.publish({ timestamp: '2026-11-17T12:00:00.000Z', severity: 3, message: 'inside' });
    homey.app.androidLinkFeed.publish({ timestamp: '2026-11-18T12:00:00.000Z', severity: 3, message: 'after' });
    const result = await pending;
    assert.deepEqual(result.logs.map(log => log.message), ['inside']);
    await assert.rejects(api.getAndroidUpdates({
      homey, query: { ssl: payload, sig: signature, after: String(result.seq), instance, dateFrom: '2026-11-18', dateTo: '2026-11-17' }
    }), /on or before/);
  } finally {
    BL._datetime = previousDateTime;
  }
});

test('Android log queries retain filters and support paging from signed widget settings', async () => {
  const homey = fakeHomey();
  let filters;
  homey.app = {
    androidLinkFeed: new AndroidLinkFeed(),
    Log: {
      getLogs: async options => {
        filters = options;
        return { logs: [], count: 0 };
      }
    }
  };
  const { payload, signature } = signLinkConfig(homey, { minSeverity: 3, entryCount: 5, paging: true });
  await api.getAndroidLogs({
    homey,
    query: { ssl: payload, sig: signature, dateFrom: '2026-11-17', dateTo: '2026-11-17', skip: '10', search: 'backup' }
  });
  assert.equal(filters.take, 6);
  assert.equal(filters.skip, 10);
  assert.equal(filters.maxSeverity, 3);
  assert.equal(filters.timestamp_fromUTC, '2026-11-17');
  assert.equal(filters.timestamp_toUTC, '2026-11-17');
  assert.equal(filters.search, 'backup');
  assert.equal(filters.searchMode, 'advanced');
});

test('Android history and live updates independently format the second timestamp from the selected design', async () => {
  const { BL } = require('betterlogiclibrary');
  const previousDateTime = BL._datetime;
  const formats = [];
  BL._datetime = { toString: format => { formats.push(format); return format === 'dd-MM' ? '20-11' : '09:00:00'; } };
  try {
    const homey = fakeHomey();
    let received;
    homey.app = {
      apiReady: true, androidLinkFeed: new AndroidLinkFeed(),
      Log: { getLogs: async options => { received = options; return { logs: [] }; } }
    };
    const feed = homey.app.androidLinkFeed;
    feed.markReady();
    const { payload, signature } = signLinkConfig(homey, { designStyle: 'builtin:compact-classic', datetimeFormat: 'HH:mm:ss' });
    const base = { ssl: payload, sig: signature };
    await api.getAndroidLogs({ homey, query: base });
    assert.deepEqual(received.timestampFormat, ['HH:mm:ss', 'ddd d MMM', 'dd-MM']);
    const pending = api.getAndroidUpdates({ homey, query: { ...base, after: String(feed.seq), instance: feed.instance } });
    feed.publish({ timestamp: '2026-11-20T08:00:00Z', severity: 6, message: 'live', timestamp_formatted: { 'ddd d MMM': 'Fri 20 Nov' } });
    const entry = (await pending).logs[0];
    assert.equal(entry.timestamp_formatted['HH:mm:ss'], '09:00:00');
    assert.equal(entry.timestamp_formatted['dd-MM'], '20-11');
    assert.deepEqual(formats, ['HH:mm:ss', 'dd-MM']);
  } finally {
    BL._datetime = previousDateTime;
  }
});

test('Android metadata filters override signed defaults in history and polling, and clearing restores defaults', async () => {
  const homey = fakeHomey();
  let received;
  homey.app = {
    apiReady: true,
    androidLinkFeed: new AndroidLinkFeed(),
    Log: { getLogs: async options => { received = options; return { logs: [] }; } }
  };
  homey.app.androidLinkFeed.markReady();
  const { payload, signature } = signLinkConfig(homey,
    { facility: 3, appFilter: 'Backup', hostnameFilter: 'Server', searchMode: 'advanced' });
  const base = { ssl: payload, sig: signature };
  const metadata = { facility: '0', appSearch: 'Climate OR Heating', hostnameSearch: 'Kitchen AND NOT Garage' };
  await api.getAndroidLogs({ homey, query: { ...base, ...metadata } });
  assert.equal(received.facility, 0);
  assert.equal(received.appSearch, metadata.appSearch);
  assert.equal(received.hostnameSearch, metadata.hostnameSearch);
  assert.equal(received.app, undefined);
  assert.equal(received.hostname, undefined);

  const feed = homey.app.androidLinkFeed;
  const pending = api.getAndroidUpdates({
    homey, query: { ...base, ...metadata, after: String(feed.seq), instance: feed.instance }
  });
  const entry = {
    timestamp: new Date().toISOString(), severity: 3, facility: 0, app: 'Climate Flow', hostname: 'Kitchen',
    timestamp_formatted: { timeshort: '10:00', 'ddd d MMM': 'Fri 20 Nov' }
  };
  feed.publish({ ...entry, hostname: 'Garage', message: 'not matching hostname' });
  feed.publish({ ...entry, app: 'Backup', message: 'not matching app' });
  feed.publish({ ...entry, facility: 3, message: 'not matching facility' });
  feed.publish({ ...entry, message: 'matching' });
  assert.deepEqual((await pending).logs.map(log => log.message), ['matching']);

  const multiple = { ...base, ...metadata, facility: '0,16' };
  await api.getAndroidLogs({ homey, query: multiple });
  assert.deepEqual(received.facility, [0, 16]);
  const next = api.getAndroidUpdates({
    homey, query: { ...multiple, after: String(feed.seq), instance: feed.instance }
  });
  feed.publish({ ...entry, facility: 3, message: 'excluded default' });
  feed.publish({ ...entry, facility: 16, message: 'second facility' });
  assert.deepEqual((await next).logs.map(log => log.message), ['second facility']);
  const savedFacilities = { levels: [], from: null, to: null, facility: [16, 0] };
  api.setAndroidFilterState({ homey, query: base, body: savedFacilities });
  assert.deepEqual(api.getAndroidFilterState({ homey, query: base }).facility, [0, 16]);

  await api.getAndroidLogs({ homey, query: base });
  assert.equal(received.facility, 3);
  assert.equal(received.app, 'Backup');
  assert.equal(received.hostname, 'Server');
  assert.equal(received.appSearch, undefined);
  await assert.rejects(api.getAndroidLogs({
    homey, query: { ...base, appSearch: 'Climate AND (' }
  }), /search|parenthesis/);

  const hidden = signLinkConfig(homey, { showFilters: false, facility: 3, appFilter: 'Backup' });
  await api.getAndroidLogs({
    homey, query: { ssl: hidden.payload, sig: hidden.signature, ...metadata }
  });
  assert.equal(received.facility, 3);
  assert.equal(received.app, 'Backup');
  assert.equal(received.appSearch, undefined);
});

function fakeElement(tag) {
  return {
    tag,
    children: [],
    listeners: {},
    classList: { add() {}, toggle() {} },
    setAttribute() {},
    appendChild(child) { this.children.push(child); },
    addEventListener(event, callback) { this.listeners[event] = callback; },
    select() {}
  };
}

function findAll(node, predicate, found = []) {
  if (predicate(node)) found.push(node);
  (node.children || []).forEach(child => findAll(child, predicate, found));
  return found;
}

test('widget shows copyable Web widget links instead of logs when Android scrolling is enabled', async () => {
  const source = fs.readFileSync(require.resolve('../assets/js/ssl-widget.js'), 'utf8');
  let shown;
  let ready;
  const requests = [];
  const document = {
    createElement: fakeElement,
    documentElement: { classList: { contains: name => name === 'homey-dark-mode' } },
    body: { replaceChildren: main => { shown = main; } }
  };
  const context = vm.createContext({ document, Promise });
  vm.runInContext(source, context);
  const settings = { androidScroll: true, height: 300 };
  context.onHomeyReady({
    __: () => undefined,
    getSettings: () => settings,
    api: async (method, path, body) => {
      requests.push([method, path, body]);
      return { local: 'https://local/link', automatic: 'https://cloud/link' };
    },
    getWidgetInstanceId: () => 'homey-widget-1',
    ready: options => { ready = options; }
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(requests.length, 1);
  assert.equal(requests[0][0] + ' ' + requests[0][1], 'POST /android-links');
  // An automatic widget stores the Homey app's current theme in the link.
  assert.equal(JSON.stringify(requests[0][2]), JSON.stringify({
    androidScroll: true, height: 300, filterStateId: 'homey-widget-1', colorMode: 'dark'
  }));
  assert.equal(settings.colorMode, undefined);
  assert.deepEqual(findAll(shown, node => node.tag === 'input').map(input => input.value),
    ['https://local/link', 'https://cloud/link']);
  assert.equal(ready.height, 300);
});

function loadWrapper() {
  const source = fs.readFileSync(require.resolve('../assets/js/ssl-widget-android.js'), 'utf8');
  const window = {};
  vm.runInContext(source, vm.createContext({ window, URLSearchParams, Promise, setTimeout, clearTimeout }));
  return window.SSLAndroidWrapper;
}

test('periodic Web widgets do not long-poll and still notice app restarts', async () => {
  const source = fs.readFileSync(require.resolve('../assets/js/ssl-widget-android.js'), 'utf8');
  let homey;
  let instance = null;
  let reloads = 0;
  const urls = [];
  const timers = [];
  const window = {
    location: {
      search: '?ssl=payload&sig=signature',
      pathname: '/app/nl.nielsdeklerk.log/widgets/log_viewer/index.html',
      origin: 'https://test.homey.homeylocal.com',
      hostname: 'test.homey.homeylocal.com',
      reload: () => { reloads++; }
    },
    onHomeyReady: value => { homey = value; }
  };
  vm.runInContext(source, vm.createContext({
    window, URLSearchParams, Promise,
    document: {
      readyState: 'complete',
      documentElement: { classList: { add() {} } },
      createElement: fakeElement,
      body: { replaceChildren: error => { assert.fail(JSON.stringify(error)); } }
    },
    setTimeout: (_callback, delay) => { timers.push(delay); return timers.length; },
    clearTimeout() {},
    fetch: async url => {
      urls.push(url);
      const requestPath = new URL(url).pathname;
      const data = requestPath.endsWith('/android/init')
        ? { config: { updateMode: 'periodic', refreshInterval: 2 }, styles: {}, translations: {} }
        : { available: !!instance, logs: [], seq: 1, instance };
      return { ok: true, text: async () => JSON.stringify(data) };
    }
  }));
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(homey);
  assert.equal(homey.getSettings().refreshInterval, 2);
  await homey.api('GET', '/logs?take=2', {});
  instance = 'app-start';
  await homey.api('GET', '/logs?take=2', {});
  await homey.api('GET', '/logs?take=2', {});
  assert.equal(reloads, 0);
  instance = 'app-restarted';
  await homey.api('GET', '/logs?take=2', {});
  assert.equal(reloads, 1);
  assert.equal(urls.filter(url => url.includes('/android/logs?')).length, 4);
  assert.ok(urls.every(url => !url.includes('/android/updates')));
  assert.deepEqual(timers, [], 'no live-poll retry loop is started');
});

test('web widget wrapper maps the widget API to the signed link endpoints', async () => {
  const wrapper = loadWrapper();
  const loadCalls = [];
  assert.equal(wrapper.appIdFromPath('/app/nl.nielsdeklerk.log/widgets/log_viewer/index.html'), 'nl.nielsdeklerk.log');
  const homey = wrapper.createHomey({
    config: { entryCount: 5, filterStateId: 'homey-widget-1' },
    styles: { designs: [] },
    translations: { 'widgets.search': 'Zoeken' },
    loadFilterState: async () => ({ levels: [3], from: null, to: null }),
    saveFilterState: async state => ({ saved: state.levels[0] === 6 }),
    loadLogs: async (...args) => {
      loadCalls.push(args);
      return { available: true, logs: [], seq: 4 };
    }
  });
  assert.equal(homey.getSettings().entryCount, 5);
  assert.equal(homey.getWidgetInstanceId(), 'homey-widget-1');
  assert.equal(homey.__('widgets.search'), 'Zoeken');
  assert.equal(homey.__('widgets.loading'), undefined);
  assert.deepEqual(await homey.api('GET', '/filter-state/homey-widget-1', {}), { levels: [3], from: null, to: null });
  assert.deepEqual(await homey.api('PUT', '/filter-state/homey-widget-1', { levels: [6], from: null, to: null }),
    { saved: true });
  assert.equal((await homey.api('POST', '/register-timestamp-format', {})).registered, true);
  assert.equal(JSON.stringify(await homey.api('GET', '/styles', {})), '{"designs":[]}');
  assert.equal((await homey.api('GET', '/logs?take=5&timestampFormat=datetime&skip=10', {})).seq, 4);
  await homey.api('GET', '/logs?dateFrom=2026-11-17&dateTo=2026-11-18&search=backup&facility=0&appSearch=Climate%20OR%20Heating&hostnameSearch=Kitchen', {});
  assert.deepEqual(JSON.parse(JSON.stringify(loadCalls)), [
    [null, null, null, '10', null, { facility: null, appSearch: null, hostnameSearch: null }],
    [null, '2026-11-17', '2026-11-18', null, 'backup',
      { facility: '0', appSearch: 'Climate OR Heating', hostnameSearch: 'Kitchen' }]
  ]);
  await assert.rejects(homey.api('POST', '/android-links', {}));

  const received = [];
  const listener = log => received.push(log);
  homey.on('log_updated', listener);
  homey.emitLocal('log_updated', 'first');
  homey.off('log_updated', listener);
  homey.emitLocal('log_updated', 'second');
  assert.deepEqual(received, ['first']);
});

test('web widget connection forwards write options to signed link endpoints', async () => {
  const wrapper = loadWrapper();
  const requests = [];
  const connection = wrapper.createConnection({
    params: { ssl: 'payload', sig: 'signature' },
    appId: 'nl.nielsdeklerk.log',
    origin: 'https://abc123.connect.athom.com',
    hostname: 'abc123.connect.athom.com',
    fetchJson: async (url, timeout, options) => {
      requests.push({ url, timeout, options });
      return { saved: true };
    }
  });
  const options = { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{"levels":[6]}' };
  assert.deepEqual(await connection.request('/android/filter-state', {}, undefined, options), { saved: true });
  assert.equal(requests[0].url,
    'https://abc123.connect.athom.com/api/app/nl.nielsdeklerk.log/android/filter-state?ssl=payload&sig=signature');
  assert.equal(requests[0].timeout, undefined);
  assert.deepEqual(requests[0].options, options);
});

test('web widget wrapper uses the local address when reachable and falls back to the cloud', async () => {
  const wrapper = loadWrapper();
  const urls = [];
  let localUp = true;
  let time = 0;
  const connection = wrapper.createConnection({
    params: { ssl: 'payload', sig: 'signature', local: '192-168-1-242.homey.homeylocal.com' },
    appId: 'nl.nielsdeklerk.log',
    origin: 'https://abc123.connect.athom.com',
    hostname: 'abc123.connect.athom.com',
    now: () => time,
    fetchJson: async url => {
      urls.push(url);
      if (url.includes('homeylocal') && !localUp) throw new Error('offline');
      return { ok: true };
    }
  });
  await connection.request('/android/logs');
  assert.equal(urls[0], 'https://192-168-1-242.homey.homeylocal.com/api/app/nl.nielsdeklerk.log/android/ping');
  assert.equal(urls[1], 'https://192-168-1-242.homey.homeylocal.com/api/app/nl.nielsdeklerk.log/android/logs?ssl=payload&sig=signature');

  localUp = false;
  await connection.request('/android/updates', { after: 3 });
  assert.equal(urls[3], 'https://abc123.connect.athom.com/api/app/nl.nielsdeklerk.log/android/updates?ssl=payload&sig=signature&after=3');
  assert.equal(connection.current(), 'https://abc123.connect.athom.com/api/app/nl.nielsdeklerk.log');

  localUp = true;
  time = 60000;
  await connection.request('/android/logs');
  assert.equal(connection.current(), 'https://192-168-1-242.homey.homeylocal.com/api/app/nl.nielsdeklerk.log');
});

test('web widget wrapper long-polls entries, reports storage readiness, and reloads when asked', async () => {
  const wrapper = loadWrapper();
  const responses = [
    { ready: false },
    { available: true, seq: 5, logs: [{ message: 'one' }] },
    { reload: true }
  ];
  const requests = [];
  const events = [];
  let reloaded = false;
  const poller = wrapper.createPoller({
    request: async (path, extra) => {
      requests.push([path, extra.after, extra.instance, extra.dateFrom, extra.dateTo, extra.facility, extra.appSearch, extra.hostnameSearch]);
      return responses.shift();
    },
    emit: (event, data) => events.push([event, data && data.message]),
    reload: () => { reloaded = true; },
    setTimeout: callback => setImmediate(callback)
  });
  poller.setFilters(null, '2026-11-17', '2026-11-18',
    { facility: '0', appSearch: 'Climate OR Heating', hostnameSearch: 'Kitchen' });
  poller.update({ available: false, seq: 2, instance: 'app-start' });
  poller.update({ available: false, seq: 2, instance: 'app-start' });
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.deepEqual(requests, [
    ['/android/updates', 2, 'app-start', '2026-11-17', '2026-11-18', '0', 'Climate OR Heating', 'Kitchen'],
    ['/android/updates', 2, 'app-start', '2026-11-17', '2026-11-18', '0', 'Climate OR Heating', 'Kitchen'],
    ['/android/updates', 5, 'app-start', '2026-11-17', '2026-11-18', '0', 'Climate OR Heating', 'Kitchen']
  ]);
  assert.deepEqual(events, [['log_storage_ready', undefined], ['log_updated', 'one']]);
  assert.equal(reloaded, true);
});
