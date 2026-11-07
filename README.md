# status-page-static

[![npm version](https://img.shields.io/npm/v/@trysac/status-page-static.svg)](https://www.npmjs.com/package/@trysac/status-page-static)
[![license: MIT](https://img.shields.io/npm/l/@trysac/status-page-static.svg)](LICENSE)
[![CI](https://github.com/Trysac/u183-status-page-static/actions/workflows/ci.yml/badge.svg)](https://github.com/Trysac/u183-status-page-static/actions/workflows/ci.yml)

Render a static, script-free HTML status page from a JSON document of components and incidents, with escaping, UTC times and an injected clock

## Problem

Describe in two or three sentences the concrete problem this utility solves, who hits it, and why existing
packages do not solve it well. Keep it factual; link to an issue or decision record when there is one.

## Install

```sh
npm install @trysac/status-page-static
```

Requires Node.js 20 or newer. The package ships ES modules with TypeScript declarations.

## Usage

```ts
import { greet } from "@trysac/status-page-static";

// Build a greeting; surrounding whitespace is ignored.
const message = greet("  Ada ");
console.log(message); // "Hello, Ada!"

try {
  greet("   ");
} catch (error) {
  console.error((error as Error).message); // "name must not be empty"
}
```

## API

| Export | Signature | Description |
|---|---|---|
| `greet` | `(name: string) => string` | Placeholder API; replace it with the real one. |

## Development

```sh
npm install
npm run check   # lint, format, types, tests with coverage, docs, secrets
```

See [AGENTS.md](AGENTS.md) for the full command list and [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow.

## License

[MIT](LICENSE) © 2026 Miguel Gomez
