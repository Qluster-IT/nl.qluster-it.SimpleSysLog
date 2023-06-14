"use strict";
const { BL } = require("betterlogiclibrary");

module.exports = {
  async internal({ homey, body: { action, logBookID, type } }) {
    switch (action) {
      case 'getLogBookIDs':
        return homey.app.Log.LogBooks;
      case 'submitLogBookForDiagnostic':
        return homey.app.Log.submitLogBookForDiagnostic(logBookID);
      case 'retrieveLogBookDiagnostic':
        let s = homey.app.Log.retrieveLogBookDiagnostic(logBookID,);
        if (type == 'base64') return Buffer.from(s).toString('base64');
        else return s;
      case 'writelogs':
        let date = new Date();
        for (let i = 0; i < 100; i++) {
          date = new Date(date.setDate(date.getDate() - 1));
          for (let j = 0; j < 10; j++) {
            await homey.app.addLogToDB('Test message voor here is this', undefined, { severity: j === 0 ? 4 : undefined, timestamp: date });
          }
        }
        break;
      case 'getCount':
        return homey.app.Log.logCount;
        break;
    }
  },

  async getLogDownloadUrl({ homey, params: { returnType } }) {
    let callback = (link) => {
      homey.api.realtime('downloadFileReady', link)
    };

    if (!homey.app.Log) throw new Error(homey.__('bllNotStartedYet'));
    try {
      switch (returnType) {
        case 'csv': {
          let filename = homey.app.settings && homey.app.settings.csvFilename ?
            await BL.decode(homey.app.settings.csvFilename) :
            "Logs " + BL.datetime.toString('datetimeshort') + '.csv';

          const link = await BL.getDownloadUrl({ contentType: 'text/csv', filename });
          homey.setTimeout(async () => {
            const logs = await homey.app.Log.getLogs({ returnType: 'csv' });
            await BL.setDownloadUrl({ link, text: logs.csv, callback });
          }, 0);
          return link;
        }
          break;
        case 'xlsx': {
          try {
            let filename = homey.app.settings && homey.app.settings.xlsxFilename ?
              await BL.decode(homey.app.settings.xlsxFilename) :
              "Logs " + BL.datetime.toString('datetimeshort') + '.xlsx';

            const link = await BL.getDownloadUrl({ contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', filename });
            homey.setTimeout(async () => {
              const logs = await homey.app.Log.getLogs({ returnType: 'xlsx' });
              await BL.setDownloadUrl({ link, buffer: logs.xlsx, callback });
            }, 0);
            return link;
          } catch (error) {
            homey.error(error);
          }
        }
          break;
        case 'json': {
          let filename = //false && //LET OP! false weg
            homey.app.settings && homey.app.settings.jsonFilename ?
              await BL.decode(homey.app.settings.jsonFilename) :
              "Logs " + BL.datetime.toString('datetimeshort') + '.json';

          const link = await BL.getDownloadUrl({ contentType: 'text/json', filename });
          homey.setTimeout(async () => {
            const logs = await homey.app.Log.getLogs({ returnType: 'json' });
            //const text = JSON.stringify(logs.logs);
            await BL.setDownloadUrl({ link, text: logs.json, callback });
          }, 0);
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
