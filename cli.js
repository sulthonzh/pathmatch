#!/usr/bin/env node
'use strict';

const { compile, match, build, createRouter, paramNames, isMatch, compare } = require('./index.js');

function usage() {
  console.log(`pathmatch — URL path pattern matching

Usage:
  pathmatch match <pattern> <path>       Match a path against a pattern
  pathmatch params <pattern>             List parameter names in a pattern
  pathmatch build <pattern> <key=val>..  Build a URL from params
  pathmatch test <pattern> <path>        Boolean match check
  pathmatch rank <p1> <p2> [p3..]        Rank patterns by specificity
  pathmatch routes <pattern> <path>..    Test multiple paths against a pattern

Options:
  --sensitive    Case-sensitive matching
  --no-end       Allow partial matches (don't require full path)
  --json         Output as JSON

Examples:
  pathmatch match '/users/:id' '/users/42'
  pathmatch build '/users/:id/posts/:postId' id=42 postId=7
  pathmatch params '/users/:userId/posts/:postId'
  pathmatch rank '/users/profile' '/users/:id' '/users/*'
  pathmatch test '/files/*' '/files/a/b/c.txt' --json`);
}

const args = process.argv.slice(2);
if (args.length === 0) {
  usage();
  process.exit(0);
}

const cmd = args[0];
let rest = args.slice(1);

// Parse flags
const json = rest.includes('--json');
const sensitive = rest.includes('--sensitive');
const noEnd = rest.includes('--no-end');
rest = rest.filter(a => !a.startsWith('--'));

const opts = { sensitive, end: !noEnd };

function jsonOut(data) {
  console.log(JSON.stringify(data, null, 2));
}

try {
  switch (cmd) {
    case 'match': {
      const [pattern, path] = rest;
      if (!pattern || !path) { console.error('Usage: pathmatch match <pattern> <path>'); process.exit(1); }
      const c = compile(pattern, opts);
      const m = match(c, path);
      if (!m) {
        if (json) jsonOut({ matched: false });
        else console.log('no match');
        process.exit(1);
      }
      if (json) jsonOut({ matched: true, params: m.params, path: m.matched });
      else {
        console.log('match ✓');
        for (const [k, v] of Object.entries(m.params)) {
          console.log(`  ${k} = ${v}`);
        }
      }
      break;
    }

    case 'params': {
      const [pattern] = rest;
      if (!pattern) { console.error('Usage: pathmatch params <pattern>'); process.exit(1); }
      const names = paramNames(pattern);
      if (json) jsonOut({ pattern, params: names });
      else names.forEach(n => console.log(n));
      break;
    }

    case 'build': {
      const [pattern, ...kvArgs] = rest;
      if (!pattern) { console.error('Usage: pathmatch build <pattern> <key=val>..'); process.exit(1); }
      const params = {};
      for (const kv of kvArgs) {
        const [k, ...v] = kv.split('=');
        params[k] = v.join('=');
      }
      const result = build(pattern, params);
      if (json) jsonOut({ pattern, params, result });
      else console.log(result);
      break;
    }

    case 'test': {
      const [pattern, path] = rest;
      if (!pattern || !path) { console.error('Usage: pathmatch test <pattern> <path>'); process.exit(1); }
      const result = isMatch(pattern, path, opts);
      if (json) jsonOut({ pattern, path, matched: result });
      else console.log(result ? 'true' : 'false');
      process.exit(result ? 0 : 1);
      break;
    }

    case 'rank': {
      if (rest.length < 2) { console.error('Usage: pathmatch rank <p1> <p2> [p3..]'); process.exit(1); }
      const ranked = rest
        .map(p => ({ pattern: p, score: compile(p, opts).score }))
        .sort((a, b) => a.score - b.score);
      if (json) jsonOut({ ranked });
      else {
        console.log('Most → least specific:');
        ranked.forEach((r, i) => console.log(`  ${i + 1}. ${r.pattern} (score: ${r.score})`));
      }
      break;
    }

    case 'routes': {
      const [pattern, ...paths] = rest;
      if (!pattern || paths.length === 0) { console.error('Usage: pathmatch routes <pattern> <path>..'); process.exit(1); }
      const results = paths.map(path => ({
        path,
        matched: isMatch(pattern, path, opts),
      }));
      if (json) jsonOut({ pattern, results });
      else {
        for (const r of results) {
          console.log(`${r.matched ? '✓' : '✗'} ${r.path}`);
        }
      }
      break;
    }

    case 'help':
    case '--help':
    case '-h':
      usage();
      break;

    default:
      console.error(`Unknown command: ${cmd}`);
      usage();
      process.exit(1);
  }
} catch (e) {
  console.error('Error: ' + e.message);
  process.exit(1);
}
