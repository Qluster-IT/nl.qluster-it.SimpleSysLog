'use strict';

(function () {
  var Homey;
  var root;
  var collection = { version: 1, designs: [], themes: [] };
  var layoutApi = window.SSLWidgetLayout;
  var builtInDesigns = [];
  var builtInThemes = [];
  var selection = null;
  var selectionKey = '';
  // The help starts open until the stored preference loads; a fresh install has no preference yet.
  var help = { expanded: true, available: false, saving: false };
  var dragState = null;
  var dragInsertion = {};
  var suppressClick = false;
  var currentDesignId = 'builtin:default';
  var currentThemeId = 'builtin:default';
  var dirty = false;
  // Copy of the stored styles; an item differs from its saved copy while it has unsaved changes.
  var savedCollection = null;
  // Undo/redo history per edited item, keyed by mode and id, like Chronograph's designer.
  var editHistories = {};
  var MAX_HISTORY = 100;
  var confirmingSwitch = false;
  // Fixed dates keep the BLL-formatted preview timestamps cacheable per format.
  var previewDates = (function () {
    var now = new Date();
    return [now, new Date(now.getTime() - 86400000)];
  })();
  var previewFormats = {};
  var previewFormatQueue = {};
  var previewFormatTimer = null;
  var translations = {
    timestamp: ['widgets.fields.timestamp', 'Timestamp'],
    timestamp2: ['widgets.fields.timestamp2', 'Timestamp 2'],
    severity: ['widgets.fields.severity', 'Severity'],
    facility: ['widgets.fields.facility', 'Facility'],
    app: ['widgets.fields.app', 'App / Group'],
    hostname: ['widgets.fields.hostname', 'Hostname'],
    message: ['widgets.fields.message', 'Message'],
    background: ['widgets.settings.colors.background', 'Background'],
    surface: ['widgets.settings.colors.surface', 'Entry background'],
    text: ['widgets.settings.colors.text', 'Text'],
    muted: ['widgets.settings.colors.muted', 'Secondary text'],
    border: ['widgets.settings.colors.border', 'Border'],
    accent: ['widgets.settings.colors.accent', 'Accent'],
    emergency: ['widgets.settings.colors.emergency', 'Emergency'],
    alert: ['widgets.settings.colors.alert', 'Alert'],
    critical: ['widgets.settings.colors.critical', 'Critical'],
    error: ['widgets.settings.colors.error', 'Error'],
    warning: ['widgets.settings.colors.warning', 'Warning'],
    notice: ['widgets.settings.colors.notice', 'Notice'],
    info: ['widgets.settings.colors.info', 'Info'],
    debug: ['widgets.settings.colors.debug', 'Debug'],
    outline: ['widgets.settings.colors.outline', 'Widget border']
  };
  var entryColorRoles = ['surface', 'border'];
  var widgetColorRoles = ['background', 'text', 'muted', 'accent',
    'emergency', 'alert', 'critical', 'error', 'warning', 'notice', 'info', 'debug', 'outline'];
  var severityNames = ['emergency', 'alert', 'critical', 'error', 'warning', 'notice', 'info', 'debug'];
  var colorNames = ['automatic', 'red', 'red-soft', 'orange', 'yellow', 'green', 'teal', 'cyan', 'blue',
    'indigo', 'purple', 'pink', 'brown', 'grey', 'black', 'black-light', 'white'];
  var elementColors = ['default', 'severity'].concat(colorNames.slice(1));
  var elementBackgrounds = ['default', 'none', 'severity'].concat(colorNames.slice(1));
  var separatorColors = ['default'].concat(colorNames.slice(1));
  var separatorBackgrounds = ['default', 'none'].concat(colorNames.slice(1));
  var SEPARATOR_ID = layoutApi.DAY_SEPARATOR_ID;
  var LINE_ID = layoutApi.DAY_SEPARATOR_LINE_ID;
  function isBorder(id) { return layoutApi.BORDER_IDS.indexOf(id) !== -1; }
  var borderSideFallbacks = { left: 'Left', top: 'Top', right: 'Right', bottom: 'Bottom' };
  var colorNameFallbacks = {
    automatic: 'Automatic', red: 'Red', orange: 'Orange', yellow: 'Yellow', green: 'Green', teal: 'Teal',
    cyan: 'Cyan', blue: 'Blue', indigo: 'Indigo', purple: 'Purple', pink: 'Pink', brown: 'Brown',
    grey: 'Grey', black: 'Black', 'black-light': 'Black (light/dark)', white: 'White',
    'red-soft': 'Red (light)'
  };
  var fontFallbacks = {
    system: 'System', 'sans-serif': 'Sans-serif (Arial)', serif: 'Serif (Georgia)', monospace: 'Monospace (Courier New)',
    verdana: 'Verdana', trebuchet: 'Trebuchet MS', times: 'Times New Roman'
  };
  var lineStyleFallbacks = { solid: 'Solid', dashed: 'Dashed', dotted: 'Dotted', double: 'Double' };
  var textStyleFallbacks = { textCase: 'Text case', weight: 'Weight', italic: 'Italic', spacing: 'Letter spacing', wrap: 'Text wrapping' };
  var textStyleValueFallbacks = {
    textCase: { none: 'As written', uppercase: 'UPPERCASE', lowercase: 'lowercase', capitalize: 'Capitalize Words' },
    weight: { normal: 'Normal', medium: 'Medium', semibold: 'Semi-bold', bold: 'Bold', extrabold: 'Extra bold' },
    italic: { off: 'Off', on: 'On' },
    spacing: { none: 'None', narrow: 'Narrow', wide: 'Wide' },
    wrap: { normal: 'Wrap to fit', nowrap: 'No wrapping' }
  };
  var linePositionFallbacks = { behind: 'Behind the date', above: 'Above the date', below: 'Below the date' };
  var darkSchemeQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  var previewMode = darkSchemeQuery && darkSchemeQuery.matches ? 'dark' : 'light';
  var previewHostElements = [];
  for (var hostElement = window.frameElement; hostElement; hostElement = hostElement.parentElement) {
    previewHostElements.push(hostElement);
  }
  function homeyInvertsPage() {
    return previewHostElements.some(function (element) {
      var filter = element.ownerDocument.defaultView.getComputedStyle(element).filter;
      return /^invert\((?:1(?:\.0+)?|100%)\) hue-rotate\(180deg\)$/.test(filter);
    });
  }
  function updatePreviewHost() {
    var inverted = homeyInvertsPage();
    root.querySelectorAll('.ssl-widget.preview-widget').forEach(function (preview) {
      preview.classList.toggle('preview-counter-invert', inverted);
    });
  }
  var mode = 'design';
  var forumTopicUrl = 'https://community.homey.app/t/162351';
  var templates = {
    section: 'export', busy: false, generating: false, review: null, exportText: '', exportDesignName: '', exportThemeName: '',
    catalog: null, favorites: {}, selectedId: null, showPreviews: false, previewsAvailable: false,
    catalogSort: 'newest', catalogSortReady: false, catalogSortSaving: false,
    imageData: null, copyStatus: null
  };

  function t(key, fallback) {
    try {
      var value = Homey.__(key);
      return value && value !== key ? value : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function call(method, args) {
    return new Promise(function (resolve, reject) {
      var completed = false;
      function finish(error, result) {
        if (completed) return;
        completed = true;
        if (error) reject(error instanceof Error ? error : new Error(String(error)));
        else resolve(result);
      }
      var result;
      try {
        result = Homey[method].apply(Homey, args.concat(finish));
      } catch (error) {
        finish(error);
        return;
      }
      if (result && typeof result.then === 'function') result.then(function (value) {
        finish(null, value);
      }, finish);
    });
  }

  function api(method, path, body) {
    return call('api', [method, path, body || {}]);
  }

  function getSetting(key) {
    return call('get', [key]);
  }

  function setSetting(key, value) {
    return call('set', [key, value]);
  }

  function newId() {
    return 'custom-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  function setStatus(message, isError) {
    var status = document.getElementById('designer-status');
    status.textContent = message || '';
    status.classList.toggle('error', !!isError);
  }

  function findDesign(id) {
    return builtInDesigns.concat(collection.designs).find(function (item) { return item.id === id; });
  }

  function findTheme(id) {
    return builtInThemes.concat(collection.themes).find(function (item) { return item.id === id; });
  }

  function selectedDesign() { return findDesign(currentDesignId); }
  function selectedTheme() { return findTheme(currentThemeId); }
  function isBuiltIn(id) { return id.indexOf('builtin:') === 0; }

  function setDirty() {
    captureHistory();
    refreshSaveState();
    renderPreview();
  }

  function setSaveState(isDirty) {
    dirty = isDirty;
    var button = document.getElementById('save-styles');
    button.disabled = !isDirty || !!root.querySelector('.style-color-control [aria-invalid="true"]');
    button.classList.toggle('is-dirty', isDirty);
    updateHistoryButtons();
  }

  // Key order is ignored, because removing and adding overrides changes the order.
  function sameValue(first, second) {
    if (first === second) return true;
    if (!first || !second || typeof first !== 'object' || typeof second !== 'object') return false;
    if (Array.isArray(first) !== Array.isArray(second)) return false;
    var keys = Object.keys(first);
    if (keys.length !== Object.keys(second).length) return false;
    return keys.every(function (key) {
      return Object.prototype.hasOwnProperty.call(second, key) && sameValue(first[key], second[key]);
    });
  }

  function markSaved() {
    savedCollection = clone(collection);
    refreshSaveState();
  }

  function refreshSaveState() {
    setSaveState(!!savedCollection && !sameValue(collection, savedCollection));
  }

  function editingItem() { return mode === 'design' ? selectedDesign() : selectedTheme(); }
  function editingKey() { return mode + ':' + editingItem().id; }

  function savedItem(kind, id) {
    if (!savedCollection) return null;
    return (kind === 'design' ? savedCollection.designs : savedCollection.themes)
      .find(function (item) { return item.id === id; }) || null;
  }

  function editHistory() {
    var item = editingItem();
    if (isBuiltIn(item.id)) return null;
    var key = editingKey();
    if (!editHistories[key]) editHistories[key] = { entries: [clone(savedItem(mode, item.id) || item)], index: 0 };
    return editHistories[key];
  }

  function captureHistory() {
    var history = editHistory();
    if (!history) return;
    var item = editingItem();
    if (sameValue(item, history.entries[history.index])) return;
    history.entries.splice(history.index + 1);
    history.entries.push(clone(item));
    history.index++;
    if (history.entries.length > MAX_HISTORY) {
      history.entries.shift();
      history.index--;
    }
  }

  function updateHistoryButtons() {
    var history = editingItem() && editHistories[editingKey()];
    byId('undo-styles').disabled = confirmingSwitch || !history || history.index <= 0;
    byId('redo-styles').disabled = confirmingSwitch || !history || history.index >= history.entries.length - 1;
  }

  function replaceItem(item, value) {
    Object.keys(item).forEach(function (key) { delete item[key]; });
    Object.assign(item, clone(value));
  }

  function stepHistory(step) {
    var history = editHistories[editingKey()];
    if (confirmingSwitch || !history) return;
    var index = history.index + step;
    if (index < 0 || index >= history.entries.length) return;
    history.index = index;
    replaceItem(editingItem(), history.entries[index]);
    // The selected row, column or element may no longer exist in the restored item.
    selectionKey = '';
    renderEditor();
    refreshSaveState();
  }

  // Runs next once the edited item has no unsaved changes; asks to discard them first, like Chronograph.
  function leaveEditingItem(next, cancel) {
    if (confirmingSwitch) return;
    var kind = mode;
    var item = editingItem();
    var key = editingKey();
    var saved = savedItem(kind, item.id);
    if (isBuiltIn(item.id) || (saved && sameValue(item, saved))) {
      next();
      return;
    }
    confirmingSwitch = true;
    updateHistoryButtons();
    var message = t('widgets.settings.discardSwitchConfirm', 'Discard unsaved changes to "__name__" and switch?');
    call('confirm', [message.replace('__name__', item.name), 'warning']).then(function (confirmed) {
      confirmingSwitch = false;
      if (!confirmed || editingItem() !== item) {
        updateHistoryButtons();
        if (cancel) cancel();
        return;
      }
      if (saved) replaceItem(item, saved);
      else {
        var items = kind === 'design' ? collection.designs : collection.themes;
        var index = items.indexOf(item);
        if (index >= 0) items.splice(index, 1);
        if (kind === 'design') currentDesignId = 'builtin:default';
        else currentThemeId = 'builtin:default';
      }
      delete editHistories[key];
      selectionKey = '';
      next();
      renderAll();
      refreshSaveState();
    }).catch(function (error) {
      confirmingSwitch = false;
      updateHistoryButtons();
      if (cancel) cancel();
      setStatus(error.message, true);
    });
  }

  function fillSelect(select, items, selectedId) {
    select.replaceChildren();
    items.forEach(function (item) {
      var option = document.createElement('option');
      option.value = item.id;
      option.textContent = item.name;
      select.appendChild(option);
    });
    select.value = selectedId;
  }

  function byId(id) { return document.getElementById(id); }

  function fillGroupedSelect(select, builtIns, customs, selectedId, isDesign) {
    select.replaceChildren();
    var labels = isDesign
      ? [t('widgets.settings.builtInStyles', 'Default styles'), t('widgets.settings.customStyles', 'Custom styles')]
      : [t('widgets.settings.builtIn', 'Built-in'), t('widgets.settings.custom', 'Custom')];
    [[labels[0], builtIns], [labels[1], customs]]
      .forEach(function (group) {
        if (!group[1].length) return;
        var optgroup = document.createElement('optgroup');
        optgroup.label = group[0];
        group[1].forEach(function (item) {
          var option = document.createElement('option');
          option.value = item.id;
          option.textContent = item.name;
          optgroup.appendChild(option);
        });
        select.appendChild(optgroup);
      });
    select.value = selectedId;
  }

  function renderEditor() {
    if (!selectedDesign()) currentDesignId = 'builtin:default';
    if (!selectedTheme()) currentThemeId = 'builtin:default';
    var isDesign = mode === 'design';
    var item = isDesign ? selectedDesign() : selectedTheme();
    var builtin = isBuiltIn(item.id);
    root.querySelectorAll('.mode-button').forEach(function (button) {
      button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
    });
    byId('style-select-label').textContent = isDesign
      ? t('widgets.settings.selectDesign', 'Design') : t('widgets.settings.theme', 'Theme');
    byId('style-new-label').textContent = isDesign
      ? t('widgets.settings.newDesign', 'New style') : t('widgets.settings.newTheme', 'New theme');
    fillGroupedSelect(byId('style-select'), isDesign ? builtInDesigns : builtInThemes,
      isDesign ? collection.designs : collection.themes, item.id, isDesign);
    byId('style-name-group').hidden = builtin;
    byId('style-name').value = item.name;
    var hint = byId('style-builtin-hint');
    hint.hidden = !builtin;
    hint.textContent = isDesign
      ? t('widgets.settings.designBuiltinHint', 'Built-in designs cannot be edited. Copy this design to customize it.')
      : t('widgets.settings.themeBuiltinHint', 'Built-in themes cannot be edited. Copy this theme to customize it.');
    byId('style-delete').hidden = builtin;
    root.querySelectorAll('[data-mode-panel]').forEach(function (panel) {
      panel.hidden = panel.dataset.modePanel !== mode;
    });
    byId('preview-other-label').textContent = isDesign
      ? t('widgets.settings.theme', 'Theme') : t('widgets.settings.selectDesign', 'Design');
    fillGroupedSelect(byId('preview-other'), isDesign ? builtInThemes : builtInDesigns,
      isDesign ? collection.themes : collection.designs, isDesign ? currentThemeId : currentDesignId, !isDesign);
    var key = mode + ':' + item.id;
    if (key !== selectionKey) {
      selectionKey = key;
      selection = null;
    }
    renderLayoutEditor();
    renderPreview();
    updateHistoryButtons();
  }

  function L(key, fallback) { return t('widgets.settings.layout.' + key, fallback); }
  function elementLabel(id) {
    if (id === 'search') return t('widgets.search', 'Search');
    if (id === 'filter') return t('widgets.filters.button', 'Filters');
    if (id === 'previousPage') return t('widgets.pagination.previous', 'Previous');
    if (id === 'pageNumber') return t('widgets.pagination.page', 'Page');
    if (id === 'nextPage') return t('widgets.pagination.next', 'Next');
    if (id === SEPARATOR_ID) return L('separator_date', 'Date');
    if (id === LINE_ID) return L('separator_line', 'Line');
    if (isBorder(id)) return L('border', 'Border') + ' ' + (layoutApi.BORDER_IDS.indexOf(id) + 1);
    return t(translations[id][0], translations[id][1]);
  }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }

  function gridFor(area, design, editing) {
    design = design || selectedDesign();
    if (layoutApi.CONTROL_AREAS[area]) {
      var key = layoutApi.CONTROL_AREAS[area].key;
      if (editing && !design[key]) design[key] = layoutApi.defaultControlLayout(area);
      return design[key] || layoutApi.defaultControlLayout(area);
    }
    if (area !== 'separator') return design;
    if (!design.daySeparatorLayout) design.daySeparatorLayout = layoutApi.defaultSeparatorLayout();
    return design.daySeparatorLayout;
  }
  function maxRowsFor(area) { return area ? layoutApi.MAX_SEPARATOR_ROWS : layoutApi.MAX_ROWS; }
  function partLabel(area) {
    if (area === 'toolbar') return L('search_filters', 'Search and filters');
    if (area === 'paging') return L('paging', 'Paging');
    return L('day_separator', 'Day separator');
  }

  function newColumn(span) {
    return { span: span, rowSpan: 1, align: 'left', valign: 'top', direction: 'horizontal', width: 'span', elements: [] };
  }

  function coveringCells(design, rowIndex) {
    return layoutApi.computeLayout(design).cells.filter(function (cell) {
      return cell.row < rowIndex && cell.row + cell.rowSpan > rowIndex;
    });
  }

  // Units in a row that are not taken by columns spanning down from earlier rows.
  function availableUnits(design, rowIndex) {
    return layoutApi.UNITS - coveringCells(design, rowIndex).reduce(function (sum, cell) { return sum + cell.span; }, 0);
  }

  function totalSpan(row) {
    return row.columns.reduce(function (sum, column) { return sum + column.span; }, 0);
  }

  function reduceWidest(columns, keep) {
    var widest = null;
    columns.forEach(function (column) {
      if (column !== keep && column.span > 1 && (!widest || column.span >= widest.span)) widest = column;
    });
    if (!widest && keep && keep.span > 1) widest = keep;
    if (widest) widest.span--;
    return !!widest;
  }

  // Keeps every row valid after a change: rows spanned by earlier columns get fewer units,
  // wider columns are reduced first and extra columns merge into the last column.
  function fitRows(design, keep) {
    var rows = design.rows;
    rows.forEach(function (row, index) {
      row.columns.forEach(function (column) {
        column.rowSpan = Math.max(1, Math.min(column.rowSpan || 1, rows.length - index));
      });
    });
    for (var index = 0; index < rows.length; index++) {
      var covering = coveringCells(design, index);
      var available = layoutApi.UNITS - covering.reduce(function (sum, cell) { return sum + cell.span; }, 0);
      if (available < 1) {
        var rowIndex = index;
        covering.forEach(function (cell) { rows[cell.row].columns[cell.column].rowSpan = rowIndex - cell.row; });
        available = layoutApi.UNITS;
      }
      var row = rows[index];
      while (row.columns.length > available) {
        var removed = row.columns.pop();
        var last = row.columns[row.columns.length - 1];
        last.elements = last.elements.concat(removed.elements);
      }
      while (totalSpan(row) > available && reduceWidest(row.columns, keep)) { /* reduce until it fits */ }
    }
  }

  function changeDesign(change, area) {
    var grid = gridFor(area, undefined, true);
    var keep = change(grid);
    fitRows(grid, keep);
    setDirty();
    renderLayoutEditor();
  }

  function range(from, to) {
    var values = [];
    for (var value = from; value <= to; value++) values.push(value);
    return values;
  }

  function availableRowSpans(design, rowIndex, columnIndex) {
    return range(1, design.rows.length - rowIndex).filter(function (value) {
      var trial = clone(design);
      trial.rows[rowIndex].columns[columnIndex].rowSpan = value;
      for (var below = rowIndex + 1; below < rowIndex + value; below++) {
        if (availableUnits(trial, below) < 1) return false;
      }
      return true;
    });
  }

  function setRowCount(count, area) {
    var design = gridFor(area);
    if (count === design.rows.length) return Promise.resolve();
    var removing = count < design.rows.length;
    var affected = removing && (design.rows.slice(count).some(function (row) {
      return row.columns.some(function (column) { return column.elements.length; });
    }) || design.rows.slice(0, count).some(function (row, index) {
      return row.columns.some(function (column) { return index + column.rowSpan > count; });
    }));
    var confirmed = affected
      ? call('confirm', [L('row_count_confirm', 'Reduce to __count__ rows? Removed rows lose their settings, their elements move to Unused, and spanning columns are shortened.')
        .replace('__count__', count), 'warning'])
      : Promise.resolve(true);
    return confirmed.then(function (accepted) {
      if (!accepted) {
        renderSelectionControls();
        return;
      }
      changeDesign(function (current) {
        if (removing) current.rows.length = count;
        while (current.rows.length < count) current.rows.push({ padding: 0, columns: [newColumn(layoutApi.UNITS)] });
      }, area);
    });
  }

  function setRowColumns(rowIndex, count, area) {
    changeDesign(function (design) {
      var row = design.rows[rowIndex];
      while (row.columns.length > count) {
        var removed = row.columns.pop();
        row.columns[row.columns.length - 1].elements = row.columns[row.columns.length - 1].elements.concat(removed.elements);
      }
      while (row.columns.length < count) row.columns.push(newColumn(1));
    }, area);
  }

  function setColumnValue(rowIndex, columnIndex, key, value, area) {
    changeDesign(function (design) {
      var column = design.rows[rowIndex].columns[columnIndex];
      column[key] = value;
      return column;
    }, area);
  }

  function moveElement(id, rowIndex, columnIndex, index, area) {
    changeDesign(function (design) {
      design.rows.forEach(function (row) {
        row.columns.forEach(function (column) {
          column.elements = column.elements.filter(function (item) { return item !== id; });
        });
      });
      if (rowIndex < 0) return;
      var elements = design.rows[rowIndex].columns[columnIndex].elements;
      elements.splice(Math.max(0, Math.min(index, elements.length)), 0, id);
    }, area);
  }

  function moveRow(from, to, area) {
    if (from === to) return;
    changeDesign(function (design) {
      design.rows.splice(to, 0, design.rows.splice(from, 1)[0]);
    }, area);
    selection = { type: 'row', row: to, area: area };
    renderLayoutEditor();
  }

  function moveColumn(rowIndex, from, to, area) {
    if (from === to) return;
    changeDesign(function (design) {
      var columns = design.rows[rowIndex].columns;
      columns.splice(to, 0, columns.splice(from, 1)[0]);
    }, area);
    selection = { type: 'column', row: rowIndex, column: to, area: area };
    renderLayoutEditor();
  }

  function sameArea(first, second) { return (first || '') === (second || ''); }

  function isSelected(type, row, column, id, area) {
    return !!selection && selection.type === type && sameArea(selection.area, area)
      && (row === undefined || selection.row === row)
      && (column === undefined || selection.column === column)
      && (id === undefined || selection.element === id);
  }

  function toggleSelection(next) {
    var same = selection && selection.type === next.type && selection.row === next.row
      && selection.column === next.column && selection.element === next.element && sameArea(selection.area, next.area);
    selection = same ? null : next;
    renderLayoutEditor();
    renderPreview();
  }

  function editorButton(className, text) {
    var button = element('button', 'hy-nostyle ' + className, text);
    button.type = 'button';
    return button;
  }

  function setPressed(button, pressed, className) {
    button.setAttribute('aria-pressed', String(pressed));
    if (className) button.classList.toggle(className, pressed);
  }

  function elementButton(id, isDesign, area) {
    var button = editorButton('style-group-element', elementLabel(id));
    var selected = isSelected('element', undefined, undefined, id, area);
    button.setAttribute('data-style-element', id);
    setPressed(button, selected, 'style-cell-selected');
    if (isDesign && selected) button.setAttribute('data-draggable', 'true');
    makeDraggable(button, 'element', id, area);
    button.addEventListener('click', function (event) {
      event.stopPropagation();
      toggleSelection({ type: 'element', element: id, area: area });
    });
    return button;
  }

  // Row labels, column slots and the Unused slot of the card grid or, with area "separator", the separator grid.
  function renderGridEditor(container, grid, area, ids, isDesign) {
    var layout = layoutApi.computeLayout(grid);
    var gridNode = element('div', 'style-group-editor-grid');
    grid.rows.forEach(function (row, rowIndex) {
      var label = editorButton('style-row-select', L('row', 'Row') + ' ' + (rowIndex + 1));
      var selected = isSelected('row', rowIndex, undefined, undefined, area);
      label.style.gridColumn = '1';
      label.style.gridRow = String(rowIndex + 1);
      label.setAttribute('data-reorder-row', String(rowIndex));
      setPressed(label, selected, 'style-row-selected');
      if (isDesign) label.title = L('row_drag', 'Drag to reorder this row');
      if (isDesign && selected) label.setAttribute('data-draggable', 'true');
      makeDraggable(label, 'row', rowIndex, area);
      label.addEventListener('click', function () { toggleSelection({ type: 'row', row: rowIndex, area: area }); });
      gridNode.appendChild(label);
    });
    layout.cells.forEach(function (cell) {
      var slot = element('div', 'style-group-slot');
      var name = (cell.row + 1) + '.' + (cell.column + 1);
      var selected = isSelected('column', cell.row, cell.column, undefined, area);
      slot.style.gridColumn = (cell.start + 2) + ' / span ' + cell.span;
      slot.style.gridRow = (cell.row + 1) + ' / span ' + cell.rowSpan;
      slot.setAttribute('data-style-group', cell.row + ':' + cell.column);
      slot.classList.toggle('style-column-selected', selected);
      slot.addEventListener('click', function () {
        toggleSelection({ type: 'column', row: cell.row, column: cell.column, area: area });
      });
      var number = editorButton('style-group-number', name);
      number.setAttribute('aria-label', L('column', 'Column') + ' ' + name);
      number.setAttribute('data-reorder-column', cell.row + ':' + cell.column);
      setPressed(number, selected);
      if (isDesign) number.title = L('column_drag', 'Drag to reorder this column');
      if (isDesign && selected) number.setAttribute('data-draggable', 'true');
      makeDraggable(number, 'column', cell.row + ':' + cell.column, area);
      number.addEventListener('click', function (event) {
        event.stopPropagation();
        toggleSelection({ type: 'column', row: cell.row, column: cell.column, area: area });
      });
      slot.appendChild(number);
      cell.elements.forEach(function (id) { slot.appendChild(elementButton(id, isDesign, area)); });
      gridNode.appendChild(slot);
    });
    container.appendChild(gridNode);

    var used = layoutApi.usedElements(grid);
    var unusedRow = element('div', 'style-unused-row');
    unusedRow.appendChild(element('span', 'style-unused-label', L('unused', 'Unused')));
    var unused = element('div', 'style-group-slot style-unused-slot');
    unused.setAttribute('data-style-group', 'unused');
    ids.forEach(function (id) {
      if (used.indexOf(id) === -1) unused.appendChild(elementButton(id, isDesign, area));
    });
    unusedRow.appendChild(unused);
    container.appendChild(unusedRow);
  }

  function renderLayoutEditor() {
    var canReorder = mode === 'design' && !isBuiltIn(selectedDesign().id);
    var helpText = byId('style-designer-help');
    helpText.hidden = !help.expanded;
    helpText.textContent = L('group_hint', '') + ' ' + L('select_before_drag', '');
    var helpToggle = byId('designer-help-toggle');
    helpToggle.disabled = !help.available || help.saving;
    helpToggle.setAttribute('aria-expanded', String(help.expanded));
    helpToggle.querySelector('i').className = 'fa fa-solid ' + (help.expanded ? 'fa-chevron-up' : 'fa-chevron-down');
    var design = selectedDesign();
    if (!design.showDaySeparators && selection && selection.area === 'separator' && selection.type !== 'separator') {
      selection = { type: 'separator', area: 'separator' };
    } else if (selection && (selection.type === 'row' || selection.type === 'column')) {
      var selectedRow = gridFor(selection.area, design).rows[selection.row];
      if (!selectedRow || (selection.type === 'column' && !selectedRow.columns[selection.column])) selection = null;
    }
    var editor = byId('group-editor');
    editor.replaceChildren();
    var widget = editorButton('style-row-select style-widget-select style-widget-root-select', L('widget', 'Widget'));
    setPressed(widget, isSelected('widget'), 'style-row-selected');
    widget.addEventListener('click', function () { toggleSelection({ type: 'widget' }); });
    editor.appendChild(widget);

    function controlArea(area) {
      var node = element('div', 'style-separator-area');
      node.setAttribute('data-style-area', area);
      var button = editorButton('style-row-select style-widget-select', partLabel(area));
      setPressed(button, isSelected('part', undefined, undefined, undefined, area), 'style-row-selected');
      button.addEventListener('click', function () { toggleSelection({ type: 'part', area: area }); });
      node.appendChild(button);
      renderGridEditor(node, gridFor(area, design), area, layoutApi.CONTROL_AREAS[area].ids, canReorder);
      editor.appendChild(node);
    }
    controlArea('toolbar');

    // The day separator has its own grid; the drag code keeps elements, rows and columns within their area.
    var separatorArea = element('div', 'style-separator-area');
    separatorArea.setAttribute('data-style-area', 'separator');
    var separator = editorButton('style-row-select style-widget-select', L('day_separator', 'Day separator'));
    separator.setAttribute('data-style-separator', '');
    setPressed(separator, isSelected('separator', undefined, undefined, undefined, 'separator'), 'style-row-selected');
    separator.addEventListener('click', function () { toggleSelection({ type: 'separator', area: 'separator' }); });
    separatorArea.appendChild(separator);
    if (design.showDaySeparators) {
      renderGridEditor(separatorArea, gridFor('separator', design), 'separator', layoutApi.SEPARATOR_ELEMENT_IDS, canReorder);
    }
    editor.appendChild(separatorArea);
    var entryArea = element('div', 'style-separator-area');
    var entry = editorButton('style-row-select style-widget-select', L('entry', 'Entry'));
    setPressed(entry, isSelected('entry'), 'style-row-selected');
    entry.addEventListener('click', function () { toggleSelection({ type: 'entry' }); });
    entryArea.appendChild(entry);
    renderGridEditor(entryArea, design, undefined, layoutApi.CARD_ELEMENT_IDS, canReorder);
    editor.appendChild(entryArea);
    controlArea('paging');
    renderSelectionControls();
  }

  function controlId(name) { return 'style-control-' + name; }

  function addSelect(container, name, labelText, options, value, onChange) {
    var label = element('label', 'hy-nostyle', labelText);
    label.htmlFor = controlId(name);
    var select = element('select', 'form-select');
    select.id = controlId(name);
    options.forEach(function (option) {
      var node = element('option', '', option[1]);
      node.value = String(option[0]);
      select.appendChild(node);
    });
    select.value = String(value);
    select.addEventListener('change', function () { onChange(select.value); });
    container.append(label, select);
    return select;
  }

  function addHint(container, text, isAlert) {
    var hint = element('p', 'help-text style-progress-full-row', text);
    if (isAlert) hint.setAttribute('role', 'alert');
    container.appendChild(hint);
    return hint;
  }

  function syncColorValidity() {
    var invalid = !!root.querySelector('.style-color-control [aria-invalid="true"]');
    root.querySelectorAll('.mode-button, #style-select, #preview-other').forEach(function (control) {
      control.disabled = invalid;
    });
    setSaveState(dirty);
  }

  function addColorSelect(container, name, label, options, value, defaultColor, onChange) {
    var swatch = element('span', 'color-swatch');
    swatch.setAttribute('aria-hidden', 'true');
    function updateSwatch(choice) {
      swatch.style.backgroundColor = swatchColor(choice, defaultColor);
    }
    updateSwatch(value);
    function applyColor(choice) {
      updateSwatch(choice);
      onChange(choice);
    }
    var custom = layoutApi.isHexColor(value);
    var wrapper = element('div', 'style-color-control');
    var hexControls = element('div', 'style-hex-controls');
    hexControls.hidden = !custom;
    var text = element('input', 'hy-nostyle form-control');
    text.type = 'text';
    text.maxLength = 7;
    text.spellcheck = false;
    text.value = custom ? value : '#2F8DF6';
    text.setAttribute('aria-label', L('color_hex', 'HEX'));
    var picker = element('input', 'hy-nostyle form-control form-control-color');
    picker.type = 'color';
    picker.value = text.value;
    picker.setAttribute('aria-label', L('color_picker', 'Color picker'));
    var select = addSelect(container, name, label, options.concat([['hex', L('color_hex', 'HEX')]]),
      custom ? 'hex' : value, function (choice) {
        hexControls.hidden = choice !== 'hex';
        if (choice === 'hex') {
          if (!layoutApi.isHexColor(text.value)) text.value = '#2F8DF6';
          commit();
        } else {
          text.removeAttribute('aria-invalid');
          error.hidden = true;
          applyColor(choice);
          syncColorValidity();
        }
      });
    container.querySelector('label').prepend(swatch);
    select.replaceWith(wrapper);
    hexControls.append(text, picker);
    wrapper.append(select, hexControls);
    var error = addHint(wrapper, L('hex_invalid', 'Enter a HEX color in #RRGGBB format.'), true);
    error.hidden = true;
    function commit() {
      var valid = layoutApi.isHexColor(text.value);
      text.setAttribute('aria-invalid', String(!valid));
      error.hidden = valid;
      if (valid) {
        picker.value = text.value;
        applyColor(text.value);
      }
      syncColorValidity();
    }
    text.addEventListener('input', commit);
    picker.addEventListener('input', function () { text.value = picker.value; commit(); });
    return select;
  }

  function addPixelSelect(container, name, label, value, min, max, fallback, onChange) {
    return addSelect(container, name, label, [['', fallback]].concat(range(min, max).map(function (pixel) {
      return [pixel, pixel];
    })), value === undefined ? '' : value, onChange);
  }

  // Number inputs only store valid values; an invalid value shows an alert instead.
  function addNumber(container, name, labelText, value, min, max, placeholder) {
    var label = element('label', 'hy-nostyle', labelText);
    label.htmlFor = controlId(name);
    var input = element('input', 'hy-nostyle form-control');
    input.id = controlId(name);
    input.type = 'number';
    input.min = String(min);
    input.max = String(max);
    input.step = '1';
    if (placeholder !== undefined) input.placeholder = String(placeholder);
    input.value = value === undefined ? '' : String(value);
    container.append(label, input);
    return input;
  }

  function fieldset(className, legend) {
    var node = element('fieldset', 'hy-nostyle ' + className);
    node.appendChild(element('legend', '', legend));
    return node;
  }

  // Works like the widget's BLL format autocomplete: type to filter or to add a custom format, then select it.
  // options: name (control ID), label and hint.
  function addFormatAutocomplete(container, value, options, onSelect) {
    var listId = controlId(options.name + '-list');
    var label = element('label', 'hy-nostyle', options.label);
    label.htmlFor = controlId(options.name);
    var wrapper = element('div', 'style-autocomplete');
    var input = element('input', 'hy-nostyle form-control');
    input.id = controlId(options.name);
    input.type = 'text';
    input.maxLength = 128;
    input.autocomplete = 'off';
    input.value = value || '';
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-controls', listId);
    var list = element('ul', 'style-autocomplete-list');
    list.id = listId;
    list.setAttribute('role', 'listbox');
    list.hidden = true;
    wrapper.append(input, list);
    container.append(label, wrapper);
    addHint(container, options.hint);
    var items = [];
    var active = -1;
    var request = 0;
    var timer = null;

    function close() {
      list.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
    }
    function render() {
      list.replaceChildren();
      items.forEach(function (item, index) {
        var option = element('li', 'style-autocomplete-option' + (index === active ? ' is-active' : ''));
        option.id = listId + '-' + index;
        option.setAttribute('role', 'option');
        option.setAttribute('aria-selected', String(index === active));
        option.appendChild(element('span', 'style-autocomplete-name', item.name));
        if (item.description) option.appendChild(element('span', 'style-autocomplete-description', item.description));
        // Keeps the input focused, so blur does not close the list before the click selects.
        option.addEventListener('mousedown', function (event) { event.preventDefault(); });
        option.addEventListener('click', function () { choose(item); });
        list.appendChild(option);
      });
      var open = items.length > 0 && document.activeElement === input;
      list.hidden = !open;
      input.setAttribute('aria-expanded', String(open));
      if (open && active >= 0) {
        input.setAttribute('aria-activedescendant', listId + '-' + active);
        list.children[active].scrollIntoView({ block: 'nearest' });
      } else input.removeAttribute('aria-activedescendant');
    }
    function load() {
      var id = ++request;
      api('GET', '/widget-datetime-formats?query=' + encodeURIComponent(input.value.trim())).then(function (result) {
        if (id !== request) return;
        items = Array.isArray(result) ? result : [];
        active = -1;
        render();
      }).catch(function () {
        if (id !== request) return;
        items = [];
        render();
      });
    }
    function choose(item) {
      input.value = item.name;
      value = item.name;
      close();
      onSelect(item.name);
    }
    input.addEventListener('focus', load);
    input.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(load, 200);
    });
    input.addEventListener('keydown', function (event) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (list.hidden) { load(); return; }
        var step = event.key === 'ArrowDown' ? 1 : -1;
        active = items.length ? (active + step + items.length) % items.length : -1;
        render();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        var item = items[active >= 0 ? active : 0];
        if (!list.hidden && item) choose(item);
      } else if (event.key === 'Escape' && !list.hidden) {
        event.preventDefault();
        close();
      }
    });
    // Like the widget setting, typed text only counts once it is selected.
    input.addEventListener('blur', function () {
      clearTimeout(timer);
      request++;
      close();
      input.value = value || '';
    });
  }

  function colorOptions(values) {
    return values.map(function (value) {
      if (value === 'default') return [value, L('color_default', 'App default')];
      if (value === 'none') return [value, L('color_none', 'None')];
      if (value === 'severity') return [value, t('widgets.fields.severity', 'Severity')];
      return [value, t('widgets.settings.colorNames.' + value, colorNameFallbacks[value])];
    });
  }

  function renderSelectionControls() {
    var container = byId('selection-controls');
    container.replaceChildren();
    syncColorValidity();
    var item = mode === 'design' ? selectedDesign() : selectedTheme();
    if (!selection || isBuiltIn(item.id)) return;
    if (mode === 'theme') {
      renderThemeControls(container);
      return;
    }
    var design = selectedDesign();
    var area = selection.area;
    var grid = gridFor(area, design);
    var group;
    var controls = element('div', 'style-position-controls');
    if (selection.type === 'widget' || selection.type === 'separator' || selection.type === 'part') {
      var isSeparator = selection.type === 'separator';
      var isControlPart = selection.type === 'part';
      group = fieldset('style-progress-controls', area ? partLabel(area) : L('widget', 'Widget'));
      if (isSeparator) {
        var show = element('label', 'hy-nostyle style-full-row');
        var checkbox = element('input', 'hy-nostyle');
        checkbox.type = 'checkbox';
        checkbox.id = controlId('day-separators');
        checkbox.checked = design.showDaySeparators;
        checkbox.addEventListener('change', function () {
          selectedDesign().showDaySeparators = checkbox.checked;
          setDirty();
          renderLayoutEditor();
          byId(controlId('day-separators')).focus();
        });
        show.append(checkbox, element('span', '', t('widgets.settings.daySeparators', 'Show day separators')));
        controls.appendChild(show);
      }
      if (!isSeparator || design.showDaySeparators) {
        addSelect(controls, 'row-count', L('row_count', 'Number of rows'),
          range(1, maxRowsFor(area)).map(function (value) { return [value, value]; }), grid.rows.length, function (value) {
            setRowCount(Number(value), area).catch(function (error) { setStatus(error.message, true); });
          });
      }
      if (isControlPart) {
        var gap = addNumber(controls, 'control-gap', L('control_gap', 'Spacing (px)'), grid.gap, 0, 40,
          layoutApi.CONTROL_AREAS[area].gap);
        var gapError = addHint(controls, L('control_spacing_invalid', 'Enter a whole number from 0 to 40.'), true);
        gapError.hidden = true;
        gap.addEventListener('input', function () {
          var valid = gap.value === '' || (Number.isInteger(Number(gap.value)) && Number(gap.value) >= 0 && Number(gap.value) <= 40);
          gapError.hidden = valid;
          if (!valid) return;
          var current = gridFor(area, undefined, true);
          if (gap.value === '') delete current.gap;
          else current.gap = Number(gap.value);
          setDirty();
        });
      } else if (isSeparator) {
        if (design.showDaySeparators) addHint(controls, L('separator_hint', 'Arrange the date and the line like the entries, in up to two rows.'));
      }
      else {
        addPixelSelect(controls, 'widget-border-width', L('widget_border_width', 'Border width (px)'),
          design.widgetBorderless ? 0 : design.widgetBorderWidth || undefined, 0, 20, L('padding_default', 'Homey default'), function (value) {
            var current = selectedDesign();
            current.widgetBorderWidth = value === '' ? 0 : Number(value);
            if (value === '0') current.widgetBorderless = true;
            else delete current.widgetBorderless;
            setDirty();
          });
        addHint(controls, L('widget_padding_hint', 'App default preserves the widget\'s normal padding.'));
        ['top', 'right', 'bottom', 'left'].forEach(function (side) {
          addPixelSelect(controls, 'widget-padding-' + side, L('padding_' + side, side),
            (design.widgetPadding || {})[side], 0, 100, L('color_default', 'App default'), function (value) {
              var current = selectedDesign();
              var padding = current.widgetPadding = current.widgetPadding || {};
              if (value === '') delete padding[side];
              else padding[side] = Number(value);
              if (!Object.keys(padding).length) delete current.widgetPadding;
              setDirty();
            });
        });
      }
    } else if (selection.type === 'row') {
      var rowIndex = selection.row;
      var row = grid.rows[rowIndex];
      if (!row) {
        selection = null;
        return;
      }
      group = fieldset('style-row-rules', (area ? partLabel(area) + ' - ' : '')
        + L('row', 'Row') + ' ' + (rowIndex + 1));
      addSelect(controls, 'row-columns', L('row_columns', 'Number of columns'),
        range(1, Math.max(1, availableUnits(grid, rowIndex))).map(function (value) { return [value, value]; }),
        row.columns.length, function (value) { setRowColumns(rowIndex, Number(value), area); });
      var padding = addNumber(controls, 'row-padding', L('row_top_padding', 'Top padding (px)'), row.padding, 0, 100);
      addHint(controls, L('row_top_padding_hint', 'Adds space above the row\'s contents.'));
      var paddingError = addHint(controls, L('row_padding_invalid', 'Enter a whole number from 0 to 100.'), true);
      paddingError.hidden = true;
      padding.addEventListener('input', function () {
        var value = Number(padding.value);
        var valid = padding.value !== '' && Number.isInteger(value) && value >= 0 && value <= 100;
        paddingError.hidden = valid;
        if (!valid) return;
        gridFor(area, undefined, true).rows[rowIndex].padding = value;
        setDirty();
      });
      addPixelSelect(controls, 'row-column-gap', L('column_gap', 'Column gap (px)'), row.columnGap,
        0, 100, L('color_default', 'App default'), function (value) {
          var current = gridFor(area, undefined, true).rows[rowIndex];
          if (value === '') delete current.columnGap;
          else current.columnGap = Number(value);
          setDirty();
        });
    } else if (selection.type === 'column') {
      var columnRow = selection.row;
      var columnIndex = selection.column;
      var column = grid.rows[columnRow] && grid.rows[columnRow].columns[columnIndex];
      if (!column) {
        selection = null;
        return;
      }
      group = fieldset('style-column-controls', (area ? partLabel(area) + ' - ' : '')
        + L('column', 'Column') + ' ' + (columnRow + 1) + '.' + (columnIndex + 1));
      var maxSpan = Math.max(1, availableUnits(grid, columnRow) - (grid.rows[columnRow].columns.length - 1));
      addSelect(group, 'column-span', L('column_span', 'Column span'), range(1, maxSpan).map(function (value) { return [value, value]; }),
        Math.min(column.span, maxSpan), function (value) { setColumnValue(columnRow, columnIndex, 'span', Number(value), area); });
      addHint(group, L('column_span_hint', ''));
      addSelect(group, 'column-row-span', L('column_row_span', 'Rows spanned'),
        availableRowSpans(grid, columnRow, columnIndex).map(function (value) { return [value, value]; }),
        column.rowSpan, function (value) { setColumnValue(columnRow, columnIndex, 'rowSpan', Number(value), area); });
      addHint(group, L('column_row_span_hint', ''));
      addSelect(group, 'column-alignment', L('column_alignment', 'Element alignment'), [
        ['left', L('align_left', 'Left')], ['center', L('align_center', 'Center')],
        ['right', L('align_right', 'Right')], ['stretch', L('align_stretch', 'Stretch')]
      ], column.align, function (value) { setColumnValue(columnRow, columnIndex, 'align', value, area); });
      addSelect(group, 'column-vertical-alignment', L('column_vertical_alignment', 'Vertical alignment'), [
        ['top', L('align_top', 'Top')], ['middle', L('align_middle', 'Middle')], ['bottom', L('align_bottom', 'Bottom')]
      ], column.valign, function (value) { setColumnValue(columnRow, columnIndex, 'valign', value, area); });
      if (isSeparatorArea(area) && column.elements.indexOf(LINE_ID) !== -1 && gridFor('separator', design).linePosition !== 'above'
        && gridFor('separator', design).linePosition !== 'below') {
        addHint(group, L('line_position_hint', 'The vertical alignment places the line at the top, middle or bottom of this column.'));
      }
      addSelect(group, 'column-direction', L('column_direction', 'Element direction'), [
        ['horizontal', L('direction_horizontal', 'Horizontal')], ['vertical', L('direction_vertical', 'Vertical')]
      ], column.direction, function (value) { setColumnValue(columnRow, columnIndex, 'direction', value, area); });
      addSelect(group, 'column-width', L('column_width', 'Column width'), [
        ['span', L('width_span', 'Fill available space by span')], ['content', L('width_content', 'Fit to content')]
      ], column.width, function (value) { setColumnValue(columnRow, columnIndex, 'width', value, area); });
      if (column.rowSpan > 1) addHint(group, L('row_span_fit_hint', ''));
      addPixelSelect(group, 'column-element-gap', L('element_gap', 'Element gap (px)'), column.elementGap,
        0, 100, L('color_default', 'App default'), function (value) {
          changeDesign(function (current) {
            var column = current.rows[columnRow].columns[columnIndex];
            if (value === '') delete column.elementGap;
            else column.elementGap = Number(value);
          }, area);
        });
      container.appendChild(group);
      return;
    } else if (selection.type === 'element' && selection.element === LINE_ID) {
      var line = gridFor('separator', design);
      group = fieldset('style-progress-controls', L('day_separator', 'Day separator') + ' - ' + elementLabel(LINE_ID));
      addSelect(controls, 'line-position', L('line_position', 'Line position'), layoutApi.LINE_POSITIONS.map(function (position) {
        return [position, L('line_positions.' + position, linePositionFallbacks[position])];
      }), line.linePosition || 'behind', function (value) {
        gridFor('separator').linePosition = value;
        setDirty();
      });
      addSelect(controls, 'line-thickness', L('line_thickness', 'Line thickness (px)'),
        range(1, layoutApi.MAX_LINE_THICKNESS).map(function (value) { return [value, value]; }), line.lineThickness || 1, function (value) {
          gridFor('separator').lineThickness = Number(value);
          setDirty();
        });
      addSelect(controls, 'line-style', L('line_style', 'Line style'), layoutApi.LINE_STYLES.map(function (style) {
        return [style, L('line_styles.' + style, lineStyleFallbacks[style])];
      }), line.lineStyle || 'solid', function (value) {
        gridFor('separator').lineStyle = value;
        setDirty();
      });
      addHint(controls, L('line_hint', 'Behind draws the line through the date. Above and Below put it on its own line above or below the date. You can also drag the line into its own row or column.'));
    } else if (selection.type === 'element' && isBorder(selection.element)) {
      var borderId = selection.element;
      var border = layoutApi.elementBorder(design, borderId);
      group = fieldset('style-progress-controls', elementLabel(borderId));
      var setBorder = function (key, value) {
        var current = selectedDesign();
        current.elementBorders = current.elementBorders || {};
        current.elementBorders[borderId] = Object.assign(layoutApi.elementBorder(current, borderId), current.elementBorders[borderId]);
        current.elementBorders[borderId][key] = value;
        setDirty();
      };
      addSelect(controls, 'border-side', L('border_side', 'Position'), layoutApi.BORDER_SIDES.map(function (side) {
        return [side, L('border_sides.' + side, borderSideFallbacks[side])];
      }), border.side, function (value) { setBorder('side', value); });
      addSelect(controls, 'border-thickness', L('border_thickness', 'Thickness (px)'),
        range(1, layoutApi.MAX_LINE_THICKNESS).map(function (value) { return [value, value]; }), border.thickness, function (value) {
          setBorder('thickness', Number(value));
        });
      addHint(controls, L('border_hint', 'Draws a border on this side of the column, in the severity colour unless the theme sets another. When the column covers that whole side of the card, the border becomes the card\'s own border.'));
    } else if (selection.type === 'element') {
      var id = selection.element;
      group = fieldset('style-progress-controls', id === SEPARATOR_ID
        ? L('day_separator', 'Day separator') + ' - ' + elementLabel(id) : elementLabel(id));
      var sizes = design.elementSizes || {};
      var size = addNumber(controls, 'element-size', L('size_current', 'Size override (px)'), sizes[id], 4, 100,
        layoutApi.DEFAULT_SIZES[id]);
      addHint(controls, L('size_default', 'App default: __size__ px. Leave empty to use the default.')
        .replace('__size__', layoutApi.DEFAULT_SIZES[id]));
      var sizeError = addHint(controls, L('size_invalid', 'Enter a whole number from 4 to 100.'), true);
      sizeError.hidden = true;
      size.addEventListener('input', function () {
        var value = Number(size.value);
        var current = selectedDesign();
        var valid = size.value === '' || (Number.isInteger(value) && value >= 4 && value <= 100);
        sizeError.hidden = valid;
        if (!valid) return;
        current.elementSizes = current.elementSizes || {};
        if (size.value === '') delete current.elementSizes[id];
        else current.elementSizes[id] = value;
        setDirty();
      });
      var fonts = design.elementFonts || {};
      addPixelSelect(controls, 'element-line-height', L('line_height', 'Line height (px)'),
        (design.elementLineHeights || {})[id], 4, 100, L('color_default', 'App default'), function (value) {
          var current = selectedDesign();
          var heights = current.elementLineHeights = current.elementLineHeights || {};
          if (value === '') delete heights[id];
          else heights[id] = Number(value);
          if (!Object.keys(heights).length) delete current.elementLineHeights;
          setDirty();
        });
      addSelect(controls, 'element-font', L('font', 'Font'), [['', L('font_default', 'App default')]].concat(
        layoutApi.FONT_IDS.map(function (font) { return [font, L('fonts.' + font, fontFallbacks[font])]; })
      ), fonts[id] || '', function (value) {
        var current = selectedDesign();
        current.elementFonts = current.elementFonts || {};
        if (value) current.elementFonts[id] = value;
        else delete current.elementFonts[id];
        setDirty();
      });
      addHint(controls, L('font_hint', 'Leave on App default to keep the widget\'s own font.'));
      var textStyles = (design.elementTextStyles || {})[id] || {};
      Object.keys(layoutApi.TEXT_STYLES).forEach(function (option) {
        if (option === 'wrap' && id !== 'timestamp' && id !== 'timestamp2') return;
        addSelect(controls, 'element-text-' + option, L('text_styles.' + option, textStyleFallbacks[option]),
          [['', L('font_default', 'App default')]].concat(Object.keys(layoutApi.TEXT_STYLES[option].values).map(function (value) {
            return [value, L('text_styles.' + option + '_values.' + value, textStyleValueFallbacks[option][value])];
          })), textStyles[option] || '', function (value) {
            var current = selectedDesign();
            var styles = current.elementTextStyles = current.elementTextStyles || {};
            var next = Object.assign({}, styles[id]);
            if (value) next[option] = value;
            else delete next[option];
            if (Object.keys(next).length) styles[id] = next;
            else delete styles[id];
            setDirty();
          });
      });
      if (layoutApi.CONTROL_IDS.indexOf(id) !== -1) {
        addHint(controls, L('control_hint', 'Leave overrides empty to keep the app defaults.'));
        Object.keys(layoutApi.CONTROL_STYLE_LIMITS).forEach(function (key) {
          var limits = layoutApi.CONTROL_STYLE_LIMITS[key];
          var input = addNumber(controls, 'control-' + key, L('control_' + key, key),
            (design.controlStyles && design.controlStyles[id] || {})[key], limits[0], limits[1]);
          var error = addHint(controls, L('control_value_invalid', 'Enter a whole number from __min__ to __max__.')
            .replace('__min__', limits[0]).replace('__max__', limits[1]), true);
          error.hidden = true;
          input.addEventListener('input', function () {
            var value = Number(input.value);
            var valid = input.value === '' || (Number.isInteger(value) && value >= limits[0] && value <= limits[1]);
            error.hidden = valid;
            if (!valid) return;
            var current = selectedDesign();
            var styles = current.controlStyles = current.controlStyles || {};
            var next = Object.assign({}, styles[id]);
            if (input.value === '') delete next[key];
            else next[key] = value;
            if (Object.keys(next).length) styles[id] = next;
            else delete styles[id];
            if (!Object.keys(styles).length) delete current.controlStyles;
            setDirty();
          });
        });
      }
      if (id === 'timestamp' || id === 'timestamp2') {
        var formatKey = id === 'timestamp2' ? 'timestamp2Format' : 'timestampFormat';
        addFormatAutocomplete(controls, design[formatKey] || layoutApi.DEFAULT_TIMESTAMP2_FORMAT, {
          name: id + '-format',
          label: t('widgets.settings.timestampFormat', 'Date and time format'),
          hint: id === 'timestamp' ? t('widgets.settings.timestampFormatHint', '') : ''
        }, function (format) {
          selectedDesign()[formatKey] = format;
          setDirty();
          renderPreview();
        });
      } else if (id === SEPARATOR_ID) {
        addFormatAutocomplete(controls, design.daySeparatorFormat, {
          name: 'day-separator-format',
          label: t('widgets.settings.daySeparatorFormat', 'Day separator format'),
          hint: t('widgets.settings.daySeparatorFormatHint', '')
        }, function (format) {
          selectedDesign().daySeparatorFormat = format;
          setDirty();
          renderPreview();
        });
      }
    } else {
      return;
    }
    group.appendChild(controls);
    container.appendChild(group);
  }

  function isSeparatorArea(area) { return area === 'separator'; }

  function renderThemeControls(container) {
    if (selection.type === 'widget' || selection.type === 'entry') {
      var isEntry = selection.type === 'entry';
      var colors = isEntry ? fieldset('style-colors ssl-palette', L('entry', 'Entry')) : element('div', 'style-colors ssl-palette');
      if (!isEntry) container.appendChild(element('h3', '', t('widgets.settings.colorsTitle', 'Colors')));
      setColorPaletteMode(colors);
      container.appendChild(colors);
      renderColors(colors, isEntry ? entryColorRoles : widgetColorRoles);
      addHint(container, L('colors_hint', 'App default keeps the widget\'s own color, which follows light and dark mode.'));
      return;
    }
    if (selection.type !== 'element') return;
    container.appendChild(element('h3', '', t('widgets.settings.colorsTitle', 'Colors')));
    var id = selection.element;
    var inSeparator = id === SEPARATOR_ID || id === LINE_ID;
    var isControl = layoutApi.CONTROL_IDS.indexOf(id) !== -1;
    var fieldsetNode = fieldset('style-colors ssl-palette', inSeparator
      ? L('day_separator', 'Day separator') + ' - ' + elementLabel(id) : elementLabel(id));
    var theme = selectedTheme();
    setColorPaletteMode(fieldsetNode);
    var themeStyle = layoutApi.widgetStyle(null, theme);
    Object.keys(themeStyle).forEach(function (key) {
      if (key.indexOf('--ssl-') === 0) fieldsetNode.style.setProperty(key, themeStyle[key]);
    });
    // Severity-dependent colors use the first sample entry as the representative color.
    var sampleLevel = severityNames[previewEntries(false)[0].severity];
    fieldsetNode.style.setProperty('--ssl-sev', 'var(--ssl-' + sampleLevel + ')');
    var current = (theme.elements && theme.elements[id]) || { color: 'default', background: 'default' };
    function update(key, value) {
      var item = selectedTheme();
      item.elements = item.elements || {};
      var next = Object.assign({ color: 'default', background: 'default' }, item.elements[id]);
      next[key] = value;
      if (next.color === 'default' && next.background === 'default') delete item.elements[id];
      else item.elements[id] = next;
      setDirty();
    }
    // The line and borders only have a colour; their thickness and position belong to the design.
    var entries = [['color', L('color', 'Color'), inSeparator || isControl ? separatorColors : elementColors]];
    if (id !== LINE_ID && !isBorder(id)) entries.push(['background', L('background', 'Background'),
      inSeparator || isControl ? separatorBackgrounds : elementBackgrounds]);
    entries.forEach(function (entry) {
      var row = element('div', 'style-color-row');
      addColorSelect(row, 'element-' + entry[0], entry[1], colorOptions(entry[2]), current[entry[0]],
        elementDefaultColor(id, entry[0], sampleLevel), function (value) { update(entry[0], value); });
      fieldsetNode.appendChild(row);
    });
    addHint(fieldsetNode, L('element_colors_hint', 'App default keeps the element\'s normal appearance, based on the Widget colors.'));
    container.appendChild(fieldsetNode);
  }

  // Pointer-based dragging works with a mouse and on touch screens in the Homey app.
  function clearInsertion() {
    if (dragInsertion.indicator) dragInsertion.indicator.remove();
    dragInsertion.indicator = null;
    if (dragInsertion.highlighted) dragInsertion.highlighted.classList.remove('style-group-drop-target');
    dragInsertion.highlighted = null;
  }

  function highlightTarget(node) {
    clearInsertion();
    dragInsertion.highlighted = node;
    node.classList.add('style-group-drop-target');
  }

  function showInsertion(slot, y, source) {
    highlightTarget(slot);
    var unused = slot.getAttribute('data-style-group') === 'unused';
    var items = Array.prototype.slice.call(slot.querySelectorAll('[data-style-element]')).filter(function (item) {
      return item.getAttribute('data-style-element') !== source;
    });
    var index = unused ? -1 : items.findIndex(function (item) {
      var bounds = item.getBoundingClientRect();
      return y < bounds.top + bounds.height / 2;
    });
    if (index === -1) index = items.length;
    var slotBounds = slot.getBoundingClientRect();
    var bounds = items[index] ? items[index].getBoundingClientRect()
      : items.length ? items[items.length - 1].getBoundingClientRect() : slotBounds;
    var top = unused ? slotBounds.top + 4 : items[index] ? bounds.top : items.length ? bounds.bottom : slotBounds.bottom - 5;
    var reference = items[index] || items[items.length - 1];
    var text = unused ? L('drop_unused', 'Move to Unused')
      : items[index] ? L('drop_before', 'Before __element__')
        : reference ? L('drop_after', 'After __element__') : L('drop_empty', 'In empty column');
    var indicator = element('div', 'style-group-insertion-indicator');
    indicator.appendChild(element('span', 'style-group-insertion-label',
      text.replace('__element__', reference ? reference.textContent.trim() : '')));
    indicator.style.left = (slotBounds.left + 4) + 'px';
    indicator.style.width = Math.max(0, slotBounds.width - 8) + 'px';
    indicator.style.top = top + 'px';
    document.body.appendChild(indicator);
    dragInsertion.indicator = indicator;
    return unused ? 0 : index;
  }

  function areaOf(node) {
    var area = node.closest('[data-style-area]');
    return area ? area.getAttribute('data-style-area') : undefined;
  }

  function findDropTarget(drag, x, y) {
    clearInsertion();
    var target = document.elementFromPoint(x, y);
    var editor = byId('group-editor');
    if (!target || !editor.contains(target) || !sameArea(areaOf(target), drag.area)) return null;
    if (drag.kind === 'element') {
      var slot = target.closest('[data-style-group]');
      if (!slot) return null;
      return { group: slot.getAttribute('data-style-group'), index: showInsertion(slot, y, drag.source) };
    }
    if (drag.kind === 'row') {
      var row = target.closest('[data-reorder-row]');
      if (!row) return null;
      highlightTarget(row);
      return { row: Number(row.getAttribute('data-reorder-row')) };
    }
    var column = target.closest('[data-style-group]');
    var sourceRow = String(drag.source).split(':')[0];
    if (!column || column.getAttribute('data-style-group').split(':')[0] !== sourceRow) return null;
    highlightTarget(column);
    return { column: Number(column.getAttribute('data-style-group').split(':')[1]) };
  }

  function dropOn(drag, target) {
    if (drag.kind === 'element') {
      if (target.group === 'unused') {
        moveElement(drag.source, -1, 0, 0, drag.area);
        return;
      }
      var position = target.group.split(':').map(Number);
      moveElement(drag.source, position[0], position[1], target.index, drag.area);
    } else if (drag.kind === 'row') {
      moveRow(drag.source, target.row, drag.area);
    } else {
      var source = String(drag.source).split(':').map(Number);
      moveColumn(source[0], source[1], target.column, drag.area);
    }
  }

  function endDrag(event, drop) {
    var drag = dragState;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragState = null;
    if (drag.ghost) drag.ghost.remove();
    drag.node.classList.remove('style-touch-dragging');
    var target = drag.active && drop ? findDropTarget(drag, event.clientX, event.clientY) : null;
    clearInsertion();
    if (drag.active) {
      suppressClick = true;
      setTimeout(function () { suppressClick = false; }, 0);
    }
    if (target) dropOn(drag, target);
  }

  function makeDraggable(node, kind, source, area) {
    node.addEventListener('click', function (event) {
      if (!suppressClick) return;
      suppressClick = false;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, true);
    node.addEventListener('pointerdown', function (event) {
      if (node.getAttribute('data-draggable') !== 'true' || event.button > 0 || dragState) return;
      dragState = { kind: kind, source: source, area: area, node: node, pointerId: event.pointerId,
        x: event.clientX, y: event.clientY, active: false, ghost: null };
      try {
        node.setPointerCapture(event.pointerId);
      } catch (error) {
        // Without pointer capture, dragging still works while the pointer stays on the item.
      }
    });
    node.addEventListener('pointermove', function (event) {
      var drag = dragState;
      if (!drag || drag.node !== node || drag.pointerId !== event.pointerId) return;
      if (!drag.active) {
        if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 6) return;
        drag.active = true;
        drag.ghost = element('div', 'style-touch-drag-ghost', node.textContent.trim());
        document.body.appendChild(drag.ghost);
        node.classList.add('style-touch-dragging');
      }
      event.preventDefault();
      drag.ghost.style.left = event.clientX + 'px';
      drag.ghost.style.top = event.clientY + 'px';
      findDropTarget(drag, event.clientX, event.clientY);
    });
    node.addEventListener('pointerup', function (event) { endDrag(event, true); });
    node.addEventListener('pointercancel', function (event) { endDrag(event, false); });
  }

  function renderColors(colors, roles) {
    var theme = selectedTheme();
    var builtin = isBuiltIn(theme.id);
    function updateGradientEndSwatch() {
      colors.style.setProperty('--ssl-gradient-end-swatch', layoutApi.gradientEndColor(selectedTheme().colors.background));
    }
    if (roles.indexOf('background') !== -1) updateGradientEndSwatch();
    roles.forEach(function (key) {
      var row = document.createElement('div');
      row.className = 'style-color-row';
      var choices = colorNames.map(function (name) {
        return [name, name === 'automatic' ? L('color_default', 'App default')
          : t('widgets.settings.colorNames.' + name, colorNameFallbacks[name])];
      });
      if (key === 'background') choices.unshift(['none', L('color_none', 'None')]);
      var input = addColorSelect(row, 'theme-color-' + key, t(translations[key][0], translations[key][1]), choices,
        theme.colors[key], 'var(--ssl-' + key + ')', function (value) {
          selectedTheme().colors[key] = value;
          if (key === 'background') updateGradientEndSwatch();
          setDirty();
        });
      input.disabled = builtin;
      colors.appendChild(row);
      if (key === 'background') {
        var fill = element('div', 'style-color-row style-color-row-no-swatch');
        var fillInput = addSelect(fill, 'background-gradient', L('background_fill', 'Background fill'), [
          ['default', L('color_default', 'App default')],
          ['solid', L('background_solid', 'Solid')], ['gradient', L('background_gradient', 'Gradient')]
        ], theme.backgroundGradient === undefined ? 'default' : theme.backgroundGradient ? 'gradient' : 'solid', function (value) {
          var current = selectedTheme();
          if (value === 'default') delete current.backgroundGradient;
          else current.backgroundGradient = value === 'gradient';
          syncGradientEnd();
          setDirty();
        });
        fillInput.disabled = builtin;
        colors.appendChild(fill);
        var end = element('div', 'style-color-row');
        addColorSelect(end, 'background-gradient-end', L('background_gradient_end', 'Gradient end color'),
          choices.filter(function (choice) { return choice[0] !== 'none'; }), theme.backgroundGradientEnd || 'automatic',
          'var(--ssl-gradient-end-swatch)', function (value) {
            if (value === 'automatic') delete selectedTheme().backgroundGradientEnd;
            else selectedTheme().backgroundGradientEnd = value;
            setDirty();
          });
        function syncGradientEnd() {
          end.querySelectorAll('select, input').forEach(function (control) {
            control.disabled = builtin || !selectedTheme().backgroundGradient;
          });
        }
        syncGradientEnd();
        colors.appendChild(end);
      }
    });
  }

  function showScreen(screen) {
    if (templates.busy) return;
    root.querySelectorAll('.designer-screen').forEach(function (panel) {
      panel.hidden = panel.dataset.screen !== screen;
    });
    byId('designer-savebar').hidden = screen !== 'editor';
    byId('designer-template-footer').hidden = screen !== 'templates';
    setStatus('');
    if (screen === 'templates') {
      renderExportSelectors();
      showTemplateSection('export');
    } else {
      closeReview();
      clearExport();
    }
  }

  function showTemplateSection(section) {
    if (templates.busy || ['export', 'import', 'catalog'].indexOf(section) === -1) return;
    templates.section = section;
    root.querySelectorAll('.template-section-button').forEach(function (button) {
      button.setAttribute('aria-pressed', String(button.dataset.section === section));
    });
    root.querySelectorAll('[data-template-section]').forEach(function (panel) {
      panel.hidden = panel.dataset.templateSection !== section;
    });
    closeReview();
    setStatus('');
    if (section === 'catalog') {
      if (templates.catalog) renderCatalog();
      else loadCatalog();
    }
  }

  function setBusy(busy) {
    templates.busy = busy;
    root.querySelectorAll('.template-section-button, #open-exchange, #load-catalog, #save-template, .template-catalog-row button, .template-catalog-details button')
      .forEach(function (button) { button.disabled = busy; });
    byId('close-templates').disabled = busy;
    byId('catalog-previews').disabled = busy || !templates.previewsAvailable;
    byId('import-template').disabled = busy || !byId('import-code').value.trim();
    byId('copy-forum-post').disabled = busy || !templates.imageData;
    byId('post-forum').disabled = busy || templates.copyStatus !== 'copied';
    updateExport();
  }

  function setGenerating(generating) {
    templates.generating = generating;
    var settingsMain = document.getElementById('settings-main-view');
    var overlay = document.getElementById('template-generation-overlay');
    if (settingsMain) {
      if (generating) {
        settingsMain.setAttribute('inert', '');
        settingsMain.setAttribute('aria-busy', 'true');
      } else {
        settingsMain.removeAttribute('inert');
        settingsMain.removeAttribute('aria-busy');
      }
    }
    if (overlay) {
      overlay.hidden = !generating;
      overlay.setAttribute('aria-busy', String(generating));
    }
  }

  function openExchange(number) {
    var url = forumTopicUrl + (number === undefined ? '' : '/' + number);
    if (number !== undefined && (!Number.isSafeInteger(number) || number < 1)) return;
    if (Homey && typeof Homey.openURL === 'function') Homey.openURL(url);
    else window.open(url, '_blank', 'noopener');
  }

  function alertMessage(message) {
    call('alert', [message, null]).catch(function () {});
  }

  function copyField(id) {
    var field = byId(id);
    if (!field || !field.value) return;
    field.focus();
    field.select();
    var copied;
    try {
      copied = document.execCommand('copy');
    } catch (error) {
      copied = false;
    }
    if (!copied) alertMessage(t('widgets.settings.copyError', 'Could not copy. Select the text and copy it manually.'));
    else if (id === 'template-code' && templates.copyStatus === 'copied') setCopyStatus(null);
  }

  function swatchColor(name, defaultColor) {
    return name === 'automatic' || name === 'default' ? defaultColor : layoutApi.colorValue(name);
  }

  function elementDefaultColor(id, role, sampleLevel) {
    if (role === 'background') {
      if (id === 'severity') return 'var(--ssl-sev)';
      if (id === 'facility') return 'color-mix(in srgb, var(--ssl-muted) 18%, transparent)';
      if ([SEPARATOR_ID, 'search', 'filter', 'previousPage', 'nextPage'].indexOf(id) !== -1) return 'var(--ssl-surface)';
      return 'transparent';
    }
    if (id === 'severity') return 'var(--ssl-' + sampleLevel + '-text, var(--ssl-color-black))';
    if (isBorder(id)) return 'var(--ssl-sev)';
    if (id === LINE_ID) return 'var(--ssl-border)';
    if (['timestamp', 'timestamp2', 'hostname', 'facility', 'filter', 'pageNumber'].indexOf(id) !== -1) return 'var(--ssl-muted)';
    return 'var(--ssl-text)';
  }

  function setColorPaletteMode(palette) {
    palette.classList.toggle('ssl-mode-dark', previewMode === 'dark');
    palette.classList.toggle('ssl-mode-light', previewMode !== 'dark');
  }

  function updateColorPaletteModes() {
    root.querySelectorAll('.style-colors.ssl-palette').forEach(setColorPaletteMode);
  }

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function setIconLabel(node, icon, text) {
    var glyph = element('i', 'fa fa-solid ' + icon);
    glyph.setAttribute('aria-hidden', 'true');
    node.replaceChildren(glyph, document.createTextNode(' ' + text));
  }

  function previewEntries(allLevels) {
    var examples = [
      { date: previewDates[0], severity: 4, severityName: t('widgets.settings.colors.warning', 'Warning'), facility: 'Flow', app: 'Heating', hostname: 'Homey', message: 'A temperature has changed. This message wraps to fit the widget.' },
      { date: previewDates[0], severity: 5, severityName: t('widgets.settings.colors.notice', 'Notice'), facility: 'User', app: 'Backup', hostname: 'Homey', message: 'Network backup completed.' },
      { date: previewDates[1], severity: 3, severityName: t('widgets.settings.colors.error', 'Error'), facility: 'System', app: 'Simple (Sys) Log', hostname: 'Homey', message: 'Widget preview entry.' }
    ];
    if (!allLevels) {
      return examples.concat(examples.map(function (entry) {
        return Object.assign({}, entry, { date: previewDates[1] });
      }));
    }
    return [
      { facility: 'System', app: 'Homey', message: 'System unavailable. Immediate action required.' },
      { facility: 'System', app: 'Storage', message: 'Storage is almost full. Action is required.' },
      { facility: 'System', app: 'Services', message: 'A service stopped unexpectedly.' },
      examples[2],
      examples[0],
      examples[1],
      { facility: 'Flow', app: 'Flows', message: 'The scheduled Flow completed successfully.' },
      { facility: 'System', app: 'Devices', message: 'Received a new device status update.' }
    ].map(function (entry, level) {
      var name = severityNames[level];
      return Object.assign({}, entry, {
        date: previewDates[level < 4 ? 0 : 1],
        severity: level,
        severityName: name.charAt(0).toUpperCase() + name.slice(1),
        hostname: 'Homey'
      });
    });
  }

  // forcedMode captures the complete widget and every severity without the settings page's counter-invert.
  function renderWidgetPreview(preview, design, theme, extraClass, selected, forcedMode) {
    selected = selected || {};
    var selectedElement = selected.type === 'element' ? selected.element : undefined;
    var inSeparator = selected.area === 'separator';
    if (!preview || !design || !theme) return;
    function previewText(key, fallback) { return forcedMode ? fallback : t(key, fallback); }
    var locale = forcedMode ? 'en' : undefined;
    preview.className = 'ssl-widget preview-widget ssl-mode-' + (forcedMode || previewMode)
      + (!forcedMode && homeyInvertsPage() ? ' preview-counter-invert' : '')
      + (selected.type === 'widget' ? ' ssl-preview-selected' : '') + (extraClass ? ' ' + extraClass : '');
    preview.removeAttribute('style');
    var widgetStyle = layoutApi.widgetStyle(design, theme);
    Object.keys(widgetStyle).forEach(function (key) {
      preview.style.setProperty(key, widgetStyle[key]);
    });
    preview.replaceChildren();
    var toolbar = element('header', 'ssl-widget-toolbar');
    var toolbarRow = element('div', 'ssl-toolbar-row');
    var searchError = element('span', 'ssl-search-error');
    searchError.setAttribute('role', 'alert');
    searchError.style.display = 'none';
    var search = element('input', 'ssl-log-search');
    search.type = 'search';
    search.placeholder = previewText('widgets.search', 'Search');
    search.setAttribute('aria-label', previewText('widgets.search', 'Search'));
    var filter = element('div', 'ssl-filter');
    var filterButton = element('button', 'ssl-filter-button');
    filterButton.type = 'button';
    filterButton.setAttribute('aria-label', previewText('widgets.filters.button', 'Filters'));
    filterButton.setAttribute('aria-haspopup', 'menu');
    filterButton.setAttribute('aria-expanded', 'false');
    var filterIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    filterIcon.setAttribute('viewBox', '0 0 24 24');
    filterIcon.setAttribute('aria-hidden', 'true');
    var filterPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    filterPath.setAttribute('d', 'M3 5h18l-7 8.5V19l-4 2v-7.5z');
    filterIcon.appendChild(filterPath);
    filterButton.appendChild(filterIcon);
    filter.appendChild(filterButton);
    var menu = element('div', 'ssl-filter-menu');
    menu.setAttribute('role', 'menu');
    menu.hidden = true;
    filter.appendChild(menu);
    var levelInputs = [];
    var dateInputs = [];
    var metadataInputs = {};
    var metadataGroups = {};
    var examples = previewEntries(!!forcedMode);
    var filterGroups = [];
    var pageIndex = 0;
    function setMenuOpen(open) {
      menu.hidden = !open;
      filterButton.setAttribute('aria-expanded', String(open));
      if (open) {
        filterGroups.forEach(function (expand) { expand(false); });
        updateDateLimits();
        layoutApi.positionFilterMenu(menu);
      }
    }
    filterButton.addEventListener('click', function () { setMenuOpen(menu.hidden); });
    filter.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMenuOpen(false);
        filterButton.focus();
      }
    });
    filter.addEventListener('focusout', function (event) {
      if (event.relatedTarget && !filter.contains(event.relatedTarget)) setMenuOpen(false);
    });
    function addFilterGroup(label, className) {
      var group = element('div', 'ssl-filter-group');
      var button = element('button', 'ssl-filter-item');
      button.type = 'button';
      button.setAttribute('role', 'menuitem');
      button.setAttribute('aria-haspopup', 'true');
      button.setAttribute('aria-expanded', 'false');
      var count = element('span', 'ssl-filter-count');
      count.hidden = true;
      button.append(element('span', '', label), count, element('span', '', '\u203a'));
      var options = element('div', 'ssl-filter-options' + (className ? ' ' + className : ''));
      options.setAttribute('role', 'group');
      options.setAttribute('aria-label', label);
      options.hidden = true;
      function expand(open) {
        options.hidden = !open;
        button.setAttribute('aria-expanded', String(open));
      }
      filterGroups.push(expand);
      button.addEventListener('click', function () {
        filterGroups.forEach(function (other) { other(other === expand); });
      });
      group.append(button, options);
      menu.appendChild(group);
      return { options: options, count: count };
    }
    var levelGroup = addFilterGroup(previewText('widgets.filters.level', 'Level'));
    severityNames.forEach(function (name) {
      var label = element('label', 'ssl-filter-option ssl-sev-' + name);
      var input = element('input');
      input.type = 'checkbox';
      input.setAttribute('role', 'menuitemcheckbox');
      input.addEventListener('change', filtersChanged);
      label.append(input, element('span', 'ssl-filter-dot'),
        document.createTextNode(previewText('widgets.settings.colors.' + name, name.charAt(0).toUpperCase() + name.slice(1))));
      levelInputs.push(input);
      levelGroup.options.appendChild(label);
    });
    var clearLevels = element('button', 'ssl-filter-clear', previewText('widgets.filters.allLevels', 'Reset'));
    clearLevels.type = 'button';
    clearLevels.addEventListener('click', function () {
      levelInputs.forEach(function (input) { input.checked = false; });
      filtersChanged();
    });
    levelGroup.options.appendChild(clearLevels);
    var dateGroup = addFilterGroup(previewText('widgets.filters.date', 'Date'), 'ssl-filter-date-range');
    ['fromDate', 'toDate'].forEach(function (key, index) {
      var label = element('label', '', previewText('widgets.filters.' + key, index === 0 ? 'From' : 'To'));
      var input = element('input');
      input.type = 'date';
      input.addEventListener('change', filtersChanged);
      dateInputs.push(input);
      label.appendChild(input);
      dateGroup.options.appendChild(label);
    });
    var dateError = element('span', 'ssl-filter-date-error');
    dateError.setAttribute('role', 'alert');
    dateGroup.options.appendChild(dateError);
    var clearDates = element('button', 'ssl-filter-clear', previewText('widgets.filters.allDates', 'All dates'));
    clearDates.type = 'button';
    clearDates.addEventListener('click', function () {
      dateInputs.forEach(function (input) { input.value = ''; });
      filtersChanged();
    });
    dateGroup.options.appendChild(clearDates);
    ['facility', 'app', 'hostname'].forEach(function (key) {
      var group = addFilterGroup(previewText(translations[key][0], translations[key][1]),
        key === 'facility' ? '' : 'ssl-filter-metadata');
      var input;
      if (key === 'facility') {
        input = Object.values(window.SSLFacilities).map(function (value) {
          var label = element('label', 'ssl-filter-option');
          var checkbox = element('input');
          checkbox.type = 'checkbox';
          checkbox.value = value;
          checkbox.setAttribute('role', 'menuitemcheckbox');
          checkbox.addEventListener('change', filtersChanged);
          label.append(checkbox, document.createTextNode(value));
          group.options.appendChild(label);
          return checkbox;
        });
      } else {
        var label = element('label', '', previewText(translations[key][0], translations[key][1]));
        input = element('input');
        input.type = 'search';
        input.maxLength = 200;
        input.placeholder = previewText('widgets.search', 'Search');
        input.addEventListener('input', filtersChanged);
        label.appendChild(input);
        group.options.appendChild(label);
      }
      metadataInputs[key] = input;
      metadataGroups[key] = group;
      var clear = element('button', 'ssl-filter-clear', previewText('widgets.filters.allLevels', 'Reset'));
      clear.type = 'button';
      clear.addEventListener('click', function () {
        if (key === 'facility') input.forEach(function (checkbox) { checkbox.checked = false; });
        else input.value = '';
        filtersChanged();
      });
      group.clear = clear;
      group.options.appendChild(clear);
    });
    toolbarRow.append(search, filter);
    toolbar.appendChild(toolbarRow);
    toolbar.appendChild(searchError);
    var list = element('div', 'ssl-log-list');
    var pageSize = forcedMode ? examples.length : 3;
    var formatted = previewTimestamps(design.timestampFormat, locale);
    var timestamp2Format = layoutApi.resolveTimestamp2Format(design);
    var formatted2 = timestamp2Format ? previewTimestamps(timestamp2Format, locale) : null;
    var days = previewTimestamps(design.daySeparatorFormat, locale);
    function dayText(date) {
      return days ? days[previewDates.indexOf(date)]
        : date.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' });
    }
    var labels = {};
    layoutApi.ELEMENT_IDS.forEach(function (id) { labels[id] = previewText(translations[id][0], translations[id][1]); });
    function renderEntries() {
      var matchesSearch, matchesApp, matchesHostname;
      try {
        matchesSearch = window.SSLWidgetSearch.compile(search.value, 'advanced');
        matchesApp = window.SSLWidgetSearch.compileText(metadataInputs.app.value, 'advanced');
        matchesHostname = window.SSLWidgetSearch.compileText(metadataInputs.hostname.value, 'advanced');
        searchError.textContent = '';
        searchError.style.display = 'none';
      } catch (error) {
        searchError.textContent = error.message;
        searchError.style.display = 'block';
        return;
      }
      var levels = levelInputs.map(function (input, index) { return input.checked ? index : -1; })
        .filter(function (level) { return level >= 0; });
      var selectedFacilities = metadataInputs.facility.filter(function (input) { return input.checked; })
        .map(function (input) { return input.value; });
      var filtered = examples.filter(function (entry) {
        var date = entry.date;
        var day = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0')
          + '-' + String(date.getDate()).padStart(2, '0');
        return (!levels.length || levels.indexOf(entry.severity) !== -1)
          && (!dateInputs[0].value || day >= dateInputs[0].value)
          && (!dateInputs[1].value || day <= dateInputs[1].value)
          && (!selectedFacilities.length || selectedFacilities.indexOf(entry.facility) !== -1)
          && matchesApp(entry.app) && matchesHostname(entry.hostname) && matchesSearch(entry);
      });
      pageIndex = Math.min(pageIndex, Math.max(0, Math.ceil(filtered.length / pageSize) - 1));
      previous.disabled = pageIndex === 0;
      next.disabled = (pageIndex + 1) * pageSize >= filtered.length;
      page.textContent = previewText('widgets.pagination.page', 'Page') + ' ' + (pageIndex + 1);
      var visible = filtered.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);
      list.replaceChildren();
      visible.forEach(function (entry, index) {
        var row = element('div', 'ssl-log-entry');
        var day = dayText(entry.date);
        if (design.showDaySeparators && (index === 0 || dayText(visible[index - 1].date) !== day)) {
          row.appendChild(layoutApi.renderDaySeparator(document, design, theme, day, {
            selectedElement: selectedElement,
            selectedSeparator: selected.type === 'separator',
            selectedRow: inSeparator && selected.type === 'row' ? selected.row : undefined,
            selectedColumn: inSeparator && selected.type === 'column' ? { row: selected.row, column: selected.column } : undefined
          }));
        }
        var values = {
          timestamp: formatted ? formatted[previewDates.indexOf(entry.date)]
            : entry.date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }),
          timestamp2: formatted2 ? formatted2[previewDates.indexOf(entry.date)] : entry.date.toLocaleDateString(locale),
          severity: entry.severityName,
          facility: entry.facility,
          app: entry.app,
          hostname: entry.hostname,
          message: entry.message
        };
        row.appendChild(layoutApi.renderCard(document, design, theme, values, {
          severityClass: 'ssl-sev-' + severityNames[entry.severity],
          labels: labels,
          selectedElement: selectedElement,
          selectedCard: selected.type === 'entry',
          selectedRow: !selected.area && selected.type === 'row' ? selected.row : undefined,
          selectedColumn: !selected.area && selected.type === 'column' ? { row: selected.row, column: selected.column } : undefined
        }));
        list.appendChild(row);
      });
      if (!visible.length) list.appendChild(element('p', 'ssl-widget-message', previewText('widgets.noLogs', 'No log entries found.')));
      list.scrollTop = 0;
      layoutApi.alignContentTracks(list);
    }
    function updateDateLimits() {
      var now = new Date();
      var today = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0')
        + '-' + String(now.getDate()).padStart(2, '0');
      dateInputs[0].max = dateInputs[1].value && dateInputs[1].value < today ? dateInputs[1].value : today;
      dateInputs[1].max = today;
      dateInputs[1].min = dateInputs[0].value;
      return today;
    }
    function filtersChanged() {
      var levelCount = levelInputs.filter(function (input) { return input.checked; }).length;
      var dateCount = dateInputs.filter(function (input) { return !!input.value; }).length;
      levelGroup.count.textContent = levelCount;
      levelGroup.count.hidden = !levelCount;
      dateGroup.count.textContent = dateCount;
      dateGroup.count.hidden = !dateCount;
      clearLevels.disabled = !levelCount;
      clearDates.disabled = !dateCount;
      var metadataCount = 0;
      Object.keys(metadataInputs).forEach(function (key) {
        var count = key === 'facility' ? metadataInputs[key].filter(function (input) { return input.checked; }).length
          : Number(!!metadataInputs[key].value.trim());
        metadataGroups[key].count.textContent = count ? String(count) : '';
        metadataGroups[key].count.hidden = !count;
        metadataGroups[key].clear.disabled = !count;
        metadataCount += count;
      });
      filterButton.classList.toggle('is-active', !!(levelCount || dateCount || metadataCount));
      var today = updateDateLimits();
      if (dateInputs.some(function (input) { return input.value > today; })) {
        dateError.textContent = previewText('widgets.filters.futureDate', 'Dates cannot be later than today.');
        return;
      }
      var invalid = dateInputs[0].value && dateInputs[1].value && dateInputs[0].value > dateInputs[1].value;
      dateError.textContent = invalid ? previewText('widgets.filters.invalidDateRange', 'The start date must be on or before the end date.') : '';
      if (invalid) return;
      pageIndex = 0;
      renderEntries();
    }
    var pagination = element('nav', 'ssl-widget-pagination');
    pagination.setAttribute('aria-label', previewText('widgets.pagination.label', 'Log pages'));
    var previous = element('button', 'ssl-page-button', previewText('widgets.pagination.previous', 'Previous'));
    previous.type = 'button';
    previous.disabled = true;
    var page = element('span', '', previewText('widgets.pagination.page', 'Page') + ' 1');
    var next = element('button', 'ssl-page-button', previewText('widgets.pagination.next', 'Next'));
    next.type = 'button';
    previous.addEventListener('click', function () { pageIndex--; renderEntries(); });
    next.addEventListener('click', function () { pageIndex++; renderEntries(); });
    search.addEventListener('input', renderEntries);
    pagination.append(previous, page, next);
    preview.append(toolbar, list, pagination);
    preview.querySelectorAll('button, input, select, label').forEach(function (control) {
      control.classList.add('hy-nostyle');
    });
    ['toolbar', 'paging'].forEach(function (area) {
      var active = selected.area === area;
      layoutApi.renderControls(document, area === 'toolbar' ? toolbarRow : pagination, area, design, theme,
        area === 'toolbar' ? { search: search, filter: filter } : { previousPage: previous, pageNumber: page, nextPage: next }, {
          selectedPart: active && selected.type === 'part',
          selectedElement: active ? selectedElement : undefined,
          selectedRow: active && selected.type === 'row' ? selected.row : undefined,
          selectedColumn: active && selected.type === 'column' ? { row: selected.row, column: selected.column } : undefined
        });
    });
    filtersChanged();
  }

  function renderPreview() {
    renderWidgetPreview(byId('widget-preview'), selectedDesign(), selectedTheme(), '', selection);
    if (templates.section === 'export') updateExport();
    if (templates.review) renderImportPreview();
  }

  function defaultDesign() { return findDesign('builtin:default') || builtInDesigns[0]; }

  // Returns the preview timestamps in a BLL format, or null until BLL has formatted them.
  function previewTimestamps(format, locale) {
    if (typeof format !== 'string' || !format.trim()) return null;
    var key = JSON.stringify([format, locale || null]);
    if (Object.prototype.hasOwnProperty.call(previewFormats, key)) return previewFormats[key] || null;
    if (!Homey) return null;
    previewFormatQueue[key] = { format: format, locale: locale };
    clearTimeout(previewFormatTimer);
    previewFormatTimer = setTimeout(function () {
      flushPreviewFormats().then(renderPreview);
    }, 250);
    return null;
  }

  function flushPreviewFormats() {
    var formats = previewFormatQueue;
    previewFormatQueue = {};
    return Promise.all(Object.keys(formats).map(function (key) {
      return api('POST', '/widget-timestamps', {
        format: formats[key].format,
        locale: formats[key].locale,
        timestamps: previewDates.map(function (date) { return date.toISOString(); })
      }).then(function (result) {
        previewFormats[key] = result && Array.isArray(result.values) ? result.values : false;
      }).catch(function () {
        previewFormats[key] = false;
      });
    }));
  }
  function defaultTheme() { return findTheme('builtin:default') || builtInThemes[0]; }

  function renderExportSelectors() {
    var none = [{ id: '', name: t('widgets.settings.none', 'None') }];
    fillSelect(byId('export-design'), none.concat(collection.designs), '');
    fillSelect(byId('export-theme'), none.concat(collection.themes), '');
    clearExport();
  }

  function exportSelection() {
    return {
      design: collection.designs.find(function (item) { return item.id === byId('export-design').value; }),
      theme: collection.themes.find(function (item) { return item.id === byId('export-theme').value; })
    };
  }

  function updateExport() {
    if (!root) return;
    var selection = exportSelection();
    byId('export-save-first').hidden = !dirty;
    byId('export-template').disabled = templates.busy || dirty || (!selection.design && !selection.theme);
    byId('export-preview-group').hidden = !selection.design && !selection.theme;
    if (selection.design || selection.theme) {
      renderWidgetPreview(byId('export-preview'), selection.design || defaultDesign(), selection.theme || defaultTheme());
    }
  }

  function clearExport() {
    templates.exportText = '';
    clearTemplateImages();
    byId('template-code').value = '';
    byId('template-forum-post').value = '';
    byId('export-result').hidden = true;
    updateExport();
  }

  function clearTemplateImages() {
    templates.imageData = null;
    byId('copy-forum-post').disabled = true;
    setCopyStatus(null);
    setImageProgress(null);
  }

  function setCopyStatus(status) {
    templates.copyStatus = status;
    var node = byId('template-copy-status');
    node.hidden = !status;
    node.replaceChildren();
    byId('post-forum').disabled = templates.busy || status !== 'copied';
    if (status === 'http') {
      node.textContent = t('widgets.settings.copyHttp', 'Automatic copying is unavailable over this HTTP connection. Click Copy post and images, or open Homey over HTTPS to copy automatically.');
    } else if (status === 'copied') {
      node.append(element('strong', '', t('widgets.settings.copyCopied', 'The post and both images were copied.')),
        document.createTextNode(' ' + t('widgets.settings.copyNext', 'Open the forum and paste them into the rich-text editor.')));
    } else if (status === 'retry') {
      node.textContent = t('widgets.settings.copyRetry', 'Copying failed. Use the Copy post and images button to try again.');
    }
  }

  function setImageProgress(done) {
    var text = done === null ? '' : t('widgets.settings.rendering', 'Creating previews') + ' ' + done + '/' + IMAGE_MODES.length;
    var node = byId('template-image-progress');
    node.hidden = done === null;
    node.textContent = text;
    var overlayProgress = document.getElementById('template-generation-progress');
    if (overlayProgress) {
      overlayProgress.hidden = done === null;
      overlayProgress.textContent = text;
    }
  }

  // Template images never follow the settings or dashboard mode: all light images first, then the same in dark.
  var IMAGE_MODES = ['light', 'dark'];
  var IMAGE_WIDTH = 400;
  var IMAGE_PANELS = {
    light: { background: '#f5f4fa', text: '#1c1c1c', label: 'Light' },
    dark: { background: '#111217', text: '#e4e4e7', label: 'Dark' }
  };

  function captureNode(node) {
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () { reject(new Error('Preview image timed out')); }, 15000);
      window.htmlToImage.toCanvas(node, { skipFonts: true, pixelRatio: 1 }).then(function (canvas) {
        clearTimeout(timer);
        resolve(canvas);
      }, function (error) {
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  async function templatePreviewImages(design, theme) {
    if (!window.htmlToImage) throw new Error('Template preview is unavailable');
    [design.timestampFormat, design.daySeparatorFormat, layoutApi.resolveTimestamp2Format(design)]
      .filter(Boolean).forEach(function (format) { previewTimestamps(format, 'en'); });
    clearTimeout(previewFormatTimer);
    await flushPreviewFormats();
    var host = element('div', 'widget-designer');
    host.setAttribute('aria-hidden', 'true');
    host.style.cssText = 'position:fixed;left:-10000px;top:0;width:' + IMAGE_WIDTH + 'px;pointer-events:none;';
    var preview = element('div');
    host.appendChild(preview);
    document.body.appendChild(host);
    var images = [];
    try {
      for (var index = 0; index < IMAGE_MODES.length; index++) {
        var imageMode = IMAGE_MODES[index];
        renderWidgetPreview(preview, design, theme, '', null, imageMode);
        preview.style.width = IMAGE_WIDTH + 'px';
        preview.style.height = 'auto';
        preview.style.maxHeight = 'none';
        var list = preview.querySelector('.ssl-log-list');
        list.style.flex = 'none';
        list.style.overflow = 'visible';
        // A timer instead of requestAnimationFrame: rAF never fires while the settings page is in a background tab.
        await new Promise(function (resolve) { setTimeout(resolve, 50); });
        layoutApi.alignContentTracks(list);
        images.push({ mode: imageMode, canvas: await captureNode(preview) });
        setImageProgress(index + 1);
      }
    } finally {
      host.remove();
    }
    var padding = 16, headingHeight = 32;
    return images.map(function (image) {
      var panel = IMAGE_PANELS[image.mode];
      var canvas = document.createElement('canvas');
      canvas.width = padding * 2 + image.canvas.width;
      canvas.height = padding * 2 + headingHeight + image.canvas.height;
      var context = canvas.getContext('2d');
      context.fillStyle = panel.background;
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = panel.text;
      context.textBaseline = 'middle';
      context.font = '600 20px sans-serif';
      context.fillText(panel.label, padding, padding + headingHeight / 2);
      context.drawImage(image.canvas, padding, padding + headingHeight);
      return canvas.toDataURL('image/png');
    });
  }

  function escapeHtml(value) {
    return value.replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
    });
  }

  function forumPostContent() {
    var text = forumPost();
    var heading = text.slice(2, text.indexOf('\n\n'));
    var html = '<h1>' + escapeHtml(heading) + '</h1><p><br></p>'
      + '<p>' + templates.imageData.map(function (image) {
        return '<img alt="Widget preview" width="' + (IMAGE_WIDTH / 2) + '" src="' + image + '">';
      }).join(' ') + '</p>'
      + '<pre data-params="javascript"><code class="language-javascript">' + escapeHtml(templates.exportText) + '</code></pre>';
    return { text: text, html: html };
  }

  function requiresManualCopyOnHttp() {
    return window.SSLTemplateClipboard.requiresManualCopyOnHttp(window.location, window.isSecureContext);
  }

  function startDeferredClipboardWrite() {
    if (requiresManualCopyOnHttp()) return null;
    return window.SSLTemplateClipboard.startWrite(navigator.clipboard, window.ClipboardItem, Blob);
  }

  function resolveDeferredClipboardWrite(write, content) {
    return !!write && write.complete(content.text, content.html);
  }

  function rejectDeferredClipboardWrite(write, error) {
    if (!write) return;
    write.reject(error);
  }

  function writeRichClipboard(content) {
    if (requiresManualCopyOnHttp()) return null;
    return window.SSLTemplateClipboard.writeNow(
      navigator.clipboard, window.ClipboardItem, Blob, content.text, content.html);
  }

  function finishForumPostCopy(error, automatic) {
    setBusy(false);
    setCopyStatus(error ? 'retry' : 'copied');
    if (error && !automatic) {
      alertMessage(t('widgets.settings.clipboardImageError', 'Could not copy the post and images. You can still copy the TWF separately.')
        + '\n' + (error.message || String(error)));
    }
  }

  function legacyCopyForumPost(content) {
    var copied = false;
    function onCopy(event) {
      event.preventDefault();
      event.clipboardData.setData('text/plain', content.text);
      event.clipboardData.setData('text/html', content.html);
      copied = true;
    }
    var copyError = null;
    var selection = null;
    try {
      var field = byId('template-forum-post');
      if (!field) throw new Error('Forum post is unavailable');
      field.focus();
      field.select();
      document.addEventListener('copy', onCopy);
      var successful = document.execCommand('copy');
      if ((!successful || !copied) && document.createRange && window.getSelection && field.setSelectionRange) {
        var editable = field.contentEditable;
        var readOnly = field.readOnly;
        try {
          field.contentEditable = true;
          field.readOnly = false;
          var range = document.createRange();
          range.selectNodeContents(field);
          selection = window.getSelection();
          selection.removeAllRanges();
          selection.addRange(range);
          field.setSelectionRange(0, field.value.length);
          successful = document.execCommand('copy');
        } finally {
          field.contentEditable = editable;
          field.readOnly = readOnly;
          if (selection) selection.removeAllRanges();
        }
      }
      if (!successful || !copied) throw new Error('Clipboard copy was blocked');
    } catch (error) {
      copyError = error;
    } finally {
      document.removeEventListener('copy', onCopy);
    }
    return copyError;
  }

  function copyForumPost(automatic) {
    if ((!automatic && templates.busy) || !templates.exportText || !templates.imageData || !templates.imageData.length) return;
    setCopyStatus(null);
    var content = forumPostContent();
    var write = writeRichClipboard(content);
    if (write) {
      if (!automatic) setBusy(true);
      write.then(function (result) {
        if (result.copied) finishForumPostCopy(null, automatic);
        else copyForumPostFallback(content, automatic, result.error);
      });
    } else {
      if (!automatic) setBusy(true);
      copyForumPostFallback(content, automatic);
    }
  }

  function copyForumPostFallback(content, automatic, clipboardError) {
    var copyError = legacyCopyForumPost(content);
    if (!copyError) {
      finishForumPostCopy(null, automatic);
      return;
    }
    var write = writeRichClipboard(content);
    if (!write) {
      finishForumPostCopy(clipboardError || copyError, automatic);
      return;
    }
    write.then(function (result) {
      finishForumPostCopy(result.copied ? null : result.error || clipboardError || copyError, automatic);
    });
  }

  function prepareTemplateImages(design, theme, clipboardWrite) {
    setImageProgress(0);
    return templatePreviewImages(design, theme).then(function (images) {
      templates.imageData = images;
      setImageProgress(null);
      setGenerating(false);
      var content = forumPostContent();
      byId('template-forum-post').value = content.text;
      if (requiresManualCopyOnHttp()) {
        setBusy(false);
        setCopyStatus('http');
      } else if (resolveDeferredClipboardWrite(clipboardWrite, content)) {
        clipboardWrite.result.then(function (result) {
          if (result.copied) finishForumPostCopy(null, true);
          else copyForumPostFallback(content, true, result.error);
        });
      } else {
        copyForumPostFallback(content, true);
      }
    }, function (error) {
      rejectDeferredClipboardWrite(clipboardWrite, error);
      setImageProgress(null);
      setGenerating(false);
      setBusy(false);
      alertMessage(t('widgets.settings.prepareImageError', 'Could not create the preview images. Create the TWF again to retry.')
        + '\n' + (error && error.message ? error.message : String(error)));
    });
  }

  function forumPost() {
    var heading = [];
    if (templates.exportDesignName) heading.push('Design: ' + templates.exportDesignName.replace(/\s+/g, ' ').trim());
    if (templates.exportThemeName) heading.push('Theme: ' + templates.exportThemeName.replace(/\s+/g, ' ').trim());
    return '# ' + heading.join(' | ') + '\n\n\n\n```javascript\n' + templates.exportText + '\n```';
  }

  function createTemplate() {
    var selection = exportSelection();
    if (templates.busy || dirty) return;
    if (!selection.design && !selection.theme) {
      alertMessage(t('widgets.settings.chooseTemplate', 'Select a design or theme.'));
      return;
    }
    clearTemplateImages();
    var clipboardWrite = startDeferredClipboardWrite();
    setBusy(true);
    setGenerating(true);
    setImageProgress(0);
    api('POST', '/widget-template/encode', { design: selection.design, theme: selection.theme }).then(function (text) {
      templates.exportText = text;
      templates.exportDesignName = selection.design ? selection.design.name : '';
      templates.exportThemeName = selection.theme ? selection.theme.name : '';
      byId('template-code').value = text;
      byId('export-result').hidden = false;
      return prepareTemplateImages(selection.design || defaultDesign(), selection.theme || defaultTheme(), clipboardWrite);
    }).catch(function (error) {
      rejectDeferredClipboardWrite(clipboardWrite, error);
      setImageProgress(null);
      setGenerating(false);
      setBusy(false);
      setStatus(error.message, true);
    });
  }

  function renderAll() {
    renderEditor();
    renderExportSelectors();
  }

  function save() {
    if (root.querySelector('.style-color-control [aria-invalid="true"]')) {
      var message = L('hex_invalid', 'Enter a HEX color in #RRGGBB format.');
      setStatus(message, true);
      return Promise.reject(new Error(message));
    }
    var design = selectedDesign();
    var theme = selectedTheme();
    if (!design.name.trim() || design.name.trim().length > 60) {
      setStatus(t('widgets.settings.invalidName', 'Enter a name of 1 to 60 characters.'), true);
      return Promise.reject(new Error('Invalid design or theme name'));
    }
    if (!theme.name.trim() || theme.name.trim().length > 60) {
      setStatus(t('widgets.settings.invalidName', 'Enter a name of 1 to 60 characters.'), true);
      return Promise.reject(new Error('Invalid design or theme name'));
    }
    if (!isBuiltIn(design.id)) {
      if (!layoutApi.usedElements(design).length) {
        setStatus(t('widgets.settings.selectField', 'Select at least one visible field.'), true);
        return Promise.reject(new Error('A design must have at least one field'));
      }
      design.name = design.name.trim();
    }
    if (!isBuiltIn(theme.id)) theme.name = theme.name.trim();
    collection.version = 1;
    return setSetting('widgetStyles', collection).then(function () {
      markSaved();
      setStatus(t('widgets.settings.saved', 'Saved.'));
      renderAll();
    }).catch(function (error) {
      setStatus(error.message || t('widgets.settings.saveError', 'Unable to save widget styles.'), true);
      throw error;
    });
  }

  function sameName(first, second) {
    return String(first || '').trim().toLocaleLowerCase() === String(second || '').trim().toLocaleLowerCase();
  }

  function itemName(copy, source, kind) {
    var prefix = copy ? source.name + ' - ' + t('widgets.settings.duplicate', 'Copy')
      : kind === 'design' ? t('widgets.settings.newDesign', 'New style') : t('widgets.settings.newTheme', 'New theme');
    var items = kind === 'design' ? collection.designs : collection.themes;
    var name = prefix;
    var number = 2;
    while (items.some(function (item) { return sameName(item.name, name); })) name = prefix + ' ' + number++;
    return name.slice(0, 60);
  }

  // The source is copied before leaving it, so a copy keeps the unsaved changes that are discarded on the source.
  function createItem(copy) {
    var source = copy ? clone(editingItem()) : null;
    leaveEditingItem(function () {
      if (mode === 'design') createDesign(copy, source);
      else createTheme(copy, source);
    });
  }

  function createDesign(copy, source) {
    var original = copy ? source : defaultDesign();
    var design = {
      id: newId(),
      name: itemName(copy, original, 'design'),
      showDaySeparators: original.showDaySeparators,
      timestampFormat: original.timestampFormat,
      daySeparatorFormat: original.daySeparatorFormat,
      widgetBorderWidth: original.widgetBorderWidth || 0,
      rows: clone(original.rows),
      daySeparatorLayout: clone(original.daySeparatorLayout || layoutApi.defaultSeparatorLayout()),
      elementBorders: clone(original.elementBorders || {}),
      elementSizes: clone(original.elementSizes || {}),
      elementFonts: clone(original.elementFonts || {}),
      elementTextStyles: clone(original.elementTextStyles || {})
    };
    ['toolbarLayout', 'pagingLayout', 'controlStyles', 'widgetPadding', 'elementLineHeights', 'widgetBorderless', 'timestamp2Format'].forEach(function (key) {
      if (original[key]) design[key] = clone(original[key]);
    });
    collection.designs.push(design);
    currentDesignId = design.id;
    mode = 'design';
    setDirty();
    renderAll();
  }

  function createTheme(copy, source) {
    var original = copy ? source : defaultTheme();
    var theme = {
      id: newId(),
      name: itemName(copy, original, 'theme'),
      colors: Object.assign({}, original.colors),
      elements: clone(original.elements || {})
    };
    if (original.backgroundGradient !== undefined) theme.backgroundGradient = original.backgroundGradient;
    if (original.backgroundGradientEnd !== undefined) theme.backgroundGradientEnd = original.backgroundGradientEnd;
    collection.themes.push(theme);
    currentThemeId = theme.id;
    mode = 'theme';
    setDirty();
    renderAll();
  }

  function deleteSelected(type) {
    var isDesign = type === 'design';
    var id = isDesign ? currentDesignId : currentThemeId;
    if (isBuiltIn(id)) return Promise.resolve();
    var message = isDesign
      ? t('widgets.settings.confirmDelete', 'Permanently delete the custom style "__name__"?')
      : t('widgets.settings.confirmDeleteTheme', 'Permanently delete the custom theme "__name__"?');
    var item = isDesign ? selectedDesign() : selectedTheme();
    return call('confirm', [message.replace('__name__', item.name), 'warning'])
      .then(function (confirmed) {
        if (!confirmed) return;
        var listKey = isDesign ? 'designs' : 'themes';
        function removeFromEditor() {
          var items = collection[listKey];
          var index = items.findIndex(function (entry) { return entry.id === id; });
          if (index >= 0) items.splice(index, 1);
          delete editHistories[type + ':' + id];
          if (isDesign) currentDesignId = 'builtin:default';
          else currentThemeId = 'builtin:default';
          renderAll();
          refreshSaveState();
        }
        if (!savedItem(type, id)) {
          removeFromEditor();
          return;
        }
        // Deleting is stored at once, like Chronograph; other items only hold saved values at this point.
        var remaining = clone(savedCollection);
        remaining[listKey] = remaining[listKey].filter(function (entry) { return entry.id !== id; });
        return setSetting('widgetStyles', remaining).then(function () {
          savedCollection = remaining;
          removeFromEditor();
        });
      });
  }

  function uniqueName(name, kind) {
    var items = kind === 'design' ? collection.designs : collection.themes;
    name = String(name || '').trim().slice(0, 60);
    var candidate = name;
    var number = 2;
    while (items.some(function (item) { return sameName(item.name, candidate); })) {
      var suffix = ' (' + number++ + ')';
      candidate = name.slice(0, 60 - suffix.length) + suffix;
    }
    return candidate;
  }

  function invalidTemplateMessage() {
    return t('widgets.settings.importError', 'This template does not contain a valid or supported Simple (Sys) Log design or theme.');
  }

  function closeReview() {
    templates.review = null;
    byId('import-review').hidden = true;
  }

  function fillPreviewSelect(select, builtIns, customs) {
    fillGroupedSelect(select, builtIns, customs, 'builtin:default', select.id === 'import-preview-design');
  }

  function readTemplate() {
    var text = byId('import-code').value.trim();
    if (templates.busy || !text) return Promise.resolve();
    closeReview();
    var header = /^(?:```[a-z]*\s*)?\[twf:([^:\]\s]{1,64}):/i.exec(text);
    if (header && header[1] !== 'SimpleSysLog') {
      setStatus(t('widgets.settings.importOtherApp', 'This TWF was made for {app}, not for Simple (Sys) Log. Import it in that app instead.')
        .replace('{app}', header[1]), true);
      return Promise.resolve();
    }
    setStatus('');
    setBusy(true);
    return api('POST', '/widget-template/decode', { text: text }).then(function (value) {
      if (text !== byId('import-code').value.trim() || templates.section !== 'import') return;
      if (!value || (!value.design && !value.theme)) throw new Error(invalidTemplateMessage());
      templates.review = value;
      byId('import-design-group').hidden = !value.design;
      byId('import-theme-group').hidden = !value.theme;
      byId('import-include-design').checked = !!value.design;
      byId('import-include-theme').checked = !!value.theme;
      byId('import-design-name').value = value.design ? uniqueName(value.design.name, 'design') : '';
      byId('import-theme-name').value = value.theme ? uniqueName(value.theme.name, 'theme') : '';
      fillPreviewSelect(byId('import-preview-design'), builtInDesigns, collection.designs);
      fillPreviewSelect(byId('import-preview-theme'), builtInThemes, collection.themes);
      byId('import-review').hidden = false;
      renderImportPreview();
    }).catch(function () {
      setStatus(invalidTemplateMessage(), true);
    }).finally(function () { setBusy(false); });
  }

  function renderImportPreview() {
    var review = templates.review;
    if (!review) return;
    var includeDesign = !!review.design && byId('import-include-design').checked;
    var includeTheme = !!review.theme && byId('import-include-theme').checked;
    byId('import-design-name').disabled = !includeDesign;
    byId('import-theme-name').disabled = !includeTheme;
    [['import-preview-design', includeDesign], ['import-preview-theme', includeTheme]].forEach(function (entry) {
      var select = byId(entry[0]);
      select.hidden = entry[1];
      select.previousElementSibling.hidden = entry[1];
    });
    byId('save-template').disabled = templates.busy || (!includeDesign && !includeTheme);
    renderWidgetPreview(byId('import-preview'),
      includeDesign ? review.design : findDesign(byId('import-preview-design').value) || defaultDesign(),
      includeTheme ? review.theme : findTheme(byId('import-preview-theme').value) || defaultTheme());
  }

  function saveTemplate() {
    var review = templates.review;
    if (templates.busy || !review) return;
    var selections = [
      { include: !!review.design && byId('import-include-design').checked, item: review.design,
        name: byId('import-design-name').value, items: collection.designs, kind: 'design' },
      { include: !!review.theme && byId('import-include-theme').checked, item: review.theme,
        name: byId('import-theme-name').value, items: collection.themes, kind: 'theme' }
    ].filter(function (selection) { return selection.include; });
    if (!selections.length) return;
    if (dirty) {
      alertMessage(t('widgets.settings.saveFirst', 'Save or discard changes before using templates.'));
      return;
    }
    if (selections.some(function (selection) {
      var name = selection.name.trim();
      return !name || name.length > 60;
    })) {
      setStatus(t('widgets.settings.invalidName', 'Enter a name of 1 to 60 characters.'), true);
      return;
    }
    var added = selections.map(function (selection) {
      var imported = JSON.parse(JSON.stringify(selection.item));
      imported.id = newId();
      imported.name = uniqueName(selection.name, selection.kind);
      selection.items.push(imported);
      return { items: selection.items, item: imported };
    });
    setBusy(true);
    setSetting('widgetStyles', collection).then(function () {
      closeReview();
      byId('import-code').value = '';
      renderAll();
      markSaved();
      alertMessage(t('widgets.settings.saved', 'Saved.'));
    }).catch(function (error) {
      added.forEach(function (entry) {
        var index = entry.items.indexOf(entry.item);
        if (index >= 0) entry.items.splice(index, 1);
      });
      setStatus(error.message || t('widgets.settings.saveError', 'Unable to save widget styles.'), true);
    }).finally(function () { setBusy(false); });
  }

  function catalogMatches(item, query) {
    return !query || [item.title, item.description, item.author].some(function (value) {
      return String(value || '').toLowerCase().indexOf(query) !== -1;
    });
  }

  function compareCatalog(order) {
    return function (first, second) {
      var result = 0;
      if (order === 'newest') result = second.number - first.number;
      else if (order === 'oldest') result = first.number - second.number;
      else if (order === 'likes') result = (second.likes || 0) - (first.likes || 0);
      else if (order === 'favorites') result = Number(!!second.favorite) - Number(!!first.favorite);
      return result || String(first.title).localeCompare(String(second.title));
    };
  }

  function iconButton(className, icon, label, onClick) {
    var button = element('button', 'hy-nostyle ' + className);
    button.type = 'button';
    button.disabled = templates.busy;
    setIconLabel(button, icon, label);
    button.addEventListener('click', onClick);
    return button;
  }

  function bindTemplateImageViewer() {
    var dialog = byId('template-image-dialog');
    var viewport = byId('template-image-viewport');
    var image = byId('template-image-full');
    var zoomOut = byId('template-zoom-out');
    var zoomIn = byId('template-zoom-in');
    var zoom = 1;
    var gesture;
    var drag;

    function setZoom(value, anchor, point) {
      zoom = Math.max(1, Math.min(5, value));
      image.style.width = (zoom * 100) + '%';
      byId('template-image-scale').textContent = Math.round(zoom * 100) + '%';
      zoomOut.disabled = zoom <= 1;
      zoomIn.disabled = zoom >= 5;
      viewport.classList.toggle('template-image-zoomed', zoom > 1);
      if (zoom === 1) endDrag();
      if (anchor && anchor.width) {
        var scale = image.getBoundingClientRect().width / anchor.width;
        viewport.scrollLeft = anchor.x * scale - point.x;
        viewport.scrollTop = anchor.y * scale - point.y;
      }
    }

    function imageAnchor(point) {
      return { x: viewport.scrollLeft + point.x, y: viewport.scrollTop + point.y, width: image.getBoundingClientRect().width };
    }

    function stepZoom(step) {
      var point = { x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 };
      setZoom(zoom + step, imageAnchor(point), point);
    }
    zoomOut.addEventListener('click', function () { stepZoom(-0.5); });
    zoomIn.addEventListener('click', function () { stepZoom(0.5); });
    byId('template-image-close').addEventListener('click', function () { dialog.close(); });
    dialog.addEventListener('close', function () {
      if (dialog.open) return;
      gesture = null;
      endDrag();
      image.removeAttribute('src');
    });

    function distance(touches) {
      return Math.hypot(touches[1].clientX - touches[0].clientX, touches[1].clientY - touches[0].clientY);
    }
    function midpoint(touches) {
      var rect = viewport.getBoundingClientRect();
      return { x: (touches[0].clientX + touches[1].clientX) / 2 - rect.left,
        y: (touches[0].clientY + touches[1].clientY) / 2 - rect.top };
    }
    viewport.addEventListener('touchstart', function (event) {
      gesture = null;
      if (event.touches.length !== 2 || !image.naturalWidth) return;
      var separation = distance(event.touches);
      if (!separation) return;
      gesture = { zoom: zoom, distance: separation, anchor: imageAnchor(midpoint(event.touches)) };
      if (event.cancelable) event.preventDefault();
    }, { passive: false });
    viewport.addEventListener('touchmove', function (event) {
      if (!gesture || event.touches.length !== 2) return;
      if (event.cancelable) event.preventDefault();
      setZoom(gesture.zoom * distance(event.touches) / gesture.distance, gesture.anchor, midpoint(event.touches));
    }, { passive: false });
    viewport.addEventListener('touchend', function () { gesture = null; });
    viewport.addEventListener('touchcancel', function () { gesture = null; });

    viewport.addEventListener('wheel', function (event) {
      if (!event.ctrlKey || !event.deltaY) return;
      if (event.cancelable) event.preventDefault();
      var bounds = viewport.getBoundingClientRect();
      var point = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
      setZoom(zoom * Math.exp(-event.deltaY * 0.0015), imageAnchor(point), point);
    }, { passive: false });

    function endDrag(event) {
      if (!drag || (event && drag.id !== event.pointerId)) return;
      var pointerId = drag.id;
      drag = null;
      viewport.classList.remove('template-image-dragging');
      if (viewport.hasPointerCapture(pointerId)) viewport.releasePointerCapture(pointerId);
    }

    viewport.addEventListener('pointerdown', function (event) {
      if (event.pointerType !== 'mouse' || event.button !== 0 || zoom <= 1) return;
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY,
        left: viewport.scrollLeft, top: viewport.scrollTop };
      viewport.classList.add('template-image-dragging');
      viewport.setPointerCapture(event.pointerId);
      if (event.cancelable) event.preventDefault();
    });
    viewport.addEventListener('pointermove', function (event) {
      if (!drag || drag.id !== event.pointerId) return;
      viewport.scrollLeft = drag.left - (event.clientX - drag.x);
      viewport.scrollTop = drag.top - (event.clientY - drag.y);
    });
    viewport.addEventListener('pointerup', endDrag);
    viewport.addEventListener('pointercancel', endDrag);
    viewport.addEventListener('lostpointercapture', endDrag);

    byId('template-catalog').addEventListener('click', function (event) {
      var button = event.target.closest('.template-catalog-image-button');
      if (!button || dialog.open) return;
      var thumbnail = button.querySelector('img');
      dialog.setAttribute('aria-label', thumbnail.alt);
      image.alt = thumbnail.alt;
      image.src = thumbnail.src;
      setZoom(1);
      dialog.showModal();
      viewport.scrollLeft = viewport.scrollTop = 0;
    });
  }

  function addCatalogCard(item, container) {
    var entry = element('div');
    entry.setAttribute('role', 'listitem');
    var row = element('div', 'template-catalog-row');
    var favoriteLabel = item.favorite
      ? t('widgets.settings.unfavorite', 'Remove favorite') : t('widgets.settings.favorite', 'Add favorite');
    var star = element('button', 'hy-nostyle template-catalog-icon');
    star.type = 'button';
    star.disabled = templates.busy;
    star.title = favoriteLabel;
    star.setAttribute('aria-label', favoriteLabel + ': ' + item.title);
    star.setAttribute('aria-pressed', String(!!item.favorite));
    var starIcon = element('i', (item.favorite ? 'fa-solid' : 'fa-regular') + ' fa-star');
    starIcon.setAttribute('aria-hidden', 'true');
    star.appendChild(starIcon);
    star.addEventListener('click', function () { toggleFavorite(item); });
    var body = element('div', 'template-catalog-entry');
    var expanded = templates.selectedId === item.id;
    var title = element('button', 'hy-nostyle template-catalog-title');
    title.type = 'button';
    title.setAttribute('aria-expanded', String(expanded));
    title.appendChild(element('span', '', item.title));
    title.addEventListener('click', function () {
      templates.selectedId = expanded ? null : item.id;
      renderCatalog();
    });
    body.appendChild(title);
    if (templates.showPreviews && !expanded) {
      var thumbnail = element('div');
      thumbnail.setAttribute('inert', '');
      thumbnail.setAttribute('aria-hidden', 'true');
      var template = item.template || {};
      renderWidgetPreview(thumbnail, template.design || defaultDesign(), template.theme || defaultTheme(), 'template-catalog-thumbnail');
      body.appendChild(thumbnail);
    }
    row.append(star, body);
    entry.appendChild(row);
    if (expanded) {
      var details = element('div', 'template-catalog-details');
      details.appendChild(element('p', '', (item.author || '') + ' \u00b7 ' + (item.likes || 0) + ' ' + t('widgets.settings.likes', 'Likes')));
      details.appendChild(element('p', 'template-catalog-description', item.description || ''));
      (item.images || []).forEach(function (source, index) {
        var button = element('button', 'hy-nostyle template-catalog-image-button');
        button.type = 'button';
        var image = element('img');
        image.loading = 'lazy';
        image.alt = item.title + ' (' + (index + 1) + '/' + item.images.length + ')';
        image.src = source;
        button.setAttribute('aria-label', t('widgets.settings.templateImageZoomIn', 'Zoom in') + ': ' + image.alt);
        button.appendChild(image);
        details.appendChild(button);
      });
      details.appendChild(iconButton('btn btn-outline-primary btn-sm', 'fa-file-import', t('widgets.settings.install', 'Import'), function () {
        importCatalogTemplate(item);
      }));
      details.appendChild(iconButton('btn btn-outline-primary btn-sm', 'fa-arrow-up-right-from-square', t('widgets.settings.openTopic', 'View post'), function () {
        openExchange(item.number);
      }));
      entry.appendChild(details);
    }
    container.appendChild(entry);
  }

  function renderCatalog() {
    var container = byId('template-catalog');
    container.replaceChildren();
    var available = Array.isArray(templates.catalog);
    byId('catalog-search').disabled = !available;
    var sort = byId('catalog-sort');
    sort.disabled = !available || !templates.catalogSortReady || templates.catalogSortSaving;
    sort.value = templates.catalogSort;
    var previews = byId('catalog-previews');
    previews.setAttribute('aria-pressed', String(templates.showPreviews));
    previews.querySelector('i').className = 'fa fa-solid ' + (templates.showPreviews ? 'fa-eye' : 'fa-eye-slash');
    previews.disabled = templates.busy || !templates.previewsAvailable;
    if (!available) {
      byId('catalog-empty').hidden = true;
      return;
    }
    var query = byId('catalog-search').value.trim().toLowerCase();
    var items = templates.catalog.filter(function (item) { return catalogMatches(item, query); })
      .sort(compareCatalog(templates.catalogSort));
    byId('catalog-empty').hidden = items.length > 0;
    items.forEach(function (item) { addCatalogCard(item, container); });
  }

  function isCatalogSort(order) {
    return ['newest', 'oldest', 'name', 'likes', 'favorites'].indexOf(order) !== -1;
  }

  function loadCatalogSort() {
    return getSetting('widgetTemplateCatalogSort').then(function (order) {
      if (isCatalogSort(order)) templates.catalogSort = order;
    }).catch(function (error) {
      setStatus(error.message, true);
    }).finally(function () {
      templates.catalogSortReady = true;
      renderCatalog();
    });
  }

  function saveCatalogSort() {
    var select = byId('catalog-sort');
    var order = select.value;
    if (select.disabled || !isCatalogSort(order) || order === templates.catalogSort) return;
    templates.catalogSortSaving = true;
    select.disabled = true;
    return setSetting('widgetTemplateCatalogSort', order).then(function () {
      templates.catalogSort = order;
    }).catch(function (error) {
      setStatus(error.message, true);
    }).finally(function () {
      templates.catalogSortSaving = false;
      renderCatalog();
    });
  }

  function loadCatalog() {
    if (templates.busy) return Promise.resolve();
    setStatus('');
    setBusy(true);
    byId('catalog-loading').hidden = false;
    return Promise.all([
      getSetting('widgetTemplateFavorites'),
      api('GET', '/widget-template-catalog')
    ]).then(function (values) {
      var favorites = values[0];
      var items = values[1];
      if (!Array.isArray(items)) throw new Error(t('widgets.settings.catalogError', 'Unable to load community templates.'));
      templates.favorites = favorites && typeof favorites === 'object' && !Array.isArray(favorites) ? favorites : {};
      templates.catalog = items.map(function (item) {
        return Object.assign({}, item, { favorite: !!templates.favorites[item.postId] });
      });
    }).catch(function (error) {
      setStatus(error.message || t('widgets.settings.catalogError', 'Unable to load community templates.'), true);
    }).finally(function () {
      byId('catalog-loading').hidden = true;
      setBusy(false);
      renderCatalog();
    });
  }

  function toggleFavorite(item) {
    if (templates.busy) return;
    var favorites = Object.assign({}, templates.favorites);
    if (favorites[item.postId]) delete favorites[item.postId];
    else favorites[item.postId] = true;
    setBusy(true);
    setSetting('widgetTemplateFavorites', favorites).then(function () {
      templates.favorites = favorites;
      templates.catalog.forEach(function (entry) { entry.favorite = !!favorites[entry.postId]; });
    }).catch(function (error) {
      setStatus(error.message, true);
    }).finally(function () {
      setBusy(false);
      renderCatalog();
    });
  }

  function togglePreviews() {
    if (templates.busy || !templates.previewsAvailable) return;
    var enabled = !templates.showPreviews;
    setBusy(true);
    setSetting('widgetTemplateShowPreviews', enabled).then(function () {
      templates.showPreviews = enabled;
    }).catch(function (error) {
      setStatus(error.message, true);
    }).finally(function () {
      setBusy(false);
      renderCatalog();
    });
  }

  function toggleHelp() {
    if (!help.available || help.saving) return;
    var expanded = !help.expanded;
    help.saving = true;
    renderLayoutEditor();
    setSetting('widgetDesignerHelpExpanded', expanded).then(function () {
      help.expanded = expanded;
    }).catch(function (error) {
      setStatus(error.message, true);
    }).finally(function () {
      help.saving = false;
      renderLayoutEditor();
    });
  }

  function importCatalogTemplate(item) {
    if (templates.busy) return;
    showTemplateSection('import');
    byId('import-code').value = item.text;
    readTemplate();
  }

  function initialize(homey) {
    Homey = homey;
    // The footers sit outside the designer so they stay pinned below the scrolling tab content.
    var scopes = [root, document.querySelector('.designer-footers')].filter(Boolean);
    scopes.forEach(function (scope) {
      scope.querySelectorAll('[data-i18n]').forEach(function (element) {
        element.textContent = t(element.getAttribute('data-i18n'), element.textContent.trim());
      });
      scope.querySelectorAll('[data-i18n-placeholder]').forEach(function (element) {
        var key = element.getAttribute('data-i18n-placeholder');
        element.placeholder = t(key, element.placeholder);
      });
      scope.querySelectorAll('[data-i18n-title]').forEach(function (element) {
        element.title = t(element.getAttribute('data-i18n-title'), element.title);
      });
      scope.querySelectorAll('[data-i18n-aria-label]').forEach(function (element) {
        element.setAttribute('aria-label', t(element.getAttribute('data-i18n-aria-label'), element.getAttribute('aria-label')));
      });
      scope.querySelectorAll('[data-i18n-alt]').forEach(function (element) {
        element.alt = t(element.getAttribute('data-i18n-alt'), element.alt);
      });
    });
    loadCatalogSort();
    getSetting('widgetTemplateShowPreviews').then(function (value) {
      templates.showPreviews = value === true;
      templates.previewsAvailable = true;
      renderCatalog();
    }).catch(function () {});
    getSetting('widgetDesignerHelpExpanded').then(function (value) {
      help.expanded = value !== false;
      help.available = true;
      if (builtInDesigns.length) renderLayoutEditor();
    }).catch(function () {});
    // The API returns validated styles, with designs from before the grid designer already converted.
    api('GET', '/widget-styles').then(function (available) {
      collection = {
        version: 1,
        designs: available.designs.filter(function (item) { return !isBuiltIn(item.id); }),
        themes: available.themes.filter(function (item) { return !isBuiltIn(item.id); })
      };
      builtInDesigns = available.designs.filter(function (item) { return isBuiltIn(item.id); }).map(function (item) {
        return Object.assign({}, item, { name: t('widgets.design.' + item.id.slice(8), item.name) });
      });
      builtInThemes = available.themes.filter(function (item) { return isBuiltIn(item.id); }).map(function (item) {
        return Object.assign({}, item, { name: t('widgets.theme.' + item.id.slice(8), item.name) });
      });
      renderAll();
      markSaved();
    }).catch(function (error) {
      setStatus(error.message || 'Unable to initialize the widget designer.', true);
    });
  }

  function switchMode(next) {
    mode = next;
    selectionKey = editingKey();
    renderEditor();
  }

  function bindStickyPreview(sticky) {
    var scrollContainer = sticky.closest('.settings-widgets-content');
    var settingsView = scrollContainer.parentNode;
    var tabs = settingsView.querySelector('.settings-tabs');
    var editor = sticky.nextElementSibling;
    var sentinel = element('div', 'style-preview-sentinel');
    sentinel.setAttribute('aria-hidden', 'true');
    sticky.parentNode.insertBefore(sentinel, sticky);
    var stuckTimer = null;
    var unpinnedHeight = 0;
    function updateStuck() {
      stuckTimer = null;
      var isStuck = sticky.classList.contains('is-stuck');
      var shouldStick = scrollContainer.clientHeight > 0 && !editor.hidden && sticky.getClientRects().length > 0
        && sentinel.getBoundingClientRect().top < scrollContainer.getBoundingClientRect().top - 0.5;
      if (shouldStick) {
        if (!isStuck) {
          unpinnedHeight = sticky.getBoundingClientRect().height;
          sticky.classList.add('is-stuck');
        }
        // Reserve only the height lost to the pinned cap, outside the visible preview.
        var space = Math.max(0, unpinnedHeight - sticky.getBoundingClientRect().height) + 'px';
        if (editor.style.getPropertyValue('--ssl-preview-reserved-space') !== space) {
          editor.style.setProperty('--ssl-preview-reserved-space', space);
        }
      } else if (isStuck) {
        sticky.classList.remove('is-stuck');
        editor.style.removeProperty('--ssl-preview-reserved-space');
      }
    }
    function scheduleStuck() {
      if (stuckTimer === null) stuckTimer = window.setTimeout(updateStuck, 0);
    }
    function updateTabHeight() {
      if (tabs.offsetHeight) settingsView.style.setProperty('--ssl-settings-tabs-height', tabs.offsetHeight + 'px');
      scheduleStuck();
    }
    scrollContainer.addEventListener('scroll', scheduleStuck, { passive: true });
    window.addEventListener('resize', updateTabHeight);
    if (window.ResizeObserver) {
      new window.ResizeObserver(updateTabHeight).observe(tabs);
      new window.ResizeObserver(function () {
        // ResizeObserver runs before paint; refresh the reservation in the same frame.
        if (stuckTimer !== null) window.clearTimeout(stuckTimer);
        updateStuck();
      }).observe(sticky);
    }
    updateTabHeight();
  }

  function bindEvents() {
    bindTemplateImageViewer();
    root.querySelectorAll('.mode-button').forEach(function (button) {
      button.addEventListener('click', function () {
        var next = button.dataset.mode === 'theme' ? 'theme' : 'design';
        if (next === mode) return;
        leaveEditingItem(function () { switchMode(next); });
      });
    });
    byId('style-select').addEventListener('change', function (event) {
      var id = event.target.value;
      var current = editingItem().id;
      leaveEditingItem(function () {
        if (mode === 'design') currentDesignId = id;
        else currentThemeId = id;
        renderEditor();
      }, function () { byId('style-select').value = current; });
    });
    byId('preview-other').addEventListener('change', function (event) {
      if (mode === 'design') currentThemeId = event.target.value;
      else {
        currentDesignId = event.target.value;
        renderLayoutEditor();
      }
      renderPreview();
    });
    byId('style-name').addEventListener('input', function (event) {
      var item = mode === 'design' ? selectedDesign() : selectedTheme();
      item.name = event.target.value;
      var option = byId('style-select').selectedOptions[0];
      if (option) option.textContent = item.name;
      setDirty();
    });
    byId('designer-help-toggle').addEventListener('click', toggleHelp);
    var sticky = root.querySelector('.style-preview-sticky');
    if (sticky) bindStickyPreview(sticky);
    byId('style-new').addEventListener('click', function () { createItem(false); });
    byId('style-copy').addEventListener('click', function () { createItem(true); });
    byId('style-delete').addEventListener('click', function () {
      deleteSelected(mode).catch(function (error) { setStatus(error.message, true); });
    });
    byId('preview-mode').value = previewMode;
    var previewModeChosen = false;
    function applyPreviewMode(value) {
      previewMode = value;
      byId('preview-mode').value = value;
      updateColorPaletteModes();
      renderPreview();
      if (templates.section === 'catalog') renderCatalog();
    }
    byId('preview-mode').addEventListener('change', function (event) {
      previewModeChosen = true;
      applyPreviewMode(event.target.value === 'dark' ? 'dark' : 'light');
    });
    if (darkSchemeQuery && darkSchemeQuery.addEventListener) {
      darkSchemeQuery.addEventListener('change', function (event) {
        if (!previewModeChosen) applyPreviewMode(event.matches ? 'dark' : 'light');
      });
    }
    if (previewHostElements.length && window.MutationObserver) {
      var previewHostObserver = new window.MutationObserver(updatePreviewHost);
      function observePreviewHost() {
        previewHostElements.forEach(function (element) {
          previewHostObserver.observe(element, { attributes: true, attributeFilter: ['class', 'style'] });
        });
        updatePreviewHost();
      }
      observePreviewHost();
      window.addEventListener('pagehide', function () { previewHostObserver.disconnect(); });
      window.addEventListener('pageshow', function (event) {
        if (event.persisted) observePreviewHost();
      });
    }
    byId('save-styles').addEventListener('click', function () { save().catch(function () {}); });
    byId('undo-styles').addEventListener('click', function () { stepHistory(-1); });
    byId('redo-styles').addEventListener('click', function () { stepHistory(1); });
    window.addEventListener('beforeunload', function (event) {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = '';
    });
    byId('open-templates').addEventListener('click', function () {
      leaveEditingItem(function () { showScreen('templates'); });
    });
    byId('close-templates').addEventListener('click', function () { showScreen('editor'); });
    root.querySelectorAll('.template-section-button').forEach(function (button) {
      button.addEventListener('click', function () { showTemplateSection(button.dataset.section); });
    });
    byId('open-exchange').addEventListener('click', function () { openExchange(); });
    ['export-design', 'export-theme'].forEach(function (id) {
      byId(id).addEventListener('change', clearExport);
    });
    byId('export-template').addEventListener('click', createTemplate);
    byId('copy-template').addEventListener('click', function () { copyField('template-code'); });
    byId('copy-forum-post').addEventListener('click', function () { copyForumPost(false); });
    byId('post-forum').addEventListener('click', function () { openExchange(); });
    byId('import-code').addEventListener('input', function () {
      closeReview();
      byId('import-template').disabled = templates.busy || !byId('import-code').value.trim();
    });
    byId('import-template').addEventListener('click', readTemplate);
    ['import-include-design', 'import-include-theme', 'import-preview-design', 'import-preview-theme'].forEach(function (id) {
      byId(id).addEventListener('change', renderImportPreview);
    });
    byId('save-template').addEventListener('click', saveTemplate);
    byId('catalog-previews').addEventListener('click', togglePreviews);
    byId('catalog-search').addEventListener('input', renderCatalog);
    byId('catalog-sort').addEventListener('change', saveCatalogSort);
    byId('load-catalog').addEventListener('click', loadCatalog);
  }

  // Mounted by the settings page when the Widget designer tab is opened for the first time.
  window.SSLWidgetDesigner = {
    mount: function (homey) {
      if (root) return;
      root = document.getElementById('widget-designer');
      if (!root) return;
      bindEvents();
      initialize(homey);
    },
    // Called before the settings page leaves the Widgets tab, so unsaved changes are kept or discarded first.
    leave: function (next) {
      if (!root || !savedCollection || byId('designer-savebar').hidden) next();
      else leaveEditingItem(next);
    }
  };
}());
