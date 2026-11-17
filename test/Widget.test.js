'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createRequire } = require('node:module');
const test = require('node:test');
const vm = require('node:vm');

const styles = require('../lib/widget-styles');
const template = require('../lib/widget-template');
const catalog = require('../lib/widget-template-catalog');
const search = require('../assets/js/ssl-widget-search');
const layout = require('../assets/js/ssl-widget-layout');
const widgetApi = require('../widgets/log_viewer/api');

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
  assert.throws(() => styles.validateTheme({ name: 'T', id: 't', colors: { ...colors, frame: 'red' } }), /Invalid widget theme/);
  assert.throws(() => styles.validateTheme({ name: 'T', id: 't', colors: { ...colors, surface: undefined } }), /Invalid widget theme/);
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
    themes: [{ id: 'bad', name: 'Bad', colors: { ...styles.BUILT_IN_THEMES[0].colors, text: '#ff0000' } }]
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
    design: { ...styles.BUILT_IN_DESIGNS[0], id: undefined },
    theme: { ...styles.BUILT_IN_THEMES[0], id: undefined }
  };
  const encoded = await template.encodeTemplate(value);
  assert.match(encoded, /^\[twf:SimpleSysLog:DESIGN,THEME:/);
  const expected = {
    design: styles.validateDesign(value.design, { allowMissingId: true }),
    theme: styles.validateTheme(value.theme, { allowMissingId: true })
  };
  assert.deepEqual(template.decodeTemplate(encoded), expected);
  const legacy = Buffer.from(JSON.stringify({ version: 1, ...expected })).toString('base64');
  assert.ok(encoded.length < legacy.length / 2);
  assert.deepEqual(template.decodeTemplate(`[twf:SimpleSysLog:DESIGN,THEME:"${legacy}":/twf]`), expected);
  assert.throws(() => template.decodeTemplate('[twf:SimpleSysLog:DESIGN:"not-base64":/twf]'), /Invalid template/);
  assert.throws(() => template.decodeTemplate(encoded.replace('twf:SimpleSysLog:', 'twf:Chronograph:')), /This TWF is for Chronograph/);
  await assert.rejects(() => template.encodeTemplate({}), /Select a design or theme/);
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
    query: { take: '1', timestampFormat: 'HH:mm', dayFormat: 'dddd' }
  });
  assert.equal(JSON.stringify(receivedOptions.timestampFormat), '["HH:mm","dddd"]');
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
  await assert.rejects(() => widgetApi.getWidgetLogs({ homey, query: { take: '5', minSeverity: '8' } }), /minimum severity/);
  await assert.rejects(() => widgetApi.getWidgetLogs({ homey, query: { take: '5', facility: '1.5' } }), /facility/);
  await widgetApi.getWidgetLogs({ homey, query: { take: '5', minSeverity: '4', severities: '7,6,7' } });
  assert.deepEqual([...receivedOptions.severities], [6, 7]);
  assert.equal('maxSeverity' in receivedOptions, false);
  await assert.rejects(() => widgetApi.getWidgetLogs({ homey, query: { take: '5', severities: '6,8' } }), /levels/);
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
    ['directive', 'sslLogCard'],
    ['directive', 'sslDaySeparator'],
    ['controller', 'SSLLogWidgetController', 'function'],
    ['bootstrap', 'sslLogWidget']
  ]));
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
    api(method, path) {
      if (path === '/register-timestamp-format') return Promise.resolve({ registered: true });
      if (path === '/styles') return Promise.resolve(styles.getWidgetStyles({ settings: { get: () => undefined } }));
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

  assert.equal(readyOptions.height, 5000);
  assert.equal(logRequests[0], '/logs?take=25&timestampFormat=timeshort&dayFormat=ddd%20d%20MMM&minSeverity=4&app=Heat');
  const formatted = { datetime: 'formatted' };
  handlers.log_updated({ timestamp: '2026-11-17T09:00:00.000Z', severity: 6, app: 'Heating', message: 'info', timestamp_formatted: formatted });
  handlers.log_updated({ timestamp: '2026-11-17T09:01:00.000Z', severity: 3, app: 'Lights', message: 'other app', timestamp_formatted: formatted });
  handlers.log_updated({ timestamp: '2026-11-17T09:02:00.000Z', severity: 3, app: 'Heating', message: 'shown', timestamp_formatted: formatted });
  assert.equal(JSON.stringify(scope.logs.map(log => log.message)), JSON.stringify(['shown']));
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
