'use strict';

(function () {
  var Homey;
  var root;
  var collection = { version: 1, designs: [], themes: [] };
  var builtInDesigns = [{ id: 'builtin:default', name: 'Default', fields: [
    'timestamp', 'severity', 'message', 'app', 'facility'
  ], showDaySeparators: true }];
  var builtInThemes = [];
  var currentDesignId = 'builtin:default';
  var currentThemeId = 'builtin:default';
  var dirty = false;
  var translations = {
    timestamp: ['widgets.fields.timestamp', 'Timestamp'],
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
    debug: ['widgets.settings.colors.debug', 'Debug']
  };
  var colorRoles = ['background', 'surface', 'text', 'muted', 'border', 'accent',
    'emergency', 'alert', 'critical', 'error', 'warning', 'notice', 'info', 'debug'];
  var colorNames = ['automatic', 'red', 'orange', 'yellow', 'green', 'teal', 'cyan', 'blue',
    'indigo', 'purple', 'pink', 'brown', 'grey', 'black', 'white'];
  var colorNameFallbacks = {
    automatic: 'Automatic', red: 'Red', orange: 'Orange', yellow: 'Yellow', green: 'Green', teal: 'Teal',
    cyan: 'Cyan', blue: 'Blue', indigo: 'Indigo', purple: 'Purple', pink: 'Pink', brown: 'Brown',
    grey: 'Grey', black: 'Black', white: 'White'
  };
  var previewMode = 'light';
  var mode = 'design';
  var forumTopicUrl = 'https://community.homey.app/t/162351';
  var templates = {
    section: 'export', busy: false, review: null, exportText: '', exportDesignName: '', exportThemeName: '',
    catalog: null, favorites: {}, selectedId: null, showPreviews: false, previewsAvailable: false
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
    setSaveState(true);
    renderPreview();
  }

  function setSaveState(isDirty) {
    dirty = isDirty;
    var button = document.getElementById('save-styles');
    button.disabled = !isDirty;
    button.classList.toggle('is-dirty', isDirty);
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
      ? t('widgets.settings.selectDesign', 'Design style') : t('widgets.settings.theme', 'Theme');
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
    byId('day-separators').closest('.style-design-selectors').hidden = !isDesign || builtin;
    byId('day-separators').checked = selectedDesign().showDaySeparators;
    byId('preview-other-label').textContent = isDesign
      ? t('widgets.settings.theme', 'Theme') : t('widgets.settings.selectDesign', 'Design style');
    fillGroupedSelect(byId('preview-other'), isDesign ? builtInThemes : builtInDesigns,
      isDesign ? collection.themes : collection.designs, isDesign ? currentThemeId : currentDesignId, !isDesign);
    if (isDesign) renderFields();
    else renderColors();
    renderPreview();
  }

  function renderFields() {
    var design = selectedDesign();
    var builtin = isBuiltIn(design.id);
    var fields = byId('design-fields');
    fields.replaceChildren();
    var selected = design.fields.slice();
    var allFields = selected.concat(['timestamp', 'severity', 'facility', 'app', 'hostname', 'message']
      .filter(function (field) { return selected.indexOf(field) === -1; }));
    allFields.forEach(function (field) {
      var row = document.createElement('li');
      var checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'hy-nostyle';
      checkbox.checked = selected.indexOf(field) !== -1;
      checkbox.disabled = builtin;
      checkbox.setAttribute('aria-label', t(translations[field][0], translations[field][1]));
      checkbox.addEventListener('change', function () {
        var current = selectedDesign();
        if (checkbox.checked) current.fields.splice(allFields.indexOf(field), 0, field);
        else current.fields = current.fields.filter(function (item) { return item !== field; });
        current.fields = allFields.filter(function (item) { return current.fields.indexOf(item) !== -1; });
        setDirty();
        renderFields();
      });
      var label = document.createElement('span');
      label.textContent = t(translations[field][0], translations[field][1]);
      row.append(checkbox, label,
        moveButton(field, -1, 'fa-arrow-up', t('widgets.settings.moveUp', 'Move up'),
          builtin || !checkbox.checked || selected.indexOf(field) === 0),
        moveButton(field, 1, 'fa-arrow-down', t('widgets.settings.moveDown', 'Move down'),
          builtin || !checkbox.checked || selected.indexOf(field) === selected.length - 1));
      fields.appendChild(row);
    });
  }

  function moveButton(field, direction, icon, title, disabled) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'hy-nostyle btn btn-outline-primary btn-sm';
    button.title = title;
    button.setAttribute('aria-label', title);
    button.disabled = disabled;
    var glyph = document.createElement('i');
    glyph.className = 'fa fa-solid ' + icon;
    glyph.setAttribute('aria-hidden', 'true');
    button.appendChild(glyph);
    button.addEventListener('click', function () { moveField(field, direction); });
    return button;
  }

  function moveField(field, direction) {
    var design = selectedDesign();
    var index = design.fields.indexOf(field);
    var target = index + direction;
    if (target < 0 || target >= design.fields.length) return;
    design.fields.splice(index, 1);
    design.fields.splice(target, 0, field);
    setDirty();
    renderFields();
  }

  function renderColors() {
    var theme = selectedTheme();
    var builtin = isBuiltIn(theme.id);
    var colors = byId('theme-colors');
    colors.replaceChildren();
    colorRoles.forEach(function (key) {
      var row = document.createElement('div');
      row.className = 'style-color-row';
      var label = document.createElement('label');
      label.className = 'hy-nostyle';
      label.htmlFor = 'style-color-' + key;
      var swatch = document.createElement('span');
      swatch.className = 'color-swatch';
      swatch.style.background = swatchColor(theme.colors[key]);
      label.append(swatch, document.createTextNode(t(translations[key][0], translations[key][1])));
      var input = document.createElement('select');
      input.id = 'style-color-' + key;
      input.className = 'form-select';
      colorNames.forEach(function (name) {
        var option = document.createElement('option');
        option.value = name;
        option.textContent = t('widgets.settings.colorNames.' + name, colorNameFallbacks[name]);
        input.appendChild(option);
      });
      input.value = theme.colors[key];
      input.disabled = builtin;
      input.addEventListener('change', function () {
        selectedTheme().colors[key] = input.value;
        swatch.style.background = swatchColor(input.value);
        setDirty();
      });
      row.append(label, input);
      colors.appendChild(row);
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
    updateExport();
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
    var copied = false;
    try {
      copied = document.execCommand('copy');
    } catch (error) {
      copied = false;
    }
    if (!copied) alertMessage(t('widgets.settings.copyError', 'Could not copy. Select the text and copy it manually.'));
  }

  function swatchColor(name) {
    return name === 'automatic' ? 'transparent' : 'var(--ssl-color-' + name + ')';
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

  // Uses the widget stylesheet and markup so the preview matches the dashboard widget.
  function renderWidgetPreview(preview, design, theme, extraClass) {
    if (!preview || !design || !theme) return;
    preview.className = 'ssl-widget preview-widget ssl-mode-' + previewMode + (extraClass ? ' ' + extraClass : '');
    preview.removeAttribute('style');
    colorRoles.forEach(function (key) {
      if (theme.colors[key] && theme.colors[key] !== 'automatic') {
        preview.style.setProperty('--ssl-' + key, 'var(--ssl-color-' + theme.colors[key] + ')');
      }
    });
    preview.replaceChildren();
    var list = element('div', 'ssl-log-list');
    var now = new Date();
    var yesterday = new Date(now.getTime() - 86400000);
    var examples = [
      { date: now, severity: 4, severityName: t('widgets.settings.colors.warning', 'Warning'), facility: 'Flow', app: 'Heating', hostname: 'Homey', message: 'A temperature has changed. This message wraps to fit the widget.' },
      { date: now, severity: 5, severityName: t('widgets.settings.colors.notice', 'Notice'), facility: 'User', app: 'Backup', hostname: 'Homey', message: 'Network backup completed.' },
      { date: yesterday, severity: 3, severityName: t('widgets.settings.colors.error', 'Error'), facility: 'System', app: 'Simple (Sys) Log', hostname: 'Homey', message: 'Widget preview entry.' }
    ];
    var fields = Array.isArray(design.fields) ? design.fields : [];
    var sideFields = fields.filter(function (field) { return field === 'timestamp' || field === 'severity'; });
    var metaFields = fields.filter(function (field) {
      return field !== 'timestamp' && field !== 'severity' && field !== 'message';
    });
    var severityNames = ['emergency', 'alert', 'critical', 'error', 'warning', 'notice', 'info', 'debug'];
    examples.forEach(function (entry, index) {
      var row = element('div', 'ssl-log-entry');
      var day = entry.date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
      if (design.showDaySeparators && (index === 0 || examples[index - 1].date !== entry.date)) {
        var separator = element('div', 'ssl-day-separator');
        separator.appendChild(element('span', '', day));
        row.appendChild(separator);
      }
      var values = {
        timestamp: entry.date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
        severity: entry.severityName,
        facility: entry.facility,
        app: entry.app,
        hostname: entry.hostname,
        message: entry.message
      };
      var card = element('article', 'ssl-log-card ssl-sev-' + severityNames[entry.severity]);
      if (sideFields.length) {
        var side = element('div', 'ssl-log-side');
        sideFields.forEach(function (field) { side.appendChild(element('span', 'ssl-field-' + field, values[field])); });
        card.appendChild(side);
      }
      var main = element('div', 'ssl-log-main');
      if (fields.indexOf('message') >= 0) main.appendChild(element('div', 'ssl-field-message', values.message));
      if (metaFields.length) {
        var meta = element('div', 'ssl-log-meta');
        metaFields.forEach(function (field) { meta.appendChild(element('span', 'ssl-field-' + field, values[field])); });
        main.appendChild(meta);
      }
      card.appendChild(main);
      row.appendChild(card);
      list.appendChild(row);
    });
    preview.appendChild(list);
  }

  function renderPreview() {
    renderWidgetPreview(byId('widget-preview'), selectedDesign(), selectedTheme());
    if (templates.section === 'export') updateExport();
    if (templates.review) renderImportPreview();
  }

  function defaultDesign() { return findDesign('builtin:default') || builtInDesigns[0]; }
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
    byId('template-code').value = '';
    byId('template-forum-post').value = '';
    byId('export-result').hidden = true;
    updateExport();
  }

  function forumPost() {
    var heading = [];
    if (templates.exportDesignName) heading.push('Design: ' + templates.exportDesignName.replace(/\s+/g, ' ').trim());
    if (templates.exportThemeName) heading.push('Theme: ' + templates.exportThemeName.replace(/\s+/g, ' ').trim());
    return '# ' + heading.join(' | ') + '\n\n\n\nTWF:\n```javascript\n' + templates.exportText + '\n```';
  }

  function createTemplate() {
    var selection = exportSelection();
    if (templates.busy || dirty) return;
    if (!selection.design && !selection.theme) {
      alertMessage(t('widgets.settings.chooseTemplate', 'Select a design or theme.'));
      return;
    }
    setBusy(true);
    api('POST', '/widget-template/encode', { design: selection.design, theme: selection.theme }).then(function (text) {
      templates.exportText = text;
      templates.exportDesignName = selection.design ? selection.design.name : '';
      templates.exportThemeName = selection.theme ? selection.theme.name : '';
      byId('template-code').value = text;
      byId('template-forum-post').value = forumPost();
      byId('export-result').hidden = false;
    }).catch(function (error) {
      setStatus(error.message, true);
    }).finally(function () { setBusy(false); });
  }

  function renderAll() {
    renderEditor();
    renderExportSelectors();
  }

  function save() {
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
      if (!design.fields.length) {
        setStatus(t('widgets.settings.selectField', 'Select at least one visible field.'), true);
        return Promise.reject(new Error('A design must have at least one field'));
      }
      design.name = design.name.trim();
    }
    if (!isBuiltIn(theme.id)) theme.name = theme.name.trim();
    collection.version = 1;
    return setSetting('widgetStyles', collection).then(function () {
      setSaveState(false);
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

  function createDesign(copy) {
    var original = copy ? selectedDesign() : defaultDesign();
    var design = {
      id: newId(),
      name: itemName(copy, original, 'design'),
      fields: original.fields.slice(),
      showDaySeparators: original.showDaySeparators
    };
    collection.designs.push(design);
    currentDesignId = design.id;
    mode = 'design';
    setDirty();
    renderAll();
  }

  function createTheme(copy) {
    var original = copy ? selectedTheme() : defaultTheme();
    var theme = { id: newId(), name: itemName(copy, original, 'theme'), colors: Object.assign({}, original.colors) };
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
        var items = isDesign ? collection.designs : collection.themes;
        var index = items.findIndex(function (item) { return item.id === id; });
        if (index >= 0) items.splice(index, 1);
        if (isDesign) currentDesignId = 'builtin:default';
        else currentThemeId = 'builtin:default';
        setDirty();
        renderAll();
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
      setSaveState(false);
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
    if (templates.showPreviews) {
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
    byId('catalog-sort').disabled = !available;
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
      .sort(compareCatalog(byId('catalog-sort').value));
    byId('catalog-empty').hidden = items.length > 0;
    items.forEach(function (item) { addCatalogCard(item, container); });
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
    });
    getSetting('widgetTemplateShowPreviews').then(function (value) {
      templates.showPreviews = value === true;
      templates.previewsAvailable = true;
      renderCatalog();
    }).catch(function () {});
    Promise.all([
      getSetting('widgetStyles'),
      api('GET', '/widget-styles')
    ]).then(function (values) {
      var saved = values[0];
      var available = values[1];
      if (saved && saved.version === 1 && Array.isArray(saved.designs) && Array.isArray(saved.themes)) {
        collection = saved;
      }
      builtInDesigns = available.designs.filter(function (item) { return isBuiltIn(item.id); }).map(function (item) {
        return Object.assign({}, item, { name: t('widgets.design.' + item.id.slice(8), item.name) });
      });
      builtInThemes = available.themes.filter(function (item) { return isBuiltIn(item.id); }).map(function (item) {
        return Object.assign({}, item, { name: t('widgets.theme.' + item.id.slice(8), item.name) });
      });
      renderAll();
      setSaveState(false);
    }).catch(function (error) {
      setStatus(error.message || 'Unable to initialize the widget designer.', true);
    });
  }

  function bindEvents() {
    root.querySelectorAll('.mode-button').forEach(function (button) {
      button.addEventListener('click', function () {
        mode = button.dataset.mode === 'theme' ? 'theme' : 'design';
        renderEditor();
      });
    });
    byId('style-select').addEventListener('change', function (event) {
      if (mode === 'design') currentDesignId = event.target.value;
      else currentThemeId = event.target.value;
      renderEditor();
    });
    byId('preview-other').addEventListener('change', function (event) {
      if (mode === 'design') currentThemeId = event.target.value;
      else currentDesignId = event.target.value;
      renderPreview();
    });
    byId('style-name').addEventListener('input', function (event) {
      var item = mode === 'design' ? selectedDesign() : selectedTheme();
      item.name = event.target.value;
      var option = byId('style-select').selectedOptions[0];
      if (option) option.textContent = item.name;
      setDirty();
    });
    byId('day-separators').addEventListener('change', function (event) {
      selectedDesign().showDaySeparators = event.target.checked;
      setDirty();
    });
    byId('style-new').addEventListener('click', function () {
      if (mode === 'design') createDesign(false);
      else createTheme(false);
    });
    byId('style-copy').addEventListener('click', function () {
      if (mode === 'design') createDesign(true);
      else createTheme(true);
    });
    byId('style-delete').addEventListener('click', function () {
      deleteSelected(mode).catch(function (error) { setStatus(error.message, true); });
    });
    byId('preview-mode').addEventListener('change', function (event) {
      previewMode = event.target.value === 'dark' ? 'dark' : 'light';
      renderPreview();
    });
    byId('save-styles').addEventListener('click', function () { save().catch(function () {}); });
    byId('open-templates').addEventListener('click', function () { showScreen('templates'); });
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
    byId('copy-forum-post').addEventListener('click', function () { copyField('template-forum-post'); });
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
    byId('catalog-sort').addEventListener('change', renderCatalog);
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
    }
  };
}());
