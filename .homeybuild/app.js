"use strict";
const { BL } = require("betterlogiclibrary");
const Homey = require("homey");
const { Log, SEVERITIES, FACILITIES } = require("./lib/Log");
const { BUILT_IN_DESIGNS, BUILT_IN_THEMES, getWidgetStyles } = require("./lib/widget-styles");
const { AndroidLinkFeed } = require("./lib/android-links");

const DBLIMIT = 2000;


let homey;


const SIMPLE_LOG = "Simple Log";
const debug = false;

function isArray(a) {
  return !!a && a.constructor === Array;
}

async function decodeText(value) {
  if (typeof value !== "string") return value;
  return await BL.decode(value);
}

// // The heart of this app. adding a log entry
// function addLogToDB(data, group, {timestamp}={}) {
//   checkSurplusEntries();
//   loggingDB.push({ data, group, date: timestamp || new Date() });
//   homey.settings.set("loggingDB", loggingDB);
// }

// Adding a log entry to Timeline.


//Limit amount of log entries to 2000.
// function checkSurplusEntries() {
//   if (loggingDB.length > DBLIMIT) {
//     let tomuch = loggingDB.length - DBLIMIT;
//     loggingDB.splice(0, tomuch);
//   }
// }

//App Class...
class simpleLog extends Homey.App {

  constructor(...args) {
    super(...args);
    this.widgetTimestampFormats = new Map();
    this.widgetTimestampFormatCache = ['datetime'];
    this.apiReady = false;
    this.androidLinkFeed = new AndroidLinkFeed();
  }

  async announceApiReady() {
    this.apiReady = true;
    this.androidLinkFeed.markReady();
    try {
      await this.homey.api.realtime('api-ready', { ready: true });
    } catch (error) {
      this.homey.error('Unable to notify clients that Simple (Sys) Log is ready', error);
    }
  }

  // Sent at most once: the setting is stored before sending, so a failed delivery is not retried.
  async notifyReleaseFeatures() {
    const key = 'widgetFeaturesNotificationAttempted';
    if (this.homey.settings.get(key)) return;
    try {
      this.homey.settings.set(key, true);
      await this.homey.notifications.createNotification({ excerpt: this.homey.__('widget_features_notice') });
    } catch (error) {
      this.homey.error('Unable to deliver release notification', error);
    }
  }

  // A widget registers its entry timestamp format and its day separator format.
  registerWidgetTimestampFormat(instanceId, formats) {
    if (typeof instanceId !== 'string' || !instanceId.trim() || instanceId.length > 128) {
      throw new Error('A valid widget instance ID is required.');
    }
    if (typeof formats === 'string') formats = [formats];
    if (!Array.isArray(formats) || !formats.length || formats.length > 4
      || formats.some(format => typeof format !== 'string' || !format.trim() || format.length > 128)) {
      throw new Error('A valid date and time format is required.');
    }
    const previous = this.widgetTimestampFormats.get(instanceId);
    if (!previous || previous.join('\u0000') !== formats.join('\u0000')) {
      this.widgetTimestampFormats.set(instanceId, formats.slice());
      this.widgetTimestampFormatCache = null;
    }
  }

  unregisterWidgetTimestampFormat(instanceId) {
    if (typeof instanceId !== 'string' || !instanceId.trim() || instanceId.length > 128) {
      throw new Error('A valid widget instance ID is required.');
    }
    if (this.widgetTimestampFormats.delete(instanceId)) this.widgetTimestampFormatCache = null;
  }

  getWidgetTimestampFormats() {
    if (!this.widgetTimestampFormatCache) {
      this.widgetTimestampFormatCache = Array.from(new Set(['datetime', ...Array.from(this.widgetTimestampFormats.values()).flat()]));
    }
    return this.widgetTimestampFormatCache;
  }

  async onInit() {
    let cardsBuild = false;
    this.apiReady = false;

    try {

      this.log('Simple (Sys) Log onInit');
      homey = this.homey;
      this.usingNewLog = !!await this.homey.settings.get("UsingNewLog");

      if (process.env.DEBUG === '1' || false) {

        if (debug) this.log('Simple (Sys) Log onInit - debugger starting');
        try {
          require('inspector').open(9218, '0.0.0.0', true);
        } catch (error) {
          try {

            require('inspector').waitForDebugger();
          } catch (error) {

          }
        }
        if (debug) this.log('Simple (Sys) Log onInit - debugger connected');


      }


      if (debug) this.log('Simple (Sys) Log onInit - past debugger');

      this.Loggers = [[], [], [], [], [], [], [], []];

      this.BackLog = this.homey.settings.get("BackLog");
      if (!isArray(this.BackLog)) {
        this.BackLog = [];
        this.homey.settings.set("BackLog", this.BackLog);
      } else this.BackLog = this.BackLog.map(x => { x[2].timestamp = new Date(x[2].timestamp); return x; });
      //this.log(this.BackLog);

      if (debug) this.log('Simple (Sys) Log onInit - past BackLog');

      /// Conversion into the new BackLog model.
      let loggingDB = this.homey.settings.get("loggingDB");
      if (debug) this.log('Simple (Sys) Log onInit - Mutating BackLog');
      if (isArray(loggingDB)) {


        if (debug) this.log('Simple (Sys) Log onInit - Mutating BackLog: ' + loggingDB.length);

        for (let i = 0; i < loggingDB.length; i++) {
          const log = loggingDB[i];
          this.addLogToDB(log.data, log.group, { timestamp: log.date, save: false });
        }
        this.homey.settings.set("BackLog", this.BackLog);
        this.homey.settings.unset("loggingDB");
      }

      this.addLogToDB('App "Simple (Sys) Log" started.', SIMPLE_LOG);
      //throw new Error('test');


      this.homey.settings.on('set', async (settingName) => {
        switch (settingName) {
          case 'settings': this.getSettings(); break;
        }
      });
      this.getSettings();
      await this.runAutomaticlyRemovalOfLogs();
      try {
        this.registerWidgetSettingAutocompletes();
      } catch (error) {
        this.error('Widget setting autocomplete registration failed', error);
      }
      await this.notifyReleaseFeatures();


      if (debug) this.log('Simple (Sys) Log onInit - BL.init');
      //try {
      try {
        let bl = await BL.init({
          homey: this.homey,
          modules: [
            '_',
            "datetime",
            "json"
          ],
          require: false
        });
        bl.ready.then(async () => {
          await this.initRealApp();
        });

      } catch (error) {
        this.homey.error('onInit BL init error:', error);
      }

      try {
        this.buildCards();
        cardsBuild = true;
      } catch (error) {
        this.error(error);
      }
      // BLL-backed log storage is optional (limited mode), so readiness does not wait for it.
      if (cardsBuild) await this.announceApiReady();

    } catch (error) {
      this.homey.error('onInit error:', error);
      try {

        if (!cardsBuild) this.buildCards();
      } catch (error2) {
        this.homey.error('onInit buildCards error:', error2);
      }
    }

    if (debug) this.log('Simple (Sys) Log onInit finished');
  }

  async initRealApp() {    
    this.logInitializing = true;
    await this.automaticlyRemovalOfLogsPending;
    try {
      this.log('Simple (Sys) Log initRealApp');
      this.homey.settings.set("UsingNewLog", true);
      this.usingNewLog = true;
      this.Log = new Log({ filePath: '/userdata/' });
      await this.Log.init();

      if (this.BackLog) {
        for (let i = 0; i < this.BackLog.length; i++) {
          const backLog = this.BackLog[i];
          await this._addLogToDB(...backLog);
        }
        delete this.BackLog;
        this.homey.settings.unset("BackLog");
      }


      if (false) {//&& process.env.DEBUG === '1') {
        let date = new Date();
        //await this.addLogToDB(date, 'DATE TEST');
        //date = new Date(date.setMonth(date.getMonth()-8));
        for (let i = 0; i < 100; i++) {
          date = new Date(date.setDate(date.getDate() - 1));
          for (let j = 0; j < 10; j++) {
            await this.addLogToDB('Test message voor here is this', undefined, { severity: j === 0 ? 4 : undefined, timestamp: date });
          }
        }
      }

      this.log('Simple (Sys) Log initRealApp finished');
    } finally {
      this.logInitializing = false;
    }
    this.androidLinkFeed.wake();
    try {
      await this.homey.api.realtime('log_storage_ready', { ready: true });
    } catch (error) {
      this.homey.error('Unable to notify clients that the log storage is ready', error);
    }
    await this.runAutomaticlyRemovalOfLogs();
  }

  getSettings() {
    this.settings = this.homey.settings.get('settings');
    let changed = false;
    if (!this.settings) this.settings = {};
    if (!this.settings.csvFilename && (changed = true)) this.settings.csvFilename = "Logs_{[date('yyyy-MM-dd_HH-mm-ss')]}.csv";
    if (!this.settings.jsonFilename && (changed = true)) this.settings.jsonFilename = "Logs_{[date('yyyy-MM-dd_HH-mm-ss')]}.json";
    if (!this.settings.xlsxFilename && (changed = true)) this.settings.xlsxFilename = "Logs_{[date('yyyy-MM-dd_HH-mm-ss')]}.xlsx";
    if (!this.settings.includeUtcInExcel && (changed = true)) this.settings.includeUtcInExcel = false;
    if (this.settings.groupInTimeline === undefined && (changed = true)) this.settings.groupInTimeline = true;

    if (changed) this.homey.settings.set('settings', this.settings);
    this.updateAutomaticlyRemovalOfLogs(this.settings.removeLogOlderThanDays);

  }

  registerWidgetSettingAutocompletes() {
    const widget = this.homey.dashboards.getWidget('log_viewer');
    const register = (settingId, getItems) => {
      widget.registerSettingAutocompleteListener(settingId, async query => {
        const text = typeof query === 'string' ? query.trim() : '';
        const search = text.toLocaleLowerCase();
        return getItems(text).filter(item => !search || item.name.toLocaleLowerCase().includes(search));
      });
    };
    register('designStyle', () => {
      const designs = getWidgetStyles(this.homey).designs;
      return designs.map(item => ({
        id: item.id,
        name: item.id === 'builtin:default' ? this.homey.__('widgets.design.default') : item.name
      }));
    });
    register('colorTheme', () => {
      const themes = getWidgetStyles(this.homey).themes;
      return themes.map(item => ({
        id: item.id,
        name: item.id === 'builtin:default' ? this.homey.__('widgets.theme.default') : item.name
      }));
    });
    register('datetimeFormat', query => {
      const formats = this.getDatetimeFormatSuggestions(query);
      if (!query) formats.unshift({ id: '', name: this.homey.__('widgets.datetime.designFormat') });
      return formats;
    });
  }

  // Same list as BLL's "format date/time" Flow card: the user's custom and the customisable BLL codes,
  // a few patterns, then the typed text when it is not listed. Shared by the widget and the designer.
  getDatetimeFormatSuggestions(query) {
    const patterns = ['dd-MM-yyyy', 'dd-MM-yyyy HH:mm', 'dd-MM-yyyy HH:mm:ss', 'HH:mm', 'HH:mm:ss'];
    let codes = [];
    try {
      if (BL.isReady) codes = BL.datetime.codes.array.filter(code => code.customisable || code.custom).map(code => code.code);
    } catch (error) {
      codes = [];
    }
    if (!codes.length) codes = ['shortdate', 'date', 'DATE', 'LONGDATE', 'DATETIME', 'datetime', 'timeshort'];
    const names = [...new Set([...codes, ...patterns])];
    const search = query ? query.toLowerCase() : '';
    const matches = names.filter(name => name.toLowerCase().includes(search));
    if (query && !names.includes(query)) matches.unshift(query);
    return matches.map(name => {
      let description = this.homey.__('widgets.datetime.customFormat');
      if (BL.isReady) {
        try {
          description = BL.datetime.toString(name, new Date());
        } catch (error) {
          description = this.homey.__('widgets.datetime.customFormat');
        }
      } else if (name !== query) description = name;
      return { id: name, name, description };
    });
  }

  updateAutomaticlyRemovalOfLogs(days) {
    if (this.automaticlyRemovalOfLogsTimer) {
      if (days === this.automaticlyRemovalOfLogsDays) return;
      this.homey.clearTimeout(this.automaticlyRemovalOfLogsTimer);
      delete this.automaticlyRemovalOfLogsTimer;
    }
    this.automaticlyRemovalOfLogsDays = days;
    if (!days) return;

    // Match getLogBook's process-local calendar days, including clock/DST changes.
    const now = new Date();
    const next = new Date(now);
    next.setHours(0, 5, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    const timer = this.homey.setTimeout(async () => {
      if (this.automaticlyRemovalOfLogsTimer !== timer) return;
      await this.runAutomaticlyRemovalOfLogs();
      if (this.automaticlyRemovalOfLogsTimer !== timer) return;
      delete this.automaticlyRemovalOfLogsTimer;
      this.updateAutomaticlyRemovalOfLogs(this.automaticlyRemovalOfLogsDays);
    }, next.getTime() - now.getTime());
    this.automaticlyRemovalOfLogsTimer = timer;
  }

  runAutomaticlyRemovalOfLogs() {
    if (this.automaticlyRemovalOfLogsPending) return this.automaticlyRemovalOfLogsPending;
    const days = this.automaticlyRemovalOfLogsDays;
    if (!days || this.logInitializing) return Promise.resolve();
    this.automaticlyRemovalOfLogsPending = Promise.resolve()
      .then(() => this.clearLog(days))
      .catch(error => this.homey.error('Automatic log cleanup failed', error))
      .finally(() => { delete this.automaticlyRemovalOfLogsPending; });
    return this.automaticlyRemovalOfLogsPending;
  }

  async onUninit() {
    //homey.settings.set('___TEST___', 'onUninit');
    //this.addLogToDB('SSL onUninit');
    this.updateAutomaticlyRemovalOfLogs();
    this.androidLinkFeed.wake();
    await this.automaticlyRemovalOfLogsPending;
    if (this.Log) await this.Log.destroy();
  }

  // addLogToDB(data, group, { severity, facility, hostname, timestamp = new Date(), source = 'log', save } = {}) {
  //   return true;
  // }
  async addLogToDB(data, group, { severity, facility, hostname, timestamp = new Date(), source = 'log', save } = {}) {
    if (!timestamp) timestamp = new Date();
    if (!source) source = 'log';
    if (typeof (timestamp) == 'number' || typeof (timestamp) == 'string') timestamp = new Date(timestamp)

    let args = [data, group, { severity, facility, hostname, timestamp, source }];


    if (this.Log) {
      // return true;
      // let _r = await this._addLogToDB('', undefined);
      // return true;
      let r = await this._addLogToDB(...args);
      //return r;
      if (save !== false) this.triggerLogGenerated(...args);//.then(()=>{}).catch(()=>{});
      //await this.triggerLogGenerated(...args);
      return r;
    }
    else {
      if (!this.BackLog) this.BackLog = [];
      this.BackLog.push(args);
      if (this.BackLog.length > DBLIMIT) {
        let tomuch = this.BackLog.length - DBLIMIT;
        this.BackLog.splice(0, tomuch);
      }
      if (save !== false) this.homey.settings.set("BackLog", this.BackLog);
    }
    if (save !== false) this.triggerLogGenerated(...args);//.then(()=>{}).catch(()=>{});
    return true;
  }

  triggerLogGenerated(data, group, { severity, facility, hostname, timestamp, source }) {
    if (!this.triggerLog_generated) return;
    let _severity = severity ? SEVERITIES[severity] : '';
    let _facility = facility ? FACILITIES[facility] : '';
    severity = severity ? Number.parseInt(severity) : -1;
    facility = facility ? Number.parseInt(facility) : -1;
    this.triggerLog_generated.trigger({
      log: data, group: group || '',
      severity: _severity, severityId: severity,
      facility: _facility, facilityId: facility,
      hostname: hostname || '', timestamp: timestamp.getTime(), source: source || ''
    }, { group, severity, facility }).then(() => { }).catch(() => { });
    return true;
  }

  /**
   * @private
   * @param {String} data 
   * @param {String} group 
   * @param {*} param2 
   */
  async _addLogToDB(data, group, { severity, facility, hostname, timestamp = new Date(), source = 'log' } = {}) {
    // checkSurplusEntries();
    // loggingDB.push({ data, group, date: timestamp });
    // this.homey.settings.set("loggingDB", loggingDB);
    //return;
    const args = { message: data, app: group, severity, facility, hostname, timestamp };
    await this.Log.writeLine(args);

    if (source === 'log') {

      let sev = Number.parseInt(severity || '6');
      for (let i = sev; i < this.Loggers.length; i++) {
        const loggers = this.Loggers[i];
        for (const logger of loggers) {
          await logger.log({ data, group, severity: severity || '6', facility: facility || '16', timestamp, hostname, source });
        }
      }
    }
    // for (const _severity of Object.keys(this.Loggers)) {
    //   if (Number.parseInt(_severity) <= Number.parseInt(severity) && this.Loggers[_severity] && this.Loggers[_severity].length > 0)

    //     for (const logger of this.Loggers[_severity]) {
    //       await logger.log({ data, group, severity: severity || '6', facility: facility || '16', timestamp, hostname });
    //     }
    // }
  }

  async apiPutAddlog(data) {
    // console.log("API: PUT...");
    // console.log(data);
    //if(data && data.body && data.body.)
    if (data && data.body && data.body.log) {
      await this.addLogToDB(data.body.log, data.body.group, data.body);
    }
  }
  async apiClearLog() {
    if (this.Log) return await this.Log.clearLog();
    else return await this.clearBackLog();
  }
  async addLogToTimeline(data) {
    try {
      return await this.homey.notifications.createNotification({ excerpt: data }, (e, n) => { });
    } catch (error) {
      await this.addLogToDB(error, SIMPLE_LOG);
      return false;
    }
  }

  async clearBackLog(days) {
    if (!days) this.BackLog = [];
    else {
      let date = new Date();
      date = new Date(date.setDate(date.getDate() - days));
      this.BackLog = this.BackLog.filter(x => x[2].timestamp > date);
    }
    this.homey.settings.set("BackLog", this.BackLog);
  }

  async getBackLog() {
    return this.BackLog.map((x) => {
      return {
        data: x[0],
        group: x[1],
        date: x[2].timestamp
      };
    });
  }

  async clearLog(days) {
    if (this.Log) return await this.Log.clearLog(days);
    else return await this.clearBackLog(days);
  }


  buildCards() {

    // FLOW Action Card, Input_group_log
    let actionAutomater_log = this.homey.flow.getActionCard("Automater_log");
    actionAutomater_log.registerRunListener(async (args, state) => {
      await this.addLogToDB(args.log, args.group, args);
      return true;
    });

    let actionAutomater_condition_log = this.homey.flow.getConditionCard("Automater_condition_log");
    actionAutomater_condition_log.registerRunListener(async (args, state) => {
      await this.addLogToDB(args.log, args.group, args);
      return true;
    });


    this.triggerLog_generated = this.homey.flow.getTriggerCard("Log_generated");
    this.triggerLog_generated.registerRunListener(async (args, state) => {
      return (!args.group || args.group == 'undefined' || args.group == state.group) &&
        (!args.severity || args.severity == 'undefined' || args.severity == state.severity) &&
        (!args.facility || args.facility == 'undefined' || args.facility == state.facility);
    });


    // FLOW Action Card, Input_log
    let actionInputLog = this.homey.flow.getActionCard("Input_log");
    actionInputLog.registerRunListener(async (args, state) => {      
      args.log = await decodeText(args.log);
      await this.addLogToDB(args.log, undefined, args);
      return true;
    });

    // FLOW Action Card, Input_logtimeline
    let actionInputLogTimeline = this.homey.flow.getActionCard("Input_logtimeline");
    actionInputLogTimeline.registerRunListener(async (args, state) => {      
      args.log = await decodeText(args.log);
      await this.addLogToDB(args.log, undefined, args);
      await this.addLogToTimeline(args.log);
      return true;
    });

    // FLOW Action Card, Input_timeline
    let actionInputTimeline = this.homey.flow.getActionCard("Input_timeline");
    actionInputTimeline.registerRunListener(async (args, state) => {      
      args.log = await decodeText(args.log);
      await this.addLogToTimeline(args.log);
      return true;
    });

    // FLOW Action Card, Input_group_log
    let actionInputGroupLog = this.homey.flow.getActionCard("Input_group_log");
    actionInputGroupLog.registerRunListener(async (args, state) => {      
      args.log = await decodeText(args.log);
      args.group = await decodeText(args.group);
      await this.addLogToDB(args.log, args.group, args);
      return true;
    });

    // FLOW Action Card, Input_group_logtimeline
    let actionInputGroupLogTimeline = this.homey.flow.getActionCard("Input_group_logtimeline");
    actionInputGroupLogTimeline.registerRunListener(async (args, state) => {      
      args.log = await decodeText(args.log);
      args.group = await decodeText(args.group);
      await this.addLogToDB(args.log, args.group, args);
      await this.addLogToTimeline((this.settings.groupInTimeline ? `[${args.group}] ` : '') + `${args.log}`);
      return true;
    });

    // FLOW Action Card, Clear_log_Older
    let actionClearlogOlder = this.homey.flow.getActionCard("Clear_log_Older");
    actionClearlogOlder.registerRunListener(async (args, state) => {
      if (!Number.isFinite(args.days) || args.days < 1) {
        throw new Error(this.homey.__('errors.retentionDays'));
      }
      //if (!this.Log) throw new Error(this.homey.__('bllNotRunning'));
      if (!this.Log) return await this.clearBackLog(args.days);

      await this.Log.clearLog(args.days);
      return true;
    });

    // FLOW Action Card, Clear_log
    let actionClearlog = this.homey.flow.getActionCard("Clear_log");
    actionClearlog.registerRunListener(async (args, state) => {
      //if(!this.Log)  throw new Error(this.homey.__('bllNotRunning'));
      if (!this.Log) return await this.clearBackLog();

      return await this.Log.clearLog();
    });

    // FLOW Action Card, get_log
    let actionGetLog = this.homey.flow.getActionCard("get_log");
    actionGetLog.registerRunListener(async (args, state) => {
      if (!this.Log && args.returnType === 'json') return { log: JSON.stringify(await homey.app.getBackLog()) };
      let s;
      try {
        if (!this.Log) throw new Error(this.homey.__('bllNotRunning'));
        const t = await this.Log.getLogs(args);
        s = t.json || t.csv || t.xlsx;
        if (!s) {
          this.homey.log('s is empty, t is ', t, ', args is ', args);
        }
      } catch (error) {
        this.homey.error(error);
        throw new Error(error);
      }
      return { "log": s };

    });
  }
}
module.exports = simpleLog;
