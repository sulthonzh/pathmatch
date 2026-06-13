'use strict';

/**
 * pathmatch — Zero-dep URL path pattern matching
 *
 * Compile path patterns like `/users/:id/posts/:postId` into regexes,
 * extract parameters, build paths from params, and rank routes by specificity.
 */

// ─── Token types ──────────────────────────────────────────────
const T_STATIC = 'static';
const T_PARAM = 'param';
const T_WILDCARD = 'wildcard';
const T_GROUP = 'group';

// ─── Helpers ──────────────────────────────────────────────────

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─── Parser ───────────────────────────────────────────────────

/**
 * Tokenize a path pattern into ordered tokens.
 *
 * Syntax:
 *   :name        — named capture (default [^/]+)
 *   :name(regex) — named capture with custom pattern
 *   :name?       — optional named capture
 *   *            — wildcard, captures everything including /
 *   (a|b)        — group with alternatives
 *   /literal     — static text
 *
 * @param {string} pattern — URL pattern
 * @returns {Array<object>}
 */
function tokenize(pattern) {
  const tokens = [];
  let i = 0;
  const len = pattern.length;

  while (i < len) {
    const ch = pattern[i];

    if (ch === ':') {
      i++;
      let name = '';
      while (i < len && /\w/.test(pattern[i])) {
        name += pattern[i];
        i++;
      }

      let optional = false;
      if (pattern[i] === '?') {
        optional = true;
        i++;
      }

      let custom = null;
      if (pattern[i] === '(') {
        i++;
        let depth = 1;
        custom = '';
        while (i < len && depth > 0) {
          if (pattern[i] === '(') depth++;
          else if (pattern[i] === ')') {
            depth--;
            if (depth === 0) break;
          }
          custom += pattern[i];
          i++;
        }
        i++; // skip closing )
      }

      tokens.push({
        type: T_PARAM,
        name,
        pattern: custom || '[^/]+',
        optional,
      });
    } else if (ch === '*') {
      tokens.push({ type: T_WILDCARD, name: 'wildcard', pattern: '.*' });
      i++;
    } else if (ch === '(') {
      i++;
      let depth = 1;
      let content = '';
      while (i < len && depth > 0) {
        if (pattern[i] === '(') depth++;
        else if (pattern[i] === ')') {
          depth--;
          if (depth === 0) break;
        }
        content += pattern[i];
        i++;
      }
      i++; // skip closing )
      const options = content.split('|');
      tokens.push({
        type: T_GROUP,
        options,
        pattern: '(?:' + options.map(escapeRegex).join('|') + ')',
      });
    } else {
      let text = '';
      while (i < len && pattern[i] !== ':' && pattern[i] !== '*' && pattern[i] !== '(') {
        text += pattern[i];
        i++;
      }
      tokens.push({ type: T_STATIC, text });
    }
  }

  return tokens;
}

// ─── Compiler ─────────────────────────────────────────────────

/**
 * Compile a path pattern into a matcher object.
 *
 * @param {string} pattern — URL pattern
 * @param {object} [opts]
 * @param {boolean} [opts.end=true] — Must match to end of path
 * @param {boolean} [opts.sensitive=false] — Case-sensitive
 * @param {boolean} [opts.delimiter='/'] — Path delimiter
 * @returns {{regex:RegExp, keys:string[], tokens:Array, score:number, pattern:string}}
 */
function compile(pattern, opts) {
  opts = opts || {};
  const end = opts.end !== undefined ? opts.end : true;
  const sensitive = !!opts.sensitive;
  const tokens = tokenize(pattern);
  const keys = [];
  let regexStr = '';

  for (let idx = 0; idx < tokens.length; idx++) {
    const tok = tokens[idx];

    if (tok.type === T_STATIC) {
      regexStr += escapeRegex(tok.text);
    } else if (tok.type === T_PARAM) {
      keys.push(tok.name);
      if (tok.optional) {
        // If regexStr ends with a delimiter (either '/' or '\\/'),
        // pull it into the optional group so the slash is also optional
        if (regexStr.endsWith('\\/')) {
          regexStr = regexStr.slice(0, -2);
          regexStr += '(?:\\/(' + tok.pattern + '))?';
        } else if (regexStr.endsWith('/')) {
          regexStr = regexStr.slice(0, -1);
          regexStr += '(?:\\/(' + tok.pattern + '))?';
        } else {
          regexStr += '(?:(' + tok.pattern + '))?';
        }
      } else {
        regexStr += '(' + tok.pattern + ')';
      }
    } else if (tok.type === T_WILDCARD) {
      keys.push(tok.name);
      if (regexStr.endsWith('\\/')) {
        regexStr = regexStr.slice(0, -2);
        regexStr += '(?:\\/(.*))?';
      } else if (regexStr.endsWith('/')) {
        regexStr = regexStr.slice(0, -1);
        regexStr += '(?:\\/(.*))?';
      } else {
        regexStr += '(.*?)';
      }
    } else if (tok.type === T_GROUP) {
      regexStr += tok.pattern;
    }
  }

  regexStr = '^' + regexStr;
  if (end) {
    regexStr += '\\/?$';
  } else {
    regexStr += '(?=\\/|$)';
  }

  const flags = sensitive ? '' : 'i';

  // Specificity score: lower = more specific (higher priority)
  let score = 0;
  for (const tok of tokens) {
    if (tok.type === T_STATIC) {
      score -= tok.text.length;
    } else if (tok.type === T_PARAM) {
      score += tok.optional ? 15 : 10;
    } else if (tok.type === T_WILDCARD) {
      score += 20;
    } else if (tok.type === T_GROUP) {
      score += 5;
    }
  }

  return {
    regex: new RegExp(regexStr, flags),
    keys: keys,
    tokens: tokens,
    score: score,
    pattern: pattern,
    end: end,
    sensitive: sensitive,
    delimiter: opts.delimiter || '/',
  };
}

// ─── Match ────────────────────────────────────────────────────

/**
 * Match a path against a compiled pattern.
 *
 * @param {object} compiled — Result of compile()
 * @param {string} path — URL path to test
 * @returns {object|null} — { params, matched } or null
 */
function match(compiled, path) {
  const m = compiled.regex.exec(path);
  if (!m) return null;

  const params = {};
  for (let i = 0; i < compiled.keys.length; i++) {
    const val = m[i + 1];
    if (val !== undefined) {
      params[compiled.keys[i]] = decodeURIComponent(val);
    }
  }

  return { params: params, matched: m[0] };
}

/**
 * Compile and match in one step.
 *
 * @param {string} pattern
 * @param {string} path
 * @param {object} [opts]
 * @returns {object|null}
 */
function matchPath(pattern, path, opts) {
  return match(compile(pattern, opts), path);
}

// ─── Build ────────────────────────────────────────────────────

/**
 * Build a URL path from a pattern and params object.
 *
 * @param {string} pattern
 * @param {object} [params]
 * @returns {string}
 */
function build(pattern, params) {
  params = params || {};
  const tokens = tokenize(pattern);
  let result = '';

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];

    if (tok.type === T_STATIC) {
      result += tok.text;
    } else if (tok.type === T_PARAM) {
      if (tok.optional) {
        if (params[tok.name] !== undefined && params[tok.name] !== null) {
          // Ensure delimiter is present before optional param value
          if (result.endsWith('/')) {
            result += encodeURIComponent(String(params[tok.name]));
          } else {
            result += encodeURIComponent(String(params[tok.name]));
          }
        } else {
          // Remove trailing delimiter when optional param is absent
          if (result.endsWith('/')) {
            result = result.slice(0, -1);
          }
        }
      } else {
        if (params[tok.name] === undefined || params[tok.name] === null) {
          throw new Error('Missing required param: ' + tok.name);
        }
        result += encodeURIComponent(String(params[tok.name]));
      }
    } else if (tok.type === T_WILDCARD) {
      if (params[tok.name] !== undefined && params[tok.name] !== null) {
        result += encodeURIComponent(String(params[tok.name]));
      }
    } else if (tok.type === T_GROUP) {
      result += tok.options[0];
    }
  }

  return result;
}

// ─── Router ───────────────────────────────────────────────────

/**
 * Create a route matcher that picks the best matching pattern.
 *
 * @param {Array<string|{pattern:string,handler:*}>} routes
 * @param {object} [opts]
 * @returns {{match:function, routes:Array}}
 */
function createRouter(routes, opts) {
  const compiled = routes.map(function (r) {
    const pattern = typeof r === 'string' ? r : r.pattern;
    const handler = typeof r === 'string' ? null : r.handler;
    const c = compile(pattern, opts);
    return Object.assign({}, c, { handler: handler, original: r });
  });

  // Sort by specificity (ascending score = most specific first)
  compiled.sort(function (a, b) { return a.score - b.score; });

  return {
    routes: compiled,
    match: function (path) {
      for (let i = 0; i < compiled.length; i++) {
        const result = match(compiled[i], path);
        if (result) {
          return Object.assign({}, result, { route: compiled[i] });
        }
      }
      return null;
    },
  };
}

// ─── Utilities ────────────────────────────────────────────────

/**
 * Extract all parameter names from a pattern.
 *
 * @param {string} pattern
 * @returns {string[]}
 */
function paramNames(pattern) {
  return tokenize(pattern)
    .filter(function (t) { return t.type === T_PARAM; })
    .map(function (t) { return t.name; });
}

/**
 * Check if a pattern would match a given path.
 *
 * @param {string} pattern
 * @param {string} path
 * @param {object} [opts]
 * @returns {boolean}
 */
function isMatch(pattern, path, opts) {
  return matchPath(pattern, path, opts) !== null;
}

/**
 * Compare two patterns by specificity.
 * Negative = a more specific, positive = b more specific, 0 = equal.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function compare(a, b) {
  return compile(a).score - compile(b).score;
}

// ─── Exports ──────────────────────────────────────────────────

module.exports = {
  tokenize: tokenize,
  compile: compile,
  match: match,
  matchPath: matchPath,
  build: build,
  createRouter: createRouter,
  paramNames: paramNames,
  isMatch: isMatch,
  compare: compare,
  T_STATIC: T_STATIC,
  T_PARAM: T_PARAM,
  T_WILDCARD: T_WILDCARD,
  T_GROUP: T_GROUP,
};
