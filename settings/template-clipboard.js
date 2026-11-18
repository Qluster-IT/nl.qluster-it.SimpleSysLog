(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SSLTemplateClipboard = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function clipboardResult(promise) {
    return Promise.resolve(promise).then(function () {
      return { copied: true };
    }, function (error) {
      return { copied: false, error: error };
    });
  }

  function requiresManualCopyOnHttp(location, isSecureContext) {
    return isSecureContext === false && !!location && location.protocol === 'http:';
  }

  function createDeferred(BlobConstructor) {
    var resolve;
    var reject;
    var promise = new Promise(function (resolvePromise, rejectPromise) {
      resolve = resolvePromise;
      reject = rejectPromise;
    });
    promise.catch(function () {});
    return {
      promise: promise,
      resolve: function (value, type) { resolve(new BlobConstructor([value], { type: type })); },
      reject: reject
    };
  }

  function startWrite(clipboard, ClipboardItemConstructor, BlobConstructor) {
    if (!clipboard || typeof clipboard.write !== 'function'
      || typeof ClipboardItemConstructor !== 'function' || typeof BlobConstructor !== 'function') return null;
    var plain = createDeferred(BlobConstructor);
    var rich = createDeferred(BlobConstructor);
    var write;
    try {
      write = clipboard.write([new ClipboardItemConstructor({
        'text/plain': plain.promise,
        'text/html': rich.promise
      })]);
    } catch (error) {
      write = Promise.reject(error);
    }
    return {
      result: clipboardResult(write),
      complete: function (text, html) {
        try {
          plain.resolve(text, 'text/plain');
          rich.resolve(html, 'text/html');
          return true;
        } catch (error) {
          plain.reject(error);
          rich.reject(error);
          return false;
        }
      },
      reject: function (error) {
        plain.reject(error);
        rich.reject(error);
      }
    };
  }

  function writeNow(clipboard, ClipboardItemConstructor, BlobConstructor, text, html) {
    if (!clipboard || typeof clipboard.write !== 'function'
      || typeof ClipboardItemConstructor !== 'function' || typeof BlobConstructor !== 'function') return null;
    try {
      return clipboardResult(clipboard.write([new ClipboardItemConstructor({
        'text/plain': new BlobConstructor([text], { type: 'text/plain' }),
        'text/html': new BlobConstructor([html], { type: 'text/html' })
      })]));
    } catch (error) {
      return Promise.resolve({ copied: false, error: error });
    }
  }

  return {
    startWrite: startWrite,
    writeNow: writeNow,
    requiresManualCopyOnHttp: requiresManualCopyOnHttp
  };
}));
