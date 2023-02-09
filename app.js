"use strict";
const Homey = require("homey");
const DBLIMIT = 2000;
let loggingDB = [];
let homey;

// Array check.
function isArray(a) {
  return !!a && a.constructor === Array;
}

// The heart of this app. adding a log entry
function addLogToDB(data, group) {
  checkSurplusEntries();
  loggingDB.push({ data, group, date: new Date() });
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
    
		//if (process.env.DEBUG === '1') require('inspector').open(9246, '0.0.0.0', true);
    	

    homey=this.homey;
    this.buildCards();
    loggingDB = this.homey.settings.get("loggingDB");
    if (!isArray(loggingDB)) {
      loggingDB = [];
    }
    addLogToDB('App "Simple LOG" started.', "Simple LOG");
  }
  apiPutAddlog(data) {
    console.log("API: PUT...");
    console.log(data);
    if (data && data.body && data.body.log) {
      addLogToDB(data.body.log, data.body.group);
    }
  }
  apiClearLog() {
    loggingDB = [];
    addLogToDB("Cleared all logging data", "Simple LOG");
  }
  getLog() {
    return loggingDB;
  }

  buildCards() {
        
    // FLOW Action Card, Input_log
    let actionInputLog = this.homey.flow.getActionCard("Input_log");
    actionInputLog.registerRunListener((args, state) => {
      addLogToDB(args.log);
      return true;
    });

    // FLOW Action Card, Input_logtimeline
    let actionInputLogTimeline = this.homey.flow.getActionCard("Input_logtimeline");
    actionInputLogTimeline.registerRunListener((args, state) => {
      addLogToDB(args.log);
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
      addLogToDB(args.log, args.group);
      return true;
    });

    // FLOW Action Card, Input_group_logtimeline
    let actionInputGroupLogTimeline = this.homey.flow.getActionCard("Input_group_logtimeline");
    actionInputGroupLogTimeline.registerRunListener((args, state) => {
      addLogToDB(args.log, args.group);
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
      addLogToDB("Cleared all logging data", "Simple LOG");
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
