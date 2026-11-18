'use strict';

const { ELEMENT_IDS, DAY_SEPARATOR_ID, DAY_SEPARATOR_LINE_ID, SEPARATOR_ELEMENT_IDS, MAX_SEPARATOR_ROWS, LINE_STYLES,
  LINE_POSITIONS, MAX_LINE_THICKNESS, BORDER_IDS, BORDER_SIDES, CARD_ELEMENT_IDS, DEFAULT_BORDER_THICKNESS,
  FONT_IDS, TEXT_STYLES, UNITS, MAX_ROWS, defaultSeparatorLayout, CONTROL_AREAS, CONTROL_IDS,
  CONTROL_STYLE_LIMITS, isHexColor } = require('../assets/js/ssl-widget-layout');

const FIELD_IDS = ELEMENT_IDS;
// Designs size and theme the separator's date like an element; the separator line and the borders only have a theme colour.
const STYLED_IDS = FIELD_IDS.concat(DAY_SEPARATOR_ID, CONTROL_IDS);
const THEMED_IDS = STYLED_IDS.concat(DAY_SEPARATOR_LINE_ID, BORDER_IDS);
const DEFAULT_TIMESTAMP_FORMAT = 'timeshort';
const DEFAULT_DAY_SEPARATOR_FORMAT = 'ddd d MMM';
const ALIGNMENTS = ['left', 'center', 'right', 'stretch'];
const VERTICAL_ALIGNMENTS = ['top', 'middle', 'bottom'];
const DIRECTIONS = ['horizontal', 'vertical'];
const WIDTHS = ['span', 'content'];
const COLOR_IDS = ['background', 'surface', 'text', 'muted', 'border', 'accent',
  'emergency', 'alert', 'critical', 'error', 'warning', 'notice', 'info', 'debug', 'outline'];
// Themes made before the widget outline colour existed get its default.
const OPTIONAL_COLOR_IDS = ['outline'];
const MAX_WIDGET_BORDER_WIDTH = 20;
// Named colours resolve in the widget CSS, so every theme adapts to light and dark mode.
const COLOR_NAMES = ['automatic', 'red', 'orange', 'yellow', 'green', 'teal', 'cyan', 'blue',
  'indigo', 'purple', 'pink', 'brown', 'grey', 'black', 'black-light', 'white'];
const NAMED_COLORS = COLOR_NAMES.filter(name => name !== 'automatic');
// "default" keeps the element's own theme colour; "severity" follows the entry's severity colour.
const ELEMENT_COLORS = ['default', 'severity'].concat(NAMED_COLORS);
const ELEMENT_BACKGROUNDS = ['default', 'none', 'severity'].concat(NAMED_COLORS);
// A separator belongs to a day, not an entry, so it has no severity colour.
const SEPARATOR_COLORS = ['default'].concat(NAMED_COLORS);
const SEPARATOR_BACKGROUNDS = ['default', 'none'].concat(NAMED_COLORS);

function column(elements, options = {}) {
  return {
    span: options.span || UNITS,
    rowSpan: options.rowSpan || 1,
    align: options.align || 'left',
    valign: options.valign || 'top',
    direction: options.direction || 'horizontal',
    width: options.width || 'span',
    ...(options.elementGap === undefined ? {} : { elementGap: options.elementGap }),
    elements
  };
}

// Converts a design saved before the grid designer, keeping its look: timestamp and
// severity on the left, the message next to them and the other fields below it.
function rowsFromFields(fields) {
  const side = fields.filter(field => field === 'timestamp' || field === 'severity');
  const message = fields.includes('message') ? ['message'] : [];
  const meta = fields.filter(field => !side.includes(field) && field !== 'message');
  const main = [message, meta].filter(items => items.length);
  if (!side.length) return main.map(items => ({ padding: 0, columns: [column(items, { direction: items === message ? 'vertical' : 'horizontal' })] }));
  const sideColumn = column(side, { span: 1, rowSpan: Math.max(main.length, 1), align: 'center', direction: 'vertical', width: 'content' });
  if (!main.length) return [{ padding: 0, columns: [sideColumn] }];
  return main.map((items, index) => ({
    padding: 0,
    columns: (index === 0 ? [sideColumn] : []).concat(column(items, {
      span: UNITS - 1, direction: items === message ? 'vertical' : 'horizontal', valign: items === message ? 'top' : 'middle'
    }))
  }));
}

// The default card's severity border: a first column spanning every row with a border on its left.
function withLeftBorder(rows) {
  return rows.map((row, index) => ({
    ...row,
    columns: (index === 0 ? [column(['border1'], { span: 1, rowSpan: rows.length, direction: 'vertical', width: 'content' })] : [])
      .concat(row.columns.map(item => (item.span === UNITS - 1 ? { ...item, span: UNITS - 2 } : item)))
  }));
}

const BUILT_IN_DESIGNS = [
  {
    id: 'builtin:default',
    name: 'Default',
    showDaySeparators: true,
    timestampFormat: DEFAULT_TIMESTAMP_FORMAT,
    daySeparatorFormat: DEFAULT_DAY_SEPARATOR_FORMAT,
    rows: withLeftBorder(rowsFromFields(['timestamp', 'severity', 'message', 'app', 'facility'])),
    daySeparatorLayout: defaultSeparatorLayout(),
    elementBorders: { border1: { side: 'left', thickness: DEFAULT_BORDER_THICKNESS } },
    elementSizes: {},
    elementFonts: {},
    elementTextStyles: {}
  }
];

BUILT_IN_DESIGNS.push(
  {
    ...BUILT_IN_DESIGNS[0],
    id: 'builtin:compact',
    name: 'Compact',
    showDaySeparators: false,
    timestampFormat: 'dd-MM-yyyy HH:mm',
    widgetBorderless: true,
    widgetPadding: { top: 6, right: 6, bottom: 6, left: 6 },
    rows: [{ padding: 0, columnGap: 6, columns: [
      column(['border1'], { span: 1, width: 'content' }),
      column(['timestamp', 'severity'], { span: 1, width: 'content', direction: 'vertical', align: 'center', elementGap: 3 }),
      column(['message'], { span: 3 })
    ] }],
    elementBorders: { border1: { side: 'left', thickness: 2 } },
    elementSizes: { timestamp: 10, severity: 9, message: 12, search: 12, filter: 12, previousPage: 12, nextPage: 12 },
    elementTextStyles: { timestamp: { wrap: 'words' } },
    elementLineHeights: { message: 17 },
    controlStyles: {
      search: { height: 30, paddingY: 4 }, filter: { height: 30 },
      previousPage: { height: 30, paddingY: 4 }, nextPage: { height: 30, paddingY: 4 }
    }
  },
  {
    ...BUILT_IN_DESIGNS[0],
    id: 'builtin:journal',
    name: 'Journal',
    widgetPadding: { top: 12, right: 12, bottom: 12, left: 12 },
    daySeparatorFormat: 'dddd d MMMM',
    daySeparatorLayout: { ...defaultSeparatorLayout(), linePosition: 'below', lineStyle: 'dashed' },
    rows: [
      { padding: 0, columnGap: 8, columns: [
        column(['border1'], { span: 1, rowSpan: 3, width: 'content' }),
        column(['timestamp'], { span: 2 }),
        column(['severity'], { span: 2, align: 'right' })
      ] },
      { padding: 4, columns: [column(['message'], { span: 4, direction: 'vertical' })] },
      { padding: 4, columns: [column(['app', 'facility'], { span: 4, elementGap: 8 })] }
    ],
    elementSizes: { timestamp: 11, severity: 10, message: 15, app: 11, facility: 9 },
    elementFonts: { message: 'serif' },
    elementLineHeights: { message: 22 },
    controlStyles: {
      search: { height: 38, radius: 10 }, filter: { height: 38, radius: 10 },
      previousPage: { height: 38, radius: 10 }, nextPage: { height: 38, radius: 10 }
    }
  },
  {
    ...BUILT_IN_DESIGNS[0],
    id: 'builtin:console',
    name: 'Console',
    widgetBorderWidth: 1,
    timestampFormat: 'HH:mm:ss',
    daySeparatorFormat: 'yyyy-MM-dd',
    rows: [
      { padding: 0, columnGap: 8, columns: [
        column(['timestamp'], { span: 1, width: 'content' }),
        column(['severity'], { span: 1, width: 'content' }),
        column(['app'], { span: 3 })
      ] },
      { padding: 2, columns: [column(['message'], { elementGap: 6 })] },
      { padding: 2, columns: [column(['hostname', 'facility'], { elementGap: 8 })] }
    ],
    elementSizes: { timestamp: 10, severity: 10, message: 12, app: 11, hostname: 10, facility: 9 },
    elementFonts: Object.fromEntries(FIELD_IDS.concat(DAY_SEPARATOR_ID).map(id => [id, 'monospace'])),
    elementLineHeights: { message: 18 },
    elementTextStyles: { severity: { textCase: 'uppercase', spacing: 'none' }, app: { weight: 'semibold' } }
  }
);

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
      notice: 'blue',
      info: 'green',
      debug: 'grey',
      outline: 'automatic'
    },
    elements: {}
  }
];

BUILT_IN_THEMES.push(
  {
    ...BUILT_IN_THEMES[0],
    id: 'builtin:ocean',
    name: 'Ocean',
    colors: { ...BUILT_IN_THEMES[0].colors, background: '#167DA5', accent: 'cyan', outline: '#167DA5' },
    backgroundGradient: true,
    elements: { daySeparator: { color: 'blue', background: 'default' }, app: { color: 'blue', background: 'default' } }
  },
  {
    ...BUILT_IN_THEMES[0],
    id: 'builtin:forest',
    name: 'Forest',
    colors: { ...BUILT_IN_THEMES[0].colors, background: '#258359', accent: 'green', outline: '#258359' },
    backgroundGradient: true,
    elements: { daySeparator: { color: 'green', background: 'default' }, app: { color: 'green', background: 'default' } }
  },
  {
    ...BUILT_IN_THEMES[0],
    id: 'builtin:sunset',
    name: 'Sunset',
    colors: { ...BUILT_IN_THEMES[0].colors, background: '#C96532', accent: 'orange', outline: '#C96532' },
    backgroundGradient: true,
    elements: { daySeparator: { color: 'orange', background: 'default' }, app: { color: 'orange', background: 'default' } }
  }
);
const LEGACY_THEME_IDS = { 'builtin:homey': 'builtin:default' };

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isInteger(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max;
}

function isTimestampFormat(value) {
  return typeof value === 'string' && value.trim() !== '' && value.length <= 128;
}

// A widget's own date and time format overrules the format of its design.
function resolveTimestampFormat(widgetFormat, design) {
  if (isTimestampFormat(widgetFormat)) return widgetFormat;
  return design && isTimestampFormat(design.timestampFormat) ? design.timestampFormat : DEFAULT_TIMESTAMP_FORMAT;
}

function resolveDaySeparatorFormat(design) {
  return design && isTimestampFormat(design.daySeparatorFormat) ? design.daySeparatorFormat : DEFAULT_DAY_SEPARATOR_FORMAT;
}

function invalidDesign() {
  return new Error('Invalid widget design');
}

function validateFields(fields) {
  if (!Array.isArray(fields) || fields.length < 1 || fields.length > FIELD_IDS.length
    || fields.some(field => !FIELD_IDS.includes(field))
    || new Set(fields).size !== fields.length) {
    throw invalidDesign();
  }
  return rowsFromFields(fields);
}

// The design grid needs at least one element; the separator grid may also be empty.
function validateRows(rows, { ids = CARD_ELEMENT_IDS, maxRows = MAX_ROWS, allowEmpty = false } = {}) {
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > maxRows) throw invalidDesign();
  const used = new Set();
  const result = rows.map((row, rowIndex) => {
    const padding = isRecord(row) && row.padding === undefined ? 0 : row && row.padding;
    if (!isRecord(row) || !isInteger(padding, 0, 100)
      || (row.columnGap !== undefined && !isInteger(row.columnGap, 0, 100))
      || !Array.isArray(row.columns) || row.columns.length < 1 || row.columns.length > UNITS) {
      throw invalidDesign();
    }
    let units = 0;
    const columns = row.columns.map(item => {
      if (!isRecord(item) || !isInteger(item.span, 1, UNITS) || !isInteger(item.rowSpan, 1, rows.length - rowIndex)
        || !ALIGNMENTS.includes(item.align) || !VERTICAL_ALIGNMENTS.includes(item.valign)
        || !DIRECTIONS.includes(item.direction) || !WIDTHS.includes(item.width)
        || (item.elementGap !== undefined && !isInteger(item.elementGap, 0, 100))
        || !Array.isArray(item.elements) || item.elements.length > ids.length
        || item.elements.some(id => !ids.includes(id) || used.has(id) || !used.add(id))) {
        throw invalidDesign();
      }
      units += item.span;
      return column(item.elements.slice(), item);
    });
    if (units > UNITS) throw invalidDesign();
    return { padding, columns, ...(row.columnGap === undefined ? {} : { columnGap: row.columnGap }) };
  });
  if (!used.size && !allowEmpty) throw invalidDesign();
  return result;
}

function validateSeparatorLayout(layout) {
  if (layout === undefined) return defaultSeparatorLayout();
  if (!isRecord(layout) || !isInteger(layout.lineThickness, 1, MAX_LINE_THICKNESS) || !LINE_STYLES.includes(layout.lineStyle)
    || (layout.linePosition !== undefined && !LINE_POSITIONS.includes(layout.linePosition))) {
    throw invalidDesign();
  }
  return {
    rows: validateRows(layout.rows, { ids: SEPARATOR_ELEMENT_IDS, maxRows: MAX_SEPARATOR_ROWS, allowEmpty: true }),
    lineThickness: layout.lineThickness,
    lineStyle: layout.lineStyle,
    linePosition: layout.linePosition || 'behind'
  };
}

function validateControlLayout(layout, area) {
  if (!isRecord(layout) || Object.keys(layout).some(key => !['rows', 'gap'].includes(key))
    || (layout.gap !== undefined && !isInteger(layout.gap, 0, 40))) throw invalidDesign();
  return {
    rows: validateRows(layout.rows, { ids: CONTROL_AREAS[area].ids, maxRows: 2, allowEmpty: true }),
    ...(layout.gap === undefined ? {} : { gap: layout.gap })
  };
}

function validateControlStyles(styles) {
  if (styles === undefined) return {};
  if (!isRecord(styles) || Object.keys(styles).some(id => !CONTROL_IDS.includes(id) || !isRecord(styles[id])
    || Object.keys(styles[id]).some(key => !Object.prototype.hasOwnProperty.call(CONTROL_STYLE_LIMITS, key)
      || !isInteger(styles[id][key], ...CONTROL_STYLE_LIMITS[key])))) throw invalidDesign();
  return Object.fromEntries(Object.entries(styles).filter(([, value]) => Object.keys(value).length)
    .map(([id, value]) => [id, { ...value }]));
}

function validateWidgetPadding(padding) {
  if (!isRecord(padding) || Object.keys(padding).some(side => !['top', 'right', 'bottom', 'left'].includes(side)
    || !isInteger(padding[side], 0, 100))) throw invalidDesign();
  return { ...padding };
}

function validateSizes(sizes) {
  if (sizes === undefined) return {};
  if (!isRecord(sizes) || Object.keys(sizes).some(id => !STYLED_IDS.includes(id) || !isInteger(sizes[id], 4, 100))) {
    throw invalidDesign();
  }
  return Object.fromEntries(STYLED_IDS.filter(id => sizes[id] !== undefined).map(id => [id, sizes[id]]));
}

function validateFonts(fonts) {
  if (fonts === undefined) return {};
  if (!isRecord(fonts) || Object.keys(fonts).some(id => !STYLED_IDS.includes(id) || !FONT_IDS.includes(fonts[id]))) {
    throw invalidDesign();
  }
  return Object.fromEntries(STYLED_IDS.filter(id => fonts[id] !== undefined).map(id => [id, fonts[id]]));
}

// Per element, only the text options that differ from the element's default are stored.
function validateTextStyles(styles) {
  if (styles === undefined) return {};
  const options = Object.keys(TEXT_STYLES);
  if (!isRecord(styles) || Object.keys(styles).some(id => !STYLED_IDS.includes(id) || !isRecord(styles[id])
    || Object.keys(styles[id]).some(option => !options.includes(option) || (option === 'wrap' && id !== 'timestamp')
      || !Object.prototype.hasOwnProperty.call(TEXT_STYLES[option].values, styles[id][option])))) {
    throw invalidDesign();
  }
  return Object.fromEntries(STYLED_IDS.filter(id => styles[id] && Object.keys(styles[id]).length)
    .map(id => [id, Object.fromEntries(options.filter(option => styles[id][option] !== undefined).map(option => [option, styles[id][option]]))]));
}

function validateBorders(borders) {
  if (borders === undefined) return {};
  if (!isRecord(borders) || Object.keys(borders).some(id => !BORDER_IDS.includes(id) || !isRecord(borders[id])
    || !BORDER_SIDES.includes(borders[id].side) || !isInteger(borders[id].thickness, 1, MAX_LINE_THICKNESS))) {
    throw invalidDesign();
  }
  return Object.fromEntries(BORDER_IDS.filter(id => borders[id])
    .map(id => [id, { side: borders[id].side, thickness: borders[id].thickness }]));
}

function validateDesign(value, { allowMissingId = false } = {}) {
  if (!isRecord(value)
    || (!allowMissingId && (typeof value.id !== 'string' || !value.id))
    || (value.id !== undefined && typeof value.id !== 'string')
    || typeof value.name !== 'string' || !value.name.trim() || value.name.trim().length > 60
    || typeof value.showDaySeparators !== 'boolean'
    || !isTimestampFormat(value.timestampFormat)
    || !isTimestampFormat(value.daySeparatorFormat)
    || (value.widgetBorderWidth !== undefined && !isInteger(value.widgetBorderWidth, 0, MAX_WIDGET_BORDER_WIDTH))
    || (value.widgetBorderless !== undefined && typeof value.widgetBorderless !== 'boolean')) {
    throw invalidDesign();
  }
  // Designs and templates saved before the grid designer only have a list of fields.
  const rows = value.rows === undefined && value.fields !== undefined ? validateFields(value.fields) : validateRows(value.rows);
  return {
    ...(value.id ? { id: value.id } : {}),
    name: value.name.trim(),
    showDaySeparators: value.showDaySeparators,
    timestampFormat: value.timestampFormat,
    daySeparatorFormat: value.daySeparatorFormat,
    widgetBorderWidth: value.widgetBorderless ? 0 : value.widgetBorderWidth || 0,
    ...(value.widgetBorderless === true ? { widgetBorderless: true } : {}),
    ...(value.widgetPadding === undefined ? {} : { widgetPadding: validateWidgetPadding(value.widgetPadding) }),
    ...(value.elementLineHeights === undefined ? {} : { elementLineHeights: validateSizes(value.elementLineHeights) }),
    rows,
    daySeparatorLayout: validateSeparatorLayout(value.daySeparatorLayout),
    ...(value.toolbarLayout === undefined ? {} : { toolbarLayout: validateControlLayout(value.toolbarLayout, 'toolbar') }),
    ...(value.pagingLayout === undefined ? {} : { pagingLayout: validateControlLayout(value.pagingLayout, 'paging') }),
    ...(value.controlStyles === undefined ? {} : { controlStyles: validateControlStyles(value.controlStyles) }),
    elementBorders: validateBorders(value.elementBorders),
    elementSizes: validateSizes(value.elementSizes),
    elementFonts: validateFonts(value.elementFonts),
    elementTextStyles: validateTextStyles(value.elementTextStyles)
  };
}

function validateElementColors(elements) {
  if (elements === undefined) return {};
  const separator = id => id === DAY_SEPARATOR_ID || CONTROL_IDS.includes(id);
  const colorOnly = id => id === DAY_SEPARATOR_LINE_ID || BORDER_IDS.includes(id);
  const backgrounds = id => (colorOnly(id) ? ['default'] : separator(id) ? SEPARATOR_BACKGROUNDS : ELEMENT_BACKGROUNDS);
  if (!isRecord(elements) || Object.keys(elements).some(id => !THEMED_IDS.includes(id)
    || !isRecord(elements[id])
    || !((separator(id) || id === DAY_SEPARATOR_LINE_ID ? SEPARATOR_COLORS : ELEMENT_COLORS).includes(elements[id].color)
      || isHexColor(elements[id].color))
    || !(backgrounds(id).includes(elements[id].background) || (!colorOnly(id) && isHexColor(elements[id].background))))) {
    throw new Error('Invalid widget theme');
  }
  return Object.fromEntries(THEMED_IDS.filter(id => elements[id])
    .map(id => [id, { color: elements[id].color, background: elements[id].background }]));
}

function validateTheme(value, { allowMissingId = false } = {}) {
  if (!isRecord(value)
    || (!allowMissingId && (typeof value.id !== 'string' || !value.id))
    || (value.id !== undefined && typeof value.id !== 'string')
    || typeof value.name !== 'string' || !value.name.trim() || value.name.trim().length > 60
    || !isRecord(value.colors)
    || (value.backgroundGradient !== undefined && typeof value.backgroundGradient !== 'boolean')
    || Object.keys(value.colors).some(key => !COLOR_IDS.includes(key))
    || COLOR_IDS.some(key => !COLOR_NAMES.includes(value.colors[key]) && !isHexColor(value.colors[key])
      && !(OPTIONAL_COLOR_IDS.includes(key) && value.colors[key] === undefined))) {
    throw new Error('Invalid widget theme');
  }
  return {
    ...(value.id ? { id: value.id } : {}),
    name: value.name.trim(),
    colors: Object.fromEntries(COLOR_IDS.map(key => [key, value.colors[key] || 'automatic'])),
    ...(value.backgroundGradient === undefined ? {} : { backgroundGradient: value.backgroundGradient }),
    elements: validateElementColors(value.elements)
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
  ELEMENT_COLORS,
  ELEMENT_BACKGROUNDS,
  BUILT_IN_DESIGNS,
  BUILT_IN_THEMES,
  getWidgetStyles,
  getSettingId,
  normalizeCollection,
  resolveTimestampFormat,
  resolveDaySeparatorFormat,
  validateDesign,
  validateTheme
};
