'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');
const layout = require('../assets/js/ssl-widget-layout');
const styles = require('../lib/widget-styles');

function previewHarness(capture, extraExports = '') {
  const document = {};
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
      item.getContext = () => ({ fillRect() {}, fillText() {}, drawImage() {} });
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
  const window = { SSLWidgetLayout: layout, htmlToImage: { toCanvas: capture } };
  window.parent = window;
  const source = fs.readFileSync(require.resolve('../settings/widgets.js'), 'utf8')
    .replace('window.SSLWidgetDesigner = {',
      'window.SSLWidgetDesigner = { renderWidgetPreview, templatePreviewImages,' + extraExports);
  vm.runInNewContext(source, { window, document, setTimeout, clearTimeout });
  return { document, ...window.SSLWidgetDesigner };
}

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

function selectionHarness() {
  const exports = `
    setupSelectionTest: function(homey, saved) {
      Homey = homey;
      root = { querySelectorAll: function() { return []; } };
      builtInDesigns = [${JSON.stringify(styles.BUILT_IN_DESIGNS[0])}];
      builtInThemes = [${JSON.stringify(styles.BUILT_IN_THEMES[0])}];
      var design = Object.assign({}, builtInDesigns[0], { id: 'custom-design' });
      var custom = Object.assign({}, builtInThemes[0], { id: 'custom-theme' });
      collection = { version: 1, designs: [design], themes: [custom] };
      savedCollection = { version: 1, designs: [design], themes: saved ? [custom] : [] };
      mode = 'theme';
      currentDesignId = design.id;
      currentThemeId = custom.id;
      selectionKey = '';
      renderLayoutEditor = function() {};
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

test('switching modes keeps only selections available in both editable grids', () => {
  const harness = selectionHarness();
  harness.setupSelectionTest({}, true);
  const preview = harness.document.getElementById('widget-preview');
  harness.switchMode('design');
  harness.switchMode('theme');
  assert.equal(harness.selectionState().selection, null);
  assert.ok(!preview.classList.contains('ssl-preview-selected'));

  for (const selected of [{ type: 'widget' }, { type: 'element', element: 'message' },
    { type: 'element', element: 'daySeparator', area: 'separator' },
    { type: 'element', element: 'search', area: 'toolbar' }]) {
    harness.selectForTest(selected);
    harness.switchMode('design');
    assert.deepEqual(harness.selectionState().selection, selected);
    harness.switchMode('theme');
    assert.deepEqual(harness.selectionState().selection, selected);
  }
  for (const selected of [{ type: 'row', row: 0 }, { type: 'column', row: 0, column: 0 },
    { type: 'separator', area: 'separator' }, { type: 'part', area: 'toolbar' }]) {
    harness.switchMode('design');
    harness.selectForTest(selected);
    harness.switchMode('theme');
    assert.equal(harness.selectionState().selection, null);
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
