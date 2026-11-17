'use strict';

const { FACILITIES, SEVERITIES } = require('../../lib/Log');
const { getWidgetStyles } = require('../../lib/widget-styles');
const { createLinks } = require('../../lib/android-links');
const { parseSeverities } = require('../../lib/severity-filter');

function optionalInteger(value, min, max, message) {
  if (value === undefined || value === null || value === '' || value === 'all') return undefined;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) throw new Error(message);
  return number;
}

function optionalText(value, message) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string' || value.length > 200) throw new Error(message);
  return value.trim() || undefined;
}

module.exports = {
  async getWidgetStyles({ homey }) {
    return getWidgetStyles(homey);
  },

  async getWidgetLogs({ homey, query }) {
    const take = query && query.take !== undefined ? Number(query.take) : 25;
    const timestampFormat = query && query.timestampFormat !== undefined ? query.timestampFormat : 'datetime';
    if (!Number.isSafeInteger(take) || take < 1) {
      throw new Error('The entry count must be a whole number of at least 1.');
    }
    if (typeof timestampFormat !== 'string' || !timestampFormat.trim() || timestampFormat.length > 128) {
      throw new Error('The date and time format must be a non-empty string of at most 128 characters.');
    }
    const dayFormat = query && query.dayFormat !== undefined ? query.dayFormat : undefined;
    if (dayFormat !== undefined && (typeof dayFormat !== 'string' || !dayFormat.trim() || dayFormat.length > 128)) {
      throw new Error('The day separator format must be a non-empty string of at most 128 characters.');
    }
    const filters = {
      maxSeverity: optionalInteger(query && query.minSeverity, 0, 7, 'The minimum severity must be a whole number from 0 to 7.'),
      facility: optionalInteger(query && query.facility, 0, 23, 'The facility must be a whole number from 0 to 23.'),
      app: optionalText(query && query.app, 'The app filter must be text of at most 200 characters.'),
      hostname: optionalText(query && query.hostname, 'The hostname filter must be text of at most 200 characters.'),
      severities: parseSeverities(query && query.severities)
    };
    // Levels picked in the widget's filter menu replace the widget's minimum level.
    if (filters.severities !== undefined) delete filters.maxSeverity;
    Object.keys(filters).forEach(key => filters[key] === undefined && delete filters[key]);
    if (!homey.app.Log) return { available: false, logs: [] };

    const result = await homey.app.Log.getLogs({ ...filters, take, maxSizeKb: 900, timestampFormat: dayFormat ? [timestampFormat, dayFormat] : timestampFormat });
    if (!result || !Array.isArray(result.logs)) throw new Error('The log query returned an invalid result.');
    const logs = result.logs.map(log => ({
      ...log,
      severityId: log.severity,
      facilityId: log.facility,
      severity: SEVERITIES[log.severity] || log.severity,
      facility: FACILITIES[log.facility] || log.facility
    }));
    return { available: true, logs, count: result.count, severities: SEVERITIES, facilities: FACILITIES };
  },

  async registerTimestampFormat({ homey, body }) {
    if (!body || !homey.app || typeof homey.app.registerWidgetTimestampFormat !== 'function') {
      throw new Error('Widget timestamp format registration is unavailable.');
    }
    homey.app.registerWidgetTimestampFormat(body.instanceId, body.formats !== undefined ? body.formats : body.format);
    return { registered: true };
  },

  async unregisterTimestampFormat({ homey, body }) {
    if (!body || !homey.app || typeof homey.app.unregisterWidgetTimestampFormat !== 'function') {
      throw new Error('Widget timestamp format unregistration is unavailable.');
    }
    homey.app.unregisterWidgetTimestampFormat(body.instanceId);
    return { unregistered: true };
  },

  async createAndroidLinks({ homey, body }) {
    return createLinks(homey, body);
  }
};
