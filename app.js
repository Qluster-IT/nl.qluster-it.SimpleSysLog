"use strict";
const { BL } = require("betterlogiclibrary");
const { createReadStream, readFileSync, unlinkSync, rmSync, stat, statSync, readdirSync } = require("fs");
const Homey = require("homey");
const path = require("path");
const { Log } = require("./lib/Log");
const DBLIMIT = 2000;
//let loggingDB = [];
let homey;

// Array check.
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
function addLogToTimeline(data) {
  try {
    homey.notifications.createNotification({ excerpt: data }, (e, n) => { });
  } catch (error) {
    homey.error(error);
  }
}

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
    if (process.env.DEBUG === '1' || false) {
      try {
        require('inspector').waitForDebugger();
      }
      catch (error) {
        require('inspector').open(9218, '0.0.0.0', true);
      }
    }

    this.Loggers = {};

try {
  
  await BL.init({
    homey: this.homey,
    modules: [
      "datetime"
      //"proto"
    ]
  });
} catch (error) {
  this.error(error);
  throw new Error(error);
}
    //if (process.env.DEBUG === '1') 
      
    
    this.Log = new Log({ filePath: '/userdata/' });
    //this.Log.clearLog();

    
    let loggingDB = this.homey.settings.get("loggingDB");
    if (isArray(loggingDB)) {
      for (let i = 0; i < loggingDB.length; i++) {
        const log = loggingDB[i];
        this.addLogToDB(log.data, log.group, {timestamp:log.date});        
      }
      await this.homey.settings.set("loggingDB", null);
    }

    this.addLogToDB('App "Simple (Sys) LOG" started.', "Simple LOG");

    if ( false ){//&& process.env.DEBUG === '1') {
      let date = new Date();
      //await this.addLogToDB(date, 'DATE TEST');
      //date = new Date(date.setMonth(date.getMonth()-8));
      for (let i = 0; i < 365; i++) {
        date = new Date(date.setDate(date.getDate() - 1));
        for (let i = 0; i < 30; i++) {
          await this.addLogToDB('Test message voor here is this', undefined, { severity: i === 0 ? 4 : undefined, timestamp: date });
        }
      }
    }

    // let first = new Date().toISOString();
    // this.log(await this.Log.getLogs());
    // this.log('first', first);
    // this.log('second', new Date().toISOString());

    //this.addLogToDB('App "Simple LOG" started.', "Simple LOG");

    // let book = this.Log.getLogBook(new Date());
    // for (let i = 0; i < book.index.length; i++) {
    //   this.log(await book.read(book.index[i][0], book.index[i][1]));
    // } 



    // let line = await book.read(book.index[10][0], book.index[10][1]);
    // this.log(line);

    // let s = createReadStream('/userdata/2023-02-17.log', { start:0, end:24} );
    // let l = s.read();
    //let s = readFileSync('/userdata/2023-02-17.log');

    //let l = s.read();


    homey = this.homey;
    this.buildCards();
    loggingDB = this.homey.settings.get("loggingDB");
    if (!isArray(loggingDB)) {
      loggingDB = [];
    }
    //this.log(loggingDB);
  }

  async onUninit() {
    if(this.Log) await this.Log.destroy();
  }

  async addLogToDB(data, group, { severity, facility, timestamp = new Date(), source = 'log' } = {}) {
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
    console.log("API: PUT...");
    console.log(data);
    if (data && data.body && data.body.log) {
      this.addLogToDB(data.body.log, data.body.group);
    }
  }
  apiClearLog() {
    this.Log.clearLog();
  }
  

  buildCards() {

    // FLOW Action Card, Input_log
    let actionInputLog = this.homey.flow.getActionCard("Input_log");
    actionInputLog.registerRunListener((args, state) => {
      this.addLogToDB(args.log, undefined, args);
      return true;
    });

    // FLOW Action Card, Input_logtimeline
    let actionInputLogTimeline = this.homey.flow.getActionCard("Input_logtimeline");
    actionInputLogTimeline.registerRunListener((args, state) => {
      this.addLogToDB(args.log, undefined, args);
      addLogToTimeline(args.log);
      return true;
    });

    // FLOW Action Card, Input_timeline
    let actionInputTimeline = this.homey.flow.getActionCard("Input_timeline");
    actionInputTimeline.registerRunListener((args, state) => {
      addLogToTimeline(args.log);
      return true;
    });

    // FLOW Action Card, Input_group_log
    let actionInputGroupLog = this.homey.flow.getActionCard("Input_group_log");
    actionInputGroupLog.registerRunListener((args, state) => {
      this.addLogToDB(args.log, args.group, args);
      return true;
    });

    // FLOW Action Card, Input_group_logtimeline
    let actionInputGroupLogTimeline = this.homey.flow.getActionCard("Input_group_logtimeline");
    actionInputGroupLogTimeline.registerRunListener((args, state) => {
      this.addLogToDB(args.log, args.group, args);
      addLogToTimeline(`[${args.group}] ${args.log}`);
      return true;
    });

    // FLOW Action Card, Clear_log_Older
    let actionClearlogOlder = this.homey.flow.getActionCard("Clear_log_Older");
    actionClearlogOlder.registerRunListener((args, state) => {
      this.Log.clearLog(args.days);
      return true;
    });

    // FLOW Action Card, Clear_log
    let actionClearlog = this.homey.flow.getActionCard("Clear_log");
    actionClearlog.registerRunListener((args, state) => {
      return this.Log.clearLog();
    });

    // FLOW Action Card, get_log
    let actionGetLog = this.homey.flow.getActionCard("get_log");
    actionGetLog.registerRunListener(async (args, state) => {
      let s;
      try {
        s = JSON.stringify(await this.Log.getLogs());
      } catch (error) {
        throw new Error(error);
      }
      return { "log": s };

    });
  }
}
module.exports = simpleLog;
