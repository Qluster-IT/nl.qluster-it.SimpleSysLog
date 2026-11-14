'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createRequire } = require('node:module');
const test = require('node:test');
const vm = require('node:vm');
const { BL } = require('betterlogiclibrary');

const appFile = require.resolve('../app');
const appRequire = createRequire(appFile);
function loadApp(LogClass) {
  const appModule = { exports: {} };
  vm.runInNewContext(fs.readFileSync(appFile, 'utf8'), {
    require: name => name === 'homey' ? { App: class {} }
      : name === './lib/Log' && LogClass ? { Log: LogClass } : appRequire(name),
    module: appModule,
    Date,
    process
  }, { filename: appFile });
  return appModule.exports;
}

function createApp(App = loadApp()) {
  const app = new App();
  const timers = new Map();
  const errors = [];
  const settings = {
    csvFilename: 'logs.csv',
    jsonFilename: 'logs.json',
    xlsxFilename: 'logs.xlsx',
    includeUtcInExcel: true,
    groupInTimeline: true,
    removeLogOlderThanDays: 7
  };
  let createdTimers = 0;
  app.homey = {
    settings: {
      get: () => settings,
      set() {
        assert.fail('Existing settings should not need saving in this test');
      }
    },
    error(...args) { errors.push(args); },
    setTimeout(callback, delay, ...args) {
      const handle = ++createdTimers;
      timers.set(handle, { callback: async () => {
        timers.delete(handle);
        await callback(...args);
      }, delay, args });
      return handle;
    },
    clearTimeout(handle) {
      timers.delete(handle);
    }
  };
  return { app, timers, settings, errors, createdTimers: () => createdTimers };
}

test('settings reloads keep one daily timer and a changed retention value is used', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 10, 13, 20, 0).getTime() });
  const { app, timers, settings, createdTimers } = createApp();
  for (let index = 0; index < 200; index++) app.getSettings();
  assert.equal(timers.size, 1);
  assert.equal(createdTimers(), 1);
  const initialHandle = app.automaticlyRemovalOfLogsTimer;

  settings.removeLogOlderThanDays = 14;
  app.getSettings();
  assert.equal(timers.size, 1);
  assert.equal(createdTimers(), 2);
  assert.equal(timers.has(initialHandle), false);
  const timer = timers.get(app.automaticlyRemovalOfLogsTimer);
  let retention;
  app.clearLog = async days => { retention = days; };
  await timer.callback(...timer.args);
  assert.equal(retention, 14);
  assert.equal(timer.delay, 4 * 60 * 60 * 1000 + 5 * 60 * 1000);
  assert.equal(timers.size, 1);
});

test('daily scheduling follows calendar boundaries after delayed runs and cleanup errors', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 2, 28, 23, 55).getTime() });
  const { app, timers, errors } = createApp();
  app.getSettings();
  assert.equal(timers.get(app.automaticlyRemovalOfLogsTimer).delay, 10 * 60 * 1000);
  t.mock.timers.setTime(new Date(2026, 2, 29, 1, 0).getTime());
  app.clearLog = async () => { throw new Error('disk unavailable'); };
  await timers.get(app.automaticlyRemovalOfLogsTimer).callback();
  assert.equal(errors.length, 1);
  assert.match(errors[0][1].message, /disk unavailable/);
  assert.equal(timers.size, 1);
  assert.equal(timers.get(app.automaticlyRemovalOfLogsTimer).delay,
    new Date(2026, 2, 30, 0, 5).getTime() - new Date(2026, 2, 29, 1, 0).getTime());
});

test('startup catches up in limited mode before BLL becomes available', async t => {
  const { app, settings } = createApp();
  app.log = () => {};
  app.buildCards = () => {};
  app.addLogToDB = () => {};
  app.homey.settings = {
    get: key => key === 'settings' ? settings : undefined,
    set() {},
    on() {}
  };
  let cleaned = false;
  app.clearBackLog = async days => {
    assert.equal(days, 7);
    assert.ok(Array.isArray(app.BackLog));
    cleaned = true;
  };
  t.mock.method(BL, 'init', async () => {
    assert.equal(cleaned, true);
    return { ready: new Promise(() => {}) };
  });
  await app.onInit();
  assert.equal(cleaned, true);
});

test('file-storage startup catches up only after initialization and backlog migration', async () => {
  const events = [];
  let finishInit;
  const { app } = createApp(loadApp(class {
    async init() {
      events.push('init');
      await new Promise(resolve => { finishInit = resolve; });
    }
    async clearLog(days) { events.push(`cleanup:${days}`); }
  }));
  app.getSettings();
  app.log = () => {};
  app.homey.settings.set = () => {};
  app.homey.settings.unset = () => {};
  app.BackLog = [['old message', 'group', {}]];
  app._addLogToDB = async () => { events.push('migrate'); };
  const initializing = app.initRealApp();
  await Promise.resolve();
  await app.runAutomaticlyRemovalOfLogs();
  assert.deepEqual(events, ['init']);
  finishInit();
  await initializing;
  assert.deepEqual(events, ['init', 'migrate', 'cleanup:7']);
});

test('disabling retention through settings releases its timer', () => {
  const { app, timers, settings } = createApp();
  app.getSettings();
  settings.removeLogOlderThanDays = 0;
  app.getSettings();
  assert.equal(timers.size, 0);
  assert.equal(app.automaticlyRemovalOfLogsTimer, undefined);
});

test('shutdown waits for in-flight cleanup and does not rearm the daily timer', async () => {
  const { app, timers } = createApp();
  app.getSettings();
  let finishCleanup;
  app.clearLog = () => new Promise(resolve => { finishCleanup = resolve; });
  const running = timers.get(app.automaticlyRemovalOfLogsTimer).callback();
  await Promise.resolve();
  let destroyed = false;
  app.Log = { async destroy() { destroyed = true; } };
  const stopping = app.onUninit();
  assert.equal(destroyed, false);
  finishCleanup();
  await Promise.all([running, stopping]);
  assert.equal(timers.size, 0);
  assert.equal(destroyed, true);
});

test('age-based cleanup rejects unsafe token values in file and limited modes, while full clear remains available', async () => {
  const { app } = createApp();
  const listeners = new Map();
  const card = id => ({ registerRunListener: listener => listeners.set(id, listener) });
  app.homey.flow = { getActionCard: card, getConditionCard: card, getTriggerCard: card };
  const message = appRequire('./.homeycompose/locales/en.errors.json').retentionDays;
  app.homey.__ = key => key === 'errors.retentionDays' ? message : key;
  app.buildCards();
  const older = listeners.get('Clear_log_Older');
  const full = listeners.get('Clear_log');
  for (const fileMode of [false, true]) {
    const cleared = [];
    app.clearBackLog = async days => { cleared.push(days); };
    app.Log = fileMode ? { clearLog: app.clearBackLog } : undefined;
    for (const days of [0, -1, 0.5, null, undefined, '', '1', NaN, Infinity, -Infinity]) {
      await assert.rejects(older({ days }), error => error.message === message);
    }
    assert.deepEqual(cleared, []);
    await older({ days: 1 });
    await older({ days: 7 });
    await full({});
    assert.deepEqual(cleared, [1, 7, undefined]);
  }
});

test('the add-log and clear-log API calls finish the work before answering and report failures', async () => {
  const api = appRequire('./api');
  const { app } = createApp();
  app.addLogToDB = async () => { throw new Error('App name must not be longer than 100 Characters.'); };
  await assert.rejects(api.addLog({ homey: { app }, body: { log: 'x', group: 'y'.repeat(101) } }), /100 Characters/);

  let cleared = false;
  app.Log = { clearLog: async () => { await new Promise(resolve => setTimeout(resolve, 5)); cleared = true; } };
  assert.equal(await api.clearLog({ homey: { app } }), 'OK');
  assert.equal(cleared, true);
});

test('a log download that cannot be generated is logged and reported to the settings page for every file type', async t => {
  const api = appRequire('./api');
  const { app, timers, errors } = createApp();
  app.settings = { csvFilename: 'logs', jsonFilename: 'logs', xlsxFilename: 'logs' };
  app.Log = { getLogs: async () => { throw new Error('disk unavailable'); } };
  t.mock.method(BL, 'decode', async filename => filename);
  t.mock.method(BL, 'getDownloadUrl', async () => ({ token: 'download' }));
  const realtime = [];
  const homey = { app, setTimeout: app.homey.setTimeout, error: app.homey.error, api: { realtime: (event, data) => realtime.push([event, data]) } };
  for (const returnType of ['csv', 'xlsx', 'json']) {
    assert.deepEqual(await api.getLogDownloadUrl({ homey, params: { returnType } }), { token: 'download' });
    const [timer] = timers.values();
    await timer.callback();
  }
  assert.deepEqual(errors.map(([message, error]) => [message, error.message]), [
    ['Log download (csv) could not be generated', 'disk unavailable'],
    ['Log download (xlsx) could not be generated', 'disk unavailable'],
    ['Log download (json) could not be generated', 'disk unavailable']
  ]);
  assert.deepEqual(realtime, Array(3).fill(['downloadFileFailed', { token: 'download' }]));
});

test('a received syslog message that cannot be stored is logged by the server device', async () => {
  const deviceFile = require.resolve('../drivers/syslogserver/device');
  const deviceRequire = createRequire(deviceFile);
  const handlers = {};
  const server = { on(event, handler) { handlers[event] = handler; return server; }, listen: async () => {}, close() {} };
  const deviceModule = { exports: {} };
  vm.runInNewContext(fs.readFileSync(deviceFile, 'utf8'), {
    require: name => name === 'homey' ? { Device: class {} }
      : name === './../../lib/simple-syslog-server' ? () => server : deviceRequire(name),
    module: deviceModule,
    console: { log() {}, warn() {}, error() {} }
  }, { filename: deviceFile });
  const device = new deviceModule.exports();
  const errors = [];
  device.error = (...args) => errors.push(args);
  device.getSettings = () => ({ protocol: 'udp', port: 5514, log_syslogs: true });
  device.homey = { app: { addLogToDB: async () => { throw new Error('App name must not be longer than 100 Characters.'); } } };
  await device.startSysLogServer();
  handlers.msg({ msg: 'message', tag: 'y'.repeat(101) });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(errors.length, 1);
  assert.equal(errors[0][0], 'Received syslog message could not be logged');
  assert.match(errors[0][1].message, /100 Characters/);
});
