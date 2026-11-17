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

  function fillGroupedSelect(select, builtIns, customs, selectedId) {
    select.replaceChildren();
    [[t('widgets.settings.builtIn', 'Built-in'), builtIns], [t('widgets.settings.custom', 'Custom'), customs]]
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
      ? t('widgets.settings.selectDesign', 'Design') : t('widgets.settings.selectTheme', 'Theme');
    fillGroupedSelect(byId('style-select'), isDesign ? builtInDesigns : builtInThemes,
      isDesign ? collection.designs : collection.themes, item.id);
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
      ? t('widgets.settings.theme', 'Theme') : t('widgets.settings.design', 'Design');
    fillGroupedSelect(byId('preview-other'), isDesign ? builtInThemes : builtInDesigns,
      isDesign ? collection.themes : collection.designs, isDesign ? currentThemeId : currentDesignId);
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
    root.querySelectorAll('.designer-screen').forEach(function (panel) {
      panel.hidden = panel.dataset.screen !== screen;
    });
    byId('designer-savebar').hidden = screen !== 'editor';
    byId('designer-template-footer').hidden = screen !== 'templates';
    setStatus('');
    if (screen === 'templates') renderExportSelectors();
  }

  function showTemplateSection(section) {
    root.querySelectorAll('.template-section-button').forEach(function (button) {
      button.setAttribute('aria-pressed', String(button.dataset.section === section));
    });
    root.querySelectorAll('[data-template-section]').forEach(function (panel) {
      panel.hidden = panel.dataset.templateSection !== section;
    });
    setStatus('');
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
  function renderPreview() {
    var design = selectedDesign();
    var theme = selectedTheme();
    if (!design || !theme) return;
    var preview = document.getElementById('widget-preview');
    preview.className = 'ssl-widget preview-widget ssl-mode-' + previewMode;
    preview.removeAttribute('style');
    colorRoles.forEach(function (key) {
      if (theme.colors[key] !== 'automatic') {
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
    var sideFields = design.fields.filter(function (field) { return field === 'timestamp' || field === 'severity'; });
    var metaFields = design.fields.filter(function (field) {
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
      if (design.fields.indexOf('message') >= 0) main.appendChild(element('div', 'ssl-field-message', values.message));
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

  function renderExportSelectors() {
    fillSelect(document.getElementById('export-design'), [{ id: '', name: t('widgets.settings.none', 'None') }]
      .concat(collection.designs), '');
    fillSelect(document.getElementById('export-theme'), [{ id: '', name: t('widgets.settings.none', 'None') }]
      .concat(collection.themes), '');
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
      setStatus(t('widgets.settings.saved', 'Widget styles saved.'));
      renderAll();
    }).catch(function (error) {
      setStatus(error.message || t('widgets.settings.saveError', 'Unable to save widget styles.'), true);
      throw error;
    });
  }

  function createDesign(source) {
    var original = source || selectedDesign();
    var design = {
      id: newId(),
      name: t('widgets.settings.newDesign', 'My design'),
      fields: original.fields.slice(),
      showDaySeparators: original.showDaySeparators
    };
    collection.designs.push(design);
    currentDesignId = design.id;
    mode = 'design';
    setDirty();
    renderAll();
  }

  function createTheme(source) {
    var original = source || selectedTheme();
    var theme = { id: newId(), name: t('widgets.settings.newTheme', 'My theme'), colors: Object.assign({}, original.colors) };
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
    return call('confirm', [t('widgets.settings.confirmDelete', 'Delete this custom item?'), 'warning'])
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
    var candidate = name;
    var suffix = 2;
    while (items.some(function (item) { return item.name.toLocaleLowerCase() === candidate.toLocaleLowerCase(); })) {
      candidate = name + ' (' + suffix++ + ')';
    }
    return candidate;
  }

  function installTemplate(template) {
    if (!template || (!template.design && !template.theme)) throw new Error('Template contains no design or theme.');
    if (template.design) {
      var design = JSON.parse(JSON.stringify(template.design));
      design.id = newId();
      design.name = uniqueName(design.name || t('widgets.settings.importedDesign', 'Imported design'), 'design');
      collection.designs.push(design);
      currentDesignId = design.id;
    }
    if (template.theme) {
      var theme = JSON.parse(JSON.stringify(template.theme));
      theme.id = newId();
      theme.name = uniqueName(theme.name || t('widgets.settings.importedTheme', 'Imported theme'), 'theme');
      collection.themes.push(theme);
      currentThemeId = theme.id;
    }
    setDirty();
    renderAll();
    return save();
  }

  function addCatalogCard(item) {
    var entry = document.createElement('div');
    entry.setAttribute('role', 'listitem');
    var title = document.createElement('button');
    title.type = 'button';
    title.className = 'hy-nostyle template-catalog-title';
    title.textContent = item.title;
    title.setAttribute('aria-expanded', 'false');
    var details = document.createElement('div');
    details.className = 'template-catalog-details';
    details.hidden = true;
    title.addEventListener('click', function () {
      details.hidden = !details.hidden;
      title.setAttribute('aria-expanded', String(!details.hidden));
    });
    var author = document.createElement('p');
    author.textContent = item.author || '';
    var description = document.createElement('p');
    description.className = 'template-catalog-description';
    description.textContent = item.description || '';
    var install = document.createElement('button');
    install.type = 'button';
    install.className = 'hy-nostyle btn btn-outline-primary btn-sm';
    setIconLabel(install, 'fa-file-import', t('widgets.settings.install', 'Add template'));
    install.addEventListener('click', function () {
      install.disabled = true;
      installTemplate(item.template).catch(function (error) {
        setStatus(error.message || 'Unable to add template.', true);
      }).finally(function () { install.disabled = false; });
    });
    var link = document.createElement('a');
    link.className = 'hy-nostyle btn btn-outline-primary btn-sm';
    link.href = item.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    setIconLabel(link, 'fa-arrow-up-right-from-square', t('widgets.settings.openTopic', 'Open forum post'));
    details.append(author, description, install, link);
    entry.append(title, details);
    document.getElementById('template-catalog').appendChild(entry);
  }

  function loadCatalog() {
    var container = document.getElementById('template-catalog');
    container.replaceChildren();
    setStatus(t('widgets.settings.loadingCatalog', 'Loading community templates…'));
    document.getElementById('load-catalog').disabled = true;
    return api('GET', '/widget-template-catalog').then(function (items) {
      if (!Array.isArray(items)) throw new Error('Invalid community catalog response.');
      if (!items.length) setStatus(t('widgets.settings.emptyCatalog', 'No community templates were found.'));
      else {
        items.forEach(addCatalogCard);
        setStatus('');
      }
    }).catch(function (error) {
      setStatus(error.message || t('widgets.settings.catalogError', 'Unable to load community templates.'), true);
    }).finally(function () {
      document.getElementById('load-catalog').disabled = false;
    });
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
    });
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
      if (mode === 'design') createDesign(builtInDesigns[0]);
      else createTheme(builtInThemes[0]);
    });
    byId('style-copy').addEventListener('click', function () {
      if (mode === 'design') createDesign();
      else createTheme();
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
    byId('export-template').addEventListener('click', function () {
      var design = collection.designs.find(function (item) { return item.id === byId('export-design').value; });
      var theme = collection.themes.find(function (item) { return item.id === byId('export-theme').value; });
      if (!design && !theme) {
        setStatus(t('widgets.settings.chooseTemplate', 'Select a design, a theme, or both.'), true);
        return;
      }
      api('POST', '/widget-template/encode', { design: design, theme: theme }).then(function (code) {
        byId('template-code').value = code;
        setStatus(t('widgets.settings.templateCreated', 'Template code created.'));
      }).catch(function (error) { setStatus(error.message, true); });
    });
    byId('copy-template').addEventListener('click', function () {
      var textarea = byId('template-code');
      if (!textarea.value) return;
      textarea.select();
      document.execCommand('copy');
      setStatus(t('widgets.settings.copied', 'Template code copied.'));
    });
    byId('import-template').addEventListener('click', function () {
      var text = byId('import-code').value;
      api('POST', '/widget-template/decode', { text: text }).then(installTemplate).then(function () {
        byId('import-code').value = '';
      }).catch(function (error) {
        setStatus(error.message || t('widgets.settings.importError', 'Unable to import template.'), true);
      });
    });
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
