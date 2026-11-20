"use strict";
const { BL } = require("betterlogiclibrary");
const { exportMetadata } = require("./lib/log-export");
const { encodeTemplate, decodeTemplate } = require("./lib/widget-template");
const { getCatalog } = require("./lib/widget-template-catalog");
const { getWidgetStyles, resolveTimestampFormat, resolveDaySeparatorFormat } = require("./lib/widget-styles");
const { resolveTimestamp2Format } = require("./assets/js/ssl-widget-layout");
const {
  TRANSLATION_KEYS, linkFilterStateId, matchesLinkFilters, resetSecret, verifyLink
} = require("./lib/android-links");
const widgetApi = require("./widgets/log_viewer/api");
const { parseSeverities } = require("./lib/severity-filter");
const widgetSearch = require("./assets/js/ssl-widget-search");

const ANDROID_POLL_TIMEOUT_MS = 20000;

function verifiedLinkConfig(homey, query) {
  return verifyLink(homey, query && query.ssl, query && query.sig);
}

// The levels chosen in a wrapper's filter menu; they are not part of the signed link.
function linkSeverities(query) {
  return parseSeverities(query && query.severities);
}

function linkFormats(homey, config) {
  const design = getWidgetStyles(homey).designs.find(item => item.id === config.designStyle);
  return { timestamp: resolveTimestampFormat(config.datetimeFormat, design), day: resolveDaySeparatorFormat(design),
    timestamp2: resolveTimestamp2Format(design) };
}

function interactiveLinkConfig(config, query) {
  if (!config.showFilters) return config;
  const filters = widgetApi.parseMetadataFilters({ ...query, searchMode: config.searchMode });
  const result = { ...config };
  if (filters.facility !== undefined) result.facility = filters.facility;
  for (const key of ['app', 'hostname']) {
    if (!filters[key + 'Search']) continue;
    delete result[key + 'Filter'];
    result[key + 'Search'] = filters[key + 'Search'];
  }
  return result;
}

function linkLogQuery(config, formats, severities, dateRange, skip, search) {
  const query = {
    take: config.entryCount + (config.paging ? 1 : 0),
    timestampFormat: formats.timestamp,
    dayFormat: formats.day
  };
  if (formats.timestamp2) query.timestamp2Format = formats.timestamp2;
  if (config.paging && skip !== undefined) query.skip = skip;
  if (config.searchMode !== 'none') {
    query.search = search;
    query.searchMode = config.searchMode;
  }
  if (severities !== undefined) query.severities = severities.join(',');
  else if (config.minSeverity !== undefined) query.minSeverity = config.minSeverity;
  if (dateRange && dateRange.from) query.dateFrom = dateRange.from;
  if (dateRange && dateRange.to) query.dateTo = dateRange.to;
  if (config.facility !== undefined) query.facility = Array.isArray(config.facility) ? config.facility.join(',') : config.facility;
  if (config.appFilter !== undefined) query.app = config.appFilter;
  if (config.hostnameFilter !== undefined) query.hostname = config.hostnameFilter;
  if (config.appSearch !== undefined) query.appSearch = config.appSearch;
  if (config.hostnameSearch !== undefined) query.hostnameSearch = config.hostnameSearch;
  if (config.appSearch || config.hostnameSearch) query.searchMode = config.searchMode === 'advanced' ? 'advanced' : 'simple';
  return query;
}

function dateRangeBounds(range) {
  const asLocaleMidnight = value => BL.datetime.asLocale(new Date(`${value}T00:00:00.000Z`));
  const from = range.from ? asLocaleMidnight(range.from) : null;
  const to = range.to ? asLocaleMidnight(range.to) : null;
  if (to) to.setDate(to.getDate() + 1);
  return { from, to };
}

function matchesDateRange(log, bounds) {
  if (!bounds.from && !bounds.to) return true;
  const timestamp = new Date(log.timestamp).getTime();
  return Number.isFinite(timestamp)
    && (!bounds.from || timestamp >= bounds.from.getTime())
    && (!bounds.to || timestamp < bounds.to.getTime());
}

// Realtime entries only carry the formats registered by dashboard widgets; links add their own.
function withTimestampFormats(log, formats) {
  const formatted = { ...(log.timestamp_formatted || {}) };
  let changed = false;
  for (const format of [formats.timestamp, formats.day].concat(formats.timestamp2 ? [formats.timestamp2] : [])) {
    if (Object.prototype.hasOwnProperty.call(formatted, format)) continue;
    try {
      formatted[format] = BL.datetime.toString(format, log.timestamp);
    } catch (error) {
      formatted[format] = formatted.datetime;
    }
    changed = true;
  }
  return changed ? { ...log, timestamp_formatted: formatted } : log;
}

function fillLogDownload(homey, link, returnType, contentKey) {
  homey.setTimeout(async () => {
    try {
      const logs = await homey.app.Log.getLogs({ returnType, streamJson: returnType === 'json',
        streamCsv: returnType === 'csv', streamExcel: returnType === 'xlsx' });
      const content = logs[returnType];
      await BL.setDownloadUrl({ link, [content && typeof content.pipe === 'function' ? 'stream' : contentKey]: content,
        callback: ready => homey.api.realtime('downloadFileReady', {
          ...ready, ...(logs.exportWarnings && logs.exportWarnings.skippedRecords
            ? { skippedRecords: logs.exportWarnings.skippedRecords } : {})
        }) });
    } catch (error) {
      homey.error(`Log download (${returnType}) could not be generated`, error);
      try {
        await homey.api.realtime('downloadFileFailed', { token: link.token, message: error.message });
      } catch (notificationError) {
        homey.error('Log download failure could not be reported', notificationError);
      }
    }
  }, 0);
}

module.exports = {
  async getApiReady({ homey }) {
    return { ready: homey.app.apiReady === true };
  },

  async getLogDownloadUrl({ homey, params: { returnType } }) {
    if (!homey.app.Log) throw new Error(homey.__('bllNotStartedYet'));
    try {
      const link = await BL.getDownloadUrl(await exportMetadata(homey.app, returnType));
      fillLogDownload(homey, link, returnType, returnType === 'xlsx' ? 'buffer' : 'text');
      return link;
    } catch (error) {
      homey.error('Log download could not be started', error);
      throw error;
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
  async getWidgetDatetimeFormats({ homey, query }) {
    const text = query && typeof query.query === 'string' ? query.query.trim().slice(0, 128) : '';
    return homey.app.getDatetimeFormatSuggestions(text);
  },
  async formatWidgetTimestamps({ homey, body }) {
    const format = body && body.format;
    const timestamps = body && body.timestamps;
    const locale = body && body.locale;
    if (typeof format !== 'string' || !format.trim() || format.length > 128
      || !Array.isArray(timestamps) || timestamps.length > 10
      || (locale !== undefined && locale !== 'en')) throw new Error('Invalid timestamp format request.');
    if (!BL.isReady) throw new Error(homey.__('bllNotStartedYet'));
    return {
      values: timestamps.map(value => {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) throw new Error('Invalid timestamp format request.');
        return BL.datetime.toString(format, date, locale);
      })
    };
  },
  async getAndroidPing() {
    return { ok: true };
  },
  async getAndroidInit({ homey, query }) {
    const config = verifiedLinkConfig(homey, query);
    config.filterStateId = linkFilterStateId(query.ssl, config);
    const translations = {};
    TRANSLATION_KEYS.forEach(key => {
      const value = homey.__(key);
      if (typeof value === 'string' && value && value !== key) translations[key] = value;
    });
    return { config, styles: getWidgetStyles(homey), translations };
  },
  getAndroidFilterState({ homey, query }) {
    const config = verifiedLinkConfig(homey, query);
    return widgetApi.getWidgetFilterState({
      homey, params: { instanceId: linkFilterStateId(query.ssl, config) }
    });
  },
  setAndroidFilterState({ homey, query, body }) {
    const config = verifiedLinkConfig(homey, query);
    return widgetApi.setWidgetFilterState({
      homey, params: { instanceId: linkFilterStateId(query.ssl, config) }, body
    });
  },
  async getAndroidLogs({ homey, query }) {
    const config = interactiveLinkConfig(verifiedLinkConfig(homey, query), query);
    const severities = linkSeverities(query);
    const dateRange = widgetApi.parseDateRange(query);
    // Read the sequence first; entries written during the query are delivered again and deduplicated.
    const seq = config.updateMode === 'periodic' ? homey.app.androidLinkFeed.seq : homey.app.androidLinkFeed.touch();
    const data = await widgetApi.getWidgetLogs({
      homey, query: linkLogQuery(config, linkFormats(homey, config), severities, dateRange, query.skip, query.search)
    });
    return { ...data, seq, instance: homey.app.androidLinkFeed.instance };
  },
  async getAndroidUpdates({ homey, query }) {
    const config = interactiveLinkConfig(verifiedLinkConfig(homey, query), query);
    const severities = linkSeverities(query);
    const dateRange = widgetApi.parseDateRange(query);
    // Wrappers cannot receive the api-ready realtime event, so they poll until it was announced.
    if (!homey.app.apiReady || !homey.app.androidLinkFeed.instance) return { ready: false };
    const dateBounds = homey.app.Log && (dateRange.from || dateRange.to) ? dateRangeBounds(dateRange) : null;
    const appMatches = widgetSearch.compileText(config.appSearch, config.searchMode);
    const hostnameMatches = widgetSearch.compileText(config.hostnameSearch, config.searchMode);
    const result = await homey.app.androidLinkFeed.wait({
      after: Number(query.after),
      instance: query.instance,
      matches: log => matchesLinkFilters(config, log, severities)
        && appMatches(log.app) && hostnameMatches(log.hostname)
        && (!dateBounds || matchesDateRange(log, dateBounds)),
      timeoutMs: ANDROID_POLL_TIMEOUT_MS,
      setTimeout: (callback, ms) => homey.setTimeout(callback, ms),
      clearTimeout: timer => homey.clearTimeout(timer)
    });
    if (result.reload) return { reload: true };
    const formats = linkFormats(homey, config);
    return {
      ...result,
      available: !!homey.app.Log,
      logs: result.logs.map(log => withTimestampFormats(log, formats))
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
