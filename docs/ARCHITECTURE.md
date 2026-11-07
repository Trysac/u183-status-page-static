# Architecture

`@trysac/status-page-static` is designed around a functional pipeline:

1. **Validation & Normalization (`parseStatus`)**:
   - Enforces payload bounds (max document length, max components, max incidents, max updates per incident, max body size).
   - Checks ISO 8601 timestamps with explicit time zone representation (`Z` or `+/-HH:mm`).
   - Verifies component ID uniqueness and reference integrity in incidents.
   - Generates typed `StatusDoc` objects or throws typed `StatusPageError`.

2. **Overall Status Calculation (`overallStatus`)**:
   - Maps components to the highest severity level:
     `major_outage` > `partial_outage` > `degraded` > `maintenance` > `operational`.

3. **Deterministic HTML Rendering (`renderPage`)**:
   - Injects the current reference clock (`opts.now`).
   - Partitions incidents into active vs. past based on whether the latest update has status `resolved`.
   - Inlines CSS without any `<script>`, `<link>`, or remote resource references.
   - Escapes HTML special characters (`&`, `<`, `>`, `"`, `'`) and converts newlines to `<br>`.

4. **CLI (`run`)**:
   - Pure CLI runner injecting filesystem and console I/O interfaces for deterministic execution and complete testability.
