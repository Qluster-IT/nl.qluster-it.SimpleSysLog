'use strict';

const { validateDesign, validateTheme } = require('./widget-styles');

const maxJsonLength = 256 * 1024;
const maxEncodedLength = 384 * 1024;
const templatePattern = /^\[twf:SimpleSysLog:(DESIGN|THEME|DESIGN,THEME):"([A-Za-z0-9+/]+={0,2})":\/twf\]$/;
const forbiddenKeys = new Set(['__proto__', 'constructor', 'prototype']);

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
  const json = Buffer.from(JSON.stringify({ version: 1, ...template }), 'utf8');
  if (json.length > maxJsonLength) throw new Error('Template is too large');
  const encoded = json.toString('base64');
  if (encoded.length > maxEncodedLength) throw new Error('Template is too large');
  return `[twf:SimpleSysLog:${templateTypes(template)}:"${encoded}":/twf]`;
}

function decodeTemplate(text) {
  if (typeof text !== 'string' || text.length > maxEncodedLength + 100) throw new Error('Invalid template');
  text = text.trim();
  const fenced = /^```(?:javascript)?[ \t]*\r?\n([\s\S]*?)\r?\n```$/.exec(text);
  if (fenced) text = fenced[1].trim();
  const match = templatePattern.exec(text);
  if (!match) throw new Error('Invalid template');
  const compressed = Buffer.from(match[2], 'base64');
  if (compressed.toString('base64') !== match[2] || compressed.length > maxJsonLength) {
    throw new Error('Invalid template encoding');
  }
  let parsed;
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(compressed));
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof TypeError) throw new Error('Invalid template data');
    throw error;
  }
  if (!parsed || parsed.version !== 1
    || Object.keys(parsed).some(key => forbiddenKeys.has(key) || !['version', 'design', 'theme'].includes(key))) {
    throw new Error('Unsupported template version');
  }
  const result = {};
  if (parsed.design) result.design = validateDesign(parsed.design, { allowMissingId: true });
  if (parsed.theme) result.theme = validateTheme(parsed.theme, { allowMissingId: true });
  if (templateTypes(result) !== match[1]) throw new Error('Template contents do not match its header');
  return result;
}

module.exports = { encodeTemplate, decodeTemplate, validateTemplateValue };
