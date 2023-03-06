"use strict";
const { BL } = require("betterlogiclibrary");

module.exports = {
  async getLogDownloadUrl({ homey, params: { returnType } }) {
    //return ;
    if (!homey.app.Log) throw new Error(homey.__('bllNotStartedYet'));
    try {
      switch (returnType) {
        case 'csv': {
          let filename = homey.app.settings && homey.app.settings.csvFilename ?
            await BL.decode(homey.app.settings.csvFilename) :
            "Logs " + BL.datetime.toString('datetimeshort') + '.csv';

          const logs = await homey.app.Log.getLogs({ returnType: 'csv' });
          const link = await BL.getDownloadUrl({ text: logs.csv, contentType: 'text/csv', filename });
          return link;
        }
          break;
        case 'xlsx': {
          try {
            let filename = homey.app.settings && homey.app.settings.xlsxFilename ?
              await BL.decode(homey.app.settings.xlsxFilename) :
              "Logs " + BL.datetime.toString('datetimeshort') + '.xlsx';

            const logs = await homey.app.Log.getLogs({ returnType: 'xlsx' });
            const link = await BL.getDownloadUrl({ base64: logs.xlsx, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', filename });
            return link;
          } catch (error) {
            homey.error(error);
          }
        }
          break;
        case 'json': {
          let filename = homey.app.settings && homey.app.settings.jsonFilename ?
            await BL.decode(homey.app.settings.jsonFilename) :
            "Logs " + BL.datetime.toString('datetimeshort') + '.json';

          const logs = await homey.app.Log.getLogs({ returnType: 'json' });
          const link = await BL.getDownloadUrl({ text: JSON.stringify(logs.logs), contentType: 'text/json', filename });
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
