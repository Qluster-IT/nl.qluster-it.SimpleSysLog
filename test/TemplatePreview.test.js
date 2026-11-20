'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');
const layout = require('../assets/js/ssl-widget-layout');
const styles = require('../lib/widget-styles');
const search = require('../assets/js/ssl-widget-search');
const facilities = require('../assets/js/ssl-facilities');

function previewHarness(capture, extraExports = '', globals = {}) {
  const document = { canvasTexts: [], canvasBackgrounds: [] };
  function node(tag) {
    const item = {
      tag, children: [], className: '', value: '', checked: false, attributes: {}, listeners: {},
      style: { setProperty(key, value) { this[key] = value; }, removeProperty(key) { delete this[key]; } },
      classList: {
        contains(name) { return item.className.split(' ').includes(name); },
        add(...names) { item.className = [...new Set(item.className.split(' ').filter(Boolean).concat(names))].join(' '); },
        remove(...names) { item.className = item.className.split(' ').filter(name => !names.includes(name)).join(' '); },
        toggle(name, force) {
          const enabled = force === undefined ? !this.contains(name) : force;
          this[enabled ? 'add' : 'remove'](name);
          return enabled;
        }
      },
      setAttribute(key, value) { this.attributes[key] = String(value); },
      getAttribute(key) { return this.attributes[key]; },
      removeAttribute(key) {
        delete this.attributes[key];
        if (key === 'style') Object.keys(this.style).filter(name => typeof this.style[name] !== 'function')
          .forEach(name => { delete this.style[name]; });
      },
      addEventListener(name, listener) { this.listeners[name] = listener; },
      appendChild(child) { child.remove(); this.children.push(child); child.parentNode = this; return child; },
      append(...children) { children.forEach(child => this.appendChild(child)); },
      prepend(child) { child.remove(); this.children.unshift(child); child.parentNode = this; },
      replaceWith(child) {
        child.remove();
        const parent = this.parentNode;
        parent.children.splice(parent.children.indexOf(this), 1, child);
        child.parentNode = parent;
        this.parentNode = null;
      },
      remove() {
        if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(child => child !== this);
        this.parentNode = null;
      },
      replaceChildren(...children) { this.children.slice().forEach(child => child.remove()); this.append(...children); },
      querySelectorAll(selector) {
        const selectors = selector.split(',').map(value => value.trim());
        return this.children.flatMap(child => [
          ...(selectors.some(value => value.startsWith('.') ? child.classList.contains(value.slice(1)) : child.tag === value)
            ? [child] : []),
          ...child.querySelectorAll(selector)
        ]);
      },
      querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
      ownerDocument: document
    };
    if (tag === 'canvas') {
      item.getContext = () => ({
        fillRect() { document.canvasBackgrounds.push(this.fillStyle); },
        fillText(text) { document.canvasTexts.push(text); }, drawImage() {}
      });
      item.toDataURL = () => 'data:image/png;base64,preview';
    }
    return item;
  }
  document.createElement = node;
  document.createElementNS = (_namespace, tag) => node(tag);
  document.createTextNode = text => Object.assign(node('#text'), { textContent: text });
  document.body = node('body');
  const nodes = { 'template-image-progress': node('p') };
  document.getElementById = id => nodes[id] || (nodes[id] = node('div'));
  const window = { SSLWidgetLayout: layout, SSLWidgetSearch: search, SSLFacilities: facilities,
    htmlToImage: { toCanvas: capture }, ...globals.window };
  window.parent = window;
  const source = fs.readFileSync(require.resolve('../settings/widgets.js'), 'utf8')
    .replace('window.SSLWidgetDesigner = {',
      'window.SSLWidgetDesigner = { renderWidgetPreview, templatePreviewImages,' + extraExports);
  vm.runInNewContext(source, { document, setTimeout, clearTimeout, ...globals, window });
  return { document, ...window.SSLWidgetDesigner };
}

test('template images zoom at the wheel pointer and support mouse panning only when zoomed', () => {
  const { document, bindTemplateImageViewer } = previewHarness(() => {}, 'bindTemplateImageViewer,');
  const viewport = document.getElementById('template-image-viewport');
  const image = document.getElementById('template-image-full');
  viewport.getBoundingClientRect = () => ({ left: 10, top: 20 });
  image.getBoundingClientRect = () => ({ width: 400 * (parseFloat(image.style.width || '100') / 100) });
  viewport.scrollLeft = viewport.scrollTop = 0;
  let captured;
  viewport.setPointerCapture = id => { captured = id; };
  viewport.hasPointerCapture = id => captured === id;
  viewport.releasePointerCapture = () => { captured = undefined; };
  bindTemplateImageViewer();

  const fire = (type, options) => {
    let prevented = false;
    viewport.listeners[type]({ ...options, cancelable: true, preventDefault() { prevented = true; } });
    return prevented;
  };
  const mouse = { pointerType: 'mouse', button: 0, pointerId: 1, clientX: 110, clientY: 220 };
  assert.equal(fire('pointerdown', mouse), false);
  const wheel = { deltaY: -Math.log(2) / 0.0015, clientX: 110, clientY: 220 };
  assert.equal(fire('wheel', wheel), false);
  assert.equal(viewport.scrollTop, 0);
  assert.equal(fire('wheel', { ...wheel, ctrlKey: true }), true);
  assert.equal(document.getElementById('template-image-scale').textContent, '200%');
  assert.equal(viewport.scrollLeft, 100);
  assert.equal(viewport.scrollTop, 200);
  assert.ok(viewport.classList.contains('template-image-zoomed'));
  assert.equal(fire('pointerdown', { ...mouse, pointerType: 'touch' }), false);
  assert.equal(fire('pointerdown', mouse), true);
  assert.equal(captured, 1);
  assert.ok(viewport.classList.contains('template-image-dragging'));
  fire('pointermove', { ...mouse, clientX: 80, clientY: 180 });
  assert.equal(viewport.scrollLeft, 130);
  assert.equal(viewport.scrollTop, 240);
  fire('pointercancel', mouse);
  assert.equal(captured, undefined);
  assert.ok(!viewport.classList.contains('template-image-dragging'));
});

test('gradient and element color pickers show and update the swatch beside their label', () => {
  const { document, addColorSelect, elementDefaultColor, setRoot } = previewHarness(() => {},
    'addColorSelect, elementDefaultColor, setRoot: function (node) { root = node; },');
  setRoot(document.body);
  const row = document.createElement('div');
  document.body.appendChild(row);
  const gradient = layout.gradientEndColor('#00838F');
  assert.ok(layout.widgetStyle({}, { colors: { background: '#00838F' }, backgroundGradient: true })
    ['background-image'].endsWith(gradient + ')'));
  const changes = [];
  const select = addColorSelect(row, 'background-gradient-end', 'Gradient end color',
    [['automatic', 'App default'], ['purple', 'Purple']], 'automatic', gradient, value => changes.push(value));
  const label = row.querySelector('label');
  const dot = label.children[0];
  assert.equal(label.htmlFor, select.id);
  assert.ok(dot.classList.contains('color-swatch'));
  assert.equal(dot.style.backgroundColor, gradient);

  select.value = 'purple';
  select.listeners.change();
  assert.equal(dot.style.backgroundColor, 'var(--ssl-color-purple)');
  select.value = 'hex';
  select.listeners.change();
  const [hex, picker] = row.querySelectorAll('input');
  const previous = dot.style.backgroundColor;
  hex.value = '#12';
  hex.listeners.input();
  assert.equal(dot.style.backgroundColor, previous);
  picker.value = '#123456';
  picker.listeners.input();
  assert.equal(dot.style.backgroundColor, '#123456');
  assert.equal(changes.at(-1), '#123456');
  select.value = 'automatic';
  select.listeners.change();
  assert.equal(dot.style.backgroundColor, gradient);

  const elementRow = document.createElement('div');
  addColorSelect(elementRow, 'element-color', 'Color', [['default', 'App default']], 'default',
    elementDefaultColor('timestamp', 'color', 'warning'), () => {});
  assert.equal(elementRow.querySelector('label').children[0].style.backgroundColor, 'var(--ssl-muted)');
});

test('community catalog saves the sort order and restores it in a new settings page', async () => {
  let saved = 'unrecognized';
  let writeError = null;
  const homey = {
    get(key, callback) {
      assert.equal(key, 'widgetTemplateCatalogSort');
      callback(null, saved);
    },
    set(key, value, callback) {
      assert.equal(key, 'widgetTemplateCatalogSort');
      if (!writeError) saved = value;
      callback(writeError);
    }
  };
  function openSettings() {
    const harness = previewHarness(() => {}, `
      loadCatalogSort, saveCatalogSort, renderCatalog,
      setupCatalogTest: function(homey) {
        Homey = homey;
        templates.catalog = [
          { title: 'Alpha', number: 2 },
          { title: 'Zulu', number: 1 }
        ];
      },
    `);
    const get = harness.document.getElementById;
    get('catalog-previews').appendChild(harness.document.createElement('i'));
    harness.setupCatalogTest(homey);
    const titles = () => get('template-catalog').querySelectorAll('.template-catalog-title')
      .map(button => button.children[0].textContent);
    return { ...harness, get, titles, select: get('catalog-sort') };
  }

  const first = openSettings();
  await first.loadCatalogSort();
  assert.equal(first.select.value, 'newest');
  assert.deepEqual(first.titles(), ['Alpha', 'Zulu']);
  first.select.value = 'oldest';
  await first.saveCatalogSort();
  assert.equal(saved, 'oldest');
  assert.deepEqual(first.titles(), ['Zulu', 'Alpha']);

  const reopened = openSettings();
  await reopened.loadCatalogSort();
  reopened.renderCatalog();
  assert.equal(reopened.select.value, 'oldest');
  assert.deepEqual(reopened.titles(), ['Zulu', 'Alpha']);

  writeError = 'Unable to save the preference';
  reopened.select.value = 'name';
  await reopened.saveCatalogSort();
  assert.equal(reopened.select.value, 'oldest');
  assert.equal(reopened.get('designer-status').textContent, writeError);
});

test('expanding a catalog entry replaces only its live preview with details and posted images', () => {
  const harness = previewHarness(() => {}, `
    renderCatalog,
    setupCatalogTest: function(items) {
      templates.catalog = items;
      templates.showPreviews = true;
    },
  `);
  const get = harness.document.getElementById;
  get('catalog-previews').appendChild(harness.document.createElement('i'));
  const template = {
    design: { ...styles.BUILT_IN_DESIGNS[0], timestampFormat: '', daySeparatorFormat: '' },
    theme: styles.BUILT_IN_THEMES[0]
  };
  const image = 'https://community.homey.app/uploads/default/original/example.png';
  harness.setupCatalogTest([
    { id: 'one', title: 'Alpha', number: 2, description: 'Template details', images: [image], template },
    { id: 'two', title: 'Bravo', number: 1, template }
  ]);
  const catalog = get('template-catalog');
  const toggleFirst = () => catalog.children[0].querySelector('.template-catalog-title').listeners.click();
  harness.renderCatalog();
  assert.equal(catalog.querySelectorAll('.template-catalog-thumbnail').length, 2);

  toggleFirst();
  assert.equal(catalog.children[0].querySelector('.template-catalog-thumbnail'), null);
  assert.equal(catalog.children[0].querySelector('.template-catalog-description').textContent, 'Template details');
  assert.equal(catalog.children[0].querySelector('.template-catalog-image-button').querySelector('img').src, image);
  assert.ok(catalog.children[1].querySelector('.template-catalog-thumbnail'));
  assert.equal(get('catalog-previews').getAttribute('aria-pressed'), 'true');

  toggleFirst();
  assert.equal(catalog.querySelectorAll('.template-catalog-thumbnail').length, 2);
  assert.equal(catalog.querySelector('.template-catalog-details'), null);
});

function snapshot(preview) {
  const list = preview.querySelector('.ssl-log-list');
  return {
    mode: preview.className.includes('ssl-mode-light') ? 'light' : 'dark',
    levels: preview.querySelectorAll('.ssl-log-card')
      .map(card => card.className.match(/ssl-sev-(\w+)/)[1]),
    search: !!preview.querySelector('.ssl-log-search'),
    filter: !!preview.querySelector('.ssl-filter-button'),
    paging: preview.querySelectorAll('.ssl-page-button').length,
    separators: preview.querySelectorAll('.ssl-day-separator').length,
    height: preview.style.height,
    maxHeight: preview.style.maxHeight,
    listFlex: list.style.flex,
    listOverflow: list.style.overflow,
    designerStyles: preview.parentNode.classList.contains('widget-designer')
  };
}

test('selecting the widget outlines the frame instead of each log card', () => {
  const harness = previewHarness(() => {});
  const preview = harness.document.createElement('div');
  const design = styles.BUILT_IN_DESIGNS[0];
  const theme = styles.BUILT_IN_THEMES[0];
  harness.renderWidgetPreview(preview, design, theme, '', { type: 'widget' });
  assert.ok(preview.classList.contains('ssl-preview-selected'));
  assert.equal(preview.querySelectorAll('.ssl-preview-selected').length, 0);

  harness.renderWidgetPreview(preview, design, theme, '', { type: 'row', row: 0 });
  assert.ok(!preview.classList.contains('ssl-preview-selected'));
  assert.ok(preview.querySelectorAll('.ssl-preview-selected').length > 0);
});

test('designer Facility filters use multi-select checkboxes and clearing them restores all preview entries', () => {
  const harness = previewHarness(() => {});
  const preview = harness.document.createElement('div');
  harness.renderWidgetPreview(preview, styles.BUILT_IN_DESIGNS[0], styles.BUILT_IN_THEMES[0]);
  const checkboxes = preview.querySelectorAll('input').filter(input => input.type === 'checkbox' && input.value);
  assert.equal(checkboxes.length, 24);
  assert.equal(preview.querySelectorAll('select').length, 0, 'there is no empty/Reset dropdown option');
  const [ntp, flow, user] = ['NTP', 'Flow', 'User'].map(name => checkboxes.find(input => input.value === name));
  ntp.checked = true;
  ntp.listeners.change();
  assert.equal(preview.querySelectorAll('.ssl-log-card').length, 0, 'an unused facility can still be selected');
  ntp.checked = false;
  flow.checked = true;
  flow.listeners.change();
  const selectedCount = preview.querySelectorAll('.ssl-log-card').length;
  assert.ok(selectedCount > 0 && selectedCount < 3);
  user.checked = true;
  user.listeners.change();
  assert.ok(preview.querySelectorAll('.ssl-log-card').length > selectedCount);
  checkboxes.forEach(input => { input.checked = false; });
  checkboxes[0].listeners.change();
  assert.equal(preview.querySelectorAll('.ssl-log-card').length, 3);
});

function selectionHarness() {
  const exports = `
    setupSelectionTest: function(homey, saved, builtin) {
      Homey = homey;
      root = document.body;
      builtInDesigns = [${JSON.stringify(styles.BUILT_IN_DESIGNS[0])}];
      builtInThemes = [${JSON.stringify(styles.BUILT_IN_THEMES[0])}];
      var design = Object.assign({}, builtInDesigns[0], { id: 'custom-design' });
      var custom = Object.assign({}, builtInThemes[0], { id: 'custom-theme',
        colors: Object.assign({}, builtInThemes[0].colors, { surface: '#123456' }) });
      collection = { version: 1, designs: [design], themes: [custom] };
      savedCollection = { version: 1, designs: [design], themes: saved ? [custom] : [] };
      mode = 'theme';
      currentDesignId = builtin ? builtInDesigns[0].id : design.id;
      currentThemeId = builtin ? builtInThemes[0].id : custom.id;
      selectionKey = '';
      byId('designer-help-toggle').appendChild(document.createElement('i'));
      renderExportSelectors = function() {};
      updateHistoryButtons = function() {};
      refreshSaveState = function() {};
      renderPreview = function() {
        renderWidgetPreview(byId('widget-preview'), selectedDesign(), selectedTheme(), '', selection);
      };
      renderEditor();
    },
    deleteSelected: deleteSelected,
    switchMode: switchMode,
    selectForTest: function(value) { selection = value; renderEditor(); },
    selectionState: function() { return { selection: selection, theme: currentThemeId }; },
  `;
  return previewHarness(() => {}, exports);
}

test('deleting a custom theme clears its selection when the built-in theme is shown', async () => {
  for (const saved of [false, true]) {
    let confirmed = false;
    let writes = 0;
    const harness = selectionHarness();
    harness.setupSelectionTest({
      confirm(_message, _icon, callback) { callback(null, confirmed); },
      set(_key, _value, callback) { writes++; callback(null); }
    }, saved);
    const preview = harness.document.getElementById('widget-preview');
    assert.equal(harness.selectionState().selection, null);
    harness.selectForTest({ type: 'widget' });
    assert.equal(harness.selectionState().selection.type, 'widget');
    assert.ok(preview.classList.contains('ssl-preview-selected'));
    await harness.deleteSelected('theme');
    assert.equal(harness.selectionState().theme, 'custom-theme');
    assert.ok(preview.classList.contains('ssl-preview-selected'));
    confirmed = true;
    await harness.deleteSelected('theme');
    assert.equal(harness.selectionState().theme, 'builtin:default');
    assert.equal(harness.selectionState().selection, null);
    assert.ok(!preview.classList.contains('ssl-preview-selected'));
    assert.equal(writes, saved ? 1 : 0);
  }
});

test('switching modes preserves selections shared by the grids without selecting a default', () => {
  const harness = selectionHarness();
  harness.setupSelectionTest({}, true);
  const preview = harness.document.getElementById('widget-preview');
  harness.switchMode('design');
  harness.switchMode('theme');
  assert.equal(harness.selectionState().selection, null);
  assert.ok(!preview.classList.contains('ssl-preview-selected'));

  for (const selected of [{ type: 'widget' }, { type: 'element', element: 'message' },
    { type: 'element', element: 'search', area: 'toolbar' },
    { type: 'row', row: 0 }, { type: 'column', row: 0, column: 0 },
    { type: 'separator', area: 'separator' }, { type: 'part', area: 'toolbar' }, { type: 'entry' }]) {
    harness.selectForTest(selected);
    harness.switchMode('design');
    assert.deepEqual(harness.selectionState().selection, selected);
    harness.switchMode('theme');
    assert.deepEqual(harness.selectionState().selection, selected);
  }
});

test('Theme grids allow preview-only selections and put the existing entry colors under Entry', () => {
  for (const builtin of [false, true]) {
    const harness = selectionHarness();
    harness.setupSelectionTest({}, true, builtin);
    const editor = harness.document.getElementById('group-editor');
    const controls = harness.document.getElementById('selection-controls');
    const preview = harness.document.getElementById('widget-preview');
    const button = text => editor.querySelectorAll('button').find(node => node.textContent === text);
    for (const label of ['Row 1', '1.1', 'Search and filters']) {
      const target = button(label);
      assert.ok(target && !target.disabled);
      assert.notEqual(target.getAttribute('data-draggable'), 'true');
      target.listeners.click({ stopPropagation() {} });
      assert.equal(button(label).getAttribute('aria-pressed'), 'true');
      assert.ok(preview.querySelector('.ssl-preview-selected'), `${label} should highlight in the preview`);
      assert.equal(controls.children.length, 0);
    }

    button('Widget').listeners.click();
    const widgetFields = controls.querySelectorAll('select').map(select => select.id);
    assert.ok(!widgetFields.includes('style-control-theme-color-surface'));
    assert.ok(!widgetFields.includes('style-control-theme-color-border'));
    if (!builtin) assert.ok(widgetFields.includes('style-control-theme-color-outline'));
    const entry = button('Entry');
    assert.ok(entry.parentNode.children[1].classList.contains('style-group-editor-grid'));
    entry.listeners.click();
    assert.equal(button('Entry').getAttribute('aria-pressed'), 'true');
    const cards = preview.querySelectorAll('.ssl-log-card');
    assert.ok(cards.length > 0 && cards.every(card => card.classList.contains('ssl-preview-selected')));
    assert.equal(preview.querySelectorAll('.ssl-preview-selected').length, cards.length);
    assert.ok(!preview.classList.contains('ssl-preview-selected'));
    if (builtin) {
      assert.equal(controls.children.length, 0);
    } else {
      const fields = controls.querySelectorAll('select');
      assert.deepEqual(fields.map(select => select.id), ['style-control-theme-color-surface', 'style-control-theme-color-border']);
      const [surface, border] = fields;
      assert.equal(controls.querySelector('.color-swatch').style.backgroundColor, '#123456');
      surface.value = 'green';
      surface.listeners.change();
      assert.equal(preview.style['--ssl-surface'], 'var(--ssl-color-green)');
      border.value = 'blue';
      border.listeners.change();
      assert.equal(preview.style['--ssl-border'], 'var(--ssl-color-blue)');
    }
    button('Entry').listeners.click();
    assert.equal(preview.querySelectorAll('.ssl-preview-selected').length, 0);
    harness.switchMode('design');
    button('Entry').listeners.click();
    assert.equal(harness.selectionState().selection.type, 'entry');
  }
});

test('pinning reserves the preview height lost to the cap, and unpinning releases it', () => {
  let observed;
  let update;
  let height = 550.5;
  let pinnedHeight = 250.25;
  let sentinelTop = 1;
  const { document, bindStickyPreview } = previewHarness(() => {}, 'bindStickyPreview,', {
    window: {
      addEventListener() {},
      setTimeout(callback) { update = callback; return 1; },
      clearTimeout() {},
      ResizeObserver: class {
        constructor(callback) { this.callback = callback; }
        observe(node) { if (node.classList?.contains('style-preview-sticky')) observed = this.callback; }
      }
    }
  });
  const sticky = document.createElement('div');
  sticky.className = 'style-preview-sticky';
  const editor = document.createElement('div');
  editor.style.getPropertyValue = key => editor.style[key];
  sticky.nextElementSibling = editor;
  sticky.getClientRects = () => [{}];
  sticky.getBoundingClientRect = () => ({ height: sticky.classList.contains('is-stuck') ? Math.min(height, pinnedHeight) : height });
  sticky.parentNode = {
    insertBefore(sentinel) { sentinel.getBoundingClientRect = () => ({ top: sentinelTop }); }
  };
  const scroller = document.createElement('div');
  scroller.clientHeight = 700;
  scroller.getBoundingClientRect = () => ({ top: 0 });
  scroller.parentNode = { style: document.createElement('div').style, querySelector: () => ({ offsetHeight: 60 }) };
  sticky.closest = () => scroller;
  bindStickyPreview(sticky);
  update();
  const space = () => parseFloat(editor.style['--ssl-preview-reserved-space'] || '0');
  const footprint = () => sticky.getBoundingClientRect().height + space();
  assert.equal(footprint(), height);
  sentinelTop = -1;
  scroller.listeners.scroll();
  update();
  assert.ok(sticky.classList.contains('is-stuck'));
  assert.equal(footprint(), height);
  pinnedHeight = 200;
  observed();
  assert.equal(footprint(), height, 'resizing the pinned preview keeps the same reservation');
  sentinelTop = 1;
  scroller.listeners.scroll();
  update();
  assert.ok(!sticky.classList.contains('is-stuck'));
  assert.equal(space(), 0);
  assert.equal(footprint(), height);
  height = 100;
  sentinelTop = -1;
  scroller.listeners.scroll();
  update();
  assert.equal(footprint(), 100, 'a short preview needs no spacer');
});

test('only interactive previews compensate for a verified iframe ancestor filter', () => {
  let filter = 'none';
  const ownerDocument = { defaultView: { getComputedStyle: element => ({
    filter: element.parentElement ? 'none' : filter
  }) } };
  const frameElement = { ownerDocument, parentElement: { ownerDocument } };
  for (const host of [null, frameElement]) {
    filter = 'none';
    const harness = previewHarness(() => {}, '', { window: { frameElement: host, matchMedia: () => ({ matches: true }) } });
    const preview = harness.document.createElement('div');
    const [design, theme] = [styles.BUILT_IN_DESIGNS[0], styles.BUILT_IN_THEMES[0]];
    harness.renderWidgetPreview(preview, design, theme);
    assert.ok(preview.classList.contains('ssl-mode-dark'));
    assert.ok(!preview.classList.contains('preview-counter-invert'));
    filter = 'invert(0.5) hue-rotate(180deg)';
    harness.renderWidgetPreview(preview, design, theme);
    assert.ok(!preview.classList.contains('preview-counter-invert'));
    filter = 'invert(1) hue-rotate(180deg)';
    harness.renderWidgetPreview(preview, design, theme);
    assert.equal(preview.classList.contains('preview-counter-invert'), !!host);
    harness.renderWidgetPreview(preview, design, theme, '', null, 'light');
    assert.ok(preview.classList.contains('ssl-mode-light'));
    assert.ok(!preview.classList.contains('preview-counter-invert'));
  }
});

test('template images include every level and control without changing interactive preview paging', async () => {
  const captures = [];
  const harness = previewHarness(async preview => {
    captures.push(snapshot(preview));
    return { width: 400, height: 1000 };
  });

  const design = styles.BUILT_IN_DESIGNS[0];
  const theme = styles.BUILT_IN_THEMES[0];
  const interactive = harness.document.createElement('div');
  harness.renderWidgetPreview(interactive, design, theme);
  assert.equal(interactive.querySelectorAll('.ssl-log-card').length, 3);
  assert.equal(interactive.querySelectorAll('.ssl-page-button')[1].disabled, false);
  interactive.querySelectorAll('.ssl-page-button')[1].listeners.click();
  assert.equal(interactive.querySelectorAll('.ssl-log-card').length, 3);
  assert.equal(interactive.querySelectorAll('.ssl-page-button')[1].disabled, true);

  assert.equal((await harness.templatePreviewImages(design, theme)).length, 2);
  assert.deepEqual(harness.document.canvasBackgrounds, ['#f5f4fa', '#111217']);
  assert.deepEqual(captures.map(image => image.mode), ['light', 'dark']);
  for (const image of captures) {
    assert.deepEqual(image.levels, ['emergency', 'alert', 'critical', 'error', 'warning', 'notice', 'info', 'debug']);
    assert.equal(image.search, true);
    assert.equal(image.filter, true);
    assert.equal(image.paging, 2);
    assert.equal(image.separators, 2);
    assert.equal(image.height, 'auto');
    assert.equal(image.maxHeight, 'none');
    assert.equal(image.listFlex, 'none');
    assert.equal(image.listOverflow, 'visible');
    assert.equal(image.designerStyles, true);
  }
  assert.equal(harness.document.body.children.length, 0);
});

test('export preview severity names stay English while interactive previews can be translated', () => {
  const harness = previewHarness(() => {}, `
    previewEntries,
    setHomey: value => { Homey = value; },
  `);
  harness.setHomey({ __: key => `translated:${key}` });
  assert.deepEqual(Array.from(harness.previewEntries(true), entry => entry.severityName),
    ['Emergency', 'Alert', 'Critical', 'Error', 'Warning', 'Notice', 'Info', 'Debug']);
  assert.ok(harness.previewEntries(false)[0].severityName.startsWith('translated:'));
});

function previewText(node) {
  return [node.textContent, node.placeholder, node.title, node.attributes['aria-label']]
    .filter(Boolean).concat(node.children.flatMap(previewText));
}

test('all generated image text is English even with non-English settings and browser defaults', async () => {
  class DutchDate extends Date {
    toLocaleDateString(locale, options) { return super.toLocaleDateString(locale || 'nl', options); }
    toLocaleTimeString(locale, options) { return super.toLocaleTimeString(locale || 'nl', options); }
  }
  const captures = [];
  const harness = previewHarness(async preview => {
    const text = previewText(preview);
    assert.ok(!text.some(value => value.includes('translated:')));
    assert.equal(preview.querySelector('.ssl-log-search').placeholder, 'Search');
    assert.deepEqual(preview.querySelectorAll('.ssl-page-button').map(button => button.textContent), ['Previous', 'Next']);
    assert.ok(text.includes('Level'));
    assert.ok(text.includes('Date'));
    assert.ok(text.includes('From'));
    assert.ok(text.includes('To'));
    assert.ok(text.includes('Facility'));
    assert.ok(text.includes('App / Group'));
    assert.ok(text.includes('Hostname'));
    assert.ok(text.includes('Reset'));
    assert.ok(text.includes('Page 1'));
    assert.ok(text.includes('All dates'));
    assert.ok(text.some(value => /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat), /.test(value)),
      'fallback day separators must use English weekday names');
    captures.push(text);
    return { width: 400, height: 1000 };
  }, 'setHomey: value => { Homey = value; },', { Date: DutchDate });
  harness.setHomey({
    __: key => `translated:${key}`,
    api(_method, _path, _body, callback) { callback(new Error('BLL unavailable')); }
  });
  const design = styles.BUILT_IN_DESIGNS[0];
  const interactive = harness.document.createElement('div');
  harness.renderWidgetPreview(interactive, design, styles.BUILT_IN_THEMES[0]);
  assert.equal(interactive.querySelector('.ssl-log-search').placeholder, 'translated:widgets.search');
  assert.ok(previewText(interactive).includes(new DutchDate().toLocaleDateString(undefined,
    { weekday: 'short', month: 'short', day: 'numeric' })));

  await harness.templatePreviewImages(design, styles.BUILT_IN_THEMES[0]);
  assert.equal(captures.length, 2);
  assert.deepEqual(harness.document.canvasTexts, ['Light', 'Dark']);
});

test('template images await both English BLL timestamps without reusing or changing localized preview dates', async () => {
  const requests = [];
  const design = { ...styles.BUILT_IN_DESIGNS.find(design => design.id === 'builtin:compact-classic'),
    showDaySeparators: true, timestampFormat: 'dddd HH:mm', timestamp2Format: 'dd MMMM', daySeparatorFormat: 'dddd d MMMM' };
  const harness = previewHarness(async preview => {
    const text = previewText(preview);
    assert.ok(text.includes('English timestamp'));
    assert.ok(text.includes('English day'));
    assert.ok(text.includes('English second'));
    assert.ok(!text.some(value => value.includes('Localized')));
    return { width: 400, height: 1000 };
  }, 'previewTimestamps, flushPreviewFormats, setHomey: value => { Homey = value; },');
  harness.setHomey({
    __: key => `translated:${key}`,
    api(_method, path, body, callback) {
      assert.equal(path, '/widget-timestamps');
      requests.push(body);
      setTimeout(() => callback(null, {
        values: body.timestamps.map(() => (body.locale === 'en' ? 'English ' : 'Localized ')
          + (body.format === design.timestampFormat ? 'timestamp' : body.format === design.timestamp2Format ? 'second' : 'day'))
      }), 5);
    }
  });
  harness.previewTimestamps(design.timestampFormat);
  harness.previewTimestamps(design.daySeparatorFormat);
  harness.previewTimestamps(design.timestamp2Format);
  await harness.flushPreviewFormats();
  await harness.templatePreviewImages(design, styles.BUILT_IN_THEMES[0]);
  assert.deepEqual(requests.map(body => body.locale), [undefined, undefined, undefined, 'en', 'en', 'en']);
  assert.equal(harness.previewTimestamps(design.timestampFormat)[0], 'Localized timestamp');
  assert.equal(harness.previewTimestamps(design.daySeparatorFormat)[0], 'Localized day');
  assert.equal(harness.previewTimestamps(design.timestamp2Format)[0], 'Localized second');
});

test('copying a design retains its independent second timestamp format and text styling', () => {
  const harness = previewHarness(() => {}, `
    copyDesign: function(original) {
      collection = { designs: [], themes: [] };
      setDirty = function() {};
      renderAll = function() {};
      createDesign(true, original);
      return collection.designs[0];
    },
  `);
  const original = styles.BUILT_IN_DESIGNS.find(design => design.id === 'builtin:compact-classic');
  const copy = harness.copyDesign(original);
  assert.equal(copy.timestamp2Format, 'dd-MM');
  assert.equal(copy.elementSizes.timestamp2, 9);
  copy.rows[0].columns[1].elements.pop();
  assert.equal(original.rows[0].columns[1].elements.length, 3);
});

test('copied forum posts keep the previews together and include the TWF code block without a heading', () => {
  const harness = previewHarness(() => {}, `
    forumPostContent,
    setupPost: function() {
      templates.exportDesignName = 'Example design';
      templates.exportText = '[twf:example:"payload":/twf]';
      templates.imageData = ['data:image/png;base64,light', 'data:image/png;base64,dark'];
    },
  `);
  harness.setupPost();
  const content = harness.forumPostContent();
  const paragraphs = [...content.html.matchAll(/<p>(.*?)<\/p>/g)].map(match => match[1]);
  const images = paragraphs.filter(paragraph => paragraph.includes('<img '));
  assert.equal(images.length, 1);
  assert.equal([...images[0].matchAll(/<img /g)].length, 2);
  assert.equal([...images[0].matchAll(/width="200"/g)].length, 2);
  assert.ok(!images[0].includes('<br'));
  assert.ok(content.html.endsWith(`${images[0]}</p><pre data-params="javascript"><code class="language-javascript">`
    + '[twf:example:&quot;payload&quot;:/twf]</code></pre>'));
  assert.equal(content.text, '# Design: Example design\n\n\n\n```javascript\n[twf:example:"payload":/twf]\n```');
});

test('template images respect omitted design controls and clean up after capture failures', async () => {
  const design = structuredClone(styles.BUILT_IN_DESIGNS[0]);
  design.showDaySeparators = false;
  design.toolbarLayout = layout.defaultControlLayout('toolbar');
  design.toolbarLayout.rows.forEach(row => row.columns.forEach(column => {
    column.elements = column.elements.filter(id => id !== 'search');
  }));
  design.pagingLayout = layout.defaultControlLayout('paging');
  design.pagingLayout.rows.forEach(row => row.columns.forEach(column => { column.elements = []; }));
  const captures = [];
  const harness = previewHarness(async preview => {
    captures.push(snapshot(preview));
    throw new Error('Image rendering failed');
  });
  await assert.rejects(harness.templatePreviewImages(styles.validateDesign(design), styles.BUILT_IN_THEMES[0]),
    /Image rendering failed/);
  assert.equal(captures.length, 1);
  assert.equal(captures[0].search, false);
  assert.equal(captures[0].filter, true);
  assert.equal(captures[0].paging, 0);
  assert.equal(captures[0].separators, 0);
  assert.equal(harness.document.body.children.length, 0);
});
