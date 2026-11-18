'use strict';

const { promisify } = require('util');
const zlib = require('zlib');
const { validateDesign, validateTheme } = require('./widget-styles');

const compress = promisify(zlib.brotliCompress);
const maxJsonLength = 256 * 1024;
const maxEncodedLength = 128 * 1024;
const templatePattern = /^\[twf:SimpleSysLog:(DESIGN|THEME|DESIGN,THEME):"([A-Za-z0-9+/]+={0,2})":\/twf\]$/;
const forbiddenKeys = new Set(['__proto__', 'constructor', 'prototype']);
// Same key shortening as Chronograph: known keys become two-character codes, other keys get a "~" prefix.
// Only append to this list; changing the order breaks existing TWFs.
const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const keys = [
  'name', 'showDaySeparators', 'rows', 'padding', 'columns', 'span', 'rowSpan', 'align', 'valign',
  'direction', 'width', 'elements', 'elementSizes', 'colors', 'color', 'background',
  'timestamp', 'severity', 'facility', 'app', 'hostname', 'message',
  'surface', 'text', 'muted', 'border', 'accent',
  'emergency', 'alert', 'critical', 'error', 'warning', 'notice', 'info', 'debug',
  'timestampFormat', 'daySeparatorFormat', 'daySeparator', 'elementFonts',
  'daySeparatorLayout', 'daySeparatorLine', 'lineThickness', 'lineStyle', 'linePosition',
  'elementBorders', 'side', 'thickness', 'border1', 'border2', 'border3', 'border4',
  'widgetBorderWidth', 'outline',
  'elementTextStyles', 'textCase', 'weight', 'italic', 'spacing',
  'toolbarLayout', 'pagingLayout', 'gap', 'search', 'filter', 'previousPage', 'pageNumber', 'nextPage',
  'controlStyles', 'height', 'paddingX', 'paddingY', 'radius',
  'widgetBorderless', 'widgetPadding', 'top', 'right', 'bottom', 'left', 'elementLineHeights',
  'columnGap', 'elementGap', 'backgroundGradient',
  'wrap', 'backgroundGradientEnd'
];
const keyToCode = new Map(keys.map((key, index) => [key, alphabet[Math.floor(index / alphabet.length)] + alphabet[index % alphabet.length]]));
const codeToKey = new Map(Array.from(keyToCode, ([key, code]) => [code, key]));

function transform(value, encode) {
  if (Array.isArray(value)) return value.map(item => transform(item, encode));
  if (!value || typeof value !== 'object') return value;
  const result = Object.create(null);
  for (const [key, child] of Object.entries(value)) {
    let next;
    if (encode) next = keyToCode.get(key) || '~' + key;
    else if (key.startsWith('~')) next = key.slice(1);
    else next = codeToKey.get(key);
    if (!next || forbiddenKeys.has(next) || Object.prototype.hasOwnProperty.call(result, next)) {
      throw new Error('Invalid template property');
    }
    result[next] = transform(child, encode);
  }
  return result;
}

function withoutId(item) {
  const copy = { ...item };
  delete copy.id;
  return copy;
}

function parseJson(buffer) {
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer));
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof TypeError) throw new Error('Invalid template data');
    throw error;
  }
}

// Returns {design?, theme?} from a compressed v2 body, or from an uncompressed v1 body made by earlier versions.
function readBody(buffer) {
  let json = null;
  try {
    json = zlib.brotliDecompressSync(buffer, { maxOutputLength: maxJsonLength });
  } catch (error) {
    if (error instanceof RangeError) throw new Error('Template is too large');
  }
  if (json) {
    const body = parseJson(json);
    if (!body || body.v !== 2 || Object.keys(body).some(key => !['v', 'd', 't'].includes(key))) {
      throw new Error('Unsupported template version');
    }
    const result = {};
    if (body.d) result.design = transform(body.d, false);
    if (body.t) result.theme = transform(body.t, false);
    return result;
  }
  const legacy = parseJson(buffer);
  if (!legacy || legacy.version !== 1
    || Object.keys(legacy).some(key => forbiddenKeys.has(key) || !['version', 'design', 'theme'].includes(key))) {
    throw new Error('Unsupported template version');
  }
  return { design: legacy.design, theme: legacy.theme };
}

function templateTypes(value) {
  return [value.design && 'DESIGN', value.theme && 'THEME'].filter(Boolean).join(',');
}

function validateTemplateValue(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || (!value.design && !value.theme)
    || Object.keys(value).some(key => !['design', 'theme'].includes(key))) {
    throw new Error('Select a design or theme');
  }
  const result = {};
  if (value.design) result.design = validateDesign(value.design, { allowMissingId: true });
  if (value.theme) result.theme = validateTheme(value.theme, { allowMissingId: true });
  return result;
}

async function encodeTemplate(value) {
  const template = validateTemplateValue(value);
  const body = { v: 2 };
  if (template.design) body.d = transform(withoutId(template.design), true);
  if (template.theme) body.t = transform(withoutId(template.theme), true);
  const json = Buffer.from(JSON.stringify(body), 'utf8');
  if (json.length > maxJsonLength) throw new Error('Template is too large');
  const encoded = (await compress(json, {
    params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 }
  })).toString('base64');
  if (encoded.length > maxEncodedLength) throw new Error('Template is too large');
  return `[twf:SimpleSysLog:${templateTypes(template)}:"${encoded}":/twf]`;
}

function decodeTemplate(text) {
  if (typeof text !== 'string' || text.length > maxEncodedLength + 100) throw new Error('Invalid template');
  text = text.trim();
  const fenced = /^```(?:javascript)?[ \t]*\r?\n([\s\S]*?)\r?\n```$/.exec(text);
  if (fenced) text = fenced[1].trim();
  const app = /^\[twf:([^:\]]+):/.exec(text);
  if (app && app[1] !== 'SimpleSysLog') throw new Error(`This TWF is for ${app[1].slice(0, 64)}, not Simple (Sys) Log`);
  const match = templatePattern.exec(text);
  if (!match) throw new Error('Invalid template');
  const compressed = Buffer.from(match[2], 'base64');
  if (compressed.toString('base64') !== match[2] || compressed.length > maxJsonLength) {
    throw new Error('Invalid template encoding');
  }
  const parsed = readBody(compressed);
  const result = {};
  if (parsed.design) result.design = validateDesign(parsed.design, { allowMissingId: true });
  if (parsed.theme) result.theme = validateTheme(parsed.theme, { allowMissingId: true });
  if (templateTypes(result) !== match[1]) throw new Error('Template contents do not match its header');
  return result;
}

module.exports = { encodeTemplate, decodeTemplate, validateTemplateValue };
