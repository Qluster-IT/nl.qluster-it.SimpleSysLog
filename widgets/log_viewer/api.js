'use strict';

const { FACILITIES, SEVERITIES } = require('../../lib/Log');
const { getWidgetStyles } = require('../../lib/widget-styles');
const { createLinks } = require('../../lib/android-links');
const { parseSeverities } = require('../../lib/severity-filter');

const WIDGET_FILTER_STATES_SETTING = 'widgetFilterStates';
const SEVERITY_COUNT = Object.keys(SEVERITIES).length;

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

function optionalDate(value, label) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`The ${label} date must be a valid calendar date (YYYY-MM-DD).`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`The ${label} date must be a valid calendar date (YYYY-MM-DD).`);
  }
  return value;
}

function parseDateRange(query) {
  const from = optionalDate(query && query.dateFrom, 'start');
  const to = optionalDate(query && query.dateTo, 'end');
  if (from && to && from > to) throw new Error('The start date must be on or before the end date.');
  return { from, to };
}

function validateWidgetInstanceId(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9._-]{1,128}$/.test(value)
    || value === '__proto__' || value === 'constructor' || value === 'prototype') {
    throw new Error('The widget instance ID is invalid.');
  }
  return value;
}

function normalizeWidgetFilterState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some(key => !['levels', 'from', 'to'].includes(key))
    || !Array.isArray(value.levels) || value.levels.length > SEVERITY_COUNT) {
    throw new Error('The widget filter state is invalid.');
  }
  const levels = new Set();
  value.levels.forEach(level => {
    if (!Number.isInteger(level) || level < 0 || level >= SEVERITY_COUNT || levels.has(level)) {
      throw new Error('The widget filter levels are invalid.');
    }
    levels.add(level);
  });
  const from = optionalDate(value.from, 'start') || null;
  const to = optionalDate(value.to, 'end') || null;
  if (from && to && from > to) throw new Error('The start date must be on or before the end date.');
  return { levels: [...levels].sort((a, b) => a - b), from, to };
}

function readWidgetFilterStates(homey) {
  if (!homey || !homey.settings || typeof homey.settings.get !== 'function') {
    throw new Error('Widget filter storage is unavailable.');
  }
  const states = homey.settings.get(WIDGET_FILTER_STATES_SETTING);
  if (states === undefined || states === null) return {};
  const prototype = typeof states === 'object' && !Array.isArray(states) ? Object.getPrototypeOf(states) : undefined;
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error('Stored widget filter states are invalid.');
  }
  return states;
}

module.exports = {
  parseDateRange,

  getWidgetFilterState({ homey, params }) {
    const instanceId = validateWidgetInstanceId(params && params.instanceId);
    const states = readWidgetFilterStates(homey);
    if (!Object.prototype.hasOwnProperty.call(states, instanceId)) {
      return { levels: [], from: null, to: null };
    }
    return normalizeWidgetFilterState(states[instanceId]);
  },

  setWidgetFilterState({ homey, params, body }) {
    const instanceId = validateWidgetInstanceId(params && params.instanceId);
    if (!homey || !homey.settings || typeof homey.settings.set !== 'function') {
      throw new Error('Widget filter storage is unavailable.');
    }
    const state = normalizeWidgetFilterState(body);
    const states = readWidgetFilterStates(homey);
    homey.settings.set(WIDGET_FILTER_STATES_SETTING, { ...states, [instanceId]: state });
    return { saved: true };
  },

  async getWidgetStyles({ homey }) {
    return getWidgetStyles(homey);
  },

  async getWidgetLogs({ homey, query }) {
    const dateRange = parseDateRange(query);
    const take = query && query.take !== undefined ? Number(query.take) : 25;
    const skipValue = query && query.skip;
    let skip;
    if (skipValue !== undefined && skipValue !== null && skipValue !== '') {
      if (!(typeof skipValue === 'number' && Number.isSafeInteger(skipValue) && skipValue >= 0)
        && !(typeof skipValue === 'string' && /^\d+$/.test(skipValue))) {
        throw new Error('The entry offset must be a non-negative whole number.');
      }
      skip = Number(skipValue);
      if (!Number.isSafeInteger(skip)) throw new Error('The entry offset must be a non-negative whole number.');
    }
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
      timestamp_fromUTC: dateRange.from,
      timestamp_toUTC: dateRange.to,
      severities: parseSeverities(query && query.severities)
    };
    // Levels picked in the widget's filter menu replace the widget's minimum level.
    if (filters.severities !== undefined) delete filters.maxSeverity;
    Object.keys(filters).forEach(key => filters[key] === undefined && delete filters[key]);
    if (!homey.app.Log) return { available: false, logs: [] };

    const result = await homey.app.Log.getLogs({ ...filters, skip, take, maxSizeKb: 900, timestampFormat: dayFormat ? [timestampFormat, dayFormat] : timestampFormat });
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
