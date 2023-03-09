"use strict";
const { BL } = require("betterlogiclibrary");
const Homey = require("homey");
const { Log } = require("./lib/Log");

const DBLIMIT = 2000;


let homey;


const SIMPLE_LOG = "Simple LOG";

function isArray(a) {
  return !!a && a.constructor === Array;
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
  async onInit() {
    this.log('Simple (Sys) LOG onInit');
    homey = this.homey;
    if (process.env.DEBUG === '1' || false) {
      try {
        require('inspector').waitForDebugger();
      }
      catch (error) {
        require('inspector').open(9218, '0.0.0.0', true);
      }
    }
    //else try{ require('inspector').open(9218, '0.0.0.0', false); } catch(ex){}

    this.Loggers = {};

    this.BackLog = this.homey.settings.get("BackLog");
    if (!isArray(this.BackLog)) {
      this.BackLog = [];
      this.homey.settings.set("BackLog", this.BackLog);
    } else this.BackLog = this.BackLog.map(x=>{ x[2].timestamp = new Date(x[2].timestamp);return x;});
    //this.log(this.BackLog);

    /// Conversion into the new BackLog model.
    let loggingDB = this.homey.settings.get("loggingDB");
    if (isArray(loggingDB)) {

      this.addLogToDB('Mutating old Log to the new Simple (Sys) LOG', SIMPLE_LOG);

      for (let i = 0; i < loggingDB.length; i++) {
        const log = loggingDB[i];
        this.addLogToDB(log.data, log.group, { timestamp: log.date });
      }
      this.homey.settings.set("loggingDB", null);
    }

    this.addLogToDB('App "Simple (Sys) LOG" started.', SIMPLE_LOG);




    //try {
    let bl = await BL.init({
      homey: this.homey,
      modules: [
        '_',
        "datetime",
        "json"
      ]
    });
    bl.ready.then(async () => {
      await this.initRealApp();
    });

    this.buildCards();

    this.log('Simple (Sys) LOG onInit finished');
    this.homey.log(this.homey.settings.get('___TEST___'));
    //await this.initRealApp();
  }

  async initRealApp() {
    this.Log = new Log({ filePath: '/userdata/' });
    await this.Log.init();
    if (this.BackLog) {
      for (let i = 0; i < this.BackLog.length; i++) {
        const backLog = this.BackLog[i];
        await this._addLogToDB(...backLog);
      }
      delete this.BackLog;
      this.homey.settings.set("BackLog", null);
    }

    if (false) {//&& process.env.DEBUG === '1') {
      let date = new Date();
      //await this.addLogToDB(date, 'DATE TEST');
      //date = new Date(date.setMonth(date.getMonth()-8));
      for (let i = 0; i < 100; i++) {
        date = new Date(date.setDate(date.getDate() - 1));
        for (let i = 0; i < 50; i++) {
          await this.addLogToDB('Test message voor here is this', undefined, { severity: i === 0 ? 4 : undefined, timestamp: date });
        }
      }
    }

    this.homey.settings.on('set', async (settingName) => {
      switch (settingName) {
        case 'settings': this.getSettings(); break;
      }
    });
    this.getSettings();
  }

  getSettings() {
    this.settings = this.homey.settings.get('settings');
    let changed = false;
    if (!this.settings) this.settings = {};
    if (!this.settings.csvFilename && (changed = true)) this.settings.csvFilename = "Logs_{[date('yyyy-MM-dd_HH-mm-ss')]}.csv";
    if (!this.settings.jsonFilename && (changed = true)) this.settings.jsonFilename = "Logs_{[date('yyyy-MM-dd_HH-mm-ss')]}.json";
    if (!this.settings.xlsxFilename && (changed = true)) this.settings.xlsxFilename = "Logs_{[date('yyyy-MM-dd_HH-mm-ss')]}.xlsx";
    if (!this.settings.includeUtcInExcel && (changed = true)) this.settings.includeUtcInExcel = false;
    if (changed) this.homey.settings.set('settings', this.settings);
  }

  async onUninit() {
    //homey.settings.set('___TEST___', 'onUninit');
    //this.addLogToDB('SSL onUninit');
    if (this.Log) await this.Log.destroy();
  }

  async addLogToDB(data, group, { severity, facility, timestamp = new Date(), source = 'log' } = {}) {
    if (!timestamp) timestamp = new Date();
    if (!source) source = 'log';

    let args = [data, group, { severity, facility, timestamp, source }];

    if (this.Log) return await this._addLogToDB(...args);
    else {
      if (!this.BackLog) this.BackLog = [];
      this.BackLog.push(args);
      if (this.BackLog.length > DBLIMIT) {
        let tomuch = this.BackLog.length - DBLIMIT;
        this.BackLog.splice(0, tomuch);
      }
      this.homey.settings.set("BackLog", this.BackLog);
    }
  }

  /**
   * @private
   * @param {String} data 
   * @param {String} group 
   * @param {*} param2 
   */
  async _addLogToDB(data, group, { severity, facility, timestamp = new Date(), source = 'log' } = {}) {
    // checkSurplusEntries();
    // loggingDB.push({ data, group, date: timestamp });
    // this.homey.settings.set("loggingDB", loggingDB);

    let args = { message: data, app: group, severity, facility, timestamp };
    await this.Log.writeLine(args);

    if (source !== 'syslog')
      for (const _severity of Object.keys(this.Loggers)) {
        if (Number.parseInt(_severity) <= Number.parseInt(severity) && this.Loggers[_severity] && this.Loggers[_severity].length > 0)

          for (const logger of this.Loggers[_severity]) {
            await logger.log({ data, group, severity: severity || '6', facility: facility || '16', timestamp });
          }
      }
  }

  apiPutAddlog(data) {
    // console.log("API: PUT...");
    // console.log(data);
    if (data && data.body && data.body.log) {
      this.addLogToDB(data.body.log, data.body.group);
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


  buildCards() {

    // FLOW Action Card, Input_log
    let actionInputLog = this.homey.flow.getActionCard("Input_log");
    actionInputLog.registerRunListener(async (args, state) => {
      await this.addLogToDB(args.log, undefined, args);
      return true;
    });

    // FLOW Action Card, Input_logtimeline
    let actionInputLogTimeline = this.homey.flow.getActionCard("Input_logtimeline");
    actionInputLogTimeline.registerRunListener(async (args, state) => {
      await this.addLogToDB(args.log, undefined, args);
      await this.addLogToTimeline(args.log);
      return true;
    });

    // FLOW Action Card, Input_timeline
    let actionInputTimeline = this.homey.flow.getActionCard("Input_timeline");
    actionInputTimeline.registerRunListener(async (args, state) => {
      await this.addLogToTimeline(args.log);
      return true;
    });

    // FLOW Action Card, Input_group_log
    let actionInputGroupLog = this.homey.flow.getActionCard("Input_group_log");
    actionInputGroupLog.registerRunListener(async (args, state) => {
      await this.addLogToDB(args.log, args.group, args);
      return true;
    });

    // FLOW Action Card, Input_group_logtimeline
    let actionInputGroupLogTimeline = this.homey.flow.getActionCard("Input_group_logtimeline");
    actionInputGroupLogTimeline.registerRunListener(async (args, state) => {
      await this.addLogToDB(args.log, args.group, args);
      await this.addLogToTimeline(`[${args.group}] ${args.log}`);
      return true;
    });

    // FLOW Action Card, Clear_log_Older
    let actionClearlogOlder = this.homey.flow.getActionCard("Clear_log_Older");
    actionClearlogOlder.registerRunListener(async (args, state) => {
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
      if (!this.Log && args.returnType==='json') return { log: JSON.stringify(await homey.app.getBackLog()) };
      let s;
      try {
        if(!this.Log)  throw new Error(this.homey.__('bllNotRunning'));
        s = await this.Log.getLogs(args);
        s = s.logs ? JSON.stringify(s.logs) : s.csv;
      } catch (error) {
        throw new Error(error);
      }
      return { "log": s };

    });
  }
}
module.exports = simpleLog;
