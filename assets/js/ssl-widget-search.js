(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SSLWidgetSearch = api;
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function searchableText(log) {
    return [log.message, log.app, log.hostname].filter(function (value) {
      return typeof value === 'string';
    }).join('\n').toLowerCase();
  }

  function tokenize(input) {
    var tokens = [];
    var index = 0;
    while (index < input.length) {
      if (/\s/.test(input[index])) {
        index++;
        continue;
      }
      if (input[index] === '(' || input[index] === ')') {
        tokens.push({ type: input[index++] });
        continue;
      }
      var value = '';
      if (input[index] === '"') {
        index++;
        while (index < input.length && input[index] !== '"') {
          if (input[index] === '\\' && index + 1 < input.length
            && (input[index + 1] === '"' || input[index + 1] === '\\')) index++;
          value += input[index++];
        }
        if (input[index] !== '"') throw new Error('Unclosed quote in search');
        index++;
      } else {
        while (index < input.length && !/\s|\(|\)/.test(input[index])) value += input[index++];
      }
      if (!value) throw new Error('Empty search term');
      var operator = value.toUpperCase();
      tokens.push({ type: /^(AND|OR|NOT)$/.test(operator) ? operator : 'term', value: value });
    }
    return tokens;
  }

  function compileAdvanced(input) {
    var tokens = tokenize(input);
    var cursor = 0;
    function peek() { return tokens[cursor]; }
    function accept(type) {
      if (peek() && peek().type === type) {
        cursor++;
        return true;
      }
      return false;
    }
    function parsePrimary() {
      if (accept('(')) {
        var grouped = parseOr();
        if (!accept(')')) throw new Error('Missing closing parenthesis in search');
        return grouped;
      }
      var token = peek();
      if (!token || token.type !== 'term') throw new Error('Expected a search term');
      cursor++;
      var needle = token.value.toLowerCase();
      return function (text) { return text.indexOf(needle) !== -1; };
    }
    function parseUnary() {
      if (accept('NOT')) {
        var negated = parseUnary();
        return function (text) { return !negated(text); };
      }
      return parsePrimary();
    }
    function startsExpression(token) {
      return token && (token.type === 'term' || token.type === 'NOT' || token.type === '(');
    }
    function parseAnd() {
      var left = parseUnary();
      while (peek() && (peek().type === 'AND' || startsExpression(peek()))) {
        if (peek().type === 'AND') cursor++;
        var right = parseUnary();
        var previous = left;
        left = (function (a, b) {
          return function (text) { return a(text) && b(text); };
        }(previous, right));
      }
      return left;
    }
    function parseOr() {
      var left = parseAnd();
      while (accept('OR')) {
        var right = parseAnd();
        var previous = left;
        left = function (a, b) { return function (text) { return a(text) || b(text); }; }(previous, right);
      }
      return left;
    }
    var predicate = tokens.length ? parseOr() : function () { return true; };
    if (cursor !== tokens.length) throw new Error('Unexpected search operator');
    return predicate;
  }

  function compileText(query, mode) {
    query = typeof query === 'string' ? query.trim() : '';
    if (!query) return function () { return true; };
    var needle = query.toLowerCase();
    var predicate = mode === 'advanced' ? compileAdvanced(query) : function (text) {
      return text.indexOf(needle) !== -1;
    };
    return function (text) { return predicate(typeof text === 'string' ? text.toLowerCase() : ''); };
  }

  function compile(query, mode) {
    var predicate = compileText(query, mode);
    return function (log) { return predicate(searchableText(log)); };
  }

  function matches(log, query, mode) {
    query = typeof query === 'string' ? query.trim() : '';
    if (!query) return true;
    var text = searchableText(log);
    if (mode !== 'advanced') return text.indexOf(query.toLowerCase()) !== -1;
    return compileAdvanced(query)(text);
  }

  return { matches: matches, compile: compile, compileText: compileText, compileAdvanced: compileAdvanced };
}));
