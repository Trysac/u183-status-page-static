# @trysac/status-page-static

Render a static, script-free HTML status page from a JSON document of components and incidents, with escaping, UTC times, and an injected clock.

## Problem

Small teams want a public status page but hosted status products cost money and add third-party scripts, while a hand-edited HTML page drifts and breaks. A status page is mostly a pure function of component states and incident updates. This library validates a small JSON document and renders one self-contained, escaped HTML page that any static host can serve.

## Installation

```bash
npm install @trysac/status-page-static
```

## Usage Example

```typescript
import { parseStatus, renderPage } from "@trysac/status-page-static";

const json = '{"title":"My Status","components":[],"incidents":[]}';
const doc = parseStatus(json);
const html = renderPage(doc, { now: new Date() });
console.log(html);
```

## Public API

- `parseStatus(json: string, opts?: { maxLength?: number }): StatusDoc`: Validates JSON structure, types, and limits.
- `overallStatus(components: { status: ComponentStatus }[]): ComponentStatus`: Calculates the worst component status.
- `renderPage(doc: StatusDoc, opts: { now: Date; historyDays?: number }): string`: Generates HTML. Throws `TypeError` if inputs are invalid.
- `StatusDoc`: Interface for the validated status structure.
- `StatusPageError`: Error class with codes `INPUT_TOO_LARGE`, `INVALID_JSON`, `INVALID_DOC`, `LIMIT_EXCEEDED`.

## Why not hosted alternatives?

Hosted status pages often introduce third-party scripts and vendor lock-in. This utility is a single, pure, testable function that generates static HTML, allowing for full control and auditability without client-side dependencies.

## Security

See [docs/SECURITY.md](docs/SECURITY.md).
