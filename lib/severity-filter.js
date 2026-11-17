'use strict';

const MESSAGE = 'The levels must be a comma-separated list of whole numbers from 0 to 7.';

// Parses the levels chosen in the widget's level filter, for example "6,7".
function parseSeverities(value) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || value.length > 32) throw new Error(MESSAGE);
  const result = [];
  for (const part of value.split(',')) {
    const text = part.trim();
    if (!/^[0-7]$/.test(text)) throw new Error(MESSAGE);
    const severity = Number(text);
    if (!result.includes(severity)) result.push(severity);
  }
  return result.sort((a, b) => a - b);
}

module.exports = { parseSeverities };
