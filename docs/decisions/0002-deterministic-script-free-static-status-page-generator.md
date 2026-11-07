# Deterministic Script-Free Static Status Page Generator

Status: accepted (generated, pending human review)

## Context

Modern status page services often incur subscription costs, introduce third-party analytics/scripts, and can become single points of failure. Static pages generated from structured JSON eliminate external dependencies and allow hosting on static storage or CDNs.

## Decision

Implement status-page-static as a zero-dependency pure TypeScript library that strictly validates JSON status documents, categorizes incidents based on latest updates, and renders self-contained HTML with inlined CSS, strict entity escaping, and UTC timestamps.

## Consequences

Status pages are fast, resilient, and immune to client-side script tampering. The library enforces strict limits to avoid memory exhaustion and rejects invalid dates or malformed schemas early.
