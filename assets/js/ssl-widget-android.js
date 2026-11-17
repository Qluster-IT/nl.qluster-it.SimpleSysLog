'use strict';

// Runs this widget inside a Homey Web widget (an ordinary web page) when opened through a signed
// Android link. Without the link parameters, this script does nothing.
(function () {
  var POLL_CLIENT_TIMEOUT_MS = 35000;
  var PING_TIMEOUT_MS = 2500;
  var RETRY_MS = 5000;
  var LOCAL_RECHECK_MS = 60000;

  function readParams(search) {
    var params = new URLSearchParams(search || '');
    return { ssl: params.get('ssl'), sig: params.get('sig'), local: params.get('local') };
  }

  function appIdFromPath(pathname) {
    var match = /^\/app\/([^/]+)\//.exec(pathname || '');
    return match ? decodeURIComponent(match[1]) : null;
  }

  function fetchJson(url, timeoutMs) {
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = controller && timeoutMs ? setTimeout(function () { controller.abort(); }, timeoutMs) : null;
    return fetch(url, { cache: 'no-store', credentials: 'omit', signal: controller ? controller.signal : undefined })
      .then(function (response) {
        return response.text().then(function (text) {
          var data = null;
          try {
            data = text ? JSON.parse(text) : null;
          } catch (error) {
            data = null;
          }
          if (!response.ok) {
            var message = data && (data.error || data.message);
            var error = new Error(typeof message === 'string' && message ? message : 'HTTP ' + response.status);
            error.status = response.status;
            throw error;
          }
          return data;
        });
      })
      .finally(function () {
        if (timer) clearTimeout(timer);
      });
  }

  // Prefers the local Homey address when reachable and falls back to the page's own (cloud) origin.
  function createConnection(options) {
    var fetcher = options.fetchJson || fetchJson;
    var now = options.now || Date.now;
    var appPath = '/api/app/' + encodeURIComponent(options.appId);
    var remoteBase = options.origin + appPath;
    var localBase = options.params.local && options.params.local !== options.hostname
      ? 'https://' + options.params.local + appPath : null;
    var base = remoteBase;
    var localCheckedAt = -Infinity;
    var probing = null;

    function url(currentBase, path, extra) {
      var query = new URLSearchParams({ ssl: options.params.ssl, sig: options.params.sig });
      Object.keys(extra || {}).forEach(function (key) { query.set(key, extra[key]); });
      return currentBase + path + '?' + query.toString();
    }

    function chooseBase() {
      if (!localBase || base === localBase || now() - localCheckedAt < LOCAL_RECHECK_MS) return Promise.resolve(base);
      if (!probing) {
        localCheckedAt = now();
        probing = fetcher(localBase + '/android/ping', PING_TIMEOUT_MS).then(function () {
          base = localBase;
        }, function () {}).then(function () {
          probing = null;
          return base;
        });
      }
      return probing;
    }

    function request(path, extra, timeoutMs) {
      return chooseBase().then(function (currentBase) {
        return fetcher(url(currentBase, path, extra), timeoutMs).catch(function (error) {
          // Only network failures switch to the cloud; server errors are the same on both routes.
          if (currentBase !== localBase || error.status) throw error;
          base = remoteBase;
          localCheckedAt = now();
          return fetcher(url(remoteBase, path, extra), timeoutMs);
        });
      });
    }

    return { request: request, current: function () { return base; } };
  }

  // Stand-in for the Homey widget SDK, backed by the public link endpoints.
  function createHomey(state) {
    var listeners = {};
    var translations = state.translations || {};
    return {
      getSettings: function () { return state.config; },
      getWidgetInstanceId: function () { return 'android'; },
      ready: function () {},
      setHeight: function () { return Promise.resolve(); },
      __: function (key) {
        return Object.prototype.hasOwnProperty.call(translations, key) ? translations[key] : undefined;
      },
      on: function (event, callback) {
        (listeners[event] = listeners[event] || []).push(callback);
      },
      off: function (event, callback) {
        listeners[event] = (listeners[event] || []).filter(function (item) { return item !== callback; });
      },
      emitLocal: function (event, data) {
        (listeners[event] || []).slice().forEach(function (callback) { callback(data); });
      },
      api: function (method, path) {
        var route = String(path).split('?')[0];
        // Links format timestamps on the server, so there is nothing to register.
        if (route === '/register-timestamp-format') return Promise.resolve({ registered: true });
        if (route === '/unregister-timestamp-format') return Promise.resolve({ unregistered: true });
        if (method === 'GET' && route === '/styles') return Promise.resolve(state.styles);
        if (method === 'GET' && route === '/logs') {
          var levels = new URLSearchParams(String(path).split('?')[1] || '').get('severities');
          return state.loadLogs(levels || null);
        }
        return Promise.reject(new Error('This action is not available in a Web widget.'));
      }
    };
  }

  // Polls even while the page reports itself hidden: some web views do so while visible,
  // and an idle long-poll costs one request per 20 seconds.
  function createPoller(options) {
    var schedule = options.setTimeout || setTimeout;
    var after = null;
    var instance = null;
    var available = null;
    var running = false;
    var severities = null;
    var generation = 0;

    function loop() {
      var started = generation;
      var extra = { after: after, instance: instance };
      if (severities) extra.severities = severities;
      options.request('/android/updates', extra, POLL_CLIENT_TIMEOUT_MS).then(function (data) {
        // The levels changed while this poll was waiting: its entries used the old levels.
        if (started !== generation) {
          loop();
          return;
        }
        if (data && data.ready === false) {
          schedule(loop, RETRY_MS);
          return;
        }
        if (!data || data.reload) {
          options.reload();
          return;
        }
        var becameAvailable = available === false && data.available === true;
        available = data.available;
        if (Number.isSafeInteger(data.seq)) after = data.seq;
        if (becameAvailable) options.emit('log_storage_ready');
        (data.logs || []).forEach(function (log) { options.emit('log_updated', log); });
        loop();
      }, function () {
        if (started !== generation) {
          loop();
          return;
        }
        schedule(loop, RETRY_MS);
      });
    }

    function start() {
      if (running || after === null) return;
      running = true;
      loop();
    }

    return {
      start: start,
      setSeverities: function (value) {
        if ((value || null) === severities) return;
        severities = value || null;
        generation++;
      },
      update: function (data) {
        if (!data) return;
        if (Number.isSafeInteger(data.seq)) after = data.seq;
        if (typeof data.instance === 'string') instance = data.instance;
        if (typeof data.available === 'boolean') available = data.available;
        start();
      },
      isRunning: function () { return running; }
    };
  }

  // The Homey widget SDK sets homey-dark-mode from the Homey app's theme when the host answers it.
  // Only without that answer does the page fall back to the device setting, under a class of its own.
  function followSystemColorMode(colorMode) {
    if (colorMode === 'light' || colorMode === 'dark' || typeof window.matchMedia !== 'function') return;
    var query = window.matchMedia('(prefers-color-scheme: dark)');
    var apply = function () { document.documentElement.classList.toggle('ssl-system-dark', query.matches); };
    apply();
    if (typeof query.addEventListener === 'function') query.addEventListener('change', apply);
    else if (typeof query.addListener === 'function') query.addListener(apply);
  }

  function whenDomReady(callback) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', callback);
    else callback();
  }

  function showError(error) {
    var message = document.createElement('p');
    message.className = 'ssl-widget-message ssl-widget-error';
    message.setAttribute('role', 'alert');
    message.textContent = error && error.message ? error.message : 'Unable to load log entries.';
    var main = document.createElement('main');
    main.className = 'ssl-widget ssl-mode-automatic';
    main.appendChild(message);
    document.body.replaceChildren(main);
  }

  function boot() {
    var params = readParams(window.location.search);
    if (!params.ssl || !params.sig) return;
    var startWidget = window.onHomeyReady;
    // The injected Homey SDK must not start a second widget instance; its call only means the
    // Homey app supplied its theme.
    window.onHomeyReady = function () { document.documentElement.classList.add('ssl-homey-theme'); };
    document.documentElement.classList.add('ssl-android-page');

    var connection = createConnection({
      params: params,
      appId: appIdFromPath(window.location.pathname),
      origin: window.location.origin,
      hostname: window.location.hostname
    });
    var homey = null;
    var poller = createPoller({
      request: connection.request,
      emit: function (event, data) { if (homey) homey.emitLocal(event, data); },
      reload: function () { window.location.reload(); }
    });

    connection.request('/android/init').then(function (init) {
      followSystemColorMode(init.config.colorMode);
      homey = createHomey({
        config: init.config,
        styles: init.styles,
        translations: init.translations,
        loadLogs: function (severities) {
          poller.setSeverities(severities);
          return connection.request('/android/logs', severities ? { severities: severities } : undefined).then(function (data) {
            poller.update(data);
            return data;
          });
        }
      });
      whenDomReady(function () { startWidget(homey); });
    }).catch(function (error) {
      whenDomReady(function () { showError(error); });
    });
  }

  window.SSLAndroidWrapper = {
    appIdFromPath: appIdFromPath,
    createConnection: createConnection,
    createHomey: createHomey,
    createPoller: createPoller,
    readParams: readParams
  };

  if (typeof window.onHomeyReady === 'function' && window.location) boot();
})();
