"use strict";
const { BL } = require("betterlogiclibrary");
const Homey = require("homey");
const DBLIMIT = 2000;
let loggingDB = [];
let homey;

// Array check.
function isArray(a) {
  return !!a && a.constructor === Array;
}

// The heart of this app. adding a log entry
function addLogToDB(data, group, {timestamp}={}) {
  checkSurplusEntries();
  loggingDB.push({ data, group, date: timestamp || new Date() });
  homey.settings.set("loggingDB", loggingDB);
}

// Adding a log entry to Timeline.
function addLogToTimeline(data) {
  try {   
    homey.notifications.createNotification({ excerpt: data }, (e, n) => {}); 
  } catch (error) {
    homey.error(error);
  }
}

//Limit amount of log entries to 2000.
function checkSurplusEntries() {
  if (loggingDB.length > DBLIMIT) {
    let tomuch = loggingDB.length - DBLIMIT;
    loggingDB.splice(0, tomuch);
  }
}

//App Class...
class simpleLog extends Homey.App {
  async onInit() {
    this.Loggers = {};

    if (process.env.DEBUG === '1'){
			try{ 
				require('inspector').waitForDebugger();
			}
			catch(error){
				require('inspector').open(9218, '0.0.0.0', true);
			}
		}

    await BL.init({
      homey:this.homey,      
      modules:[
				"datetime"
			]});
		//if (process.env.DEBUG === '1') require('inspector').open(9246, '0.0.0.0', true);
    	

    homey=this.homey;
    this.buildCards();
    loggingDB = this.homey.settings.get("loggingDB");
    if (!isArray(loggingDB)) {
      loggingDB = [];
    }
    addLogToDB('App "Simple LOG" started.', "Simple LOG");
  }
  
  addLogToDB(data, group, {severity, facility, timestamp}={severity:'6'}) {
    timestamp = timestamp || new Date();
    checkSurplusEntries();
    loggingDB.push({ data, group, date: timestamp });
    homey.settings.set("loggingDB", loggingDB);
    for (const _severity of Object.keys(this.Loggers)) {
      if(Number.parseInt(_severity)<=Number.parseInt(severity) && this.Loggers[_severity] && this.Loggers[_severity].length>0) 
      
      for (const logger  of this.Loggers[_severity]) {
        logger.log({data, group, severity, facility, timestamp });
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
    loggingDB = [];
    this.addLogToDB("Cleared all logging data", "Simple LOG");
  }
  getLog() {
    return loggingDB;
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
      console.log("Removing log data older then " + args.days + " Day(s).");
      let newloggingDB = [];
      for (let i in loggingDB) {
        if ((new Date() - new Date(loggingDB[i].date)) / 86400000 <= args.days) {
          newloggingDB.push(loggingDB[i]);
        }
      }
      loggingDB = newloggingDB;
      this.homey.settings.set("loggingDB", loggingDB);
      return true;
    });

    // FLOW Action Card, Clear_log
    let actionClearlog = this.homey.flow.getActionCard("Clear_log");
    actionClearlog.registerRunListener((args, state) => {
      loggingDB = [];
      this.addLogToDB("Cleared all logging data", "Simple LOG");
      return true;
    });

    // FLOW Action Card, get_log
    let actionGetLog = this.homey.flow.getActionCard("get_log");
    actionGetLog.registerRunListener((args, state) => {
      let s;
      try {
        s = JSON.stringify(this.getLog());
      } catch (error) {
        
      }
      return {"log":s};

    });
  }
}
module.exports = simpleLog;
