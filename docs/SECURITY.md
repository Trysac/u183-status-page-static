# Security

## Threat Model

### Defended
- **Cross-Site Scripting (XSS)**: All user-controlled text (titles, names, bodies) is escaped using character entity mappings (`&`, `<`, `>`, `"`, `'`). The generated HTML forbids `<script>` tags, `<link>` tags, and `src=` attributes to ensure a secure, static-only page.
- **Denial of Service (DoS)**: The library enforces resource limits to prevent processing of malicious or oversized payloads.

### Limits
- **Document Length**: 1,000,000 characters maximum.
- **Components**: 200 maximum.
- **Incidents**: 1,000 maximum.
- **Updates per Incident**: 50 maximum.
- **Update Body Length**: 5,000 characters maximum.
