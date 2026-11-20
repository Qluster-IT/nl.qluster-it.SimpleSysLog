'use strict';

const crypto = require('node:crypto');

const SECRET_SETTING = 'androidLinkSecret';
const LINK_VERSION = 1;
const MAX_PAYLOAD_LENGTH = 4096;
const WIDGET_PATH = '/widgets/log_viewer/index.html';

// Labels the widget reads through Homey.__(); the wrapper has no Homey SDK, so the app supplies them.
const TRANSLATION_KEYS = [
  'widgets.fields.timestamp',
  'widgets.fields.severity',
  'widgets.fields.facility',
  'widgets.fields.app',
  'widgets.fields.hostname',
  'widgets.fields.message',
  'widgets.search',
  'widgets.loading',
  'widgets.bllRequired',
  'widgets.bllNotInstalled',
  'widgets.noLogs',
  'widgets.loadError',
  'widgets.invalidEntryCount',
  'widgets.invalidUpdateMode',
  'widgets.invalidRefreshInterval',
  'widgets.designUnavailable',
  'widgets.themeUnavailable',
  'widgets.pagination.label',
  'widgets.pagination.previous',
  'widgets.pagination.next',
  'widgets.pagination.page',
  'widgets.filters.button',
  'widgets.filters.level',
  'widgets.filters.allLevels',
  'widgets.filters.date',
  'widgets.filters.fromDate',
  'widgets.filters.toDate',
  'widgets.filters.allDates',
  'widgets.filters.invalidDateRange',
  'widgets.filters.futureDate',
  ...['emergency', 'alert', 'critical', 'error', 'warning', 'notice', 'info', 'debug']
    .map(name => `widgets.settings.colors.${name}`)
];

function createSecret() {
  return crypto.randomBytes(32).toString('hex');
}

function getSecret(homey) {
  let secret = homey.settings.get(SECRET_SETTING);
  if (typeof secret !== 'string' || !/^[0-9a-f]{64}$/.test(secret)) {
    secret = createSecret();
    homey.settings.set(SECRET_SETTING, secret);
  }
  return secret;
}

function resetSecret(homey) {
  homey.settings.set(SECRET_SETTING, createSecret());
}

function settingId(value, fallback) {
  if (typeof value === 'string' && value) return value;
  if (value && typeof value === 'object') {
    if (typeof value.name === 'string' && value.name) return value.name;
    if (typeof value.id === 'string' && value.id) return value.id;
  }
  return fallback;
}

function limitedText(value, max, message) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(message);
  return value;
}

// The "use the design's format" choice has an empty ID; format IDs equal their names.
function formatSettingId(value) {
  const id = value && typeof value === 'object' ? value.id : value;
  return typeof id === 'string' && id.trim() ? id : '';
}

// Produces the widget settings that a link carries; the wrapper hands them to the widget unchanged.
function normalizeLinkConfig(settings) {
  const values = settings && typeof settings === 'object' ? settings : {};
  const entryCount = values.entryCount === undefined || values.entryCount === null ? 25 : Number(values.entryCount);
  if (!Number.isSafeInteger(entryCount) || entryCount < 1) {
    throw new Error('The entry count must be a whole number of at least 1.');
  }
  const searchMode = values.v === LINK_VERSION && values.showSearch === false ? 'none'
    : values.searchMode === 'simple' || values.searchMode === 'none' ? values.searchMode : 'advanced';
  const updateMode = values.updateMode === undefined ? 'live' : values.updateMode;
  if (updateMode !== 'live' && updateMode !== 'periodic') throw new Error('The widget update mode is invalid.');
  let refreshInterval = values.refreshInterval === undefined ? 10 : values.refreshInterval;
  if (typeof refreshInterval === 'string' && refreshInterval.trim()) refreshInterval = Number(refreshInterval);
  if (updateMode === 'periodic'
    && (!Number.isSafeInteger(refreshInterval) || refreshInterval < 1 || refreshInterval > 2147483)) {
    throw new Error('The refresh interval must be a whole number from 1 to 2147483 seconds.');
  }
  const config = {
    v: LINK_VERSION,
    entryCount,
    updateMode,
    colorMode: values.colorMode === 'light' || values.colorMode === 'dark' ? values.colorMode : 'automatic',
    designStyle: limitedText(settingId(values.designStyle, 'builtin:default'), 128, 'The design is invalid.'),
    colorTheme: limitedText(settingId(values.colorTheme, 'builtin:default'), 128, 'The theme is invalid.'),
    searchMode,
    showSearch: searchMode !== 'none',
    showFilters: values.showFilters !== false,
    paging: values.paging === true
  };
  if (updateMode === 'periodic') config.refreshInterval = refreshInterval;
  if (values.filterStateId !== undefined && values.filterStateId !== null) {
    if (typeof values.filterStateId !== 'string'
      || !/^[A-Za-z0-9._-]{1,128}$/.test(values.filterStateId)
      || ['__proto__', 'constructor', 'prototype'].includes(values.filterStateId)) {
      throw new Error('The widget instance ID is invalid.');
    }
    config.filterStateId = values.filterStateId;
  }
  // Without a format of its own, the link uses the format of its design.
  const datetimeFormat = formatSettingId(values.datetimeFormat);
  if (datetimeFormat) {
    config.datetimeFormat = limitedText(datetimeFormat, 128,
      'The date and time format must be a non-empty string of at most 128 characters.');
  }
  const minSeverity = Number(values.minSeverity);
  if (values.minSeverity !== undefined && values.minSeverity !== null && values.minSeverity !== ''
    && Number.isInteger(minSeverity) && minSeverity >= 0 && minSeverity < 7) config.minSeverity = minSeverity;
  const facility = Number(values.facility);
  if (values.facility !== undefined && values.facility !== null && values.facility !== '' && values.facility !== 'all'
    && Number.isInteger(facility) && facility >= 0 && facility <= 23) config.facility = facility;
  ['appFilter', 'hostnameFilter'].forEach(key => {
    if (values[key] === undefined || values[key] === null) return;
    if (typeof values[key] !== 'string' || values[key].length > 200) {
      throw new Error('Filters must be text of at most 200 characters.');
    }
    if (values[key].trim()) config[key] = values[key].trim();
  });
  return config;
}

function signPayload(secret, payload) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

function signLinkConfig(homey, settings) {
  const config = normalizeLinkConfig(settings);
  const payload = Buffer.from(JSON.stringify(config)).toString('base64url');
  return { config, payload, signature: signPayload(getSecret(homey), payload) };
}

function linkFilterStateId(payload, config) {
  if (config && config.filterStateId) return config.filterStateId;
  return `android-${crypto.createHash('sha256').update(payload).digest('hex')}`;
}

function verifyLink(homey, payload, signature) {
  const invalid = () => new Error(homey.__('widgets.android.invalidLink')
    || 'This link is invalid or has been reset. Copy a new link from the widget.');
  if (typeof payload !== 'string' || typeof signature !== 'string' || !payload
    || payload.length > MAX_PAYLOAD_LENGTH || !/^[A-Za-z0-9_-]{43}$/.test(signature)) throw invalid();
  const expected = Buffer.from(signPayload(getSecret(homey), payload));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) throw invalid();
  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch (error) {
    throw invalid();
  }
  if (!parsed || parsed.v !== LINK_VERSION) throw invalid();
  return normalizeLinkConfig(parsed);
}

function localHostname(address) {
  const host = typeof address === 'string' ? address.split(':')[0] : '';
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) ? `${host.replace(/\./g, '-')}.homey.homeylocal.com` : null;
}

async function createLinks(homey, settings) {
  const { payload, signature } = signLinkConfig(homey, settings);
  const path = `/app/${homey.manifest.id}${WIDGET_PATH}?ssl=${payload}&sig=${signature}`;
  const [address, homeyId] = await Promise.all([
    homey.cloud.getLocalAddress().catch(() => null),
    homey.cloud.getHomeyId()
  ]);
  const localHost = localHostname(address);
  return {
    local: localHost ? `https://${localHost}${path}` : null,
    automatic: `https://${homeyId}.connect.athom.com${path}${localHost ? `&local=${localHost}` : ''}`
  };
}

function containsText(value, search) {
  return value !== undefined && value !== null && String(value).toLowerCase().includes(search.toLowerCase());
}

// Mirrors the widget filters for entries delivered to wrappers; chosen levels replace the minimum level.
function matchesLinkFilters(config, log, severities) {
  if (severities !== undefined) {
    if (!severities.includes(Number(log.severity))) return false;
  } else if (config.minSeverity !== undefined && !(Number(log.severity) <= config.minSeverity)) return false;
  if (config.facility !== undefined && !(Array.isArray(config.facility)
    ? config.facility.includes(Number(log.facility)) : Number(log.facility) === config.facility)) return false;
  if (config.appFilter !== undefined && !containsText(log.app, config.appFilter)) return false;
  if (config.hostnameFilter !== undefined && !containsText(log.hostname, config.hostnameFilter)) return false;
  return true;
}

// Buffers recent entries only while wrappers are connected, and answers their long-poll requests
// as soon as a matching entry is written.
class AndroidLinkFeed {
  constructor({ now = Date.now, maxEntries = 200, idleMs = 120000, maxWaiters = 50, instance = null } = {}) {
    // Set by markReady() when the app announces api-ready, so wrappers reload after every app start.
    this.instance = instance;
    this.now = now;
    this.maxEntries = maxEntries;
    this.idleMs = idleMs;
    this.maxWaiters = maxWaiters;
    this.seq = 0;
    this.bufferStart = 0;
    this.entries = [];
    this.waiters = new Set();
    this.lastActivity = -Infinity;
  }

  isActive() {
    return this.waiters.size > 0 || this.now() - this.lastActivity < this.idleMs;
  }

  touch() {
    if (!this.isActive()) {
      this.entries = [];
      this.bufferStart = this.seq;
    }
    this.lastActivity = this.now();
    return this.seq;
  }

  publish(log) {
    this.seq++;
    if (!this.isActive()) {
      if (this.entries.length) this.entries = [];
      return;
    }
    this.entries.push({ seq: this.seq, log });
    if (this.entries.length > this.maxEntries) {
      this.entries.shift();
      this.bufferStart = this.entries[0].seq - 1;
    }
    for (const waiter of Array.from(this.waiters)) waiter.check();
  }

  markReady() {
    this.instance = crypto.randomBytes(8).toString('hex');
    this.wake();
  }

  wake() {
    for (const waiter of Array.from(this.waiters)) waiter.finish();
  }

  collect(after, matches) {
    const logs = [];
    for (const entry of this.entries) {
      if (entry.seq > after && matches(entry.log)) logs.push(entry.log);
    }
    return logs;
  }

  wait({ after, instance, matches, timeoutMs, setTimeout, clearTimeout }) {
    this.touch();
    // Another instance means the app restarted; an older sequence means entries were not buffered.
    if (instance !== this.instance || !Number.isSafeInteger(after) || after > this.seq || after < this.bufferStart) {
      return Promise.resolve({ reload: true, seq: this.seq, logs: [] });
    }
    const ready = this.collect(after, matches);
    if (ready.length) return Promise.resolve({ seq: this.seq, logs: ready });
    return new Promise(resolve => {
      let done = false;
      let timer = null;
      const waiter = {
        finish: (logs = []) => {
          if (done) return;
          done = true;
          if (timer !== null) clearTimeout(timer);
          this.waiters.delete(waiter);
          this.lastActivity = this.now();
          resolve({ seq: this.seq, logs });
        },
        check: () => {
          const logs = this.collect(after, matches);
          if (logs.length) waiter.finish(logs);
        }
      };
      if (this.waiters.size >= this.maxWaiters) this.waiters.values().next().value.finish();
      this.waiters.add(waiter);
      timer = setTimeout(() => waiter.finish(), timeoutMs);
    });
  }
}

module.exports = {
  SECRET_SETTING,
  TRANSLATION_KEYS,
  AndroidLinkFeed,
  createLinks,
  localHostname,
  linkFilterStateId,
  matchesLinkFilters,
  normalizeLinkConfig,
  resetSecret,
  signLinkConfig,
  verifyLink
};
