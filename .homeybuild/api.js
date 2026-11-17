"use strict";
const { BL } = require("betterlogiclibrary");
const { encodeTemplate, decodeTemplate } = require("./lib/widget-template");
const { getCatalog } = require("./lib/widget-template-catalog");
const { getWidgetStyles } = require("./lib/widget-styles");
const {
  TRANSLATION_KEYS, matchesLinkFilters, resetSecret, verifyLink
} = require("./lib/android-links");
const widgetApi = require("./widgets/log_viewer/api");

const ANDROID_POLL_TIMEOUT_MS = 20000;

function verifiedLinkConfig(homey, query) {
  return verifyLink(homey, query && query.ssl, query && query.sig);
}

function linkLogQuery(config) {
  const query = { take: config.entryCount, timestampFormat: config.datetimeFormat };
  if (config.minSeverity !== undefined) query.minSeverity = config.minSeverity;
  if (config.facility !== undefined) query.facility = config.facility;
  if (config.appFilter !== undefined) query.app = config.appFilter;
  if (config.hostnameFilter !== undefined) query.hostname = config.hostnameFilter;
  return query;
}

// Realtime entries only carry the formats registered by dashboard widgets; links add their own.
function withTimestampFormat(log, format) {
  const formatted = log.timestamp_formatted || {};
  if (Object.prototype.hasOwnProperty.call(formatted, format)) return log;
  let value;
  try {
    value = BL.datetime.toString(format, log.timestamp);
  } catch (error) {
    value = formatted.datetime;
  }
  return { ...log, timestamp_formatted: { ...formatted, [format]: value } };
}

function fillLogDownload(homey, link, returnType, contentKey) {
  homey.setTimeout(async () => {
    try {
      const logs = await homey.app.Log.getLogs({ returnType });
      await BL.setDownloadUrl({ link, [contentKey]: logs[returnType], callback: ready => homey.api.realtime('downloadFileReady', ready) });
    } catch (error) {
      homey.error(`Log download (${returnType}) could not be generated`, error);
      homey.api.realtime('downloadFileFailed', { token: link.token });
    }
  }, 0);
}

module.exports = {
  async getApiReady({ homey }) {
    return { ready: homey.app.apiReady === true };
  },
  async internal({ homey, body: { action, logBookID, type } }) {
    if(!homey.app.Log) throw new Error(homey.__('bllNotStartedYet'));
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
    if (!homey.app.Log) throw new Error(homey.__('bllNotStartedYet'));
    try {
      switch (returnType) {
        case 'csv': {
          let filename = homey.app.settings && homey.app.settings.csvFilename ?
            await BL.decode(homey.app.settings.csvFilename) :
            "Logs " + BL.datetime.toString('datetimeshort') + '.csv';

          const link = await BL.getDownloadUrl({ contentType: 'text/csv', filename });
          fillLogDownload(homey, link, 'csv', 'text');
          return link;
        }
          break;
        case 'xlsx': {
          try {
            let filename = homey.app.settings && homey.app.settings.xlsxFilename ?
              await BL.decode(homey.app.settings.xlsxFilename) :
              "Logs " + BL.datetime.toString('datetimeshort') + '.xlsx';

            const link = await BL.getDownloadUrl({ contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', filename });
            fillLogDownload(homey, link, 'xlsx', 'buffer');
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
          fillLogDownload(homey, link, 'json', 'text');
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

    if (!homey.app.Log) {
      if(homey.app.usingNewLog) 
        throw new Error(homey.__('bllNotStartedYet'));
      else 
        return homey.app.getBackLog();
    }
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
    await homey.app.apiClearLog();
    return "OK";
  },
  async addLog({ homey, body }) {
    await homey.app.apiPutAddlog({ body });
    return "OK";
  },
  async encodeWidgetTemplate({ body }) {
    return encodeTemplate(body);
  },
  async decodeWidgetTemplate({ body }) {
    if (!body || typeof body.text !== 'string') throw new Error('Template text is required.');
    return decodeTemplate(body.text);
  },
  async getWidgetTemplateCatalog() {
    return getCatalog();
  },
  async getWidgetStyles({ homey }) {
    return getWidgetStyles(homey);
  },
  async getAndroidPing() {
    return { ok: true };
  },
  async getAndroidInit({ homey, query }) {
    const config = verifiedLinkConfig(homey, query);
    const translations = {};
    TRANSLATION_KEYS.forEach(key => {
      const value = homey.__(key);
      if (typeof value === 'string' && value && value !== key) translations[key] = value;
    });
    return { config, styles: getWidgetStyles(homey), translations };
  },
  async getAndroidLogs({ homey, query }) {
    const config = verifiedLinkConfig(homey, query);
    // Read the sequence first; entries written during the query are delivered again and deduplicated.
    const seq = homey.app.androidLinkFeed.touch();
    const data = await widgetApi.getWidgetLogs({ homey, query: linkLogQuery(config) });
    return { ...data, seq };
  },
  async getAndroidUpdates({ homey, query }) {
    const config = verifiedLinkConfig(homey, query);
    const result = await homey.app.androidLinkFeed.wait({
      after: Number(query.after),
      matches: log => matchesLinkFilters(config, log),
      timeoutMs: ANDROID_POLL_TIMEOUT_MS,
      setTimeout: (callback, ms) => homey.setTimeout(callback, ms),
      clearTimeout: timer => homey.clearTimeout(timer)
    });
    if (result.reload) return { reload: true };
    return {
      ...result,
      available: !!homey.app.Log,
      logs: result.logs.map(log => withTimestampFormat(log, config.datetimeFormat))
    };
  },
  async resetAndroidLinks({ homey }) {
    resetSecret(homey);
    homey.app.androidLinkFeed.wake();
    return { reset: true };
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
