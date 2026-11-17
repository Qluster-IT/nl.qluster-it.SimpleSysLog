'use strict';

const FIELD_IDS = ['timestamp', 'severity', 'facility', 'app', 'hostname', 'message'];
const COLOR_IDS = ['background', 'surface', 'text', 'muted', 'border', 'accent',
  'emergency', 'alert', 'critical', 'error', 'warning', 'notice', 'info', 'debug'];
// Named colours resolve in the widget CSS, so every theme adapts to light and dark mode.
const COLOR_NAMES = ['automatic', 'red', 'orange', 'yellow', 'green', 'teal', 'cyan', 'blue',
  'indigo', 'purple', 'pink', 'brown', 'grey', 'black', 'white'];

const BUILT_IN_DESIGNS = [
  {
    id: 'builtin:default',
    name: 'Default',
    fields: ['timestamp', 'severity', 'message', 'app', 'facility'],
    showDaySeparators: true
  }
];

// Like Chronograph's built-in schemes, status colours are explicit and the
// surfaces stay automatic so they follow the dashboard's light or dark mode.
const BUILT_IN_THEMES = [
  {
    id: 'builtin:default',
    name: 'Default',
    colors: {
      background: 'automatic',
      surface: 'automatic',
      text: 'automatic',
      muted: 'automatic',
      border: 'automatic',
      accent: 'blue',
      emergency: 'purple',
      alert: 'pink',
      critical: 'red',
      error: 'red',
      warning: 'orange',
      notice: 'green',
      info: 'blue',
      debug: 'grey'
    }
  }
];
const LEGACY_THEME_IDS = { 'builtin:homey': 'builtin:default' };

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateDesign(value, { allowMissingId = false } = {}) {
  if (!isRecord(value)
    || (!allowMissingId && (typeof value.id !== 'string' || !value.id))
    || (value.id !== undefined && typeof value.id !== 'string')
    || typeof value.name !== 'string' || !value.name.trim() || value.name.trim().length > 60
    || !Array.isArray(value.fields) || value.fields.length < 1
    || value.fields.length > FIELD_IDS.length
    || value.fields.some(field => !FIELD_IDS.includes(field))
    || new Set(value.fields).size !== value.fields.length
    || typeof value.showDaySeparators !== 'boolean') {
    throw new Error('Invalid widget design');
  }
  return {
    ...(value.id ? { id: value.id } : {}),
    name: value.name.trim(),
    fields: value.fields.slice(),
    showDaySeparators: value.showDaySeparators
  };
}

function validateTheme(value, { allowMissingId = false } = {}) {
  if (!isRecord(value)
    || (!allowMissingId && (typeof value.id !== 'string' || !value.id))
    || (value.id !== undefined && typeof value.id !== 'string')
    || typeof value.name !== 'string' || !value.name.trim() || value.name.trim().length > 60
    || !isRecord(value.colors)
    || Object.keys(value.colors).length !== COLOR_IDS.length
    || COLOR_IDS.some(key => !COLOR_NAMES.includes(value.colors[key]))) {
    throw new Error('Invalid widget theme');
  }
  return {
    ...(value.id ? { id: value.id } : {}),
    name: value.name.trim(),
    colors: Object.fromEntries(COLOR_IDS.map(key => [key, value.colors[key]]))
  };
}

function normalizeCollection(value) {
  if (value === undefined || value === null) return { version: 1, designs: [], themes: [] };
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.designs) || !Array.isArray(value.themes)) {
    throw new Error('Invalid widget styles collection');
  }
  const designs = value.designs.map(item => validateDesign(item));
  const themes = value.themes.map(item => validateTheme(item));
  const ids = new Set();
  for (const item of designs.concat(themes)) {
    if (item.id.startsWith('builtin:') || ids.has(item.id)) throw new Error('Invalid widget style ID');
    ids.add(item.id);
  }
  return { version: 1, designs, themes };
}

function getWidgetStyles(homey) {
  const custom = normalizeCollection(homey.settings.get('widgetStyles'));
  return {
    version: 1,
    designs: BUILT_IN_DESIGNS.concat(custom.designs),
    themes: BUILT_IN_THEMES.concat(custom.themes)
  };
}

function getSettingId(setting, fallback) {
  let id = fallback;
  if (typeof setting === 'string') id = setting;
  else if (isRecord(setting) && typeof setting.id === 'string') id = setting.id;
  return LEGACY_THEME_IDS[id] || id;
}

module.exports = {
  FIELD_IDS,
  COLOR_IDS,
  COLOR_NAMES,
  BUILT_IN_DESIGNS,
  BUILT_IN_THEMES,
  getWidgetStyles,
  getSettingId,
  normalizeCollection,
  validateDesign,
  validateTheme
};
