# pathmatch

Zero-dependency URL path pattern matching for Node.js.

Compile patterns like `/users/:id` into regexes, extract parameters, build URLs from params, and rank routes by specificity.

## Install

```bash
npm install @sulthonzh/pathmatch
```

## Why

Every web framework needs route matching. Most implementations are tightly coupled to the framework. `pathmatch` gives you the matching engine — clean, tested, and dependency-free. Use it for routers, link generators, middleware, or anything that needs to match URLs against patterns.

## Quick Start

```js
const { matchPath, build, createRouter } = require('pathmatch');

// Match a path against a pattern
const result = matchPath('/users/:id', '/users/42');
// → { params: { id: '42' }, matched: '/users/42' }

// Build a URL from params
const url = build('/users/:userId/posts/:postId', { userId: 42, postId: 7 });
// → '/users/42/posts/7'

// Create a router that picks the best match
const router = createRouter([
  '/users/profile',
  '/users/:id',
  '/*',
]);
router.match('/users/profile');  // → matches '/users/profile' (most specific)
router.match('/users/42');       // → matches '/users/:id'
router.match('/anything');       // → matches '/*'
```

## Pattern Syntax

| Syntax | Description | Example |
|--------|-------------|---------|
| `:name` | Named param (matches `[^/]+`) | `/users/:id` → `/users/42` |
| `:name?` | Optional param | `/search/:query?` → `/search` or `/search/cats` |
| `:name(regex)` | Custom regex constraint | `/users/:id(\d+)` → `/users/42` |
| `*` | Wildcard (matches everything including `/`) | `/files/*` → `/files/a/b/c.txt` |
| `(a\|b)` | Group alternatives | `/(json\|xml)` → `/json` or `/xml` |

## API

### `compile(pattern, opts?)`

Compile a pattern into a matcher object.

```js
const m = compile('/users/:id');
// → { regex, keys: ['id'], tokens, score: N, pattern }
```

Options:
- `end` (default `true`) — Must match to end of path
- `sensitive` (default `false`) — Case-sensitive matching

### `match(compiled, path)`

Match a path against a compiled pattern. Returns `{ params, matched }` or `null`.

### `matchPath(pattern, path, opts?)`

Compile and match in one step.

### `build(pattern, params)`

Build a URL from a pattern and params object.

```js
build('/users/:id/posts/:postId', { id: 42, postId: 7 });
// → '/users/42/posts/7'
```

### `createRouter(routes, opts?)`

Create a route matcher. Routes are ranked by specificity (static > param > wildcard).

```js
const router = createRouter([
  '/users/profile',
  { pattern: '/users/:id', handler: userHandler },
]);
const result = router.match('/users/42');
// → { params: { id: '42' }, matched: '/users/42', route: { ... } }
```

### `paramNames(pattern)`

Extract parameter names from a pattern.

### `isMatch(pattern, path, opts?)`

Boolean match check.

### `compare(a, b)`

Compare two patterns by specificity. Returns negative if `a` is more specific.

## CLI

```bash
# Match a path
pathmatch match '/users/:id' '/users/42'
# → match ✓
#     id = 42

# Build from params
pathmatch build '/users/:id/posts/:postId' id=42 postId=7
# → /users/42/posts/7

# Rank patterns by specificity
pathmatch rank '/users/profile' '/users/:id' '/users/*'
# → Most → least specific:
#     1. /users/profile (score: -15)
#     2. /users/:id (score: 3)
#     3. /users/* (score: 13)

# JSON output
pathmatch match '/users/:id' '/users/42' --json
```

## Specificity Scoring

Routes are ranked so the most specific pattern wins:

- Static segments score highest (most specific)
- Named params score medium
- Wildcards score lowest (least specific)

This means `/users/profile` beats `/users/:id` which beats `/*`.

## License

MIT
