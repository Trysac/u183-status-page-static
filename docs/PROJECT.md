# Project Information

## Objective

Provide a lightweight, secure tool to generate public HTML status pages from version-controlled JSON files without vendor lock-in or third-party client-side dependencies.

## Scope

- Validating input JSON against a strict schema.
- Normalizing component and incident data.
- Deterministic rendering of HTML containing only standard tags, without external CSS or JavaScript.
- Providing a CLI for file-based status page updates.

## Out-of-Scope

- Uptime history bars.
- Automated subscription or alerting systems.
- RSS/Atom feeds.
- Probing/Monitoring infrastructure (the utility does not fetch data).
- UI themes or CSS customization.

## Factory run u183 (measured from API usage)

| Phase | Model | Batch | Input | Output | Cache write | Cache read | Cost (USD) |
|---|---|---|---|---|---|---|---|
| generation | gemini-3.8-flash | yes | 4414 | 15844 | 0 | 0 | 0.0314 |
| fix-1 | gemini-3.1-flash-lite | no | 53989 | 610 | 0 | 238406 | 0.0204 |
| fix-2 | gemini-3.1-flash-lite | no | 35013 | 2081 | 0 | 67309 | 0.0136 |
| audit | gemini-3.1-flash-lite | no | 33107 | 127 | 0 | 40739 | 0.0095 |
| docs | gemini-3.1-flash-lite | no | 18089 | 1035 | 0 | 0 | 0.0061 |

Total: $0.0809. Prices: Anthropic list prices.
