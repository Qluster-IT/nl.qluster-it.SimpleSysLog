'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createRequire } = require('node:module');
const test = require('node:test');
const vm = require('node:vm');

const styles = require('../lib/widget-styles');
const template = require('../lib/widget-template');
const catalog = require('../lib/widget-template-catalog');
const search = require('../assets/js/ssl-widget-search');
const widgetApi = require('../widgets/log_viewer/api');

test('widget style collection provides built-ins and validates custom entries', () => {
  const homey = { settings: { get: () => undefined } };
  const builtIns = styles.getWidgetStyles(homey);
  assert.equal(builtIns.designs[0].id, 'builtin:default');
  assert.equal(builtIns.themes[0].id, 'builtin:default');
  assert.equal(builtIns.themes[0].colors.background, 'automatic');
  assert.equal(styles.getSettingId('builtin:homey', 'builtin:default'), 'builtin:default');

  const custom = styles.normalizeCollection({
    version: 1,
    designs: [{ id: 'my-design', name: 'My design', fields: ['message'], showDaySeparators: false }],
    themes: []
  });
  assert.equal(custom.designs[0].fields[0], 'message');
  assert.throws(() => styles.normalizeCollection({
    version: 1,
    designs: [{ id: 'bad', name: 'Bad', fields: ['message', 'message'], showDaySeparators: true }],
    themes: []
  }), /Invalid widget design/);
  assert.throws(() => styles.normalizeCollection({
    version: 1,
    designs: [],
    themes: [{ id: 'bad', name: 'Bad', colors: { ...styles.BUILT_IN_THEMES[0].colors, text: '#ff0000' } }]
  }), /Invalid widget theme/);
  const named = styles.normalizeCollection({
    version: 1,
    designs: [],
    themes: [{ id: 'named', name: 'Named', colors: { ...styles.BUILT_IN_THEMES[0].colors, text: 'red' } }]
  });
  assert.equal(named.themes[0].colors.text, 'red');
});

test('widget templates round-trip and reject invalid or oversized input', async () => {
  const value = {
    design: { ...styles.BUILT_IN_DESIGNS[0], id: undefined },
    theme: { ...styles.BUILT_IN_THEMES[0], id: undefined }
  };
  const encoded = await template.encodeTemplate(value);
  assert.match(encoded, /^\[twf:SimpleSysLog:DESIGN,THEME:/);
  assert.deepEqual(template.decodeTemplate(encoded), {
    design: { name: 'Default', fields: styles.BUILT_IN_DESIGNS[0].fields, showDaySeparators: true },
    theme: { name: 'Default', colors: styles.BUILT_IN_THEMES[0].colors }
  });
  assert.throws(() => template.decodeTemplate('[twf:SimpleSysLog:DESIGN:"not-base64":/twf]'), /Invalid template/);
  await assert.rejects(() => template.encodeTemplate({}), /Select a design or theme/);
});

test('community catalog loads templates from the configured SSL topic', async () => {
  const encoded = await template.encodeTemplate({
    design: { name: 'Shared', fields: ['timestamp', 'message'], showDaySeparators: true }
  });
  const requests = [];
  const fetcher = async url => {
    requests.push(url);
    const body = url.includes('/posts.json')
      ? { post_stream: { posts: [{
        id: 501,
        post_number: 4,
        raw: `# Compact log\nA shared design.\n${encoded}`,
        username: 'community-user',
        created_at: '2026-01-01T00:00:00Z',
        actions_summary: [{ id: 2, count: 3 }]
      }] } }
      : { post_stream: { stream: [501], posts: [] } };
    return { ok: true, status: 200, text: async () => JSON.stringify(body) };
  };

  const results = await catalog.getCatalog(fetcher);
  assert.equal(catalog.topicId, 162351);
  assert.equal(results.length, 1);
  assert.equal(results[0].title, 'Compact log');
  assert.equal(results[0].template.design.name, 'Shared');
  assert.ok(requests[0].includes('/t/162351.json'));
  assert.ok(requests[1].includes('/t/162351/posts.json'));
});

test('widget API validates entry count, handles initial BLL absence, and formats returned fields', async () => {
  await assert.rejects(() => widgetApi.getWidgetLogs({
    homey: { app: { Log: { getLogs: async () => ({ logs: [] }) } } },
    query: { take: '0' }
  }), /at least 1/);
  assert.deepEqual(await widgetApi.getWidgetLogs({ homey: { app: {} }, query: { take: '25' } }), {
    available: false,
    logs: []
  });

  let receivedOptions;
  const response = await widgetApi.getWidgetLogs({
    homey: { app: { Log: { getLogs: async options => {
      receivedOptions = options;
      return { logs: [{
        timestamp: '2026-01-01T12:00:00Z',
        timestamp_formatted: { datetime: '2026-01-01 12:00', 'dd-MM-yyyy HH:mm': '01-01-2026 12:00' },
        severity: 3, facility: 16, app: 'Heating', hostname: 'Homey', message: 'Warm'
      }], count: 1 };
    } } } },
    query: { take: '1', timestampFormat: 'dd-MM-yyyy HH:mm' }
  });
  assert.equal(receivedOptions.take, 1);
  assert.equal(receivedOptions.timestampFormat, 'dd-MM-yyyy HH:mm');
  assert.equal(response.logs[0].severity, 'Error');
  assert.equal(response.logs[0].facility, 'Flow');
  assert.equal(response.logs[0].severityId, 3);
  assert.equal(response.logs[0].timestamp_formatted['dd-MM-yyyy HH:mm'], '01-01-2026 12:00');
  assert.equal(receivedOptions.maxSeverity, undefined);
});

test('widget API validates and forwards per-widget log filters', async () => {
  let receivedOptions;
  const homey = { app: { Log: { getLogs: async options => {
    receivedOptions = options;
    return { logs: [], count: 0 };
  } } } };
  await widgetApi.getWidgetLogs({
    homey,
    query: { take: '5', minSeverity: '4', facility: '16', app: ' Heat ', hostname: '' }
  });
  assert.equal(receivedOptions.maxSeverity, 4);
  assert.equal(receivedOptions.facility, 16);
  assert.equal(receivedOptions.app, 'Heat');
  assert.equal('hostname' in receivedOptions, false);
  await widgetApi.getWidgetLogs({ homey, query: { take: '5', facility: 'all' } });
  assert.equal('facility' in receivedOptions, false);
  await assert.rejects(() => widgetApi.getWidgetLogs({ homey, query: { take: '5', minSeverity: '8' } }), /minimum severity/);
  await assert.rejects(() => widgetApi.getWidgetLogs({ homey, query: { take: '5', facility: '1.5' } }), /facility/);
});

test('widget timestamp format registration is scoped to the widget instance', async () => {
  const registrations = new Map();
  const homey = { app: {
    registerWidgetTimestampFormat: (instanceId, format) => registrations.set(instanceId, format),
    unregisterWidgetTimestampFormat: instanceId => registrations.delete(instanceId)
  } };
  assert.deepEqual(await widgetApi.registerTimestampFormat({
    homey, body: { instanceId: 'widget-instance-1', format: 'dd-MM-yyyy' }
  }), { registered: true });
  assert.equal(registrations.get('widget-instance-1'), 'dd-MM-yyyy');
  assert.deepEqual(await widgetApi.unregisterTimestampFormat({
    homey, body: { instanceId: 'widget-instance-1' }
  }), { unregistered: true });
  assert.equal(registrations.has('widget-instance-1'), false);
});

test('custom datetime widget suggestions mirror the BLL format Flow autocomplete', async () => {
  const appFile = require.resolve('../app');
  const appRequire = createRequire(appFile);
  const listeners = {};
  const fakeBL = {
    isReady: true,
    datetime: { toString: (format, date) => `${format}:${date.getFullYear()}` }
  };
  const appModule = { exports: {} };
  vm.runInNewContext(fs.readFileSync(appFile, 'utf8'), {
    require: name => name === 'homey' ? { App: class {} }
      : name === 'betterlogiclibrary' ? { BL: fakeBL } : appRequire(name),
    module: appModule,
    Date,
    process
  }, { filename: appFile });

  const app = new appModule.exports();
  app.homey = {
    dashboards: {
      getWidget: id => {
        assert.equal(id, 'log_viewer');
        return { registerSettingAutocompleteListener: (setting, listener) => { listeners[setting] = listener; } };
      }
    },
    settings: { get: () => undefined },
    __: key => key
  };
  app.registerWidgetSettingAutocompletes();
  const presets = await listeners.datetimeFormat('', {});
  assert.ok(presets.some(item => item.name === 'datetime'));
  assert.ok(presets.every(item => item.description.includes(':')));
  const custom = await listeners.datetimeFormat('yyyy-MM-dd HH:mm', {});
  assert.equal(custom[0].name, 'yyyy-MM-dd HH:mm');
  assert.equal(custom[0].id, 'yyyy-MM-dd HH:mm');
  assert.equal(custom[0].description, `yyyy-MM-dd HH:mm:${new Date().getFullYear()}`);

  assert.equal([...app.getWidgetTimestampFormats()].join(','), 'datetime');
  assert.throws(() => app.registerWidgetTimestampFormat('', 'datetime'), /instance ID/);
  assert.throws(() => app.registerWidgetTimestampFormat('widget-invalid', ''), /date and time format/);
  app.registerWidgetTimestampFormat('widget-one', 'dd-MM-yyyy');
  app.registerWidgetTimestampFormat('widget-two', 'dd-MM-yyyy');
  app.registerWidgetTimestampFormat('widget-three', 'yyyy/MM/dd');
  assert.equal([...app.getWidgetTimestampFormats()].join(','), 'datetime,dd-MM-yyyy,yyyy/MM/dd');
  app.unregisterWidgetTimestampFormat('widget-one');
  assert.equal([...app.getWidgetTimestampFormats()].join(','), 'datetime,dd-MM-yyyy,yyyy/MM/dd');
  app.unregisterWidgetTimestampFormat('widget-two');
  app.unregisterWidgetTimestampFormat('widget-three');
  assert.equal([...app.getWidgetTimestampFormats()].join(','), 'datetime');
});

test('simple and advanced widget search match app, host, and message fields', () => {
  const log = { message: 'Kitchen window is open', app: 'Climate Flow', hostname: 'Homey Pro' };
  assert.equal(search.matches(log, 'window', 'simple'), true);
  assert.equal(search.matches(log, 'Climate', 'simple'), true);
  assert.equal(search.matches(log, 'AND', 'simple'), false);
  assert.equal(search.matches(log, 'window AND Climate', 'advanced'), true);
  assert.equal(search.matches(log, 'window OR missing', 'advanced'), true);
  assert.equal(search.matches(log, 'window AND NOT closed', 'advanced'), true);
  assert.equal(search.matches(log, '(window OR door) AND "Homey Pro"', 'advanced'), true);
  assert.throws(() => search.matches(log, 'window AND (door', 'advanced'), /parenthesis/);
});


test('widget waits for the Homey widget API before bootstrapping Angular', () => {
  const source = fs.readFileSync(require.resolve('../assets/js/ssl-widget.js'), 'utf8');
  const calls = [];
  const angular = {
    module: () => ({ controller: (name, definition) => calls.push(['controller', name, typeof definition.at(-1)]) }),
    bootstrap: (_document, modules) => calls.push(['bootstrap', modules.join(',')])
  };
  const context = vm.createContext({ angular, document: {} });
  vm.runInContext(source, context);
  assert.equal(calls.length, 0);
  assert.equal(typeof context.onHomeyReady, 'function');

  context.onHomeyReady({ getSettings: () => ({}) });
  assert.equal(JSON.stringify(calls), JSON.stringify([
    ['controller', 'SSLLogWidgetController', 'function'],
    ['bootstrap', 'sslLogWidget']
  ]));
});

test('widget explains that BLL is required when its AngularJS file is unavailable', () => {
  const source = fs.readFileSync(require.resolve('../assets/js/ssl-widget.js'), 'utf8');
  let shown;
  let ready;
  const document = {
    createElement: () => ({ setAttribute() {}, appendChild(child) { this.child = child; } }),
    body: { replaceChildren: main => { shown = main.child.textContent; } }
  };
  const context = vm.createContext({ document });
  vm.runInContext(source, context);
  context.onHomeyReady({
    __: key => `translated:${key}`,
    getSettings: () => ({ height: 50 }),
    ready: options => { ready = options; }
  });
  assert.equal(shown, 'translated:widgets.bllNotInstalled');
  assert.equal(ready.height, 100);
});

test('widget applies its height and filters to loaded and realtime entries', async () => {
  const source = fs.readFileSync(require.resolve('../assets/js/ssl-widget.js'), 'utf8');
  let controller;
  const angular = {
    module: () => ({ controller: (_name, definition) => { controller = definition.at(-1); } }),
    bootstrap() {}
  };
  const handlers = {};
  const logRequests = [];
  let readyOptions;
  const homey = {
    __: () => '',
    getSettings: () => ({ entryCount: 25, height: 9000, minSeverity: '4', facility: 'all', appFilter: ' Heat ', hostnameFilter: '' }),
    getWidgetInstanceId: () => 'widget-1',
    on: (event, handler) => { handlers[event] = handler; },
    ready: options => { readyOptions = options; },
    api(method, path) {
      if (path === '/register-timestamp-format') return Promise.resolve({ registered: true });
      if (path === '/styles') return Promise.resolve(styles.getWidgetStyles({ settings: { get: () => undefined } }));
      logRequests.push(path);
      return Promise.resolve({ available: true, logs: [], severities: {}, facilities: {} });
    }
  };
  const context = vm.createContext({
    angular,
    document: { addEventListener() {}, getElementById: () => null },
    window: { SSLWidgetSearch: search },
    console
  });
  vm.runInContext(source, context);
  context.onHomeyReady(homey);
  const scope = { $applyAsync: fn => fn && fn(), $on() {} };
  controller(scope, () => {});
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(readyOptions.height, 5000);
  assert.equal(logRequests[0], '/logs?take=25&timestampFormat=datetime&minSeverity=4&app=Heat');
  const formatted = { datetime: 'formatted' };
  handlers.log_updated({ timestamp: '2026-11-17T09:00:00.000Z', severity: 6, app: 'Heating', message: 'info', timestamp_formatted: formatted });
  handlers.log_updated({ timestamp: '2026-11-17T09:01:00.000Z', severity: 3, app: 'Lights', message: 'other app', timestamp_formatted: formatted });
  handlers.log_updated({ timestamp: '2026-11-17T09:02:00.000Z', severity: 3, app: 'Heating', message: 'shown', timestamp_formatted: formatted });
  assert.equal(JSON.stringify(scope.logs.map(log => log.message)), JSON.stringify(['shown']));
});

async function runWidgetStorageScenario(storageReadyDuringLoad) {
  const source = fs.readFileSync(require.resolve('../assets/js/ssl-widget.js'), 'utf8');
  let controller;
  const angular = {
    module: () => ({ controller: (_name, definition) => { controller = definition.at(-1); } }),
    bootstrap() {}
  };
  const handlers = {};
  let available = false;
  let resolveFirstLogs;
  const logRequests = [];
  const homey = {
    __: () => '',
    getSettings: () => ({ entryCount: 25 }),
    getWidgetInstanceId: () => 'widget-1',
    on: (event, handler) => { handlers[event] = handler; },
    ready() {},
    api(method, path) {
      if (path === '/register-timestamp-format') return Promise.resolve({ registered: true });
      if (path === '/styles') return Promise.resolve(styles.getWidgetStyles({ settings: { get: () => undefined } }));
      logRequests.push(path);
      const data = available
        ? { available: true, logs: [{ id: 1, timestamp: '2026-11-17T09:00:00.000Z', severity: 6, facility: 1, message: 'ready',
          timestamp_formatted: { datetime: 'formatted' } }], severities: {}, facilities: {} }
        : { available: false, logs: [] };
      if (logRequests.length === 1 && storageReadyDuringLoad) {
        return new Promise(resolve => { resolveFirstLogs = () => resolve(data); });
      }
      return Promise.resolve(data);
    }
  };
  const context = vm.createContext({ angular, document: { addEventListener() {} }, window: { SSLWidgetSearch: search }, console });
  vm.runInContext(source, context);
  context.onHomeyReady(homey);
  const scope = { $applyAsync: fn => fn && fn(), $on() {} };
  controller(scope, () => {});
  const settle = () => new Promise(resolve => setImmediate(resolve));
  await settle();
  if (storageReadyDuringLoad) {
    available = true;
    handlers.log_storage_ready({ ready: true });
    available = false;
    resolveFirstLogs();
    available = true;
  } else {
    assert.equal(scope.bllUnavailable, true);
    available = true;
    handlers.log_storage_ready({ ready: true });
  }
  await settle();
  await settle();
  return { scope, logRequests };
}

test('widget loads the logs when BLL storage becomes ready after the widget loaded', async () => {
  const { scope, logRequests } = await runWidgetStorageScenario(false);
  assert.equal(logRequests.length, 2);
  assert.equal(scope.bllUnavailable, false);
  assert.equal(scope.loading, false);
  assert.equal(scope.logs.length, 1);
});

test('widget reloads when BLL storage becomes ready during its initial load', async () => {
  const { scope, logRequests } = await runWidgetStorageScenario(true);
  assert.equal(logRequests.length, 2);
  assert.equal(scope.bllUnavailable, false);
  assert.equal(scope.logs.length, 1);
});
