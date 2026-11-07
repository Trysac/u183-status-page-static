# Testing

Tests are located in `test/` and run via `vitest`.

## Coverage
- `test/index.test.ts`: Tests `parseStatus` for schema violations, constraint overflows (limit exceeded), and invalid JSON types. Validates `overallStatus` logic (severity order) and `renderPage` output for correctness, XSS escaping, date formatting, and incident sorting/filtering.
- `test/cli.test.ts`: Acceptance tests for the CLI `run` function, covering successful execution (status 0), invalid input handling (status 1/2), and I/O error scenarios (read/write failures).
