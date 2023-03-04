"use strict";
const { BL } = require("betterlogiclibrary");

module.exports = {
  async getLogDownloadUrl({ homey, params: { returnType } }) {
    //return ;
    if (!homey.app.Log) throw new Error(homey.__('bllNotStartedYet'));
    try {
      switch (returnType) {
        case 'csv': {
          const logs = await homey.app.Log.getLogs({ returnType: 'csv' });
          const link = await BL.getDownloadUrl({ text: logs.csv, contentType: 'text/csv' });
          if (homey.app.settings && homey.app.settings.csvFilename) link.filename = await BL.decode(homey.app.settings.csvFilename);
          else link.filename = "Logs " + BL.datetime.toString('datetimeshort') + '.csv';
          //if(!a.filename.toLowerCase().endsWith('.csv')) a.filename+='.csv';
          link.filenameEncoded = encodeURIComponent(link.filename);
          return link;
        }
        case 'xlsx': {
          try {
            const logs = await homey.app.Log.getLogs({ returnType: 'xlsx' });
            const test = logs.xlsx;//Buffer.from(logs.xlsx).toString('base64');
            const link = await BL.getDownloadUrl({ base64: logs.xlsx, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            if (homey.app.settings && homey.app.settings.xlsxFilename) link.filename = await BL.decode(homey.app.settings.xlsxFilename);
            else link.filename = "Logs " + BL.datetime.toString('datetimeshort') + '.xlsx';
            //if(!a.filename.toLowerCase().endsWith('.csv')) a.filename+='.csv';
            link.filenameEncoded = encodeURIComponent(link.filename);
            return link;
          } catch (error) {
            homey.error(error);
          }
        };
        case 'json': {
          const logs = await homey.app.Log.getLogs({ returnType: 'json' });
          const link = await BL.getDownloadUrl({ text: JSON.stringify(logs.logs), contentType: 'text/json' });
          if (homey.app.settings && homey.app.settings.jsonFilename) link.filename = await BL.decode(homey.app.settings.jsonFilename);
          else link.filename = "Logs " + BL.datetime.toString('datetimeshort') + '.json';
          //if(!a.filename.toLowerCase().endsWith('.csv')) a.filename+='.csv';
          link.filenameEncoded = encodeURIComponent(link.filename);
          return link;
        }
      }
      if (returnType === 'csv') {
      }
    } catch (error) {
      //homey.error(error);
      let msg = error.message || error;
      if (msg.indexOf('App Not Ready') > -1) throw new Error(homey.__('bllNotRunning'));
    }
  },

  async getLogs({ homey }) {
    
    if (!homey.app.Log) return homey.app.getLogFromBackLog();
    //if(!homey.app.Log) throw new Error(homey.__('bllNotStartedYet'));
    let result = await homey.app.Log.getLogs({ maxSizeKb: 900 });//BL._.take(, 1000);
    return result;
    //return homey.app.getLog();
  },
  async queryLogs({ homey, body }) {
    if (!homey.app.Log) throw new Error(homey.__('bllNotStartedYet'));
    body.maxSizeKb = 900;
    let result = await homey.app.Log.getLogs(body);//BL._.take(, 1000);
    return result;
  },
  async clearLog({ homey }) {
    homey.app.apiClearLog();
    return "OK";
  },
  async addLog({ homey, body }) {
    homey.app.apiPutAddlog({ body });
    return "OK";
  }
};


// module.exports = [
//   {
//     description: "Add some logging.",
//     method: "PUT",
//     path: "/addlog/",
//     requires_authorization: true,
//     public: true,
//     fn: function (data, callback) {
//       Homey.app.apiPutAddlog(data);
//       return callback(null, "OK");
//     },
//   },
//   {
//     description: "Clear logging.",
//     method: "GET",
//     path: "/clearlog/",
//     requires_authorization: true,
//     public: true,
//     fn: function (data, callback) {
//       Homey.app.apiClearLog();
//       return callback(null, "OK");
//     },
//   },
//   {
//     description: "Get Logging.",
//     method: "GET",
//     path: "/",
//     requires_authorization: true,
//     public: true,
//     fn: function (data, callback) {
//       let log = Homey.app.getLog();
//       return callback(null, log);
//     },
//   },
// ];
