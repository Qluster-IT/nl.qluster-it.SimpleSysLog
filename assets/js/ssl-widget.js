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
    'After changing this widget\'s settings, copy the link again.')));
  content.appendChild(element('p', 'ssl-android-text ssl-android-warning', t('private',
    'Anyone with a link can read these log entries. You can reset all links in the Widget designer.')));
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
    return Homey.api('POST', '/android-links', settings);
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

  angular.module('sslLogWidget', []).controller('SSLLogWidgetController', [
    '$scope',
    '$timeout',
    function ($scope, $timeout) {
      var settings = widgetSettings;
      var count = settings.entryCount === undefined || settings.entryCount === null
        ? 25 : Number(settings.entryCount);
      var searchMode = settings.searchMode === 'advanced' ? 'advanced' : 'simple';
      var datetimeFormat = settings.datetimeFormat && typeof settings.datetimeFormat === 'object'
        ? settings.datetimeFormat.name || settings.datetimeFormat.id : settings.datetimeFormat;
      if (typeof datetimeFormat !== 'string' || !datetimeFormat) datetimeFormat = 'datetime';
      var filters = readFilters(settings);
      var instanceId = Homey.getWidgetInstanceId();
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
        loading: translate('widgets.loading', 'Loading logs…'),
        bllRequired: translate('widgets.bllRequired', 'Better Logic Library must be running when this widget is loaded.'),
        noLogs: translate('widgets.noLogs', 'No matching log entries.')
      };

      $scope.loading = true;
      $scope.bllUnavailable = false;
      $scope.error = '';
      $scope.searchText = '';
      $scope.searchError = '';
      $scope.labels = labels;
      $scope.logs = [];
      $scope.filteredLogs = [];
      $scope.design = { fields: ['timestamp', 'severity', 'message', 'app', 'facility'], showDaySeparators: true };
      $scope.themeStyle = {};
      $scope.showSearch = settings.showSearch !== false;
      $scope.modeClass = sslColorModeClass(settings);
      setLayout($scope.design.fields);

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
        if (filters.minSeverity !== undefined && !(Number(entry.severity) <= filters.minSeverity)) return false;
        if (filters.facility !== undefined && Number(entry.facility) !== filters.facility) return false;
        if (filters.app !== undefined && !containsText(entry.app, filters.app)) return false;
        if (filters.hostname !== undefined && !containsText(entry.hostname, filters.hostname)) return false;
        return true;
      }

      function setLayout(fields) {
        $scope.sideFields = fields.filter(function (field) { return field === 'timestamp' || field === 'severity'; });
        $scope.metaFields = fields.filter(function (field) {
          return field !== 'timestamp' && field !== 'severity' && field !== 'message';
        });
        $scope.showMessage = fields.indexOf('message') >= 0;
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
        setLayout(design.fields);
        var style = {};
        Object.keys(theme.colors).forEach(function (key) {
          var color = theme.colors[key];
          if (color && color !== 'automatic') style['--ssl-' + key] = 'var(--ssl-color-' + color + ')';
        });
        $scope.themeStyle = style;
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
          $scope.filteredLogs = $scope.logs.filter(function (log) {
            return window.SSLWidgetSearch.matches(log, $scope.searchText, searchMode);
          });
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
      $scope.formatDay = function (timestamp) {
        var date = new Date(timestamp);
        return Number.isNaN(date.getTime()) ? ''
          : date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
      };
      $scope.showDaySeparator = function (index) {
        if (!$scope.design.showDaySeparators) return false;
        if (index === 0) return true;
        return $scope.formatDay($scope.filteredLogs[index - 1].timestamp)
          !== $scope.formatDay($scope.filteredLogs[index].timestamp);
      };

      function formatTimestamp(value) {
        var date = new Date(value);
        return Number.isNaN(date.getTime()) ? String(value || '') : date.toLocaleString();
      }

      function preserveScrollOnInsert(log) {
        var list = document.getElementById('ssl-log-list');
        // Web widget wrappers scroll the page itself; dashboard widgets scroll the list.
        var pageScroll = !!document.documentElement && document.documentElement.classList.contains('ssl-android-page');
        var toolbar = pageScroll ? document.querySelector('.ssl-widget-toolbar') : null;
        var viewTop = !list ? 0 : pageScroll ? (toolbar ? toolbar.getBoundingClientRect().bottom : 0)
          : list.getBoundingClientRect().top;
        var anchor = list && Array.from(list.querySelectorAll('.ssl-log-entry')).find(function (entry) {
          return entry.getBoundingClientRect().bottom > viewTop;
        });
        var top = anchor ? anchor.getBoundingClientRect().top : 0;
        $scope.$applyAsync(function () {
          if ($scope.logs.some(function (item) { return item._fingerprint === log._fingerprint; })) return;
          $scope.logs.unshift(log);
          if ($scope.logs.length > count) $scope.logs.length = count;
          refreshSearch();
          if (!anchor) return;
          window.requestAnimationFrame(function () {
            if (destroyed || !list.contains(anchor)) return;
            var scroller = pageScroll ? document.scrollingElement || document.documentElement : list;
            scroller.scrollTop += anchor.getBoundingClientRect().top - top;
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
        var path = '/logs?take=' + encodeURIComponent(count)
          + '&timestampFormat=' + encodeURIComponent(datetimeFormat);
        Object.keys(filters).forEach(function (key) {
          path += '&' + key + '=' + encodeURIComponent(filters[key]);
        });
        return path;
      }

      function applyLogData(data) {
        if (!data.available) {
          $scope.bllUnavailable = true;
          pendingRealtimeEntries.length = 0;
          realtimeReady = true;
          return;
        }
        $scope.bllUnavailable = false;
        severities = data.severities || {};
        facilities = data.facilities || {};
        $scope.logs = data.logs.map(normalizeLog);
        refreshSearch();
        realtimeReady = true;
        var pending = pendingRealtimeEntries;
        pendingRealtimeEntries = [];
        pending.forEach(insertRealtimeEntry);
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
      Homey.api('POST', '/register-timestamp-format', {
        instanceId: instanceId,
        format: datetimeFormat
      }).then(function (result) {
        if (!result || !result.registered) throw new Error('Widget timestamp format registration failed.');
        timestampFormatRegistered = true;
        if (destroyed) {
          unregisterTimestampFormat();
          return null;
        }
        return Promise.all([
          Homey.api('GET', '/styles', {}),
          Homey.api('GET', logsPath(), {})
        ]);
      }).then(function (results) {
        if (!results) return;
        if (destroyed) return;
        var styles = results[0];
        var data = results[1];
        applyStyles(styles);
        applyLogData(data);
      }).catch(function (error) {
        if (!destroyed) $scope.error = error && error.message
          ? error.message : translate('widgets.loadError', 'Unable to load log entries.');
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
      });

      document.addEventListener('visibilitychange', function () {
        if (document.hidden === false && !destroyed && !$scope.bllUnavailable) {
          Homey.api('GET', logsPath(), {}).then(function (data) {
            if (!destroyed && data.available) {
              $scope.$applyAsync(function () {
                $scope.logs = data.logs.map(normalizeLog);
                refreshSearch();
              });
            }
          }).catch(function (error) {
            console.error('Unable to refresh visible Simple Sys Log widget', error);
          });
        }
      });

      $scope.$on('$destroy', function () {
        destroyed = true;
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
