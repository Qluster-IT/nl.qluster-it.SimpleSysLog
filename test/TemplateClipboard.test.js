const assert = require('node:assert/strict');
const test = require('node:test');
const templateClipboard = require('../settings/template-clipboard');

class MockClipboardItem {
  constructor(items) {
    this.items = items;
  }
}

test('starts a rich clipboard write immediately and supplies deferred content', async () => {
  let writeCalls = 0;
  let clipboardItems;
  let resolvedContent;
  const clipboard = {
    write(items) {
      writeCalls += 1;
      clipboardItems = items[0].items;
      return Promise.all(Object.values(clipboardItems)).then((content) => {
        resolvedContent = content;
      });
    }
  };

  const write = templateClipboard.startWrite(clipboard, MockClipboardItem, Blob);
  assert.equal(writeCalls, 1);
  let settled = false;
  write.result.then(() => { settled = true; });
  await Promise.resolve();
  assert.equal(settled, false);

  assert.equal(write.complete('plain content', '<p>rich content</p>'), true);
  assert.deepEqual(await write.result, { copied: true });
  assert.equal(clipboardItems['text/plain'] instanceof Promise, true);
  assert.equal(resolvedContent[0].type, 'text/plain');
  assert.equal(await resolvedContent[0].text(), 'plain content');
  assert.equal(resolvedContent[1].type, 'text/html');
  assert.equal(await resolvedContent[1].text(), '<p>rich content</p>');
});

test('reports rejected clipboard writes without losing the underlying error', async () => {
  const error = new Error('Clipboard permission denied');
  const write = templateClipboard.startWrite({
    write() {
      return Promise.reject(error);
    }
  }, MockClipboardItem, Blob);

  const result = await write.result;
  assert.equal(result.copied, false);
  assert.equal(result.error, error);
});

test('writes ready rich content and returns null when rich clipboard is unavailable', async () => {
  let clipboardItems;
  const result = await templateClipboard.writeNow({
    write(items) {
      clipboardItems = items[0].items;
    }
  }, MockClipboardItem, Blob, 'plain content', '<p>rich content</p>');

  assert.deepEqual(result, { copied: true });
  assert.equal(await clipboardItems['text/plain'].text(), 'plain content');
  assert.equal(await clipboardItems['text/html'].text(), '<p>rich content</p>');
  assert.equal(templateClipboard.startWrite(null, MockClipboardItem, Blob), null);
});

test('requires a manual copy only in insecure HTTP contexts', () => {
  assert.equal(templateClipboard.requiresManualCopyOnHttp({ protocol: 'http:' }, false), true);
  assert.equal(templateClipboard.requiresManualCopyOnHttp({ protocol: 'http:' }, true), false);
  assert.equal(templateClipboard.requiresManualCopyOnHttp({ protocol: 'https:' }, false), false);
  assert.equal(templateClipboard.requiresManualCopyOnHttp(null, false), false);
});
