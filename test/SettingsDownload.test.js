const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const sslRoot = path.resolve(__dirname, '..');
const bllRoot = path.resolve(sslRoot, '..', 'nl.qluster-it.BetterLogicLibrary');
const implementations = [['SSL', require('../settings/settings-download')]];
if (fs.existsSync(path.join(bllRoot, 'assets', 'js', 'settings-download.js'))) {
  implementations.push(['BLL', require(path.join(bllRoot, 'assets', 'js', 'settings-download.js'))]);
}
const link = (token = 'current') => ({
  token, localUrl: 'https://local.homey.test/file.json', cloudUrl: 'https://cloud.homey.test/file.json'
});
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
function clock() {
  let now = 0;
  let next = 0;
  const pending = new Map();
  return {
    pending,
    setTimeout(fn, delay) { const id = ++next; pending.set(id, { fn, at: now + delay }); return id; },
    clearTimeout(id) { pending.delete(id); },
    tick(delay) {
      const end = now + delay;
      while (true) {
        const due = [...pending].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        pending.delete(due[0]);
        now = due[1].at;
        due[1].fn();
      }
      now = end;
    }
  };
}
function fixture(implementation, overrides = {}) {
  const time = clock();
  const homey = new EventEmitter();
  let reserve;
  let state;
  const probes = [];
  const opened = [];
  homey.__ = (key) => key;
  homey.api = (method, url, data, callback) => { reserve = callback; };
  homey.openURL = (url, callback) => { opened.push(url); callback(); };
  const download = implementation.create({
    homey, path: '/download/', ...time,
    changed: (next) => { state = next; },
    probe: (url) => { probes.push(url); return Promise.resolve(); },
    ...overrides
  });
  return { homey, download, time, probes, opened, get state() { return state; }, reserve: (...args) => reserve(...args) };
}
for (const [name, implementation] of implementations) {
  test(`${name}: buffers early success, correlates tokens, and leaves expiring manual links`, async () => {
    const f = fixture(implementation);
    const pending = f.download.start('json');
    assert.equal(f.state.busy, true);
    f.homey.emit('downloadFileFailed', { token: 'other' });
    f.homey.emit('downloadFileReady', link());
    f.reserve(null, link());
    assert.equal(await pending, true);
    assert.deepEqual(f.opened, [link().localUrl]);
    assert.equal(f.state.busy, false);
    assert.equal(f.state.cloudUrl, link().cloudUrl);
    assert.equal(f.homey.listenerCount('downloadFileReady'), 0);
    assert.equal(f.time.pending.size, 1);
    f.time.tick(30000);
    assert.equal(f.state.url, '');
    assert.equal(f.state.error, 'settingsDownload.expired');
    assert.equal(f.time.pending.size, 0);
  });

  test(`${name}: early failure only affects its reserved token`, async () => {
    const f = fixture(implementation);
    const pending = f.download.start('json');
    f.homey.emit('downloadFileFailed', { token: 'current', message: 'generation failed' });
    assert.equal(f.state.busy, true);
    f.reserve(null, link());
    assert.equal(await pending, false);
    assert.equal(f.state.error, 'settingsDownload.generationFailed');
    assert.equal(f.state.busy, false);
    assert.equal(f.time.pending.size, 0);
    assert.deepEqual(f.opened, []);
  });

  test(`${name}: ignores mismatched/stale events and concurrent clicks, then permits retry`, async () => {
    const f = fixture(implementation);
    const first = f.download.start('json');
    assert.equal(await f.download.start('csv'), false);
    f.reserve(null, link());
    f.homey.emit('downloadFileReady', link('stale'));
    f.homey.emit('downloadFileFailed', { token: 'stale' });
    assert.equal(f.state.busy, true);
    f.time.tick(120000);
    assert.equal(await first, false);
    const retry = f.download.start('json');
    f.homey.emit('downloadFileReady', link('current'));
    f.reserve(null, link('new'));
    assert.equal(f.state.busy, true);
    f.homey.emit('downloadFileReady', link('new'));
    assert.equal(await retry, true);
    assert.equal(f.opened.length, 1);
    f.download.dispose();
    assert.equal(f.time.pending.size, 0);
  });

  test(`${name}: bounds missing reservation callback and missing ready event; ignores late responses`, async () => {
    for (const withReservation of [false, true]) {
      const f = fixture(implementation);
      const pending = f.download.start('json');
      if (withReservation) f.reserve(null, link());
      f.time.tick(60001);
      assert.equal(f.state.busy, true, 'allow a 60-second upload');
      f.time.tick(59999);
      assert.equal(await pending, false);
      assert.equal(f.state.busy, false);
      assert.equal(f.state.error, 'settingsDownload.timeout');
      f.reserve(null, link());
      f.homey.emit('downloadFileReady', link());
      assert.deepEqual(f.opened, []);
      assert.equal(f.time.pending.size, 0);
    }
  });

  test(`${name}: reservation errors and malformed links surface visibly and release busy state`, async () => {
    for (const response of [[new Error('offline')], [null, {}], [null, null]]) {
      const f = fixture(implementation);
      const pending = f.download.start('json');
      f.reserve(...response);
      assert.equal(await pending, false);
      assert.equal(f.state.error, 'settingsDownload.reservationFailed');
      assert.equal(f.state.busy, false);
      assert.equal(f.time.pending.size, 0);
    }
  });

  test(`${name}: off-LAN local failure falls back to cloud without fetching a JSON body`, async () => {
    const seen = [];
    const f = fixture(implementation, {
      probe: (url) => {
        seen.push(url);
        return url === link().localUrl ? Promise.reject(new Error('off LAN')) : Promise.resolve();
      }
    });
    const pending = f.download.start('json');
    f.reserve(null, link());
    f.homey.emit('downloadFileReady', link());
    assert.equal(await pending, true);
    assert.deepEqual(seen, [link().localUrl, link().cloudUrl]);
    assert.deepEqual(f.opened, [link().cloudUrl]);
    f.download.dispose();
  });

  test(`${name}: both network failures report an error but retain a manual cloud link for CORS restrictions`, async () => {
    const f = fixture(implementation, { probe: () => Promise.reject(new Error('network or CORS')) });
    const pending = f.download.start('json');
    f.reserve(null, link());
    f.homey.emit('downloadFileReady', link());
    assert.equal(await pending, false);
    assert.equal(f.state.error, 'settingsDownload.networkFailed');
    assert.equal(f.state.url, link().cloudUrl);
    assert.equal(f.state.busy, false);
    assert.deepEqual(f.opened, []);
    f.download.dispose();
    assert.equal(f.time.pending.size, 0);
  });

  test(`${name}: stalled probes have independent deadlines and clean up`, async () => {
    const f = fixture(implementation, { probe: () => new Promise(() => {}) });
    const pending = f.download.start('json');
    f.reserve(null, link());
    f.homey.emit('downloadFileReady', link());
    f.time.tick(8000);
    assert.equal(await pending, false);
    assert.equal(f.state.error, 'settingsDownload.networkFailed');
    f.download.dispose();
    assert.equal(f.time.pending.size, 0);
  });

  test(`${name}: handles throwing, rejected, callback-failed and unconfirmed browser opens`, async () => {
    for (const kind of ['throw', 'reject', 'callback', 'void']) {
      const f = fixture(implementation);
      f.homey.openURL = (url, callback) => {
        if (kind === 'throw') throw new Error('blocked');
        if (kind === 'reject') return Promise.reject(new Error('blocked'));
        if (kind === 'callback') callback(new Error('blocked'));
        return undefined;
      };
      const pending = f.download.start('json');
      f.reserve(null, link());
      f.homey.emit('downloadFileReady', link());
      await flush();
      if (kind === 'void') f.time.tick(5000);
      assert.equal(await pending, false);
      assert.equal(f.state.error, 'settingsDownload.' + (kind === 'void' ? 'openUnconfirmed' : 'openFailed'));
      assert.equal(f.state.busy, false);
      assert.equal(f.state.url, link().localUrl);
      f.download.dispose();
      assert.equal(f.time.pending.size, 0);
    }
  });

  test(`${name}: cleanup during pending work ignores late events/responses and supports removeListener`, async () => {
    const f = fixture(implementation);
    f.homey.off = undefined;
    const pending = f.download.start('json');
    f.download.dispose();
    await pending;
    f.reserve(null, link());
    f.homey.emit('downloadFileReady', link());
    assert.equal(f.homey.listenerCount('downloadFileReady'), 0);
    assert.equal(f.state.busy, false);
    assert.equal(f.time.pending.size, 0);
    assert.deepEqual(f.opened, []);
  });

  test(`${name}: SDK without off/removeListener reuses shared handlers without leaking operation subscribers`, async () => {
    const f = fixture(implementation);
    f.homey.off = undefined;
    f.homey.removeListener = undefined;
    for (let i = 0; i < 5; i++) {
      const pending = f.download.start('json');
      f.reserve(new Error('request failed'));
      assert.equal(await pending, false);
      assert.equal(f.homey.listenerCount('downloadFileReady'), 1);
      assert.equal(f.homey.listenerCount('downloadFileFailed'), 1);
    }
    f.download.dispose();
    f.homey.emit('downloadFileReady', link());
    assert.deepEqual(f.opened, []);
    assert.equal(f.time.pending.size, 0);
  });

  test(`${name}: actual Angular binding uses bounded HEAD, digest-safe updates and independent busy state`, async () => {
    const homey = new EventEmitter();
    let reserve;
    let destroy;
    let count = 0;
    const view = { isBusy: true };
    const requests = [];
    homey.__ = (key) => key;
    homey.api = (method, url, data, callback) => { reserve = callback; };
    homey.openURL = (url, callback) => callback();
    const download = implementation.bind({
      homey, path: '/download/', view,
      scope: { $evalAsync(fn) { count++; fn(); }, $on(name, fn) { destroy = fn; } },
      http: (request) => { requests.push(request); return Promise.resolve(); }
    });
    const pending = download.start('json');
    assert.equal(view.downloadBusy, true);
    reserve(null, link());
    homey.emit('downloadFileReady', link());
    assert.equal(await pending, true);
    assert.deepEqual(requests, [{ method: 'HEAD', url: link().localUrl, timeout: 4000 }]);
    assert.equal(view.downloadBusy, false);
    assert.equal(view.isBusy, true, 'do not alter an unrelated log load');
    assert.ok(count > 1);
    destroy();
    assert.equal(view.downloadUrl, '');
  });
}

test('SSL error-only downloads stay silent on success, missing open acknowledgement and link expiry', async () => {
  const implementation = implementations[0][1];
  for (const confirmed of [true, false]) {
    const f = fixture(implementation, { errorsOnly: true });
    if (!confirmed) f.homey.openURL = () => {};
    const pending = f.download.start('json');
    f.reserve(null, link());
    f.homey.emit('downloadFileReady', link());
    await flush();
    if (!confirmed) f.time.tick(5000);
    assert.equal(await pending, true);
    assert.equal(f.state.error, '');
    assert.equal(f.state.url, '');
    f.time.tick(120000);
    assert.equal(f.state.error, '', 'expiry is not a failed download');
    assert.equal(f.time.pending.size, 0);
  }
});

test('SSL error-only binding shows failure popups without adding download UI state', async () => {
  const homey = new EventEmitter();
  const alerts = [];
  let reserve;
  const view = {};
  homey.__ = key => key;
  homey.alert = (...args) => alerts.push(args);
  homey.api = (method, url, data, callback) => { reserve = callback; };
  homey.openURL = (url, callback) => callback();
  const download = implementations[0][1].bind({
    homey, view, errorsOnly: true, path: '/download/',
    scope: { $evalAsync: fn => fn(), $on() {} },
    http: () => Promise.resolve()
  });
  let pending = download.start('json');
  reserve(null, link());
  homey.emit('downloadFileReady', link());
  assert.equal(await pending, true);
  assert.deepEqual(alerts, []);
  pending = download.start('json');
  reserve(new Error('offline'));
  assert.equal(await pending, false);
  assert.deepEqual(alerts, [['settingsDownload.reservationFailed', 'error']]);
  pending = download.start('json');
  reserve(null, link());
  homey.emit('downloadFileFailed', link());
  assert.equal(await pending, false);
  assert.equal(alerts.length, 2);
  homey.__ = key => key === 'exportSkipped' ? 'Exported readable entries; __count__ unreadable entries skipped.' : key;
  pending = download.start('json');
  reserve(null, link());
  homey.emit('downloadFileReady', { ...link(), skippedRecords: 3 });
  assert.equal(await pending, true);
  assert.deepEqual(alerts[2], ['Exported readable entries; 3 unreadable entries skipped.', 'info']);
  assert.deepEqual(view, { downloadBusy: false });
  download.dispose();
  assert.equal(alerts.length, 3, 'disposing must not repeat the skipped-record warning');
  const markup = fs.readFileSync(path.join(sslRoot, 'settings', 'index.html'), 'utf8');
  assert.doesNotMatch(markup, /view\.download(?:Status|Error|Url|CloudUrl)/);
});

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function angularStub() {
  const registered = {};
  const chain = {};
  for (const kind of ['controller', 'factory', 'directive', 'filter', 'run']) {
    chain[kind] = (name, value) => { if (typeof name === 'string') registered[name] = value; return chain; };
  }
  return { registered, module: () => chain };
}
for (const [name, implementation] of implementations) {
  test(`${name}: real settings controller handles an early event through its own export endpoint`, async () => {
    const angular = angularStub();
    const isSSL = name === 'SSL';
    const source = fs.readFileSync(isSSL ? path.join(sslRoot, 'settings', 'simplelog.module.js') : path.join(bllRoot, 'settings', 'variableController.js'), 'utf8');
    const homey = new EventEmitter();
    const requested = [];
    const opened = [];
    let destroy;
    const scope = {
      $evalAsync: (fn) => fn(), $apply: (fn) => fn(),
      $on(event, fn) { if (event === '$destroy') destroy = fn; }
    };
    homey.__ = (key) => key;
    homey.getLanguage = () => Promise.resolve('en');
    homey.openURL = (url, callback) => { opened.push(url); callback(); };
    homey.api = (method, url, data, callback) => {
      requested.push(url);
      homey.emit('downloadFileReady', link());
      callback(null, link());
    };
    const window = { angular, Homey: homey, SettingsDownload: implementation };
    const context = {
      angular, window, console: { log() {} },
      _: {
        flatMap: (items, key) => items.flatMap((item) => item[key]),
        filter: (items, fn) => items.filter(fn),
        map: (items, fn) => Object.entries(items).map(([key, value]) => fn(value, key))
      }
    };
    vm.runInNewContext(source, context);
    const controller = angular.registered[isSSL ? 'simplelogCtrl' : 'VariableSettingsController'];
    const deps = {
      $scope: scope, $rootScope: {}, $window: window,
      $bl: { init() {}, get() {}, api() {} },
      $q: { defer: deferred },
      $http: () => Promise.resolve(),
      uiGridConstants: { filter: {} }, tmhDynamicLocale: { set() {} }
    };
    controller.at(-1).apply({}, controller.slice(0, -1).map((dep) => deps[dep]));
    assert.equal(await scope.downloadFile('json'), true);
    assert.deepEqual(requested, [isSSL ? '/getlogdownloadurl/json' : '/getvariablesdownloadurl/json']);
    assert.deepEqual(opened, [link().localUrl]);
    assert.equal(scope.view.downloadBusy, false);
    destroy();
    assert.equal(homey.listenerCount('downloadFileReady'), 0);
  });
}

test('BLL API rejects errors without invoking success callbacks or nested $apply', { skip: implementations.length < 2 }, async () => {
  const angular = angularStub();
  vm.runInNewContext(fs.readFileSync(path.join(bllRoot, 'assets', 'js', 'bll.module.js'), 'utf8'), { angular });
  const registration = angular.registered.$bl;
  const bl = registration.at(-1)({ defer: deferred });
  const failure = new Error('offline');
  let success = false;
  let alerts = 0;
  bl.init({
    api(method, url, data, callback) { callback(failure); },
    alert(error) { assert.equal(error, failure); alerts++; }
  }, { $evalAsync: (fn) => fn(), $apply() { throw new Error('digest already active'); } });
  await assert.rejects(bl.api('GET', '/', null, () => { success = true; }), failure);
  assert.equal(success, false);
  assert.equal(alerts, 1);
});

test('download messages are translated consistently in all 13 source locales', () => {
  for (const locale of ['ar', 'da', 'de', 'en', 'es', 'fr', 'it', 'ko', 'nl', 'no', 'pl', 'ru', 'sv']) {
    const messages = JSON.parse(fs.readFileSync(path.join(sslRoot, '.homeycompose', 'locales', locale + '.json'), 'utf8'));
    assert.match(messages.exportSkipped, /__count__/);
    const ssl = messages.settingsDownload;
    assert.ok(ssl.networkFailed && ssl.manual && ssl.timeout);
    assert.equal(Object.keys(ssl).length, 11);
    if (implementations.length > 1) {
      const bll = JSON.parse(fs.readFileSync(path.join(bllRoot, 'locales', locale + '.json'), 'utf8')).settingsDownload;
      assert.deepEqual(ssl, bll);
    }
  }
});
