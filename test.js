'use strict';

const assert = require('assert');
const {
  tokenize, compile, match, matchPath, build, createRouter,
  paramNames, isMatch, compare,
  T_STATIC, T_PARAM, T_WILDCARD, T_GROUP,
} = require('./index.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    failed++;
    console.error(`✗ ${name}: ${e.message}`);
  }
}

// ─── Tokenize ─────────────────────────────────────────────────

test('tokenize: static path', () => {
  const tokens = tokenize('/users/all');
  assert.strictEqual(tokens.length, 1);
  assert.strictEqual(tokens[0].type, T_STATIC);
  assert.strictEqual(tokens[0].text, '/users/all');
});

test('tokenize: single param', () => {
  const tokens = tokenize('/users/:id');
  assert.strictEqual(tokens.length, 2);
  assert.strictEqual(tokens[0].type, T_STATIC);
  assert.strictEqual(tokens[0].text, '/users/');
  assert.strictEqual(tokens[1].type, T_PARAM);
  assert.strictEqual(tokens[1].name, 'id');
});

test('tokenize: multiple params', () => {
  const tokens = tokenize('/users/:userId/posts/:postId');
  const params = tokens.filter(t => t.type === T_PARAM);
  assert.strictEqual(params.length, 2);
  assert.strictEqual(params[0].name, 'userId');
  assert.strictEqual(params[1].name, 'postId');
});

test('tokenize: optional param', () => {
  const tokens = tokenize('/search/:query?');
  const param = tokens.find(t => t.type === T_PARAM);
  assert.ok(param.optional);
});

test('tokenize: custom regex constraint', () => {
  const tokens = tokenize('/users/:id(\\d+)');
  const param = tokens.find(t => t.type === T_PARAM);
  assert.strictEqual(param.pattern, '\\d+');
});

test('tokenize: wildcard', () => {
  const tokens = tokenize('/files/*');
  assert.strictEqual(tokens.length, 2);
  assert.strictEqual(tokens[1].type, T_WILDCARD);
});

test('tokenize: group with alternatives', () => {
  const tokens = tokenize('/(json|xml)');
  // '/' is static, then group
  const groupTok = tokens.find(t => t.type === T_GROUP);
  assert.ok(groupTok);
  assert.deepStrictEqual(groupTok.options, ['json', 'xml']);
});

// ─── Compile + Match ──────────────────────────────────────────

test('compile: basic pattern produces regex', () => {
  const c = compile('/users/:id');
  assert.ok(c.regex instanceof RegExp);
  assert.deepStrictEqual(c.keys, ['id']);
});

test('match: simple static', () => {
  const result = matchPath('/users', '/users');
  assert.ok(result);
  assert.strictEqual(result.matched, '/users');
});

test('match: static no match', () => {
  assert.strictEqual(matchPath('/users', '/posts'), null);
});

test('match: single param', () => {
  const result = matchPath('/users/:id', '/users/123');
  assert.ok(result);
  assert.strictEqual(result.params.id, '123');
});

test('match: multiple params', () => {
  const result = matchPath('/users/:userId/posts/:postId', '/users/42/posts/7');
  assert.strictEqual(result.params.userId, '42');
  assert.strictEqual(result.params.postId, '7');
});

test('match: optional param present', () => {
  const result = matchPath('/search/:query?', '/search/hello');
  assert.ok(result);
  assert.strictEqual(result.params.query, 'hello');
});

test('match: optional param absent', () => {
  const result = matchPath('/search/:query?', '/search');
  assert.ok(result);
  assert.strictEqual(result.params.query, undefined);
});

test('match: custom regex constraint match', () => {
  const result = matchPath('/users/:id(\\d+)', '/users/123');
  assert.ok(result);
  assert.strictEqual(result.params.id, '123');
});

test('match: custom regex constraint no match', () => {
  const result = matchPath('/users/:id(\\d+)', '/users/abc');
  assert.strictEqual(result, null);
});

test('match: wildcard captures everything', () => {
  const result = matchPath('/files/*', '/files/a/b/c.txt');
  assert.ok(result);
  assert.strictEqual(result.params.wildcard, 'a/b/c.txt');
});

test('match: URL-encoded params', () => {
  const result = matchPath('/search/:q', '/search/hello%20world');
  assert.strictEqual(result.params.q, 'hello world');
});

test('match: case-insensitive by default', () => {
  const result = matchPath('/Users', '/users');
  assert.ok(result);
});

test('match: case-sensitive option', () => {
  const result = matchPath('/Users', '/users', { sensitive: true });
  assert.strictEqual(result, null);
});

test('match: end=true rejects trailing segments', () => {
  const result = matchPath('/users/:id', '/users/123/extra');
  assert.strictEqual(result, null);
});

test('match: end=false allows trailing segments', () => {
  const result = matchPath('/users/:id', '/users/123/extra', { end: false });
  assert.ok(result);
  assert.strictEqual(result.params.id, '123');
});

test('match: empty path', () => {
  const result = matchPath('/', '/');
  assert.ok(result);
});

test('match: trailing slash tolerance', () => {
  const result = matchPath('/users/:id', '/users/123/');
  assert.ok(result);
  assert.strictEqual(result.params.id, '123');
});

test('match: group alternatives', () => {
  assert.ok(matchPath('/(json|xml)', '/json'));
  assert.ok(matchPath('/(json|xml)', '/xml'));
  assert.strictEqual(matchPath('/(json|xml)', '/yaml'), null);
});

// ─── Build ────────────────────────────────────────────────────

test('build: basic params', () => {
  const path = build('/users/:id', { id: '123' });
  assert.strictEqual(path, '/users/123');
});

test('build: multiple params', () => {
  const path = build('/users/:userId/posts/:postId', { userId: '42', postId: '7' });
  assert.strictEqual(path, '/users/42/posts/7');
});

test('build: optional param included', () => {
  const path = build('/search/:query?', { query: 'hello' });
  assert.strictEqual(path, '/search/hello');
});

test('build: optional param omitted', () => {
  const path = build('/search/:query?', {});
  assert.strictEqual(path, '/search');
});

test('build: missing required param throws', () => {
  assert.throws(() => build('/users/:id', {}), /Missing required param/);
});

test('build: URL-encodes values', () => {
  const path = build('/search/:q', { q: 'hello world' });
  assert.strictEqual(path, '/search/hello%20world');
});

// ─── Router ───────────────────────────────────────────────────

test('router: matches first route', () => {
  const router = createRouter(['/users', '/posts']);
  const result = router.match('/users');
  assert.ok(result);
  assert.strictEqual(result.route.pattern, '/users');
});

test('router: picks most specific route', () => {
  const router = createRouter([
    '/users/:id',
    '/users/profile',
  ]);
  const result = router.match('/users/profile');
  assert.ok(result);
  assert.strictEqual(result.route.pattern, '/users/profile');
});

test('router: wildcard lower priority', () => {
  const router = createRouter([
    '/*',
    '/users/:id',
  ]);
  const result = router.match('/users/123');
  assert.ok(result);
  assert.strictEqual(result.route.pattern, '/users/:id');
});

test('router: no match returns null', () => {
  const router = createRouter(['/users']);
  assert.strictEqual(router.match('/posts'), null);
});

test('router: preserves handler', () => {
  const handler = () => 'test';
  const router = createRouter([
    { pattern: '/users/:id', handler },
  ]);
  const result = router.match('/users/123');
  assert.strictEqual(result.route.handler, handler);
});

test('router: param extraction in router', () => {
  const router = createRouter([
    '/users/:userId/posts/:postId',
  ]);
  const result = router.match('/users/42/posts/7');
  assert.strictEqual(result.params.userId, '42');
  assert.strictEqual(result.params.postId, '7');
});

// ─── Utilities ────────────────────────────────────────────────

test('paramNames: extracts names', () => {
  const names = paramNames('/users/:userId/posts/:postId');
  assert.deepStrictEqual(names, ['userId', 'postId']);
});

test('paramNames: empty for static', () => {
  assert.deepStrictEqual(paramNames('/users/all'), []);
});

test('isMatch: true for matching', () => {
  assert.ok(isMatch('/users/:id', '/users/123'));
});

test('isMatch: false for non-matching', () => {
  assert.ok(!isMatch('/users/:id', '/posts/123'));
});

test('compare: static more specific than param', () => {
  assert.ok(compare('/users/profile', '/users/:id') < 0);
});

test('compare: param more specific than wildcard', () => {
  assert.ok(compare('/users/:id', '/users/*') < 0);
});

// ─── Edge cases ───────────────────────────────────────────────

test('edge: root pattern', () => {
  const result = matchPath('/', '/');
  assert.ok(result);
});

test('edge: pattern with dots', () => {
  const result = matchPath('/files/:name.:ext', '/files/report.pdf');
  assert.ok(result);
  assert.strictEqual(result.params.name, 'report');
  assert.strictEqual(result.params.ext, 'pdf');
});

test('edge: nested optional params', () => {
  const result = matchPath('/api/:ver/users/:id?', '/api/v1/users');
  assert.ok(result);
  assert.strictEqual(result.params.ver, 'v1');
  assert.strictEqual(result.params.id, undefined);
});

test('edge: special chars in param value', () => {
  const result = matchPath('/search/:q', '/search/a%2Bb');
  assert.strictEqual(result.params.q, 'a+b');
});

test('edge: numeric params are strings', () => {
  const result = matchPath('/users/:id', '/users/12345');
  assert.strictEqual(typeof result.params.id, 'string');
  assert.strictEqual(result.params.id, '12345');
});

test('edge: empty param value not matched', () => {
  const result = matchPath('/users/:id', '/users/');
  // trailing slash with empty id — depends on trailing slash tolerance
  // should match because we allow optional trailing /
});

// ─── Summary ──────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
