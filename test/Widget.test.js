'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const test = require('node:test');
const vm = require('node:vm');
const zlib = require('node:zlib');

const styles = require('../lib/widget-styles');
const template = require('../lib/widget-template');
const catalog = require('../lib/widget-template-catalog');
const search = require('../assets/js/ssl-widget-search');
const layout = require('../assets/js/ssl-widget-layout');
const widgetApi = require('../widgets/log_viewer/api');

test('built-in presets remain valid and portable across every design and theme combination', async () => {
  const doc = { createElement: () => {
    const node = { style: {}, children: [], className: '', attributes: {},
      setAttribute(name, value) { this.attributes[name] = value; }, appendChild(child) { this.children.push(child); } };
    node.classList = { add: name => { node.className += ' ' + name; } };
    return node;
  } };
  const values = { message: 'A sample log entry', timestamp: '13:45', severity: 'Info', app: 'Example',
    hostname: 'homey', facility: 'Flow' };
  const findField = (node, id) => node.className.split(' ').includes('ssl-field-' + id)
    ? node : node.children.map(child => findField(child, id)).find(Boolean);
  for (const originalDesign of styles.BUILT_IN_DESIGNS) {
    const design = styles.validateDesign(originalDesign);
    for (const originalTheme of styles.BUILT_IN_THEMES) {
      const theme = styles.validateTheme(originalTheme);
      const card = layout.renderCard(doc, design, theme, values);
      const prepared = layout.renderCard(doc, design, theme, values, { cardLayout: layout.computeLayout(design) });
      assert.equal(JSON.stringify(prepared), JSON.stringify(card), 'reusing a card layout must render the same output');
      const message = findField(card, 'message');
      assert.equal(message.textContent, values.message);
      assert.equal(message.style.background, undefined, 'built-in messages must not have a background highlight');
      assert.equal(message.style.color, undefined, 'messages must inherit the theme text color for light/dark readability');
      assert.ok(!message.className.includes('ssl-has-background'));
      if (design.id === 'builtin:journal') {
        assert.equal(findField(card, 'app').style.lineHeight, '17px', 'App / Group must not inherit host line height');
        assert.equal(findField(card, 'facility').style.lineHeight, '14px', 'Facility must not inherit host line height');
        const metadata = card.children.find(cell => cell.children.some(child => child.attributes['data-element'] === 'app'));
        assert.ok(metadata.children.some(child => child.attributes['data-element'] === 'facility'));
        assert.equal(metadata.attributes['data-valign'], 'middle', 'badges of different heights must share a vertical center');
      }
      if (design.id === 'builtin:aurora') {
        const cells = layout.computeLayout(design).cells;
        const timestamp = cells.find(cell => cell.elements.includes('timestamp'));
        const messageCell = cells.find(cell => cell.elements.includes('message'));
        assert.equal(timestamp.rowSpan, 3, 'timestamp rail must cover the header, message and metadata');
        assert.equal(messageCell.start, timestamp.start + timestamp.span, 'message must remain beside the timestamp rail');
        for (const id of ['timestamp', 'severity', 'app', 'facility', 'hostname']) {
          assert.equal(findField(card, id).textContent, values[id], `${id} must not be merged away by spanning columns`);
        }
        assert.equal(card.style.borderTop, `2px solid ${theme.id === 'builtin:aurora' ? '#218579' : 'var(--ssl-sev)'}`);
      }
      const decoded = template.decodeTemplate(await template.encodeTemplate({ design, theme }));
      const { id: designId, ...expectedDesign } = design;
      const { id: themeId, ...expectedTheme } = theme;
      assert.deepEqual(decoded.design, expectedDesign);
      assert.deepEqual(decoded.theme, expectedTheme);
    }
  }
});

test('timestamp wrapping is optional, portable and stacks Compact at spaces without splitting words', async () => {
  const doc = { createElement: () => {
    const node = { style: {}, children: [], className: '', setAttribute() {}, appendChild(child) { this.children.push(child); } };
    node.classList = { add: name => { node.className += ' ' + name; } };
    return node;
  } };
  const findTimestamp = node => node.className.includes('ssl-field-timestamp') ? node : node.children.map(findTimestamp).find(Boolean);
  const original = styles.BUILT_IN_DESIGNS[0];
  const values = { timestamp: '18-11-2026 16:19', severity: 'Warning', message: 'Test' };
  const defaultTimestamp = findTimestamp(layout.renderCard(doc, original, null, values));
  assert.equal(defaultTimestamp.style.whiteSpace, undefined);
  assert.equal(defaultTimestamp.style.inlineSize, undefined);
  for (const wrap of ['normal', 'nowrap', 'words']) {
    const design = styles.validateDesign({ ...original, id: 'wrapping', elementTextStyles: { timestamp: { wrap } } });
    const timestamp = findTimestamp(layout.renderCard(doc, design, null, values));
    assert.equal(timestamp.textContent, wrap === 'words' ? '18-11-2026\n16:19' : values.timestamp);
    assert.equal(timestamp.style.whiteSpace, wrap === 'words' ? 'pre' : wrap === 'nowrap' ? 'nowrap' : 'normal');
    const decoded = template.decodeTemplate(await template.encodeTemplate({ design }));
    assert.deepEqual(decoded.design.elementTextStyles, design.elementTextStyles);
  }
  assert.throws(() => styles.validateDesign({ ...original, elementTextStyles: { timestamp: { wrap: 'invalid' } } }), /Invalid widget design/);
  assert.throws(() => styles.validateDesign({ ...original, elementTextStyles: { message: { wrap: 'words' } } }), /Invalid widget design/);
  const compact = styles.BUILT_IN_DESIGNS.find(design => design.id === 'builtin:compact');
  const timestamp = findTimestamp(layout.renderCard(doc, compact, null, values));
  assert.equal(timestamp.textContent, '18-11-2026\n16:19');
  assert.equal(timestamp.style.whiteSpace, 'pre');
});

test('control layouts and overrides validate and survive TWF export without changing older designs', async () => {
  const base = { ...styles.BUILT_IN_DESIGNS[0], id: 'controls' };
  assert.equal(styles.validateDesign(base).toolbarLayout, undefined);
  assert.equal(styles.validateDesign(base).pagingLayout, undefined);
  const design = styles.validateDesign({ ...base,
    toolbarLayout: layout.defaultControlLayout('toolbar'),
    pagingLayout: layout.defaultControlLayout('paging'),
    controlStyles: { search: { height: 40, paddingX: 10, radius: 5 }, filter: {} },
    elementSizes: { search: 16, pageNumber: 14 },
    elementFonts: { previousPage: 'serif' },
    elementTextStyles: { nextPage: { weight: 'bold' } }
  });
  assert.deepEqual(design.controlStyles, { search: { height: 40, paddingX: 10, radius: 5 } });
  const theme = styles.validateTheme({ ...styles.BUILT_IN_THEMES[0], id: 'controls',
    elements: { search: { color: 'blue', background: 'white' }, filter: { color: 'red', background: 'none' } } });
  const exported = await template.encodeTemplate({ design, theme });
  const decoded = template.decodeTemplate(exported);
  assert.deepEqual(decoded.design, styles.validateDesign({ ...design, id: undefined }, { allowMissingId: true }));
  assert.deepEqual(decoded.theme, styles.validateTheme({ ...theme, id: undefined }, { allowMissingId: true }));
  const badLayouts = [
    { ...design.toolbarLayout, gap: 41 },
    { ...design.toolbarLayout, unexpected: true },
    { rows: [...design.toolbarLayout.rows, ...design.toolbarLayout.rows, ...design.toolbarLayout.rows] },
    { rows: [{ columns: [{ ...design.toolbarLayout.rows[0].columns[0], elements: ['nextPage'] }] }] },
    { rows: [{ columns: [{ ...design.toolbarLayout.rows[0].columns[0], elements: ['search', 'search'] }] }] }
  ];
  for (const toolbarLayout of badLayouts) assert.throws(() => styles.validateDesign({ ...base, toolbarLayout }), /Invalid widget design/);
  for (const controlStyles of [{ search: { height: 3 } }, { filter: { radius: 101 } }, { search: { paddingX: -1 } },
    { nextPage: { paddingY: 1.5 } }, { message: { height: 40 } }, { search: { unknown: 1 } }]) {
    assert.throws(() => styles.validateDesign({ ...base, controlStyles }), /Invalid widget design/);
  }
  assert.throws(() => styles.validateTheme({ ...theme, elements: { search: { color: 'severity', background: 'default' } } }), /Invalid widget theme/);
});

test('shared control renderer reuses live controls, arranges them and clears removed overrides', () => {
  const doc = { createElement: () => {
    const node = { style: { setProperty(key, value) { this[key] = value; }, removeProperty(key) {
      delete this[key.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())];
    } }, children: [], className: '', setAttribute() {},
    appendChild(child) { this.children.push(child); }, replaceChildren() { this.children = []; } };
    node.classList = {
      add(...names) { node.className += ' ' + names.join(' '); },
      remove(...names) { node.className = node.className.split(/\s+/).filter(name => !names.includes(name)).join(' '); }
    };
    return node;
  } };
  const root = doc.createElement('div');
  const nodes = { previousPage: doc.createElement('button'), pageNumber: doc.createElement('span'), nextPage: doc.createElement('button') };
  nodes.nextPage.onclick = () => 'next';
  const design = { ...styles.BUILT_IN_DESIGNS[0], pagingLayout: layout.defaultControlLayout('paging'),
    controlStyles: { nextPage: { height: 40, paddingX: 12, radius: 8 } },
    elementLineHeights: { nextPage: 24 },
    elementFonts: { nextPage: 'serif' }, elementTextStyles: { nextPage: { weight: 'bold' } } };
  design.pagingLayout.rows[0].columns.reverse();
  layout.renderControls(doc, root, 'paging', design, { elements: { nextPage: { color: 'red', background: 'white' } } }, nodes,
    { selectedColumn: { row: 0, column: 0 }, selectedElement: 'nextPage' });
  assert.equal(root.children[0].children[0].children[0], nodes.nextPage);
  assert.match(root.children[0].children[0].className, /ssl-preview-selected/);
  assert.match(nodes.nextPage.className, /ssl-element-selected/);
  assert.equal(nodes.nextPage.style.minHeight, '40px');
  assert.equal(nodes.nextPage.style.fontWeight, '700');
  assert.equal(nodes.nextPage.style.lineHeight, '24px');
  assert.equal(nodes.nextPage.style.color, 'var(--ssl-color-red)');
  assert.equal(nodes.nextPage.onclick(), 'next');
  const { controlStyles, elementFonts, elementTextStyles, elementLineHeights, pagingLayout, ...oldDesign } = design;
  layout.renderControls(doc, root, 'paging', oldDesign, {}, nodes);
  assert.deepEqual(root.children, [nodes.previousPage, nodes.pageNumber, nodes.nextPage]);
  assert.equal(nodes.nextPage.style.minHeight, undefined);
  assert.equal(nodes.nextPage.style.fontWeight, undefined);
  assert.equal(nodes.nextPage.style.lineHeight, undefined);
  assert.equal(nodes.nextPage.style.color, undefined);
  assert.doesNotMatch(root.className, /ssl-grid-card/);
  assert.doesNotMatch(nodes.nextPage.className, /ssl-element-selected/);
  design.pagingLayout.rows[0].columns.forEach(column => { column.elements = []; });
  layout.renderControls(doc, root, 'paging', design, {}, nodes);
  assert.ok(root.children[0].children.every(column => column.children.length === 0));
});

test('filter menus stay inside the widget when the filter moves left or into a lower row', () => {
  const widget = { getBoundingClientRect: () => ({ left: 100, right: 260, width: 160, top: 0, bottom: 200 }) };
  const menu = { style: {}, closest: () => widget, scrollHeight: 140,
    parentElement: { getBoundingClientRect: () => ({ top: 40 }) },
    getBoundingClientRect: () => ({ left: -60, right: 80, top: 78 }) };
  layout.positionFilterMenu(menu);
  assert.equal(menu.style.minWidth, '140px');
  assert.equal(menu.style.maxWidth, '140px');
  assert.equal(menu.style.right, '-170px');
  assert.equal(menu.style.maxHeight, '114px');
  menu.parentElement.getBoundingClientRect = () => ({ top: 160 });
  menu.getBoundingClientRect = () => ({ left: 130, right: 270, top: 198 });
  layout.positionFilterMenu(menu);
  assert.equal(menu.style.right, '20px');
  assert.equal(menu.style.top, 'auto');
  assert.equal(menu.style.bottom, 'calc(100% + 4px)');
  assert.equal(menu.style.maxHeight, '152px');
});

test('designer preview outlines the selected widget, row and column', () => {
  const doc = { createElement: () => {
    const node = { style: {}, children: [], className: '', setAttribute() {},
      appendChild(child) { this.children.push(child); } };
    node.classList = { add: name => { node.className += ' ' + name; } };
    return node;
  } };
  const selected = node => node.className.split(/\s+/).includes('ssl-preview-selected');
  const column = (rowSpan, elements) => ({ span: 1, rowSpan, align: 'left', valign: 'top', direction: 'horizontal', width: 'span', elements });
  const base = styles.BUILT_IN_DESIGNS[0];
  const flat = styles.validateDesign({ ...base, id: 'flat', rows: [{ columns: [column(1, ['timestamp']), column(1, ['message'])] }, { columns: [column(1, ['app'])] }] });
  const values = { timestamp: '1', message: 'm', app: 'a' };

  assert.ok(selected(layout.renderCard(doc, flat, null, values, { selectedCard: true })));
  const rowCard = layout.renderCard(doc, flat, null, values, { selectedRow: 1 });
  assert.deepEqual(rowCard.children.map(selected), [false, true]);
  const columnCard = layout.renderCard(doc, flat, null, values, { selectedColumn: { row: 0, column: 1 } });
  assert.deepEqual(columnCard.children[0].children.map(selected), [false, true]);
  assert.ok(!selected(columnCard) && !selected(columnCard.children[0]));

  const spanning = styles.validateDesign({ ...base, id: 'span', rows: [{ columns: [column(2, ['timestamp']), column(1, ['message'])] }, { columns: [column(1, ['app'])] }] });
  const spanCard = layout.renderCard(doc, spanning, null, values, { selectedRow: 1 });
  const overlay = spanCard.children.find(node => node.className.includes('ssl-preview-row-overlay'));
  assert.equal(overlay.style.gridRow, '2');
  assert.equal(overlay.style.gridColumn, '1 / -1');
  assert.equal(spanCard.children.filter(selected).length, 1);
});

test('widget outline width and colour validate with defaults like Chronograph', () => {
  const base = styles.BUILT_IN_DESIGNS[0];
  assert.equal(styles.validateDesign({ ...base, id: 'd' }).widgetBorderWidth, 0);
  assert.equal(styles.validateDesign({ ...base, id: 'd', widgetBorderWidth: 20 }).widgetBorderWidth, 20);
  for (const widgetBorderWidth of [-1, 21, 1.5]) {
    assert.throws(() => styles.validateDesign({ ...base, id: 'd', widgetBorderWidth }), /Invalid widget design/);
  }
  const { outline, ...colors } = styles.BUILT_IN_THEMES[0].colors;
  assert.equal(outline, 'automatic');
  assert.equal(styles.validateTheme({ name: 'T', id: 't', colors }).colors.outline, 'automatic');
  assert.equal(styles.validateTheme({ name: 'T', id: 't', colors: { ...colors, outline: 'red' } }).colors.outline, 'red');
  assert.equal(styles.validateTheme({ name: 'T', id: 't', colors: { ...colors, accent: 'black-light' } }).colors.accent, 'black-light');
  assert.throws(() => styles.validateTheme({ name: 'T', id: 't', colors: { ...colors, frame: 'red' } }), /Invalid widget theme/);
  assert.throws(() => styles.validateTheme({ name: 'T', id: 't', colors: { ...colors, surface: undefined } }), /Invalid widget theme/);
});

test('built-in severity shades are distinct and portable without changing saved colors', async () => {
  const css = fs.readFileSync(require.resolve('../assets/css/ssl-widget.css'), 'utf8');
  const colorHex = name => {
    const match = css.match(new RegExp(`--ssl-color-${name}:\\s*(#[0-9a-f]{6})\\s*;`, 'i'));
    assert.ok(match, `${name} must have a palette color`);
    return match[1].toUpperCase();
  };
  const levels = ['emergency', 'alert', 'critical', 'error', 'warning', 'notice', 'info', 'debug'];
  for (const theme of styles.BUILT_IN_THEMES) {
    assert.notEqual(theme.colors.critical, theme.colors.error, `${theme.name} must distinguish Critical and Error`);
  }
  const builtin = styles.BUILT_IN_THEMES[0];
  assert.equal(builtin.colors.critical, 'red');
  assert.equal(builtin.colors.error, 'red-soft');
  assert.notEqual(colorHex('red-soft'), '#F25F5C');
  const syslog = styles.BUILT_IN_THEMES[1];
  assert.equal(syslog.id, 'builtin:default-syslog');
  assert.deepEqual(Object.fromEntries(levels.map(level => [level, syslog.colors[level]])), {
    emergency: '#FF00FF', alert: '#FF0000', critical: '#F44336', error: '#E57373',
    warning: '#FFC107', notice: '#00BCD4', info: '#4CAF50', debug: '#2196F3'
  });
  const luminance = hex => {
    const [red, green, blue] = hex.slice(1).match(/../g).map(value => {
      const channel = parseInt(value, 16) / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return red * 0.2126 + green * 0.7152 + blue * 0.0722;
  };
  for (const level of levels) {
    assert.ok((luminance(syslog.colors[level]) + 0.05) / (luminance('#101114') + 0.05) >= 4.5,
      `${level} badge must have readable text`);
  }
  for (const key of ['background', 'surface', 'text', 'muted', 'border', 'accent', 'outline']) {
    assert.equal(syslog.colors[key], builtin.colors[key]);
  }
  assert.deepEqual(syslog.elements, builtin.elements);
  const theme = styles.validateTheme({ ...builtin, id: 'custom',
    colors: { ...builtin.colors, error: 'red-soft' }, elements: { message: { color: 'red-soft', background: 'red-soft' } } });
  assert.equal(layout.widgetStyle({}, theme)['--ssl-error'], 'var(--ssl-color-red-soft)');
  const { id, ...expected } = theme;
  assert.deepEqual(template.decodeTemplate(await template.encodeTemplate({ theme })).theme, expected);
  const localeDirectory = path.join('.homeycompose', 'locales');
  for (const file of fs.readdirSync(localeDirectory).filter(name => /^[a-z]{2}\.json$/.test(name))) {
    const locale = JSON.parse(fs.readFileSync(path.join(localeDirectory, file), 'utf8'));
    assert.ok(locale.widgets.theme['default-syslog'], `${file} must name the Syslog theme`);
    assert.ok(locale.widgets.settings.colorNames['red-soft'], `${file} must name red-soft`);
  }
  const saved = styles.validateTheme({ ...builtin, id: 'saved', colors: { ...builtin.colors, error: 'red' } });
  assert.equal(saved.colors.error, 'red');
  assert.equal(layout.widgetStyle({}, saved)['--ssl-error'], 'var(--ssl-color-red)');
});

test('retired Console and Syslog palette names migrate to their original HEX colors', async () => {
  const builtin = styles.BUILT_IN_THEMES[0];
  const legacy = {
    'console-purple': '#FF94E4', 'console-pink': '#FF94B8', 'console-red': '#FF7B7B',
    'console-red-soft': '#FFB4AB', 'console-yellow': '#FFD580', 'console-blue': '#86D9F9',
    'console-green': '#75E6A4', 'console-grey': '#A2B0AA',
    'syslog-magenta': '#FF00FF', 'syslog-red': '#FF0000', 'syslog-critical-red': '#F44336',
    'syslog-light-red': '#E57373', 'syslog-amber': '#FFC107', 'syslog-cyan': '#00BCD4',
    'syslog-green': '#4CAF50', 'syslog-blue': '#2196F3'
  };
  for (const [name, hex] of Object.entries(legacy)) {
    assert.ok(!styles.COLOR_NAMES.includes(name));
    const theme = styles.validateTheme({ ...builtin, id: 'custom',
      backgroundGradientEnd: name, colors: { ...builtin.colors, error: name },
      elements: { message: { color: name, background: name }, daySeparatorLine: { color: name, background: 'default' } } });
    assert.equal(theme.colors.error, hex);
    assert.equal(theme.backgroundGradientEnd, hex);
    assert.deepEqual(theme.elements.message, { color: hex, background: hex });
    assert.equal(theme.elements.daySeparatorLine.color, hex);
    const { id, ...expected } = theme;
    assert.deepEqual(template.decodeTemplate(await template.encodeTemplate({ theme })).theme, expected);
  }
});

test('frame overrides distinguish legacy default from borderless and survive TWF export', async () => {
  const base = { ...styles.BUILT_IN_DESIGNS[0], id: 'frame', widgetBorderWidth: 0 };
  const theme = styles.BUILT_IN_THEMES[0];
  assert.equal(styles.validateDesign(base).widgetBorderless, undefined);
  const defaultStyle = layout.widgetStyle(styles.validateDesign(base), theme);
  assert.equal(defaultStyle['--ssl-outline-width'], undefined);
  assert.equal(defaultStyle['--ssl-frame-shadow'], undefined);
  const design = styles.validateDesign({ ...base, widgetBorderless: true,
    widgetPadding: { top: 0, right: 100, bottom: 8, left: 4 }, elementLineHeights: { message: 24, search: 30 } });
  assert.deepEqual(layout.widgetStyle(design, theme), {
    ...defaultStyle,
    '--ssl-outline-width': '0px', '--ssl-frame-shadow': 'none',
    '--ssl-widget-padding-top': '0px', '--ssl-widget-padding-right': '100px',
    '--ssl-widget-padding-bottom': '8px', '--ssl-widget-padding-left': '4px'
  });
  assert.equal(layout.widgetStyle({ ...base, widgetBorderWidth: 3 }, theme)['--ssl-outline-width'], '3px');
  const decoded = template.decodeTemplate(await template.encodeTemplate({ design }));
  const { id, ...expected } = design;
  assert.deepEqual(decoded.design, expected);
  for (const changes of [{ widgetBorderless: 0 }, { widgetPadding: { top: -1 } },
    { widgetPadding: { left: 101 } }, { widgetPadding: { left: 1.5 } }, { widgetPadding: { other: 2 } },
    { elementLineHeights: { message: 3 } }, { elementLineHeights: { search: 101 } },
    { elementLineHeights: { border1: 20 } }]) {
    assert.throws(() => styles.validateDesign({ ...base, ...changes }), /Invalid widget design/);
  }
});

test('only Console overrides built-in widget backgrounds and custom backgrounds remain supported', async () => {
  const theme = styles.validateTheme(styles.BUILT_IN_THEMES[0]);
  for (const original of styles.BUILT_IN_THEMES.filter(item => item.id !== 'builtin:console')) {
    const preset = styles.validateTheme(original);
    const rendered = layout.widgetStyle(styles.BUILT_IN_DESIGNS[0], preset);
    assert.equal(preset.colors.background, 'automatic');
    assert.equal(preset.backgroundGradient, undefined);
    assert.equal(rendered['background-color'], undefined);
    assert.equal(rendered['--ssl-background'], undefined);
    assert.equal(rendered['background-image'], undefined);
  }
  const transparent = styles.validateTheme({ ...theme, id: 'transparent', colors: { ...theme.colors, background: 'none' } });
  const rendered = layout.widgetStyle(styles.BUILT_IN_DESIGNS[0], transparent);
  assert.equal(rendered['background-color'], 'transparent');
  assert.equal(rendered['--ssl-background'], undefined, 'menus and sticky controls must keep their opaque background');
  assert.equal(layout.widgetStyle({}, { ...transparent, backgroundGradient: true })['background-image'], undefined);
  for (const key of ['surface', 'text', 'accent']) {
    assert.throws(() => styles.validateTheme({ ...theme, colors: { ...theme.colors, [key]: 'none' } }), /Invalid widget theme/);
  }
  const { id, ...expected } = transparent;
  assert.deepEqual(template.decodeTemplate(await template.encodeTemplate({ theme: transparent })).theme, expected);
});

test('built-in highlights and the green Console gradient keep readable foregrounds', () => {
  const theme = styles.validateTheme(styles.BUILT_IN_THEMES.find(item => item.id === 'builtin:console'));
  const design = styles.BUILT_IN_DESIGNS.find(item => item.id === 'builtin:console');
  const style = layout.widgetStyle(design, theme);
  assert.equal(style['--ssl-background'], theme.colors.background);
  assert.equal(style['--ssl-surface'], theme.colors.surface);
  assert.equal(style['--ssl-text'], theme.colors.text);
  assert.equal(style['background-image'], `linear-gradient(to bottom, ${theme.colors.background}, ${theme.backgroundGradientEnd})`);
  assert.equal(style['background-color'], undefined);
  const luminance = hex => {
    const rgb = hex.slice(1).match(/../g).map(value => {
      const channel = parseInt(value, 16) / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  for (const key of ['text', 'muted', 'accent', 'emergency', 'alert', 'critical', 'error', 'warning', 'notice', 'info', 'debug']) {
    const foreground = luminance(theme.colors[key]);
    for (const background of [theme.colors.background, theme.backgroundGradientEnd, theme.colors.surface]) {
      const contrast = (foreground + 0.05) / (luminance(background) + 0.05);
      assert.ok(contrast >= 4.5, `${key} must remain readable on the terminal background`);
    }
  }
  for (const preset of styles.BUILT_IN_THEMES) {
    for (const [id, colors] of Object.entries(preset.elements)) {
      if (!colors.background.startsWith('#')) continue;
      const foreground = luminance(colors.color);
      const background = luminance(colors.background);
      const contrast = (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
      assert.ok(contrast >= 4.5, `${preset.name} ${id} highlights must remain readable in both modes`);
    }
  }
});

test('HEX colors and optional gradient fill validate and round-trip for widget and element colors', async () => {
  const base = { ...styles.BUILT_IN_THEMES[0], id: 'hex' };
  const theme = styles.validateTheme({ ...base, colors: { ...base.colors, background: '#2F8df6', outline: '#001122' },
    elements: { message: { color: '#123456', background: '#ABCDEF' }, border1: { color: '#001122', background: 'default' } },
    backgroundGradient: true });
  assert.equal(layout.colorValue(theme.elements.message.color), '#123456');
  assert.equal(layout.widgetStyle({}, theme)['--ssl-outline'], '#001122');
  assert.match(layout.widgetStyle({}, theme)['background-image'],
    /^linear-gradient\(to bottom, color-mix\(in srgb, #2F8df6 22%, var\(--ssl-gradient-surface\)\), color-mix\(in srgb, #2F8df6 11%,/);
  assert.equal(layout.widgetStyle({}, { ...theme, backgroundGradient: false })['--ssl-background'], '#2F8df6');
  assert.equal(layout.widgetStyle({}, { ...base, backgroundGradient: true })['background-image'], undefined);
  const { id, ...expected } = theme;
  assert.deepEqual(template.decodeTemplate(await template.encodeTemplate({ theme })).theme, expected);
  const twoColor = styles.validateTheme({ ...theme, backgroundGradientEnd: '#001122' });
  assert.equal(layout.widgetStyle({}, twoColor)['background-image'], 'linear-gradient(to bottom, #2F8df6, #001122)');
  assert.equal(layout.widgetStyle({}, twoColor)['--ssl-background'], '#2F8df6');
  assert.equal(layout.widgetStyle({}, { ...twoColor, backgroundGradient: false })['background-image'], undefined);
  assert.equal(layout.widgetStyle({}, { ...twoColor, colors: { ...twoColor.colors, background: 'automatic' } })['background-image'], undefined);
  assert.equal(styles.validateTheme({ ...twoColor, backgroundGradientEnd: 'automatic' }).backgroundGradientEnd, undefined);
  assert.equal(layout.widgetStyle({}, styles.validateTheme({ ...twoColor, backgroundGradientEnd: 'green' }))['background-image'],
    'linear-gradient(to bottom, #2F8df6, var(--ssl-color-green))');
  assert.deepEqual(template.decodeTemplate(await template.encodeTemplate({ theme: twoColor })).theme,
    { ...expected, backgroundGradientEnd: '#001122' });
  for (const color of ['#fff', '#fffffff', '#GG0000', 'red; color:black']) {
    assert.throws(() => styles.validateTheme({ ...base, colors: { ...base.colors, background: color } }), /Invalid widget theme/);
    assert.throws(() => styles.validateTheme({ ...base, elements: { message: { color, background: 'default' } } }), /Invalid widget theme/);
    assert.throws(() => styles.validateTheme({ ...base, elements: { message: { color: 'default', background: color } } }), /Invalid widget theme/);
  }
  assert.throws(() => styles.validateTheme({ ...base, backgroundGradient: 'yes' }), /Invalid widget theme/);
  for (const backgroundGradientEnd of ['#fff', 'none', '#GG0000', true]) {
    assert.throws(() => styles.validateTheme({ ...base, backgroundGradientEnd }), /Invalid widget theme/);
  }
  assert.throws(() => styles.validateTheme({ ...base, elements: { border1: { color: '#123456', background: '#123456' } } }), /Invalid widget theme/);
});

test('optional row and element gaps render in flat and spanning grids without changing omitted defaults', async () => {
  const doc = { createElement: () => {
    const node = { style: {}, children: [], className: '', setAttribute() {}, appendChild(child) { this.children.push(child); } };
    node.classList = { add: name => { node.className += ' ' + name; } };
    return node;
  } };
  const column = (elements, span, options = {}) => ({ elements, span, rowSpan: 1,
    align: 'left', valign: 'top', direction: 'horizontal', width: 'span', ...options });
  const design = styles.validateDesign({ ...styles.BUILT_IN_DESIGNS[0], id: 'spacing',
    elementLineHeights: { message: 28 },
    rows: [
      { columnGap: 0, columns: [column(['message', 'border2'], 2, { elementGap: 3 }), column(['app'], 3)] },
      { columnGap: 17, columns: [column(['timestamp'], 5)] }
    ] });
  const values = { message: 'Message', app: 'App', timestamp: '12:00' };
  const flat = layout.renderCard(doc, design, null, values);
  assert.equal(flat.children[0].style.columnGap, '0px');
  assert.equal(flat.children[1].style.columnGap, '17px');
  assert.equal(flat.children[0].children[0].style.gap, '3px');
  assert.equal(flat.children[0].children[0].children[0].style.lineHeight, '28px');
  const spanning = structuredClone(design);
  spanning.rows[0].columns[0].rowSpan = 2;
  const card = layout.renderCard(doc, spanning, null, values);
  assert.equal(card.style.columnGap, '0px');
  assert.equal(card.children[0].style.paddingRight, 'calc(0px + var(--ssl-border-padding-right, 0px))');
  assert.match(card.children[0].className, /ssl-border-right/);
  assert.equal(card.children[1].style.paddingRight, undefined);
  assert.equal(card.children[2].style.paddingRight, undefined);
  const legacy = structuredClone(spanning);
  legacy.rows.forEach(row => { delete row.columnGap; });
  assert.equal(layout.renderCard(doc, legacy, null, values).style.columnGap, undefined);
  const { id, ...expected } = design;
  assert.deepEqual(template.decodeTemplate(await template.encodeTemplate({ design })).design, expected);
  for (const gap of [-1, 101, 2.5]) {
    const badRow = structuredClone(design);
    badRow.rows[0].columnGap = gap;
    assert.throws(() => styles.validateDesign(badRow), /Invalid widget design/);
    const badColumn = structuredClone(design);
    badColumn.rows[0].columns[0].elementGap = gap;
    assert.throws(() => styles.validateDesign(badColumn), /Invalid widget design/);
  }
});

test('border elements draw the card edge or a column side in the severity colour', () => {
  const doc = { createElement: () => {
    const node = { style: {}, children: [], className: '', setAttribute() {}, appendChild(child) { this.children.push(child); } };
    node.classList = { add: name => { node.className += ' ' + name; } };
    return node;
  } };
  const column = (span, rowSpan, elements) => ({ span, rowSpan, align: 'left', valign: 'top', direction: 'vertical', width: 'content', elements });
  const base = styles.BUILT_IN_DESIGNS[0];
  // The default design keeps its severity bar as the card's left border, without shifting the content.
  const defaultCard = layout.renderCard(doc, base, null, { message: 'm' });
  assert.equal(defaultCard.style.borderLeft, '4px solid var(--ssl-sev)');
  assert.match(defaultCard.className, /ssl-edge-left/);

  const design = styles.validateDesign({ ...base, id: 'borders',
    rows: [{ columns: [column(2, 1, ['message', 'border2']), column(3, 1, ['border3'])] }, { columns: [column(5, 1, ['app'])] }],
    elementBorders: { border2: { side: 'right', thickness: 2 } } });
  const card = layout.renderCard(doc, design, { elements: { border2: { color: 'blue', background: 'default' } } }, { message: 'm', app: 'a' });
  const [first, second] = card.children[0].children;
  assert.equal(first.style.borderRight, '2px solid var(--ssl-color-blue)');
  assert.equal(first.children.length, 1);
  // A top border on a column that doesn't span the whole width stays inside that column.
  assert.equal(second.style.borderTop, '4px solid var(--ssl-sev)');
  assert.equal(card.style.borderTop, undefined);

  for (const elementBorders of [{ border1: { side: 'middle', thickness: 4 } }, { border1: { side: 'left', thickness: 11 } }, { other: { side: 'left', thickness: 1 } }]) {
    assert.throws(() => styles.validateDesign({ ...base, id: 'bad', elementBorders }), /Invalid widget design/);
  }
  assert.throws(() => styles.validateTheme({ ...styles.BUILT_IN_THEMES[0], id: 't', elements: { border1: { color: 'red', background: 'red' } } }),
    /Invalid widget theme/);
});

test('content-sized columns share the widest width across the cards of a list', () => {
  const doc = { createElement: () => {
    const node = { style: {}, children: [], className: '', attributes: {}, setAttribute(name, value) { this.attributes[name] = value; },
      getAttribute(name) { return this.attributes[name]; }, appendChild(child) { this.children.push(child); } };
    node.classList = { add: name => { node.className += ' ' + name; } };
    return node;
  } };
  const card = layout.renderCard(doc, styles.BUILT_IN_DESIGNS[0], null, { timestamp: '9:05', severity: 'Info', message: 'm' });
  // The border and the time/level column fit their content, with a minimum the list can share.
  assert.match(card.style.gridTemplateColumns, /^minmax\(var\(--ssl-card-track-0, auto\), auto\) minmax\(var\(--ssl-card-track-1, auto\), auto\) minmax\(0, 1fr\)/);
  assert.equal(card.attributes['data-ssl-content-tracks'], '0,1');

  const measured = [{ ...card, used: '4px 40.2px 100px' }, { ...card, used: '4px 61px 80px' }];
  const props = { '--ssl-card-track-9': '1px' };
  const root = {
    sslTrackNames: ['--ssl-card-track-9'],
    style: { setProperty: (name, value) => { props[name] = value; }, removeProperty: name => { delete props[name]; } },
    querySelectorAll: () => measured,
    ownerDocument: { defaultView: { getComputedStyle: node => ({ gridTemplateColumns: node.used }) } }
  };
  layout.alignContentTracks(root);
  assert.deepEqual(props, { '--ssl-card-track-0': '4px', '--ssl-card-track-1': '61px' });
});

test('day separator grid validates, defaults and renders the date and line', () => {
  const doc = { createElement: () => {
    const node = { style: {}, children: [], className: '', attributes: {}, setAttribute(name, value) { this.attributes[name] = value; },
      appendChild(child) { this.children.push(child); } };
    node.classList = { add: name => { node.className += ' ' + name; } };
    return node;
  } };
  const column = (elements, options = {}) => ({ span: 5, rowSpan: 1, align: 'center', valign: 'middle', direction: 'horizontal', width: 'span', elements, ...options });
  const base = { ...styles.BUILT_IN_DESIGNS[0], id: 'separator' };
  delete base.daySeparatorLayout;
  // Designs saved before the separator grid get the default: the date on a centred line.
  assert.deepEqual(styles.validateDesign(base).daySeparatorLayout, layout.defaultSeparatorLayout());

  const twoRows = styles.validateDesign({ ...base, daySeparatorLayout: {
    rows: [{ columns: [column(['daySeparator'])] }, { columns: [column(['daySeparatorLine'], { valign: 'bottom' })] }],
    lineThickness: 3, lineStyle: 'dashed'
  } });
  const separator = layout.renderDaySeparator(doc, twoRows, { elements: { daySeparatorLine: { color: 'red', background: 'default' } } }, 'Mon 1 Jan',
    { selectedRow: 1, selectedElement: 'daySeparator' });
  const [dateRow, lineRow] = separator.children;
  const date = dateRow.children[0].children[0];
  const line = lineRow.children[0].children[0];
  assert.equal(date.textContent, 'Mon 1 Jan');
  assert.match(date.className, /ssl-element-selected/);
  assert.equal(line.style.borderTop, '3px dashed var(--ssl-color-red)');
  assert.equal(lineRow.children[0].attributes['data-valign'], 'bottom');
  assert.equal(twoRows.daySeparatorLayout.linePosition, 'behind');
  const below = styles.validateDesign({ ...base, daySeparatorLayout: { ...layout.defaultSeparatorLayout(), linePosition: 'below' } });
  const belowCell = layout.renderDaySeparator(doc, below, {}, 'Mon 1 Jan').children[0].children[0];
  assert.equal(belowCell.children[1].attributes['data-position'], 'below');
  assert.ok(!belowCell.style.minHeight);
  assert.match(lineRow.className, /ssl-preview-selected/);
  assert.doesNotMatch(dateRow.className, /ssl-preview-selected/);
  assert.equal(styles.validateDesign({ ...base, daySeparatorLayout: { ...twoRows.daySeparatorLayout, rows: [{ columns: [column([])] }] } })
    .daySeparatorLayout.rows[0].columns[0].elements.length, 0);

  for (const daySeparatorLayout of [
    { ...twoRows.daySeparatorLayout, rows: [{ columns: [column(['message'])] }] },
    { ...twoRows.daySeparatorLayout, rows: [{ columns: [column(['daySeparator', 'daySeparator'])] }] },
    { ...twoRows.daySeparatorLayout, rows: [0, 1, 2].map(() => ({ columns: [column([])] })) },
    { ...twoRows.daySeparatorLayout, lineThickness: 11 },
    { ...twoRows.daySeparatorLayout, lineStyle: 'groove' },
    { ...twoRows.daySeparatorLayout, linePosition: 'beside' }
  ]) {
    assert.throws(() => styles.validateDesign({ ...base, daySeparatorLayout }), /Invalid widget design/);
  }
  const colors = styles.BUILT_IN_THEMES[0].colors;
  assert.equal(styles.validateTheme({ id: 'line', name: 'Line', colors, elements: { daySeparatorLine: { color: 'blue', background: 'default' } } })
    .elements.daySeparatorLine.color, 'blue');
  assert.throws(() => styles.validateTheme({ id: 'line', name: 'Line', colors, elements: { daySeparatorLine: { color: 'blue', background: 'red' } } }),
    /Invalid widget theme/);
});

test('widget style collection provides built-ins and validates custom entries', () => {
  const homey = { settings: { get: () => undefined } };
  const builtIns = styles.getWidgetStyles(homey);
  assert.equal(builtIns.designs[0].id, 'builtin:default');
  assert.equal(builtIns.themes[0].id, 'builtin:default');
  assert.equal(builtIns.themes[0].colors.background, 'automatic');
  assert.equal(styles.getSettingId('builtin:homey', 'builtin:default'), 'builtin:default');

  const custom = styles.normalizeCollection({
    version: 1,
    designs: [{ id: 'my-design', name: 'My design', fields: ['message'], showDaySeparators: false, timestampFormat: 'HH:mm', daySeparatorFormat: 'dddd' }],
    themes: []
  });
  assert.deepEqual(custom.designs[0].rows[0].columns[0].elements, ['message']);
  assert.equal(custom.designs[0].timestampFormat, 'HH:mm');
  assert.throws(() => styles.validateDesign({ id: 'bad', name: 'Bad', fields: ['message'], showDaySeparators: true }), /Invalid widget design/);
  assert.equal(styles.resolveTimestampFormat('', custom.designs[0]), 'HH:mm');
  assert.equal(styles.resolveTimestampFormat('dd-MM-yyyy', custom.designs[0]), 'dd-MM-yyyy');
  assert.equal(styles.resolveDaySeparatorFormat(custom.designs[0]), 'dddd');
  assert.throws(() => styles.validateDesign({ ...custom.designs[0], id: 'no-day-format', daySeparatorFormat: '' }), /Invalid widget design/);
  const fakeDocument = () => ({ createElement: () => {
    const node = { style: {}, children: [], classList: { add() {} }, setAttribute() {},
      appendChild(child) { this.children.push(child); if (!this.firstChild) this.firstChild = child; } };
    return node;
  } });
  const fonted = styles.validateDesign({ ...custom.designs[0], elementFonts: { message: 'serif', daySeparator: 'monospace' } });
  assert.equal(layout.elementFont(fonted, 'message'), 'Georgia, "Times New Roman", Times, serif');
  assert.equal(layout.elementFont(fonted, 'app'), '');
  const fontedSeparator = layout.renderDaySeparator(fakeDocument(), fonted, null, 'Mon');
  assert.equal(fontedSeparator.firstChild.firstChild.firstChild.style.fontFamily, '"Courier New", Courier, monospace');
  assert.equal(layout.renderCard(fakeDocument(), fonted, null, { message: 'hi' }).firstChild.firstChild.firstChild.style.fontFamily,
    'Georgia, "Times New Roman", Times, serif');
  for (const elementFonts of [{ message: 'comic' }, { message: '' }, { nope: 'serif' }]) {
    assert.throws(() => styles.validateDesign({ ...custom.designs[0], elementFonts }), /Invalid widget design/);
  }
  const styled = styles.validateDesign({ ...custom.designs[0], elementTextStyles: {
    message: { textCase: 'capitalize', weight: 'bold', italic: 'on', spacing: 'wide' }, daySeparator: { textCase: 'none' }, app: {}
  } });
  assert.deepEqual(styled.elementTextStyles, {
    message: { textCase: 'capitalize', weight: 'bold', italic: 'on', spacing: 'wide' }, daySeparator: { textCase: 'none' }
  });
  const styledMessage = layout.renderCard(fakeDocument(), styled, null, { message: 'hi' }).firstChild.firstChild.firstChild.style;
  assert.deepEqual([styledMessage.textTransform, styledMessage.fontWeight, styledMessage.fontStyle, styledMessage.letterSpacing],
    ['capitalize', '700', 'italic', '0.08em']);
  assert.equal(layout.renderDaySeparator(fakeDocument(), styled, null, 'Mon').firstChild.firstChild.firstChild.style.textTransform, 'none');
  assert.equal(layout.renderCard(fakeDocument(), fonted, null, { message: 'hi' }).firstChild.firstChild.firstChild.style.textTransform, undefined);
  for (const elementTextStyles of [{ message: { weight: 'heavy' } }, { message: { color: 'red' } }, { nope: { italic: 'on' } }, { message: 'bold' }]) {
    assert.throws(() => styles.validateDesign({ ...custom.designs[0], elementTextStyles }), /Invalid widget design/);
  }
  const separatorTheme = styles.validateTheme({
    id: 'separator', name: 'Separator', colors: styles.BUILT_IN_THEMES[0].colors,
    elements: { daySeparator: { color: 'red', background: 'none' } }
  });
  assert.equal(separatorTheme.elements.daySeparator.color, 'red');
  assert.throws(() => styles.validateTheme({
    id: 'bad', name: 'Bad', colors: styles.BUILT_IN_THEMES[0].colors, elements: { daySeparator: { color: 'severity', background: 'default' } }
  }), /Invalid widget theme/);
  const row = elements => ({ columns: [{ span: 5, rowSpan: 1, align: 'left', valign: 'top', direction: 'horizontal', width: 'span', elements }] });
  for (const rows of [
    [row(['message']), row(['message'])],
    [row([])],
    [{ columns: [{ ...row(['message']).columns[0], span: 3 }, { ...row(['app']).columns[0], span: 3 }] }],
    [{ columns: [{ ...row(['message']).columns[0], rowSpan: 2 }] }]
  ]) {
    assert.throws(() => styles.validateDesign({ id: 'bad', name: 'Bad', showDaySeparators: true, timestampFormat: 'datetime', daySeparatorFormat: 'date', rows }), /Invalid widget design/);
  }
  assert.throws(() => styles.normalizeCollection({
    version: 1,
    designs: [{ id: 'bad', name: 'Bad', fields: ['message', 'message'], showDaySeparators: true, timestampFormat: 'datetime', daySeparatorFormat: 'date' }],
    themes: []
  }), /Invalid widget design/);
  assert.throws(() => styles.validateTheme({
    id: 'bad', name: 'Bad', colors: styles.BUILT_IN_THEMES[0].colors, elements: { message: { color: 'severity', background: 'teal-ish' } }
  }), /Invalid widget theme/);
  assert.throws(() => styles.normalizeCollection({
    version: 1,
    designs: [],
    themes: [{ id: 'bad', name: 'Bad', colors: { ...styles.BUILT_IN_THEMES[0].colors, text: '#ff000' } }]
  }), /Invalid widget theme/);
  const named = styles.normalizeCollection({
    version: 1,
    designs: [],
    themes: [{ id: 'named', name: 'Named', colors: { ...styles.BUILT_IN_THEMES[0].colors, text: 'red' } }]
  });
  assert.equal(named.themes[0].colors.text, 'red');
});

test('widget templates round-trip and reject invalid or oversized input', async () => {
  const value = {
    design: { ...styles.BUILT_IN_DESIGNS[0], id: undefined, elementTextStyles: { severity: { textCase: 'none', italic: 'on' } } },
    theme: { ...styles.BUILT_IN_THEMES[0], id: undefined }
  };
  const encoded = await template.encodeTemplate(value);
  assert.match(encoded, /^\[twf:SimpleSysLog:LogViewer:DESIGN,THEME:/);
  const expected = {
    design: styles.validateDesign(value.design, { allowMissingId: true }),
    theme: styles.validateTheme(value.theme, { allowMissingId: true })
  };
  assert.deepEqual(template.decodeTemplate(encoded), expected);
  const body = JSON.parse(zlib.brotliDecompressSync(Buffer.from(encoded.split('"')[1], 'base64')));
  assert.equal(body.v, 1);
  const uncompressed = Buffer.from(JSON.stringify({ version: 1, ...expected })).toString('base64');
  assert.ok(encoded.length < uncompressed.length / 2);
  assert.throws(() => template.decodeTemplate(`[twf:SimpleSysLog:LogViewer:DESIGN,THEME:"${uncompressed}":/twf]`), /Invalid template data/);
  for (const version of [0, 2, 3]) {
    const unsupported = zlib.brotliCompressSync(JSON.stringify({ ...body, v: version })).toString('base64');
    assert.throws(() => template.decodeTemplate(`[twf:SimpleSysLog:LogViewer:DESIGN,THEME:"${unsupported}":/twf]`), /Unsupported template version/);
  }
  assert.throws(() => template.decodeTemplate('[twf:SimpleSysLog:LogViewer:DESIGN:"not-base64":/twf]'), /Invalid template/);
  assert.throws(() => template.decodeTemplate(encoded.replace('twf:SimpleSysLog:', 'twf:Chronograph:')), /This TWF is for Chronograph/);
  assert.throws(() => template.decodeTemplate(encoded.replace(':LogViewer:', ':HistoryChart:')), /This TWF is for HistoryChart, not LogViewer/);
  assert.throws(() => template.decodeTemplate(encoded.replace(':LogViewer:', ':')), /not LogViewer/);
  await assert.rejects(() => template.encodeTemplate({}), /Select a design or theme/);
});

test('community catalog excludes other widget families, other apps and headers without a widget family', async () => {
  const encoded = await template.encodeTemplate({ theme: { ...styles.BUILT_IN_THEMES[0], id: undefined } });
  const post = { id: 501, post_number: 4, raw: [
    encoded, encoded.replace(':LogViewer:', ':HistoryChart:'),
    encoded.replace(':SimpleSysLog:', ':OtherApp:'), encoded.replace(':LogViewer:', ':')
  ].join('\n') };
  const entries = catalog.entriesFromPost(post);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].text, encoded);
});

test('community catalog loads templates from the configured SSL topic', async () => {
  const encoded = await template.encodeTemplate({
    design: { name: 'Shared', fields: ['timestamp', 'message'], showDaySeparators: true, timestampFormat: 'HH:mm', daySeparatorFormat: 'date' }
  });
  const requests = [];
  const fetcher = async url => {
    requests.push(url);
    const body = url.includes('/posts.json')
      ? { post_stream: { posts: [{
        id: 501,
        post_number: 4,
        raw: `# Compact log\nA shared design.\n${encoded}`,
        username: 'community-user',
        created_at: '2026-01-01T00:00:00Z',
        actions_summary: [{ id: 2, count: 3 }]
      }] } }
      : { post_stream: { stream: [501], posts: [] } };
    return { ok: true, status: 200, text: async () => JSON.stringify(body) };
  };

  const results = await catalog.getCatalog(fetcher);
  assert.equal(catalog.topicId, 162351);
  assert.equal(results.length, 1);
  assert.equal(results[0].title, 'Compact log');
  assert.equal(results[0].template.design.name, 'Shared');
  assert.ok(requests[0].includes('/t/162351.json'));
  assert.ok(requests[1].includes('/t/162351/posts.json'));
});

test('widget API validates entry count, handles initial BLL absence, and formats returned fields', async () => {
  await assert.rejects(() => widgetApi.getWidgetLogs({
    homey: { app: { Log: { getLogs: async () => ({ logs: [] }) } } },
    query: { take: '0' }
  }), /at least 1/);
  assert.deepEqual(await widgetApi.getWidgetLogs({ homey: { app: {} }, query: { take: '25' } }), {
    available: false,
    logs: []
  });

  let receivedOptions;
  const response = await widgetApi.getWidgetLogs({
    homey: { app: { Log: { getLogs: async options => {
      receivedOptions = options;
      return { logs: [{
        timestamp: '2026-01-01T12:00:00Z',
        timestamp_formatted: { datetime: '2026-01-01 12:00', 'dd-MM-yyyy HH:mm': '01-01-2026 12:00' },
        severity: 3, facility: 16, app: 'Heating', hostname: 'Homey', message: 'Warm'
      }], count: 1 };
    } } } },
    query: { take: '1', timestampFormat: 'dd-MM-yyyy HH:mm' }
  });
  assert.equal(receivedOptions.take, 1);
  assert.equal(receivedOptions.timestampFormat, 'dd-MM-yyyy HH:mm');
  assert.equal(response.logs[0].severity, 'Error');
  assert.equal(response.logs[0].facility, 'Flow');
  assert.equal(response.logs[0].severityId, 3);
  assert.equal(response.logs[0].timestamp_formatted['dd-MM-yyyy HH:mm'], '01-01-2026 12:00');
  assert.equal(receivedOptions.maxSeverity, undefined);
  await widgetApi.getWidgetLogs({
    homey: { app: { Log: { getLogs: async options => { receivedOptions = options; return { logs: [], count: 0 }; } } } },
    query: { take: '1', skip: '10', timestampFormat: 'HH:mm', dayFormat: 'dddd' }
  });
  assert.equal(JSON.stringify(receivedOptions.timestampFormat), '["HH:mm","dddd"]');
  assert.equal(receivedOptions.skip, 10);
  await assert.rejects(() => widgetApi.getWidgetLogs({
    homey: { app: { Log: { getLogs: async () => ({ logs: [] }) } } },
    query: { take: '1', skip: '-1' }
  }), /non-negative whole number/);
  await assert.rejects(() => widgetApi.getWidgetLogs({
    homey: { app: { Log: { getLogs: async () => ({ logs: [] }) } } },
    query: { take: '1', skip: '1.5' }
  }), /non-negative whole number/);
});

test('widget API validates and forwards per-widget log filters', async () => {
  let receivedOptions;
  const homey = { app: { Log: { getLogs: async options => {
    receivedOptions = options;
    return { logs: [], count: 0 };
  } } } };
  await widgetApi.getWidgetLogs({
    homey,
    query: { take: '5', minSeverity: '4', facility: '16', app: ' Heat ', hostname: '' }
  });
  assert.equal(receivedOptions.maxSeverity, 4);
  assert.equal(receivedOptions.facility, 16);
  assert.equal(receivedOptions.app, 'Heat');
  assert.equal('hostname' in receivedOptions, false);
  await widgetApi.getWidgetLogs({ homey, query: { take: '5', facility: 'all' } });
  assert.equal('facility' in receivedOptions, false);
  await widgetApi.getWidgetLogs({ homey, query: { take: '5', dateFrom: '2026-11-17', dateTo: '2026-11-18' } });
  assert.equal(receivedOptions.timestamp_fromUTC, '2026-11-17');
  assert.equal(receivedOptions.timestamp_toUTC, '2026-11-18');
  await widgetApi.getWidgetLogs({ homey, query: { take: '5', dateFrom: '2026-11-17' } });
  assert.equal(receivedOptions.timestamp_fromUTC, '2026-11-17');
  assert.equal('timestamp_toUTC' in receivedOptions, false);
  await assert.rejects(() => widgetApi.getWidgetLogs({ homey, query: { take: '5', dateFrom: '2026-02-30' } }), /valid calendar date/);
  await assert.rejects(() => widgetApi.getWidgetLogs({ homey, query: { take: '5', dateFrom: '2026-11-18', dateTo: '2026-11-17' } }), /on or before/);
  await assert.rejects(() => widgetApi.getWidgetLogs({ homey, query: { take: '5', minSeverity: '8' } }), /minimum severity/);
  await assert.rejects(() => widgetApi.getWidgetLogs({ homey, query: { take: '5', facility: '1.5' } }), /facility/);
  await widgetApi.getWidgetLogs({ homey, query: { take: '5', minSeverity: '4', severities: '7,6,7' } });
  assert.deepEqual([...receivedOptions.severities], [6, 7]);
  assert.equal('maxSeverity' in receivedOptions, false);
  await assert.rejects(() => widgetApi.getWidgetLogs({ homey, query: { take: '5', severities: '6,8' } }), /levels/);
});

test('widget filter state is saved independently for each Homey widget instance', () => {
  const settings = new Map();
  const homey = { settings: { get: key => settings.get(key), set: (key, value) => settings.set(key, value) } };
  const instance = id => ({ homey, params: { instanceId: id } });
  assert.deepEqual(widgetApi.getWidgetFilterState(instance('widget-one')), { levels: [], from: null, to: null });
  assert.deepEqual(widgetApi.setWidgetFilterState({
    ...instance('widget-one'),
    body: { levels: [6, 3], from: '2026-11-17', to: '2026-11-18' }
  }), { saved: true });
  assert.deepEqual(widgetApi.getWidgetFilterState(instance('widget-one')),
    { levels: [3, 6], from: '2026-11-17', to: '2026-11-18' });
  assert.deepEqual(widgetApi.getWidgetFilterState(instance('widget-two')), { levels: [], from: null, to: null });
  assert.throws(() => widgetApi.setWidgetFilterState({
    ...instance('widget-one'), body: { levels: [8], from: null, to: null }
  }), /levels are invalid/);
  assert.throws(() => widgetApi.getWidgetFilterState(instance('../widget-two')), /instance ID is invalid/);
});

test('widget timestamp format registration is scoped to the widget instance', async () => {
  const registrations = new Map();
  const homey = { app: {
    registerWidgetTimestampFormat: (instanceId, format) => registrations.set(instanceId, format),
    unregisterWidgetTimestampFormat: instanceId => registrations.delete(instanceId)
  } };
  assert.deepEqual(await widgetApi.registerTimestampFormat({
    homey, body: { instanceId: 'widget-instance-1', formats: ['dd-MM-yyyy', 'dddd'] }
  }), { registered: true });
  assert.deepEqual(registrations.get('widget-instance-1'), ['dd-MM-yyyy', 'dddd']);
  assert.deepEqual(await widgetApi.unregisterTimestampFormat({
    homey, body: { instanceId: 'widget-instance-1' }
  }), { unregistered: true });
  assert.equal(registrations.has('widget-instance-1'), false);
});

test('custom datetime widget suggestions mirror the BLL format Flow autocomplete', async () => {
  const appFile = require.resolve('../app');
  const appRequire = createRequire(appFile);
  const listeners = {};
  const fakeBL = {
    isReady: true,
    datetime: {
      codes: { array: [
        { code: 'MyFormat', custom: true },
        { code: 'datetime', customisable: true },
        { code: 'HH:mm', customisable: true },
        { code: 'ss', customisable: false }
      ] },
      toString: (format, date) => `${format}:${date.getFullYear()}`
    }
  };
  const appModule = { exports: {} };
  vm.runInNewContext(fs.readFileSync(appFile, 'utf8'), {
    require: name => name === 'homey' ? { App: class {} }
      : name === 'betterlogiclibrary' ? { BL: fakeBL } : appRequire(name),
    module: appModule,
    Date,
    process
  }, { filename: appFile });

  const app = new appModule.exports();
  app.homey = {
    dashboards: {
      getWidget: id => {
        assert.equal(id, 'log_viewer');
        return { registerSettingAutocompleteListener: (setting, listener) => { listeners[setting] = listener; } };
      }
    },
    settings: { get: () => undefined },
    __: key => key
  };
  app.registerWidgetSettingAutocompletes();
  const presets = await listeners.datetimeFormat('', {});
  assert.equal(presets[0].id, '');
  assert.equal(presets[0].name, 'widgets.datetime.designFormat');
  assert.equal(presets.slice(1).map(item => item.name).join('|'),
    'MyFormat|datetime|HH:mm|dd-MM-yyyy|dd-MM-yyyy HH:mm|dd-MM-yyyy HH:mm:ss|HH:mm:ss');
  assert.ok(presets.slice(1).every(item => item.description.includes(':')));
  assert.equal((await listeners.datetimeFormat('hh:MM', {})).map(item => item.name).join('|'),
    'hh:MM|HH:mm|dd-MM-yyyy HH:mm|dd-MM-yyyy HH:mm:ss|HH:mm:ss');
  assert.equal((await listeners.datetimeFormat('HH:mm', {})).map(item => item.name).join('|'),
    'HH:mm|dd-MM-yyyy HH:mm|dd-MM-yyyy HH:mm:ss|HH:mm:ss');
  const custom = await listeners.datetimeFormat('yyyy-MM-dd HH:mm', {});
  assert.equal(custom[0].name, 'yyyy-MM-dd HH:mm');
  assert.equal(custom[0].id, 'yyyy-MM-dd HH:mm');
  assert.equal(custom[0].description, `yyyy-MM-dd HH:mm:${new Date().getFullYear()}`);

  const nl = require('../.homeycompose/locales/nl.json');
  app.homey.__ = key => key.split('.').reduce((value, part) => value[part], nl);
  assert.equal((await listeners.designStyle(nl.widgets.design.journal))[0].id, 'builtin:journal');
  assert.equal((await listeners.colorTheme(nl.widgets.theme.forest))[0].id, 'builtin:forest');

  assert.equal([...app.getWidgetTimestampFormats()].join(','), 'datetime');
  assert.throws(() => app.registerWidgetTimestampFormat('', 'datetime'), /instance ID/);
  assert.throws(() => app.registerWidgetTimestampFormat('widget-invalid', ''), /date and time format/);
  app.registerWidgetTimestampFormat('widget-one', 'dd-MM-yyyy');
  app.registerWidgetTimestampFormat('widget-two', 'dd-MM-yyyy');
  app.registerWidgetTimestampFormat('widget-three', ['yyyy/MM/dd', 'dddd']);
  assert.equal([...app.getWidgetTimestampFormats()].join(','), 'datetime,dd-MM-yyyy,yyyy/MM/dd,dddd');
  app.unregisterWidgetTimestampFormat('widget-one');
  assert.equal([...app.getWidgetTimestampFormats()].join(','), 'datetime,dd-MM-yyyy,yyyy/MM/dd,dddd');
  app.unregisterWidgetTimestampFormat('widget-two');
  app.unregisterWidgetTimestampFormat('widget-three');
  assert.equal([...app.getWidgetTimestampFormats()].join(','), 'datetime');
});

test('simple and advanced widget search match app, host, and message fields', () => {
  const log = { message: 'Kitchen window is open', app: 'Climate Flow', hostname: 'Homey Pro' };
  assert.equal(search.matches(log, 'window', 'simple'), true);
  assert.equal(search.matches(log, 'Climate', 'simple'), true);
  assert.equal(search.matches(log, 'AND', 'simple'), false);
  assert.equal(search.matches(log, 'window AND Climate', 'advanced'), true);
  assert.equal(search.matches(log, 'window OR missing', 'advanced'), true);
  assert.equal(search.matches(log, 'window AND NOT closed', 'advanced'), true);
  assert.equal(search.matches(log, '(window OR door) AND "Homey Pro"', 'advanced'), true);
  assert.throws(() => search.matches(log, 'window AND (door', 'advanced'), /parenthesis/);
  const entries = [log, { message: 'Door closed', app: 'Security', hostname: 'Hall' }, { message: 'Window closed', app: 'Climate Flow' }];
  for (const mode of ['simple', 'advanced']) {
    for (const query of ['  ', 'CLIMATE', '(window OR door) AND NOT closed', '"Homey Pro"']) {
      assert.deepEqual(entries.filter(search.compile(query, mode)), entries.filter(entry => search.matches(entry, query, mode)));
    }
  }
  assert.throws(() => search.compile('window AND (door', 'advanced'), /parenthesis/);
});


test('widget waits for the Homey widget API before bootstrapping Angular', () => {
  const source = fs.readFileSync(require.resolve('../assets/js/ssl-widget.js'), 'utf8');
  const calls = [];
  const angular = {
    module: () => ({
      directive: name => calls.push(['directive', name]),
      controller: (name, definition) => calls.push(['controller', name, typeof definition.at(-1)])
    }),
    bootstrap: (_document, modules) => calls.push(['bootstrap', modules.join(',')])
  };
  const context = vm.createContext({ angular, document: {} });
  vm.runInContext(source, context);
  assert.equal(calls.length, 0);
  assert.equal(typeof context.onHomeyReady, 'function');

  context.onHomeyReady({ getSettings: () => ({}) });
  assert.equal(JSON.stringify(calls), JSON.stringify([
    ['directive', 'sslWidgetStyle'],
    ['directive', 'sslLogCard'],
    ['directive', 'sslDaySeparator'],
    ['directive', 'sslControlLayout'],
    ['controller', 'SSLLogWidgetController', 'function'],
    ['bootstrap', 'sslLogWidget']
  ]));
});

test('widget applies and replaces frame and theme CSS properties', () => {
  const source = fs.readFileSync(require.resolve('../assets/js/ssl-widget.js'), 'utf8');
  let factory;
  const angular = {
    module: () => ({
      directive: (name, fn) => { if (name === 'sslWidgetStyle') factory = fn; },
      controller() {}
    }),
    bootstrap() {}
  };
  const context = vm.createContext({ angular, document: {} });
  vm.runInContext(source, context);
  context.onHomeyReady({ getSettings: () => ({}) });
  const values = { unrelated: 'preserved' };
  const style = {
    setProperty(name, value) { values[name] = value; },
    removeProperty(name) { delete values[name]; }
  };
  let update;
  factory().link({ $watch(name, listener) { assert.equal(name, 'themeStyle'); update = listener; } },
    [{ style }], { sslWidgetStyle: 'themeStyle' });
  update({ '--ssl-outline-width': '3px', '--ssl-widget-padding-bottom': '24px',
    'background-image': 'linear-gradient(red, blue)' });
  assert.deepEqual(values, { unrelated: 'preserved', '--ssl-outline-width': '3px',
    '--ssl-widget-padding-bottom': '24px', 'background-image': 'linear-gradient(red, blue)' });
  update({ '--ssl-outline-width': '0px' });
  assert.deepEqual(values, { unrelated: 'preserved', '--ssl-outline-width': '0px' });
});

test('widget explains that BLL is required when its AngularJS file is unavailable', () => {
  const source = fs.readFileSync(require.resolve('../assets/js/ssl-widget.js'), 'utf8');
  let shown;
  let ready;
  const document = {
    createElement: () => ({ setAttribute() {}, appendChild(child) { this.child = child; } }),
    body: { replaceChildren: main => { shown = main.child.textContent; } }
  };
  const context = vm.createContext({ document });
  vm.runInContext(source, context);
  context.onHomeyReady({
    __: key => `translated:${key}`,
    getSettings: () => ({ height: 50 }),
    ready: options => { ready = options; }
  });
  assert.equal(shown, 'translated:widgets.bllNotInstalled');
  assert.equal(ready.height, 100);
});

test('widget applies its height and filters to loaded and realtime entries', async () => {
  const source = fs.readFileSync(require.resolve('../assets/js/ssl-widget.js'), 'utf8');
  let controller;
  const angular = {
    module: () => ({ directive() {}, controller: (_name, definition) => { controller = definition.at(-1); } }),
    bootstrap() {}
  };
  const handlers = {};
  const logRequests = [];
  let readyOptions;
  const homey = {
    __: () => '',
    getSettings: () => ({ entryCount: 25, height: 9000, minSeverity: '4', facility: 'all', appFilter: ' Heat ', hostnameFilter: '' }),
    getWidgetInstanceId: () => 'widget-1',
    on: (event, handler) => { handlers[event] = handler; },
    ready: options => { readyOptions = options; },
    api(method, path, body) {
      if (path === '/filter-state/widget-1' && method === 'GET') {
        return Promise.resolve({ levels: [], from: null, to: null });
      }
      if (path === '/filter-state/widget-1' && method === 'PUT') {
        filterStates.push(body);
        return Promise.resolve({ saved: true });
      }
      if (path === '/register-timestamp-format') return Promise.resolve({ registered: true });
      if (path === '/styles') return Promise.resolve(styles.getWidgetStyles({ settings: { get: () => undefined } }));
      logRequests.push(path);
      return Promise.resolve({ available: true, logs: [], severities: {}, facilities: {} });
    }
  };
  const filterStates = [];
  const context = vm.createContext({
    angular,
    document: { addEventListener() {}, getElementById: () => null },
    window: { SSLWidgetSearch: search, SSLWidgetLayout: layout },
    console
  });
  vm.runInContext(source, context);
  context.onHomeyReady(homey);
  const scope = { $applyAsync: fn => fn && fn(), $on() {} };
  controller(scope, () => {});
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(readyOptions.height, 5000);
  assert.equal(scope.paging, false);
  assert.equal(scope.showFilters, true);
  scope.toggleFilterMenu();
  scope.openFilterGroup('date');
  assert.equal(scope.filterMenu.open, true);
  assert.equal(scope.filterMenu.date, true);
  assert.equal(scope.filterMenu.level, false);
  scope.openFilterGroup('level');
  assert.equal(scope.filterMenu.open, true);
  assert.equal(scope.filterMenu.level, true);
  assert.equal(scope.filterMenu.date, false);
  scope.openFilterGroup('date');
  scope.openFilterGroup('date');
  assert.equal(scope.filterMenu.open, true);
  assert.equal(scope.filterMenu.date, true);
  assert.equal(scope.filterMenu.level, false);
  scope.toggleFilterMenu();
  assert.equal(logRequests[0], '/logs?take=25&timestampFormat=timeshort&dayFormat=ddd%20d%20MMM&minSeverity=4&app=Heat');
  const formatted = { datetime: 'formatted' };
  handlers.log_updated({ timestamp: '2026-11-17T09:00:00.000Z', severity: 6, app: 'Heating', message: 'info', timestamp_formatted: formatted });
  handlers.log_updated({ timestamp: '2026-11-17T09:01:00.000Z', severity: 3, app: 'Lights', message: 'other app', timestamp_formatted: formatted });
  handlers.log_updated({ timestamp: '2026-11-17T09:02:00.000Z', severity: 3, app: 'Heating', message: 'shown', timestamp_formatted: formatted });
  assert.equal(JSON.stringify(scope.logs.map(log => log.message)), JSON.stringify(['shown']));
  scope.dateFilter.from = new Date(2026, 10, 17);
  scope.dateFilter.to = new Date(2026, 10, 17);
  scope.dateRangeChanged();
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(logRequests[1].endsWith('&dateFrom=2026-11-17&dateTo=2026-11-17'));
  assert.deepEqual(JSON.parse(JSON.stringify(filterStates[0])), { levels: [], from: '2026-11-17', to: '2026-11-17' });
  scope.toggleLevel(3);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(JSON.parse(JSON.stringify(filterStates[1])), { levels: [3], from: '2026-11-17', to: '2026-11-17' });
  assert.ok(logRequests[2].endsWith('&dateFrom=2026-11-17&dateTo=2026-11-17&severities=3'));
  handlers.log_updated({ timestamp: new Date(2026, 10, 17, 12).toISOString(), severity: 3, app: 'Heating', message: 'inside',
    timestamp_formatted: { datetime: 'formatted' } });
  handlers.log_updated({ timestamp: new Date(2026, 10, 16, 12).toISOString(), severity: 3, app: 'Heating', message: 'outside',
    timestamp_formatted: { datetime: 'formatted' } });
  assert.deepEqual(scope.logs.map(log => log.message), ['inside']);
  const requestsBeforeInvalidRange = logRequests.length;
  scope.dateFilter.from = new Date(2026, 10, 18);
  scope.dateRangeChanged();
  assert.equal(logRequests.length, requestsBeforeInvalidRange);
  assert.ok(scope.dateFilterError);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  scope.dateFilter = { from: today, to: today };
  scope.dateRangeChanged();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(scope.dateFilterError, '');
  assert.equal(scope.maxFromDate(), scope.todayDate());
  const requestsBeforeFutureDate = logRequests.length;
  const savesBeforeFutureDate = filterStates.length;
  for (const bound of ['from', 'to']) {
    scope.dateFilter = { from: null, to: null };
    scope.dateFilter[bound] = tomorrow;
    scope.dateRangeChanged();
    scope.toggleLevel(4);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(scope.dateFilterError, 'Dates cannot be later than today.');
    assert.equal(logRequests.length, requestsBeforeFutureDate);
    assert.equal(filterStates.length, savesBeforeFutureDate);
  }
  scope.dateFilter = { from: null, to: new Date(2026, 10, 17) };
  assert.equal(scope.maxFromDate(), '2026-11-17');
});

test('live and visibility updates keep five entries and follow the top only within 24 px in both scrollers', async () => {
  const source = fs.readFileSync(require.resolve('../assets/js/ssl-widget.js'), 'utf8');
  for (const paging of [false, true]) {
    for (const pageScroll of [false, true]) {
      for (const initialTop of [0, 24, 25, 100]) {
        let controller;
        const events = {};
        const documentEvents = {};
        const frames = [];
        let geometryReads = 0;
        let anchorPosition = 150;
        const page = { scrollTop: initialTop };
        const list = {
          scrollTop: initialTop,
          getBoundingClientRect: () => { geometryReads++; return { top: 0 }; },
          querySelectorAll: () => [anchor],
          contains: node => node === anchor
        };
        const scroller = pageScroll ? page : list;
        const anchor = { getBoundingClientRect: () => { geometryReads++; return ({
          top: anchorPosition - scroller.scrollTop, bottom: anchorPosition - scroller.scrollTop + 40
        }); } };
        const entry = id => ({ id, timestamp: '2026-11-18T10:00:00.000Z', severity: 6, app: 'Example',
          message: 'Entry ' + id, timestamp_formatted: { timeshort: '10:00' } });
        const homey = {
          __: () => '',
          getSettings: () => ({ entryCount: 5, paging }),
          getWidgetInstanceId: () => 'live-limit',
          on: (name, handler) => { events[name] = handler; },
          ready() {},
          api(method, path) {
            if (path === '/filter-state/live-limit') return Promise.resolve({ levels: [], from: null, to: null });
            if (path === '/styles') return Promise.resolve(styles.getWidgetStyles({ settings: { get: () => undefined } }));
            if (path === '/register-timestamp-format') return Promise.resolve({ registered: true });
            if (path.startsWith('/logs?')) {
              return Promise.resolve({ available: true, logs: Array.from({ length: 6 }, (_, index) => entry(index)) });
            }
            throw new Error('Unexpected request: ' + path);
          }
        };
        const context = vm.createContext({
          angular: {
            module: () => ({ directive() {}, controller: (_name, definition) => { controller = definition.at(-1); } }),
            bootstrap() {}
          },
          document: {
            hidden: false,
            documentElement: { classList: { contains: () => pageScroll } },
            scrollingElement: page,
            getElementById: () => list,
            querySelector: () => ({ getBoundingClientRect: () => ({ bottom: 30 }) }),
            addEventListener: (name, handler) => { documentEvents[name] = handler; }
          },
          window: { SSLWidgetSearch: search, SSLWidgetLayout: layout, requestAnimationFrame: callback => frames.push(callback) },
          console
        });
        vm.runInContext(source, context);
        context.onHomeyReady(homey);
        const scope = { $applyAsync: fn => fn && fn(), $on() {} };
        controller(scope, () => {});
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(scope.logs.length, 5);
        for (const id of [10, 11, 12]) {
          events.log_updated(entry(id));
          anchorPosition += 40;
          assert.equal(scope.logs.length, 5);
          assert.equal(scope.filteredLogs.length, 5);
        }
        assert.equal(scope.logs.map(log => log.id).join(','), '12,11,10,0,1');
        assert.equal(geometryReads, initialTop <= 24 ? 0 : pageScroll ? 2 : 3,
          'live bursts must skip anchor measurements while following the top or awaiting scroll restoration');
        frames.splice(0).forEach(frame => frame());
        assert.equal(scroller.scrollTop, initialTop <= 24 ? 0 : initialTop + 120);
        events.log_updated(entry(12));
        assert.equal(scope.logs.length, 5);
        assert.equal(frames.length, 0);
        documentEvents.visibilitychange();
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(scope.logs.length, 5);
        assert.equal(scope.filteredLogs.length, 5);
        assert.equal(scope.hasNextPage, paging);
      }
    }
  }
});

test('widget restores its instance filters before the first log request', async () => {
  const source = fs.readFileSync(require.resolve('../assets/js/ssl-widget.js'), 'utf8');
  let controller;
  const angular = {
    module: () => ({ directive() {}, controller: (_name, definition) => { controller = definition.at(-1); } }),
    bootstrap() {}
  };
  const saved = { levels: [3, 6], from: '2026-11-17', to: '2026-11-18' };
  let releaseFilters;
  const pendingFilters = new Promise(resolve => { releaseFilters = resolve; });
  let stylesRequested = false;
  const logRequests = [];
  const homey = {
    __: () => '',
    getSettings: () => ({ entryCount: 25 }),
    getWidgetInstanceId: () => 'widget-restore',
    on() {},
    ready() {},
    api(method, path) {
      if (path === '/filter-state/widget-restore') return pendingFilters;
      if (path === '/register-timestamp-format') return Promise.resolve({ registered: true });
      if (path === '/styles') {
        stylesRequested = true;
        return Promise.resolve(styles.getWidgetStyles({ settings: { get: () => undefined } }));
      }
      logRequests.push(path);
      return Promise.resolve({ available: true, logs: [], severities: {}, facilities: {} });
    }
  };
  const context = vm.createContext({
    angular,
    document: { addEventListener() {}, getElementById: () => null },
    window: { SSLWidgetSearch: search, SSLWidgetLayout: layout },
    console
  });
  vm.runInContext(source, context);
  context.onHomeyReady(homey);
  const scope = { $applyAsync: fn => fn && fn(), $on() {} };
  controller(scope, () => {});
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(stylesRequested, true, 'styles need not wait for saved filters');
  assert.deepEqual(logRequests, [], 'logs must still wait for saved filters');
  releaseFilters(saved);
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(scope.selectedLevelCount(), 2);
  assert.equal(scope.hasDateFilter(), true);
  assert.ok(logRequests[0].includes('&dateFrom=2026-11-17&dateTo=2026-11-18&severities=3%2C6'));
  const timestamp = '2026-11-18T10:00:00.000Z';
  const expectedDay = new Date(timestamp).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  assert.equal(scope.formatDay({ timestamp }), expectedDay);
  assert.equal(scope.formatDay({ timestamp }), expectedDay);
  assert.equal(scope.formatDay({ timestamp: 'invalid' }), '');
});

test('widget paging is opt-in and requests adjacent pages; search and filters can be hidden independently', async () => {
  const source = fs.readFileSync(require.resolve('../assets/js/ssl-widget.js'), 'utf8');
  let controller;
  const angular = {
    module: () => ({ directive() {}, controller: (_name, definition) => { controller = definition.at(-1); } }),
    bootstrap() {}
  };
  const logRequests = [];
  const entries = (start, length) => Array.from({ length }, (_, index) => ({
    id: `${start + index}`,
    timestamp: `2026-11-18T10:${String(start + index).padStart(2, '0')}:00.000Z`,
    timestamp_formatted: { datetime: 'formatted', timeshort: '10:00' },
    severity: 6,
    facility: 1,
    message: `entry ${start + index}`
  }));
  const homey = {
    __: () => '',
    getSettings: () => ({ entryCount: 2, paging: true, searchMode: 'none', showFilters: false }),
    getWidgetInstanceId: () => 'widget-page',
    on() {},
    ready() {},
    api(method, path) {
      if (path === '/filter-state/widget-page') return Promise.resolve({ levels: [3], from: '2026-11-18', to: null });
      if (path === '/register-timestamp-format') return Promise.resolve({ registered: true });
      if (path === '/styles') return Promise.resolve(styles.getWidgetStyles({ settings: { get: () => undefined } }));
      logRequests.push(path);
      return Promise.resolve({
        available: true,
        logs: path.includes('skip=2') ? entries(2, 1) : entries(0, 3),
        severities: {},
        facilities: {}
      });
    }
  };
  const context = vm.createContext({
    angular,
    document: { addEventListener() {}, getElementById: () => null },
    window: { SSLWidgetSearch: search, SSLWidgetLayout: layout },
    console
  });
  vm.runInContext(source, context);
  context.onHomeyReady(homey);
  const scope = { $applyAsync: fn => fn && fn(), $on() {} };
  controller(scope, () => {});
  const settle = () => new Promise(resolve => setImmediate(resolve));
  await settle();

  assert.equal(scope.searchMode, 'none');
  assert.equal(scope.showSearch, false);
  assert.equal(scope.showFilters, false);
  assert.equal(scope.showToolbar, false);
  assert.equal(scope.logs.length, 2);
  assert.equal(scope.hasNextPage, true);
  assert.ok(logRequests[0].includes('take=3'));
  assert.ok(logRequests[0].includes('&skip=0'));
  assert.ok(!logRequests[0].includes('dateFrom='));
  assert.ok(!logRequests[0].includes('severities='));

  scope.nextPage();
  await settle();
  assert.equal(scope.pageIndex, 1);
  assert.equal(scope.logs.length, 1);
  assert.equal(scope.hasNextPage, false);
  assert.ok(logRequests[1].includes('&skip=2'));

  scope.previousPage();
  await settle();
  assert.equal(scope.pageIndex, 0);
  assert.ok(logRequests[2].includes('&skip=0'));
});

async function runWidgetStorageScenario(storageReadyDuringLoad) {
  const source = fs.readFileSync(require.resolve('../assets/js/ssl-widget.js'), 'utf8');
  let controller;
  const angular = {
    module: () => ({ directive() {}, controller: (_name, definition) => { controller = definition.at(-1); } }),
    bootstrap() {}
  };
  const handlers = {};
  let available = false;
  let resolveFirstLogs;
  const logRequests = [];
  const homey = {
    __: () => '',
    getSettings: () => ({ entryCount: 25 }),
    getWidgetInstanceId: () => 'widget-1',
    on: (event, handler) => { handlers[event] = handler; },
    ready() {},
    api(method, path) {
      if (path === '/filter-state/widget-1') return Promise.resolve({ levels: [], from: null, to: null });
      if (path === '/register-timestamp-format') return Promise.resolve({ registered: true });
      if (path === '/styles') return Promise.resolve(styles.getWidgetStyles({ settings: { get: () => undefined } }));
      logRequests.push(path);
      const data = available
        ? { available: true, logs: [{ id: 1, timestamp: '2026-11-17T09:00:00.000Z', severity: 6, facility: 1, message: 'ready',
          timestamp_formatted: { datetime: 'formatted' } }], severities: {}, facilities: {} }
        : { available: false, logs: [] };
      if (logRequests.length === 1 && storageReadyDuringLoad) {
        return new Promise(resolve => { resolveFirstLogs = () => resolve(data); });
      }
      return Promise.resolve(data);
    }
  };
  const context = vm.createContext({ angular, document: { addEventListener() {} }, window: { SSLWidgetSearch: search, SSLWidgetLayout: layout }, console });
  vm.runInContext(source, context);
  context.onHomeyReady(homey);
  const scope = { $applyAsync: fn => fn && fn(), $on() {} };
  controller(scope, () => {});
  const settle = () => new Promise(resolve => setImmediate(resolve));
  await settle();
  if (storageReadyDuringLoad) {
    available = true;
    handlers.log_storage_ready({ ready: true });
    available = false;
    resolveFirstLogs();
    available = true;
  } else {
    assert.equal(scope.bllUnavailable, true);
    available = true;
    handlers.log_storage_ready({ ready: true });
  }
  await settle();
  await settle();
  return { scope, logRequests };
}

test('widget loads the logs when BLL storage becomes ready after the widget loaded', async () => {
  const { scope, logRequests } = await runWidgetStorageScenario(false);
  assert.equal(logRequests.length, 2);
  assert.equal(scope.bllUnavailable, false);
  assert.equal(scope.loading, false);
  assert.equal(scope.logs.length, 1);
});

test('widget reloads when BLL storage becomes ready during its initial load', async () => {
  const { scope, logRequests } = await runWidgetStorageScenario(true);
  assert.equal(logRequests.length, 2);
  assert.equal(scope.bllUnavailable, false);
  assert.equal(scope.logs.length, 1);
});

test('widget layout places columns per row and in a shared grid when a column spans rows', () => {
  const column = (span, elements, extra) => ({ span, rowSpan: 1, align: 'left', valign: 'top', direction: 'horizontal', width: 'span', elements, ...extra });
  const flat = layout.computeLayout({ rows: [{ padding: 0, columns: [column(1, ['timestamp'], { width: 'content' }), column(2, ['message'])] }] });
  assert.equal(flat.spanning, false);
  assert.equal(flat.rows[0].template, 'auto minmax(0, 2fr) minmax(0, 2fr)');

  const spanning = layout.computeLayout({ rows: [
    { padding: 0, columns: [column(1, ['severity'], { rowSpan: 2 }), column(3, ['timestamp'])] },
    { padding: 0, columns: [column(3, ['message'])] }
  ] });
  assert.equal(spanning.spanning, true);
  assert.deepEqual(spanning.cells.map(cell => [cell.gridColumn, cell.gridRow]), [['1 / span 1', '1 / span 2'], ['2 / span 3', '1 / span 1'], ['2 / span 3', '2 / span 1']]);
  assert.equal(spanning.tracks.split(' ')[0], 'auto');
  assert.deepEqual(layout.usedElements({ rows: [{ columns: [column(4, ['app', 'message'])] }] }), ['app', 'message']);
});
