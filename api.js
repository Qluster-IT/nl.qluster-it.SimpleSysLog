"use strict";
const { BL } = require("betterlogiclibrary");
const Homey = require("homey");


module.exports = {
  async getLogDownloadUrl({ homey, params: {returnType} }) {
    try {
      if(returnType==='csv') {
        let logs = await homey.app.Log.getLogs({returnType:'csv'});
        let a = await BL.getDownloadUrl({base64:Buffer.from(logs.csv).toString('base64'), contentType:'text/csv'});
        a.filename = "Logs " + BL.datetime.toString('datetimeshort') + '.csv';
        a.filenameEncoded = encodeURIComponent(a.filename);
        
        return a;

      }
    } catch (error) {
      homey.error(error);
    }
  },
  async getLogs({ homey }) {
    let result = await homey.app.Log.getLogs({ maxSizeKb: 900 });//BL._.take(, 1000);
    return result;
    //return homey.app.getLog();
  },
  async queryLogs({ homey, body: { skip, take } }) {
    arguments[0].body.maxSizeKb = 900;
    let result = await homey.app.Log.getLogs(arguments[0].body);//BL._.take(, 1000);
    //return [];
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
