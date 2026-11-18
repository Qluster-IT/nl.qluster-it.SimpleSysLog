'use strict';

var SSL_SEVERITY_NAMES = ['emergency', 'alert', 'critical', 'error', 'warning', 'notice', 'info', 'debug'];

function sslWidgetHeight(settings) {
  var height = Number(settings && settings.height);
  if (!Number.isFinite(height)) return 500;
  return Math.min(5000, Math.max(100, Math.round(height)));
}

function sslColorModeClass(settings) {
  return 'ssl-mode-' + (settings.colorMode === 'light' || settings.colorMode === 'dark' ? settings.colorMode : 'automatic');
}

function sslTranslate(Homey, key, fallback) {
  try {
    var value = Homey.__(key);
    return value && value !== key ? value : fallback;
  } catch (error) {
    return fallback;
  }
}

// Clipboard API first, then the selection fallback that also works in iOS and Android web views.
function sslCopyText(text) {
  function fallback() {
    var textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.setAttribute('readonly', '');
    textArea.style.position = 'fixed';
    textArea.style.top = '0';
    textArea.style.left = '0';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    try {
      textArea.focus();
      textArea.select();
      var range = document.createRange();
      range.selectNodeContents(textArea);
      var selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      textArea.setSelectionRange(0, text.length);
      return document.execCommand('copy');
    } catch (error) {
      return false;
    } finally {
      document.body.removeChild(textArea);
    }
  }
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      return navigator.clipboard.writeText(text).then(function () { return true; }, fallback);
    }
  } catch (error) {
    // Fall through to the selection fallback.
  }
  return Promise.resolve(fallback());
}

function sslShowAndroidLinks(Homey, settings, widgetHeight) {
  function t(key, fallback) {
    return sslTranslate(Homey, 'widgets.android.' + key, fallback);
  }
  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  var main = element('main', 'ssl-widget ssl-android-links ' + sslColorModeClass(settings));
  var content = element('div', 'ssl-android-content');
  var status = element('p', 'ssl-android-status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  content.appendChild(element('h2', 'ssl-android-title', t('title', 'Scrolling on Android')));
  content.appendChild(element('p', 'ssl-android-text', t('explain',
    'Widgets cannot scroll in the Homey app on Android yet. Add a Web widget to this dashboard and paste one of these links as its address.')));
  var linkList = element('div', 'ssl-android-list');
  content.appendChild(linkList);
  content.appendChild(element('p', 'ssl-android-text', t('settingsChanged',
    'After changing this widget\'s settings or the Homey app\'s light/dark theme, copy the link again.')));
  content.appendChild(element('p', 'ssl-android-text ssl-android-warning', t('private',
    'Anyone with a link can read these log entries. You can reset all links on the Widgets tab.')));
  content.appendChild(status);
  main.appendChild(content);
  document.body.replaceChildren(main);

  function addLink(id, label, hint, url) {
    var block = element('section', 'ssl-android-link');
    var heading = element('label', 'ssl-android-label', label);
    heading.setAttribute('for', 'ssl-android-' + id);
    block.appendChild(heading);
    block.appendChild(element('p', 'ssl-android-hint', hint));
    var row = element('div', 'ssl-android-row');
    var input = element('input', 'ssl-android-url');
    input.id = 'ssl-android-' + id;
    input.type = 'text';
    input.readOnly = true;
    input.value = url;
    input.addEventListener('focus', function () { input.select(); });
    var button = element('button', 'ssl-android-copy', t('copy', 'Copy'));
    button.type = 'button';
    button.addEventListener('click', function () {
      sslCopyText(url).then(function (copied) {
        if (!copied) input.select();
        status.classList.toggle('ssl-widget-error', !copied);
        status.textContent = copied ? t('copied', 'Link copied.')
          : t('copyFailed', 'Copying failed. Select the link and copy it manually.');
      });
    });
    row.appendChild(input);
    row.appendChild(button);
    block.appendChild(row);
    linkList.appendChild(block);
  }

  return Promise.resolve().then(function () {
    // A Web widget cannot read the Homey app's theme, so an automatic link keeps the theme of this moment.
    var linkSettings = Object.assign({}, settings);
    if (typeof Homey.getWidgetInstanceId === 'function') {
      linkSettings.filterStateId = Homey.getWidgetInstanceId();
    }
    if (linkSettings.colorMode !== 'light' && linkSettings.colorMode !== 'dark') {
      linkSettings.colorMode = document.documentElement.classList.contains('homey-dark-mode') ? 'dark' : 'light';
    }
    return Homey.api('POST', '/android-links', linkSettings);
  }).then(function (links) {
    if (!links || !links.automatic) throw new Error(t('unavailable', 'The links could not be created.'));
    if (links.local) {
      addLink('local', t('local', 'Local link'), t('localHint', 'Works only on your home network.'), links.local);
    }
    addLink('automatic', t('automatic', 'Automatic link'),
      t('automaticHint', 'Uses the local connection when available, otherwise the Homey cloud.'), links.automatic);
  }).catch(function (error) {
    status.classList.add('ssl-widget-error');
    status.textContent = error && error.message ? error.message : t('unavailable', 'The links could not be created.');
  }).then(function () {
    Homey.ready({ height: widgetHeight });
  });
}

function onHomeyReady(Homey) {
  var widgetSettings = Homey.getSettings() || {};
  var widgetHeight = sslWidgetHeight(widgetSettings);
  if (widgetSettings.androidScroll === true) {
    sslShowAndroidLinks(Homey, widgetSettings, widgetHeight);
    return;
  }
  // AngularJS is loaded from the BLL app; it is missing only when BLL is not installed.
  if (typeof angular === 'undefined') {
    var message = document.createElement('p');
    message.className = 'ssl-widget-message';
    message.setAttribute('role', 'status');
    var text = '';
    try {
      text = Homey.__('widgets.bllNotInstalled');
    } catch (error) {
      text = '';
    }
    message.textContent = text || 'Install the Better Logic Library app to use this widget.';
    var main = document.createElement('main');
    main.className = 'ssl-widget ' + sslColorModeClass(widgetSettings);
    main.appendChild(message);
    document.body.replaceChildren(main);
    Homey.ready({ height: widgetHeight });
    return;
  }

  var widgetModule = angular.module('sslLogWidget', []);
  // Builds each entry card with the shared grid renderer, also used by the settings designer.
  widgetModule.directive('sslLogCard', function () {
    return {
      restrict: 'A',
      link: function (scope, element, attrs) {
        function render() {
          var log = scope.$eval(attrs.sslLogCard);
          if (!log) return;
          var values = {};
          var classes = {};
          window.SSLWidgetLayout.ELEMENT_IDS.forEach(function (id) {
            values[id] = scope.fieldValue(id, log);
            classes[id] = scope.fieldValueClass(id, log);
          });
          element[0].replaceChildren(window.SSLWidgetLayout.renderCard(document, scope.design, scope.theme, values, {
            severityClass: scope.severityClass(log),
            labels: scope.labels,
            classes: classes,
            cardLayout: scope.cardLayout
          }));
          scope.scheduleTrackAlignment();
        }
        scope.$watch('styleVersion', render);
        scope.$on('$destroy', function () { scope.scheduleTrackAlignment(); });
      }
    };
  });
  // Builds a day separator with the shared renderer from the design's separator grid.
  widgetModule.directive('sslDaySeparator', function () {
    return {
      restrict: 'A',
      link: function (scope, element, attrs) {
        function render() {
          var log = scope.$eval(attrs.sslDaySeparator);
          if (!log) return;
          element[0].replaceChildren(window.SSLWidgetLayout.renderDaySeparator(document, scope.design, scope.theme, scope.formatDay(log)));
          scope.scheduleTrackAlignment();
        }
        scope.$watch(function () {
          var log = scope.$eval(attrs.sslDaySeparator);
          return scope.styleVersion + '|' + (log ? scope.formatDay(log) : '');
        }, render);
      }
    };
  });
  widgetModule.directive('sslControlLayout', function () {
    return {
      restrict: 'A',
      link: function (scope, element, attrs) {
        var nodes = {};
        element[0].querySelectorAll('[data-ssl-control]').forEach(function (node) {
          nodes[node.getAttribute('data-ssl-control')] = node;
        });
        scope.$watch('styleVersion', function () {
          window.SSLWidgetLayout.renderControls(document, element[0], attrs.sslControlLayout, scope.design, scope.theme, nodes);
        });
        if (attrs.sslControlLayout === 'toolbar') {
          scope.$watch('filterMenu.open', function (open) {
            if (open) scope.$evalAsync(function () {
              var menu = element[0].querySelector('.ssl-filter-menu');
              if (!menu) return;
              window.SSLWidgetLayout.applyControlText(menu, scope.design, scope.theme, 'filter');
              window.SSLWidgetLayout.positionFilterMenu(menu);
            });
          });
        }
      }
    };
  });
  widgetModule.controller('SSLLogWidgetController', [
    '$scope',
    '$timeout',
    function ($scope, $timeout) {
      var settings = widgetSettings;
      var count = settings.entryCount === undefined || settings.entryCount === null
        ? 25 : Number(settings.entryCount);
      var searchMode = settings.searchMode === 'advanced' ? 'advanced' : 'simple';
      var searchEnabled = settings.searchMode !== 'none';
      var showFilters = settings.showFilters !== false;
      var paging = settings.paging === true;
      // The design's format applies unless this widget chose its own; it is resolved once the styles load.
      var ownFormat = settings.datetimeFormat && typeof settings.datetimeFormat === 'object'
        ? settings.datetimeFormat.id : settings.datetimeFormat;
      if (typeof ownFormat !== 'string' || !ownFormat.trim()) ownFormat = '';
      var datetimeFormat = ownFormat || 'timeshort';
      var dayFormat = 'ddd d MMM';
      var filters = readFilters(settings);
      var instanceId = Homey.getWidgetInstanceId();
      var filterStatePath = '/filter-state/' + encodeURIComponent(instanceId);
      var filterSaveQueue = Promise.resolve();
      var sequence = 0;
      var severities = {};
      var facilities = {};
      var destroyed = false;
      var realtimeReady = false;
      var timestampFormatRegistered = false;
      var pendingRealtimeEntries = [];
      var labels = {
        timestamp: translate('widgets.fields.timestamp', 'Timestamp'),
        severity: translate('widgets.fields.severity', 'Severity'),
        facility: translate('widgets.fields.facility', 'Facility'),
        app: translate('widgets.fields.app', 'App / Group'),
        hostname: translate('widgets.fields.hostname', 'Hostname'),
        message: translate('widgets.fields.message', 'Message'),
        search: translate('widgets.search', 'Search'),
        filters: translate('widgets.filters.button', 'Filters'),
        level: translate('widgets.filters.level', 'Level'),
        allLevels: translate('widgets.filters.allLevels', 'All levels'),
        date: translate('widgets.filters.date', 'Date'),
        fromDate: translate('widgets.filters.fromDate', 'From'),
        toDate: translate('widgets.filters.toDate', 'To'),
        allDates: translate('widgets.filters.allDates', 'All dates'),
        invalidDateRange: translate('widgets.filters.invalidDateRange', 'The start date must be on or before the end date.'),
        futureDate: translate('widgets.filters.futureDate', 'Dates cannot be later than today.'),
        filterSaveError: translate('widgets.filters.saveError', 'Could not save your filters. They may not be restored after a reload.'),
        loading: translate('widgets.loading', 'Loading logs…'),
        bllRequired: translate('widgets.bllRequired', 'Better Logic Library must be running when this widget is loaded.'),
        noLogs: translate('widgets.noLogs', 'No matching log entries.'),
        pagination: translate('widgets.pagination.label', 'Log pages'),
        previousPage: translate('widgets.pagination.previous', 'Previous'),
        nextPage: translate('widgets.pagination.next', 'Next'),
        page: translate('widgets.pagination.page', 'Page')
      };

      $scope.loading = true;
      $scope.bllUnavailable = false;
      $scope.error = '';
      // An object, because the search box sits in an ng-if child scope.
      $scope.search = { text: '' };
      $scope.searchError = '';
      $scope.labels = labels;
      $scope.logs = [];
      $scope.filteredLogs = [];
      $scope.design = { rows: [], showDaySeparators: true };
      $scope.theme = { elements: {} };
      $scope.styleVersion = 0;
      var alignTimer = null;
      var scrollPending = false;
      // Every card is its own grid, so content-sized columns (time and level in the default design)
      // are aligned across the list after cards render; a timeout also runs in background tabs.
      $scope.scheduleTrackAlignment = function () {
        if (alignTimer !== null || destroyed) return;
        alignTimer = window.setTimeout(function () {
          alignTimer = null;
          var list = document.getElementById('ssl-log-list');
          if (!destroyed && list) window.SSLWidgetLayout.alignContentTracks(list);
        }, 0);
      };
      if (typeof window.addEventListener === 'function') window.addEventListener('resize', $scope.scheduleTrackAlignment);
      if (document.fonts && document.fonts.ready) document.fonts.ready.then($scope.scheduleTrackAlignment);
      $scope.themeStyle = {};
      $scope.searchMode = searchEnabled ? searchMode : 'none';
      $scope.showSearch = searchEnabled;
      $scope.showFilters = showFilters;
      $scope.showToolbar = searchEnabled || showFilters;
      $scope.paging = paging;
      $scope.pageIndex = 0;
      $scope.hasNextPage = false;
      $scope.pageLoading = false;
      $scope.modeClass = sslColorModeClass(settings);
      $scope.filterMenu = { open: false, level: false, date: false };
      // Chosen levels by id; when any are chosen they replace the widget's minimum level.
      $scope.levelFilter = {};
      $scope.dateFilter = { from: null, to: null };
      $scope.dateFilterError = '';
      $scope.filterSaveError = '';
      $scope.levels = SSL_SEVERITY_NAMES.map(function (name, id) {
        return {
          id: id,
          className: 'ssl-sev-' + name,
          label: translate('widgets.settings.colors.' + name, name.charAt(0).toUpperCase() + name.slice(1))
        };
      });

      function selectedLevels() {
        return $scope.levels.filter(function (level) { return $scope.levelFilter[level.id]; })
          .map(function (level) { return level.id; });
      }

      $scope.hasLevelFilter = function () { return selectedLevels().length > 0; };
      $scope.selectedLevelCount = function () { return selectedLevels().length; };
      function dateValue(value) {
        if (value === undefined || value === null || value === '') return '';
        var date = value instanceof Date ? value : new Date(value);
        if (!Number.isFinite(date.getTime())) return '';
        return String(date.getFullYear()).padStart(4, '0') + '-'
          + String(date.getMonth() + 1).padStart(2, '0') + '-'
          + String(date.getDate()).padStart(2, '0');
      }
      $scope.todayDate = function () { return dateValue(new Date()); };
      $scope.maxFromDate = function () {
        var to = dateValue($scope.dateFilter.to);
        var today = $scope.todayDate();
        return to && to < today ? to : today;
      };
      function localDate(value) {
        if (value === null) return null;
        if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
          throw new Error('The saved widget filter dates are invalid.');
        }
        var date = new Date(value + 'T00:00:00');
        if (!Number.isFinite(date.getTime()) || dateValue(date) !== value) {
          throw new Error('The saved widget filter dates are invalid.');
        }
        return date;
      }
      function restoreFilterState(state) {
        if (!state || !Array.isArray(state.levels)) throw new Error('The saved widget filter state is invalid.');
        var levels = {};
        state.levels.forEach(function (id) {
          if (!Number.isInteger(id) || id < 0 || id >= $scope.levels.length || levels[id]) {
            throw new Error('The saved widget filter levels are invalid.');
          }
          levels[id] = true;
        });
        var from = localDate(state.from);
        var to = localDate(state.to);
        if (from && to && dateValue(from) > dateValue(to)) {
          throw new Error('The saved widget filter dates are invalid.');
        }
        $scope.levelFilter = levels;
        $scope.dateFilter = { from: from, to: to };
      }
      function persistFilterState() {
        if (hasFutureDate()) return;
        var state = {
          levels: selectedLevels(),
          from: dateValue($scope.dateFilter.from) || null,
          to: dateValue($scope.dateFilter.to) || null
        };
        filterSaveQueue = filterSaveQueue.then(function () {
          return Homey.api('PUT', filterStatePath, state);
        }).then(function () {
          if (destroyed) return;
          $scope.$applyAsync(function () { $scope.filterSaveError = ''; });
        }).catch(function (error) {
          if (destroyed) return;
          console.error('Unable to save Simple Sys Log widget filters', error);
          $scope.$applyAsync(function () { $scope.filterSaveError = labels.filterSaveError; });
        });
      }
      $scope.hasDateFilter = function () {
        return !!(dateValue($scope.dateFilter.from) || dateValue($scope.dateFilter.to));
      };
      $scope.dateFilterCount = function () {
        return Number(!!dateValue($scope.dateFilter.from)) + Number(!!dateValue($scope.dateFilter.to));
      };
      function hasFutureDate() {
        var today = $scope.todayDate();
        if (dateValue($scope.dateFilter.from) <= today && dateValue($scope.dateFilter.to) <= today) return false;
        $scope.dateFilterError = labels.futureDate;
        return true;
      }
      $scope.dateRangeChanged = function () {
        var from = dateValue($scope.dateFilter.from);
        var to = dateValue($scope.dateFilter.to);
        if (hasFutureDate()) return;
        if (from && to && from > to) {
          $scope.dateFilterError = labels.invalidDateRange;
          return;
        }
        $scope.dateFilterError = '';
        persistFilterState();
        reloadLogs(true);
      };
      $scope.clearDateRange = function () {
        $scope.dateFilter = { from: null, to: null };
        $scope.dateFilterError = '';
        persistFilterState();
        reloadLogs(true);
      };
      $scope.toggleFilterMenu = function () {
        $scope.filterMenu.open = !$scope.filterMenu.open;
        $scope.filterMenu.level = false;
        $scope.filterMenu.date = false;
      };
      $scope.openFilterGroup = function (group) {
        $scope.filterMenu.level = group === 'level';
        $scope.filterMenu.date = group === 'date';
      };
      $scope.filterKeydown = function (event) {
        if (event.key !== 'Escape' || !$scope.filterMenu.open) return;
        $scope.filterMenu.open = false;
        var button = document.querySelector('.ssl-filter-button');
        if (button) button.focus();
      };
      $scope.toggleLevel = function (id) {
        $scope.levelFilter[id] = !$scope.levelFilter[id];
        persistFilterState();
        reloadLogs(true);
      };
      $scope.clearLevels = function () {
        $scope.levelFilter = {};
        persistFilterState();
        reloadLogs(true);
      };
      $scope.previousPage = function () {
        if (!paging || $scope.pageIndex <= 0 || $scope.pageLoading) return;
        $scope.pageIndex--;
        reloadLogs();
      };
      $scope.nextPage = function () {
        if (!paging || !$scope.hasNextPage || $scope.pageLoading) return;
        $scope.pageIndex++;
        reloadLogs();
      };

      function closeFilterMenuOutside(event) {
        if (!$scope.filterMenu.open || (event.target.closest && event.target.closest('.ssl-filter'))) return;
        $scope.$applyAsync(function () { $scope.filterMenu.open = false; });
      }
      document.addEventListener('click', closeFilterMenuOutside);

      function readFilters(values) {
        var result = {};
        var minSeverity = Number(values.minSeverity);
        if (Number.isInteger(minSeverity) && minSeverity >= 0 && minSeverity < 7) result.minSeverity = minSeverity;
        var facility = Number(values.facility);
        if (values.facility !== 'all' && values.facility !== '' && values.facility !== undefined
          && values.facility !== null && Number.isInteger(facility)) result.facility = facility;
        if (typeof values.appFilter === 'string' && values.appFilter.trim()) result.app = values.appFilter.trim();
        if (typeof values.hostnameFilter === 'string' && values.hostnameFilter.trim()) {
          result.hostname = values.hostnameFilter.trim();
        }
        return result;
      }

      function containsText(value, search) {
        return value !== undefined && value !== null
          && String(value).toLowerCase().indexOf(search.toLowerCase()) >= 0;
      }

      // Mirrors the server-side widget filters for realtime entries.
      function matchesFilters(entry) {
        var levels = showFilters ? selectedLevels() : [];
        if (levels.length) {
          if (levels.indexOf(Number(entry.severity)) < 0) return false;
        } else if (filters.minSeverity !== undefined && !(Number(entry.severity) <= filters.minSeverity)) return false;
        if (filters.facility !== undefined && Number(entry.facility) !== filters.facility) return false;
        if (filters.app !== undefined && !containsText(entry.app, filters.app)) return false;
        if (filters.hostname !== undefined && !containsText(entry.hostname, filters.hostname)) return false;
        var from = showFilters ? dateValue($scope.dateFilter.from) : '';
        var to = showFilters ? dateValue($scope.dateFilter.to) : '';
        if (from || to) {
          var entryDate = dateValue(entry.timestamp);
          if (!entryDate || (from && entryDate < from) || (to && entryDate > to)) return false;
        }
        return true;
      }

      function unregisterTimestampFormat() {
        if (!timestampFormatRegistered) return;
        timestampFormatRegistered = false;
        Homey.api('POST', '/unregister-timestamp-format', { instanceId: instanceId })
          .catch(function (error) {
            console.error('Unable to unregister Simple Sys Log widget timestamp format', error);
          });
      }

      function translate(key, fallback) {
        try {
          return Homey.__(key) || fallback;
        } catch (error) {
          return fallback;
        }
      }

      function settingId(value, fallback) {
        if (typeof value === 'string') return value;
        return value && typeof value.id === 'string' ? value.id : fallback;
      }

      function applyStyles(collection) {
        var designId = settingId(settings.designStyle, 'builtin:default');
        var themeId = settingId(settings.colorTheme, 'builtin:default');
        // Widgets saved before the built-in theme was renamed keep working.
        if (themeId === 'builtin:homey') themeId = 'builtin:default';
        var design = collection.designs.find(function (item) { return item.id === designId; });
        var theme = collection.themes.find(function (item) { return item.id === themeId; });
        if (!design) throw new Error(translate('widgets.designUnavailable', 'The selected widget design is unavailable.'));
        if (!theme) throw new Error(translate('widgets.themeUnavailable', 'The selected widget theme is unavailable.'));
        $scope.design = design;
        $scope.theme = theme;
        $scope.cardLayout = window.SSLWidgetLayout.computeLayout(design);
        if (!ownFormat && typeof design.timestampFormat === 'string' && design.timestampFormat.trim()) {
          datetimeFormat = design.timestampFormat;
        }
        if (typeof design.daySeparatorFormat === 'string' && design.daySeparatorFormat.trim()) {
          dayFormat = design.daySeparatorFormat;
        }
        $scope.styleVersion++;
        $scope.themeStyle = window.SSLWidgetLayout.widgetStyle(design, theme);
      }

      function fingerprint(log) {
        return [log.timestamp, log.severityId, log.facilityId, log.app, log.hostname, log.message].join('\u0000');
      }

      function normalizeLog(log) {
        var copy = Object.assign({}, log);
        copy.severityId = copy.severityId === undefined ? copy.severity : copy.severityId;
        copy.facilityId = copy.facilityId === undefined ? copy.facility : copy.facilityId;
        copy.severity = severities[copy.severityId] || copy.severity;
        copy.facility = facilities[copy.facilityId] || copy.facility;
        copy.timestamp = copy.timestamp instanceof Date ? copy.timestamp.toISOString() : copy.timestamp;
        copy._fingerprint = fingerprint(copy);
        copy._key = copy.id === undefined || copy.id === null
          ? copy._fingerprint + ':' + (++sequence) : String(copy.id);
        return copy;
      }

      function refreshSearch() {
        try {
          var query = searchEnabled ? $scope.search.text : '';
          $scope.filteredLogs = typeof query === 'string' && query.trim()
            ? $scope.logs.filter(window.SSLWidgetSearch.compile(query, searchMode))
            : $scope.logs.slice();
          $scope.searchError = '';
        } catch (error) {
          $scope.searchError = error.message;
        }
      }

      $scope.validateSearch = refreshSearch;
      $scope.fieldValue = function (field, log) {
        if (field === 'timestamp') {
          var formatted = log.timestamp_formatted;
          if (formatted && typeof formatted === 'object') {
            if (Object.prototype.hasOwnProperty.call(formatted, datetimeFormat)) return formatted[datetimeFormat];
            if (Object.prototype.hasOwnProperty.call(formatted, 'datetime')) {
              console.error('The log entry is missing its selected timestamp format', datetimeFormat);
              return formatted.datetime;
            }
          }
          return formatTimestamp(log.timestamp);
        }
        return log[field] === undefined || log[field] === null ? '' : String(log[field]);
      };
      $scope.fieldValueClass = function (field, log) {
        return field === 'severity' && Number.isInteger(Number(log.severityId))
          ? 'ssl-severity-' + Number(log.severityId) : '';
      };
      $scope.severityClass = function (log) {
        var severity = Number(log.severityId);
        return SSL_SEVERITY_NAMES[severity] ? 'ssl-sev-' + SSL_SEVERITY_NAMES[severity] : 'ssl-sev-unknown';
      };
      // Entries are grouped by their formatted separator text, so the design's format sets the grouping.
      var fallbackDayFormatter;
      $scope.formatDay = function (log) {
        var formatted = log.timestamp_formatted;
        if (formatted && typeof formatted === 'object' && Object.prototype.hasOwnProperty.call(formatted, dayFormat)) {
          return formatted[dayFormat];
        }
        var date = new Date(log.timestamp);
        if (Number.isNaN(date.getTime())) return '';
        if (!fallbackDayFormatter) {
          fallbackDayFormatter = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
        }
        return fallbackDayFormatter.format(date);
      };
      $scope.showDaySeparator = function (index) {
        if (!$scope.design.showDaySeparators) return false;
        if (index === 0) return true;
        return $scope.formatDay($scope.filteredLogs[index - 1]) !== $scope.formatDay($scope.filteredLogs[index]);
      };

      function formatTimestamp(value) {
        var date = new Date(value);
        return Number.isNaN(date.getTime()) ? String(value || '') : date.toLocaleString();
      }

      function preserveScrollOnInsert(log) {
        var list = document.getElementById('ssl-log-list');
        // Web widget wrappers scroll the page itself; dashboard widgets scroll the list.
        var pageScroll = !!document.documentElement && document.documentElement.classList.contains('ssl-android-page');
        var scroller = pageScroll ? document.scrollingElement || document.documentElement : list;
        var followTop = !!scroller && scroller.scrollTop <= 24;
        var anchor = null;
        if (list && !followTop && !scrollPending) {
          var toolbar = pageScroll ? document.querySelector('.ssl-widget-toolbar') : null;
          var viewTop = pageScroll ? (toolbar ? toolbar.getBoundingClientRect().bottom : 0)
            : list.getBoundingClientRect().top;
          var entries = list.querySelectorAll('.ssl-log-entry');
          for (var index = 0; index < entries.length; index++) {
            if (entries[index].getBoundingClientRect().bottom > viewTop) {
              anchor = entries[index];
              break;
            }
          }
        }
        var top = anchor ? anchor.getBoundingClientRect().top : 0;
        $scope.$applyAsync(function () {
          if ($scope.logs.some(function (item) { return item._fingerprint === log._fingerprint; })) return;
          $scope.logs.unshift(log);
          if ($scope.logs.length > count) {
            $scope.logs.length = count;
            if (paging) $scope.hasNextPage = true;
          }
          refreshSearch();
          if (scrollPending || (!anchor && !followTop)) return;
          scrollPending = true;
          window.requestAnimationFrame(function () {
            scrollPending = false;
            if (destroyed) return;
            if (followTop) scroller.scrollTop = 0;
            else if (list.contains(anchor)) scroller.scrollTop += anchor.getBoundingClientRect().top - top;
          });
        });
      }

      function insertRealtimeEntry(entry) {
        var formatted = entry.timestamp_formatted;
        if (!formatted || typeof formatted !== 'object'
          || !Object.prototype.hasOwnProperty.call(formatted, datetimeFormat)) {
          console.error('Realtime log entry is missing its selected timestamp format', datetimeFormat);
          if (!formatted || typeof formatted !== 'object'
            || !Object.prototype.hasOwnProperty.call(formatted, 'datetime')) return;
          formatted = Object.assign(Object.create(null), formatted);
          formatted[datetimeFormat] = formatted.datetime;
          entry.timestamp_formatted = formatted;
        }
        preserveScrollOnInsert(normalizeLog(entry));
      }

      function onRealtimeLog(entry) {
        if (destroyed || $scope.bllUnavailable || !entry || !Number.isSafeInteger(count)) return;
        if (paging && $scope.pageIndex > 0) return;
        if (!matchesFilters(entry)) return;
        if (!realtimeReady) {
          if (pendingRealtimeEntries.length >= count) pendingRealtimeEntries.shift();
          pendingRealtimeEntries.push(entry);
          return;
        }
        insertRealtimeEntry(entry);
      }

      if (!Number.isSafeInteger(count) || count < 1) {
        $scope.loading = false;
        $scope.error = translate('widgets.invalidEntryCount', 'The entry count must be a whole number of at least 1.');
        Homey.ready({ height: widgetHeight });
        return;
      }

      function logsPath() {
        var path = '/logs?take=' + encodeURIComponent(count + (paging ? 1 : 0))
          + '&timestampFormat=' + encodeURIComponent(datetimeFormat)
          + '&dayFormat=' + encodeURIComponent(dayFormat);
        if (paging) path += '&skip=' + encodeURIComponent($scope.pageIndex * count);
        Object.keys(filters).forEach(function (key) {
          path += '&' + key + '=' + encodeURIComponent(filters[key]);
        });
        var from = showFilters ? dateValue($scope.dateFilter.from) : '';
        var to = showFilters ? dateValue($scope.dateFilter.to) : '';
        if (from) path += '&dateFrom=' + encodeURIComponent(from);
        if (to) path += '&dateTo=' + encodeURIComponent(to);
        var levels = showFilters ? selectedLevels() : [];
        if (levels.length) path += '&severities=' + encodeURIComponent(levels.join(','));
        return path;
      }

      function applyLogData(data) {
        if (!data.available) {
          $scope.bllUnavailable = true;
          $scope.pageLoading = false;
          pendingRealtimeEntries.length = 0;
          realtimeReady = true;
          return;
        }
        $scope.bllUnavailable = false;
        severities = data.severities || {};
        facilities = data.facilities || {};
        $scope.hasNextPage = paging && data.logs.length > count;
        $scope.logs = data.logs.slice(0, count).map(normalizeLog);
        $scope.pageLoading = false;
        refreshSearch();
        realtimeReady = true;
        var pending = pendingRealtimeEntries;
        pendingRealtimeEntries = [];
        pending.forEach(insertRealtimeEntry);
      }

      // Refetches with the current filters; only the latest request applies.
      var levelRequest = 0;
      var filtersChangedDuringLoad = false;
      function reloadLogs(resetPage) {
        if (showFilters && hasFutureDate()) return;
        if (resetPage && paging) $scope.pageIndex = 0;
        if (initialLoadPending) {
          filtersChangedDuringLoad = true;
          return;
        }
        if (destroyed || $scope.bllUnavailable) return;
        $scope.pageLoading = paging;
        var request = ++levelRequest;
        realtimeReady = false;
        pendingRealtimeEntries.length = 0;
        $scope.error = '';
        Homey.api('GET', logsPath(), {}).then(function (data) {
          if (destroyed || request !== levelRequest) return;
          $scope.$applyAsync(function () { applyLogData(data); });
        }).catch(function (error) {
          if (destroyed || request !== levelRequest) return;
          $scope.$applyAsync(function () {
            $scope.pageLoading = false;
            $scope.error = error && error.message
              ? error.message : translate('widgets.loadError', 'Unable to load log entries.');
            pendingRealtimeEntries.length = 0;
            realtimeReady = true;
          });
        });
      }

      // BLL started after this widget loaded: buffer realtime entries while the logs are fetched.
      function reloadAfterStorageReady() {
        if (destroyed || !$scope.bllUnavailable) return;
        realtimeReady = false;
        $scope.bllUnavailable = false;
        $scope.loading = true;
        $scope.$applyAsync();
        Homey.api('GET', logsPath(), {}).then(function (data) {
          if (destroyed) return;
          $scope.$applyAsync(function () {
            applyLogData(data);
          });
        }).catch(function (error) {
          if (destroyed) return;
          $scope.$applyAsync(function () {
            $scope.pageLoading = false;
            $scope.error = error && error.message
              ? error.message : translate('widgets.loadError', 'Unable to load log entries.');
            pendingRealtimeEntries.length = 0;
            realtimeReady = true;
          });
        }).finally(function () {
          if (destroyed) return;
          $scope.$applyAsync(function () {
            $scope.loading = false;
          });
        });
      }

      function onLogStorageReady() {
        if (destroyed) return;
        if (initialLoadPending) storageReadyDuringInitialLoad = true;
        else reloadAfterStorageReady();
      }

      var initialLoadPending = true;
      var storageReadyDuringInitialLoad = false;
      Homey.on('log_updated', onRealtimeLog);
      Homey.on('log_storage_ready', onLogStorageReady);
      Promise.all([
        Homey.api('GET', filterStatePath, {}),
        Homey.api('GET', '/styles', {})
      ]).then(function (initialData) {
        if (destroyed) return null;
        restoreFilterState(initialData[0]);
        applyStyles(initialData[1]);
        return Homey.api('POST', '/register-timestamp-format', {
          instanceId: instanceId,
          formats: [datetimeFormat, dayFormat]
        });
      }).then(function (result) {
        if (destroyed && !result) return null;
        if (!result || !result.registered) throw new Error('Widget timestamp format registration failed.');
        timestampFormatRegistered = true;
        if (destroyed) {
          unregisterTimestampFormat();
          return null;
        }
        return Homey.api('GET', logsPath(), {});
      }).then(function (data) {
        if (!data) return;
        if (destroyed) return;
        applyLogData(data);
      }).catch(function (error) {
        if (!destroyed) {
          $scope.pageLoading = false;
          $scope.error = error && error.message
            ? error.message : translate('widgets.loadError', 'Unable to load log entries.');
        }
        pendingRealtimeEntries.length = 0;
        realtimeReady = true;
      }).finally(function () {
        if (destroyed) return;
        initialLoadPending = false;
        // Native promises run outside Angular's digest, so apply all results from this chain here.
        $scope.$applyAsync(function () {
          $scope.loading = false;
        });
        Homey.ready({ height: widgetHeight });
        if (storageReadyDuringInitialLoad && !$scope.error) reloadAfterStorageReady();
        else if (filtersChangedDuringLoad && !$scope.error) reloadLogs();
      });

      document.addEventListener('visibilitychange', function () {
        if (document.hidden === false && !destroyed && !$scope.bllUnavailable) {
          reloadLogs();
        }
      });

      $scope.$on('$destroy', function () {
        destroyed = true;
        if (typeof window.removeEventListener === 'function') window.removeEventListener('resize', $scope.scheduleTrackAlignment);
        if (alignTimer !== null) window.clearTimeout(alignTimer);
        document.removeEventListener('click', closeFilterMenuOutside);
        pendingRealtimeEntries.length = 0;
        unregisterTimestampFormat();
        if (typeof Homey.off === 'function') {
          Homey.off('log_updated', onRealtimeLog);
          Homey.off('log_storage_ready', onLogStorageReady);
        } else if (typeof Homey.removeListener === 'function') {
          Homey.removeListener('log_updated', onRealtimeLog);
          Homey.removeListener('log_storage_ready', onLogStorageReady);
        }
      });
    }
  ]);

  angular.bootstrap(document, ['sslLogWidget']);
}
