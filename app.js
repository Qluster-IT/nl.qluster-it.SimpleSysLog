"use strict";
const { BL } = require("betterlogiclibrary");
const Homey = require("homey");
const { Log, SEVERITIES, FACILITIES } = require("./lib/Log");

const DBLIMIT = 2000;


let homey;


const SIMPLE_LOG = "Simple Log";
const debug = false;

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
    let cardsBuild = false;

    try {

      this.log('Simple (Sys) Log onInit');
      homey = this.homey;

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
    this.log('Simple (Sys) Log initRealApp');
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
    if (this.settings.removeLogOlderThanDays) this.updateAutomaticlyRemovalOfLogs(this.settings.removeLogOlderThanDays);

  }

  updateAutomaticlyRemovalOfLogs(days) {
    if (days) this.automaticlyRemovalOfLogsTimer = this.homey.setInterval(async (days) => {
      await this.clearLog(days);
    }, 60 * 60 * 1_000, days);
    else if (this.automaticlyRemovalOfLogsTimer) {
      this.homey.clearInterval(this.automaticlyRemovalOfLogsTimer);
      delete this.automaticlyRemovalOfLogsTimer;
    }
  }

  async onUninit() {
    //homey.settings.set('___TEST___', 'onUninit');
    //this.addLogToDB('SSL onUninit');
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

  apiPutAddlog(data) {
    // console.log("API: PUT...");
    // console.log(data);
    //if(data && data.body && data.body.)
    if (data && data.body && data.body.log) {
      this.addLogToDB(data.body.log, data.body.group, data.body);
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
      await this.addLogToTimeline((this.settings.groupInTimeline ? `[${args.group}] ` : '') + `${args.log}`);
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
