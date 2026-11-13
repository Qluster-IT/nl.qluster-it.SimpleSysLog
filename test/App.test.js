'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createRequire } = require('node:module');
const test = require('node:test');
const vm = require('node:vm');

const appFile = require.resolve('../app');
const appRequire = createRequire(appFile);
const appModule = { exports: {} };
vm.runInNewContext(fs.readFileSync(appFile, 'utf8'), {
  require: name => name === 'homey' ? { App: class {} } : appRequire(name),
  module: appModule,
  process
}, { filename: appFile });
const App = appModule.exports;

function createApp() {
  const app = new App();
  const timers = new Map();
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
    setInterval(callback, delay, ...args) {
      const handle = ++createdTimers;
      timers.set(handle, { callback, delay, args });
      return handle;
    },
    clearInterval(handle) {
      assert.equal(timers.delete(handle), true);
    }
  };
  return { app, timers, settings, createdTimers: () => createdTimers };
}

test('settings reloads keep one retention timer and changing its period replaces it', async () => {
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
  assert.equal(timer.delay, 60 * 60 * 1000);
});

test('disabling retention through settings releases its timer', () => {
  const { app, timers, settings } = createApp();
  app.getSettings();
  settings.removeLogOlderThanDays = 0;
  app.getSettings();
  assert.equal(timers.size, 0);
  assert.equal(app.automaticlyRemovalOfLogsTimer, undefined);
});

test('shutdown releases retention timers and destroys the log', async () => {
  const { app, timers } = createApp();
  app.getSettings();
  let destroyed = false;
  app.Log = { async destroy() { destroyed = true; } };
  await app.onUninit();
  assert.equal(timers.size, 0);
  assert.equal(destroyed, true);
});
