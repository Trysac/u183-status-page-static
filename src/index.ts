/**
 * Core status page definitions, validator, and HTML renderer.
 *
 * Zero runtime dependencies, pure deterministic functions, no node: imports.
 */

export type ComponentStatus =
  | "operational"
  | "degraded"
  | "partial_outage"
  | "major_outage"
  | "maintenance";

export type IncidentStatus = "investigating" | "identified" | "monitoring" | "resolved";

export interface Component {
  id: string;
  name: string;
  status: ComponentStatus;
}

export interface IncidentUpdate {
  at: string;
  status: IncidentStatus;
  body: string;
}

export interface Incident {
  id: string;
  title: string;
  impact: "minor" | "major" | "critical";
  components: string[];
  updates: IncidentUpdate[];
}

export interface StatusDoc {
  title: string;
  components: Component[];
  incidents: Incident[];
}

export type StatusPageErrorCode =
  | "INPUT_TOO_LARGE"
  | "INVALID_JSON"
  | "INVALID_DOC"
  | "LIMIT_EXCEEDED";

export class StatusPageError extends Error {
  readonly code: StatusPageErrorCode;

  constructor(code: StatusPageErrorCode, message: string) {
    super(message);
    this.name = "StatusPageError";
    this.code = code;
  }
}

const MAX_DOC_LENGTH = 1_000_000;
const MAX_COMPONENTS = 200;
const MAX_INCIDENTS = 1000;
const MAX_UPDATES_PER_INCIDENT = 50;
const MAX_UPDATE_BODY_LENGTH = 5000;

const COMPONENT_ID_REGEX = /^[a-z0-9-]{1,40}$/;
const ISO_8601_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/;

const COMPONENT_STATUSES: readonly ComponentStatus[] = [
  "operational",
  "degraded",
  "partial_outage",
  "major_outage",
  "maintenance",
];

const INCIDENT_STATUSES: readonly IncidentStatus[] = [
  "investigating",
  "identified",
  "monitoring",
  "resolved",
];

const INCIDENT_IMPACTS = ["minor", "major", "critical"] as const;

const SEVERITY_ORDER: Record<ComponentStatus, number> = {
  major_outage: 5,
  partial_outage: 4,
  degraded: 3,
  maintenance: 2,
  operational: 1,
};

const STATUS_LABELS: Record<ComponentStatus, string> = {
  operational: "All systems operational",
  degraded: "Degraded performance",
  partial_outage: "Partial outage",
  major_outage: "Major outage",
  maintenance: "Under maintenance",
};

const COMPONENT_STATUS_LABELS: Record<ComponentStatus, string> = {
  operational: "Operational",
  degraded: "Degraded performance",
  partial_outage: "Partial outage",
  major_outage: "Major outage",
  maintenance: "Under maintenance",
};

const INCIDENT_STATUS_LABELS: Record<IncidentStatus, string> = {
  investigating: "Investigating",
  identified: "Identified",
  monitoring: "Monitoring",
  resolved: "Resolved",
};

function sanitizeMessageSnippet(raw: string): string {
  if (raw.length <= 200) {
    return raw;
  }
  return `${raw.slice(0, 197)}...`;
}

export function overallStatus(components: { status: ComponentStatus }[]): ComponentStatus {
  if (components.length === 0) {
    return "operational";
  }
  let worst: ComponentStatus = "operational";
  for (const c of components) {
    if (SEVERITY_ORDER[c.status] > SEVERITY_ORDER[worst]) {
      worst = c.status;
    }
  }
  return worst;
}

export function parseStatus(json: string, opts?: { maxLength?: number }): StatusDoc {
  if (typeof json !== "string") {
    throw new StatusPageError("INVALID_DOC", "input must be a string");
  }
  const maxLength = opts?.maxLength ?? MAX_DOC_LENGTH;
  if (json.length > maxLength) {
    throw new StatusPageError(
      "INPUT_TOO_LARGE",
      `Input length ${json.length} exceeds limit of ${maxLength}`,
    );
  }

  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new StatusPageError("INVALID_JSON", `Invalid JSON: ${sanitizeMessageSnippet(message)}`);
  }

  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new StatusPageError("INVALID_DOC", "root document must be an object");
  }

  const docObj = raw as Record<string, unknown>;

  if (typeof docObj.title !== "string" || docObj.title.length < 1 || docObj.title.length > 100) {
    throw new StatusPageError("INVALID_DOC", "title must be a string between 1 and 100 characters");
  }

  if (!Array.isArray(docObj.components)) {
    throw new StatusPageError("INVALID_DOC", "components must be an array");
  }
  if (docObj.components.length > MAX_COMPONENTS) {
    throw new StatusPageError(
      "LIMIT_EXCEEDED",
      `components length ${docObj.components.length} exceeds max of ${MAX_COMPONENTS}`,
    );
  }

  const componentIds = new Set<string>();
  const validatedComponents: Component[] = [];

  for (let i = 0; i < docObj.components.length; i++) {
    const c = docObj.components[i];
    const path = `components[${i}]`;
    if (typeof c !== "object" || c === null || Array.isArray(c)) {
      throw new StatusPageError("INVALID_DOC", `${path} must be an object`);
    }
    const comp = c as Record<string, unknown>;
    if (typeof comp.id !== "string" || !COMPONENT_ID_REGEX.test(comp.id)) {
      throw new StatusPageError("INVALID_DOC", `${path}.id must match /^[a-z0-9-]{1,40}$/`);
    }
    if (componentIds.has(comp.id)) {
      throw new StatusPageError("INVALID_DOC", `${path}.id '${comp.id}' must be unique`);
    }
    componentIds.add(comp.id);

    if (typeof comp.name !== "string" || comp.name.length < 1 || comp.name.length > 100) {
      throw new StatusPageError("INVALID_DOC", `${path}.name must be between 1 and 100 characters`);
    }

    if (
      typeof comp.status !== "string" ||
      !COMPONENT_STATUSES.includes(comp.status as ComponentStatus)
    ) {
      throw new StatusPageError(
        "INVALID_DOC",
        `${path}.status must be one of ${COMPONENT_STATUSES.join(", ")}`,
      );
    }

    validatedComponents.push({
      id: comp.id,
      name: comp.name,
      status: comp.status as ComponentStatus,
    });
  }

  if (!Array.isArray(docObj.incidents)) {
    throw new StatusPageError("INVALID_DOC", "incidents must be an array");
  }
  if (docObj.incidents.length > MAX_INCIDENTS) {
    throw new StatusPageError(
      "LIMIT_EXCEEDED",
      `incidents length ${docObj.incidents.length} exceeds max of ${MAX_INCIDENTS}`,
    );
  }

  const validatedIncidents: Incident[] = [];

  for (let i = 0; i < docObj.incidents.length; i++) {
    const inc = docObj.incidents[i];
    const path = `incidents[${i}]`;
    if (typeof inc !== "object" || inc === null || Array.isArray(inc)) {
      throw new StatusPageError("INVALID_DOC", `${path} must be an object`);
    }
    const incident = inc as Record<string, unknown>;

    if (typeof incident.id !== "string" || incident.id.length < 1) {
      throw new StatusPageError("INVALID_DOC", `${path}.id must be a non-empty string`);
    }

    if (typeof incident.title !== "string" || incident.title.length < 1) {
      throw new StatusPageError("INVALID_DOC", `${path}.title must be a non-empty string`);
    }

    if (
      typeof incident.impact !== "string" ||
      !INCIDENT_IMPACTS.includes(incident.impact as (typeof INCIDENT_IMPACTS)[number])
    ) {
      throw new StatusPageError(
        "INVALID_DOC",
        `${path}.impact must be one of minor, major, critical`,
      );
    }

    if (!Array.isArray(incident.components)) {
      throw new StatusPageError("INVALID_DOC", `${path}.components must be an array`);
    }
    const incCompList: string[] = [];
    for (let cIdx = 0; cIdx < incident.components.length; cIdx++) {
      const cId = incident.components[cIdx];
      const cPath = `${path}.components[${cIdx}]`;
      if (typeof cId !== "string" || !componentIds.has(cId)) {
        throw new StatusPageError(
          "INVALID_DOC",
          `${cPath} must reference an existing component id`,
        );
      }
      incCompList.push(cId);
    }

    if (!Array.isArray(incident.updates)) {
      throw new StatusPageError("INVALID_DOC", `${path}.updates must be an array`);
    }
    if (incident.updates.length < 1 || incident.updates.length > MAX_UPDATES_PER_INCIDENT) {
      throw new StatusPageError(
        "INVALID_DOC",
        `${path}.updates length must be between 1 and ${MAX_UPDATES_PER_INCIDENT}`,
      );
    }

    const validatedUpdates: IncidentUpdate[] = [];
    for (let uIdx = 0; uIdx < incident.updates.length; uIdx++) {
      const u = incident.updates[uIdx];
      const uPath = `${path}.updates[${uIdx}]`;
      if (typeof u !== "object" || u === null || Array.isArray(u)) {
        throw new StatusPageError("INVALID_DOC", `${uPath} must be an object`);
      }
      const update = u as Record<string, unknown>;

      if (typeof update.at !== "string" || !ISO_8601_REGEX.test(update.at)) {
        throw new StatusPageError(
          "INVALID_DOC",
          `${uPath}.at must be a valid ISO 8601 string with Z or offset`,
        );
      }
      const parsedTime = Date.parse(update.at);
      if (Number.isNaN(parsedTime)) {
        throw new StatusPageError("INVALID_DOC", `${uPath}.at must parse to a valid timestamp`);
      }

      if (
        typeof update.status !== "string" ||
        !INCIDENT_STATUSES.includes(update.status as IncidentStatus)
      ) {
        throw new StatusPageError(
          "INVALID_DOC",
          `${uPath}.status must be one of ${INCIDENT_STATUSES.join(", ")}`,
        );
      }

      if (typeof update.body !== "string" || update.body.length > MAX_UPDATE_BODY_LENGTH) {
        throw new StatusPageError(
          "INVALID_DOC",
          `${uPath}.body must be a string of at most ${MAX_UPDATE_BODY_LENGTH} characters`,
        );
      }

      validatedUpdates.push({
        at: update.at,
        status: update.status as IncidentStatus,
        body: update.body,
      });
    }

    validatedIncidents.push({
      id: incident.id,
      title: incident.title,
      impact: incident.impact as "minor" | "major" | "critical",
      components: incCompList,
      updates: validatedUpdates,
    });
  }

  return {
    title: docObj.title,
    components: validatedComponents,
    incidents: validatedIncidents,
  };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatUtcDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes} UTC`;
}

function formatIsoTime(iso: string): string {
  const d = new Date(iso);
  return formatUtcDate(d);
}

interface InternalIncidentWithLatest {
  incident: Incident;
  latestUpdate: IncidentUpdate;
  latestTimestamp: number;
  resolved: boolean;
}

export function renderPage(doc: StatusDoc, opts: { now: Date; historyDays?: number }): string {
  if (!opts || !(opts.now instanceof Date) || Number.isNaN(opts.now.getTime())) {
    throw new TypeError("opts.now must be a valid Date instance");
  }
  const historyDays = opts.historyDays ?? 14;
  if (
    typeof historyDays !== "number" ||
    !Number.isInteger(historyDays) ||
    historyDays < 1 ||
    historyDays > 90
  ) {
    throw new TypeError("opts.historyDays must be an integer between 1 and 90");
  }

  const overall = overallStatus(doc.components);
  const overallLabel = STATUS_LABELS[overall];

  const enriched: InternalIncidentWithLatest[] = doc.incidents.map((incident) => {
    const sortedUpdates = [...incident.updates].sort((a, b) => {
      const diff = Date.parse(b.at) - Date.parse(a.at);
      return diff;
    });
    const latest = (sortedUpdates[0] ?? incident.updates[0]) as IncidentUpdate;
    const latestTimestamp = Date.parse(latest.at);
    return {
      incident,
      latestUpdate: latest,
      latestTimestamp,
      resolved: latest.status === "resolved",
    };
  });

  const activeIncidents: InternalIncidentWithLatest[] = [];
  const pastIncidents: InternalIncidentWithLatest[] = [];

  const cutoff = opts.now.getTime() - historyDays * 86400000;

  for (const item of enriched) {
    if (!item.resolved) {
      activeIncidents.push(item);
    } else if (item.latestTimestamp >= cutoff) {
      pastIncidents.push(item);
    }
  }

  const incidentSorter = (a: InternalIncidentWithLatest, b: InternalIncidentWithLatest) => {
    if (b.latestTimestamp !== a.latestTimestamp) {
      return b.latestTimestamp - a.latestTimestamp;
    }
    if (a.incident.id < b.incident.id) return -1;
    if (a.incident.id > b.incident.id) return 1;
    return 0;
  };

  activeIncidents.sort(incidentSorter);
  pastIncidents.sort(incidentSorter);

  const componentMap = new Map<string, string>();
  for (const c of doc.components) {
    componentMap.set(c.id, c.name);
  }

  const lines: string[] = [];
  lines.push("<!doctype html>");
  lines.push('<html lang="en">');
  lines.push("<head>");
  lines.push('<meta charset="utf-8">');
  lines.push('<meta name="viewport" content="width=device-width, initial-scale=1">');
  lines.push(`<title>${escapeHtml(doc.title)}</title>`);
  lines.push("<style>");
  lines.push(
    'body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 2rem 1rem; background: #fafafa; color: #111; }',
  );
  lines.push(
    ".container { max-width: 720px; margin: 0 auto; background: #ffffff; padding: 2rem; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }",
  );
  lines.push("h1 { margin-top: 0; font-size: 1.75rem; }");
  lines.push(
    "h2 { font-size: 1.25rem; margin-top: 2rem; border-bottom: 1px solid #eee; padding-bottom: 0.5rem; }",
  );
  lines.push(
    ".overall { padding: 1rem 1.25rem; border-radius: 6px; font-weight: 600; margin: 1.5rem 0; font-size: 1.125rem; }",
  );
  lines.push(".overall.operational { background: #e6f4ea; color: #137333; }");
  lines.push(".overall.degraded { background: #fef7e0; color: #b06000; }");
  lines.push(".overall.partial_outage { background: #feefe3; color: #c5221f; }");
  lines.push(".overall.major_outage { background: #fce8e6; color: #c5221f; }");
  lines.push(".overall.maintenance { background: #e8f0fe; color: #1a73e8; }");
  lines.push(".component-list { list-style: none; padding: 0; margin: 0; }");
  lines.push(
    ".component-item { display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 0; border-bottom: 1px solid #f0f0f0; }",
  );
  lines.push(".component-status { font-size: 0.875rem; font-weight: 500; }");
  lines.push(
    ".incident { margin: 1.5rem 0; padding-bottom: 1rem; border-bottom: 1px solid #f0f0f0; }",
  );
  lines.push(".incident:last-child { border-bottom: none; }");
  lines.push(".incident-title { font-size: 1.05rem; font-weight: 600; margin: 0 0 0.5rem 0; }");
  lines.push(".incident-meta { font-size: 0.875rem; color: #666; margin-bottom: 0.75rem; }");
  lines.push(
    ".update { margin-top: 0.75rem; padding-left: 0.75rem; border-left: 2px solid #ddd; }",
  );
  lines.push(
    ".update-header { font-size: 0.8125rem; color: #555; font-weight: 600; margin-bottom: 0.25rem; }",
  );
  lines.push(".update-body { font-size: 0.9375rem; line-height: 1.45; }");
  lines.push(".empty { color: #666; font-style: italic; }");
  lines.push("</style>");
  lines.push("</head>");
  lines.push("<body>");
  lines.push('<div class="container">');
  lines.push(`<h1>${escapeHtml(doc.title)}</h1>`);
  lines.push(`<h2 class="overall ${overall}">${escapeHtml(overallLabel)}</h2>`);

  lines.push("<h2>Components</h2>");
  if (doc.components.length === 0) {
    lines.push('<p class="empty">No components configured.</p>');
  } else {
    lines.push('<ul class="component-list">');
    for (const c of doc.components) {
      const compLabel = COMPONENT_STATUS_LABELS[c.status];
      lines.push(
        `  <li class="component-item"><span class="component-name">${escapeHtml(
          c.name,
        )}</span><span class="component-status ${c.status}">${escapeHtml(compLabel)}</span></li>`,
      );
    }
    lines.push("</ul>");
  }

  const renderIncidentBlock = (item: InternalIncidentWithLatest) => {
    const inc = item.incident;
    const compNames = inc.components
      .map((id) => componentMap.get(id) ?? id)
      .map(escapeHtml)
      .join(", ");

    const sortedUpdates = [...inc.updates].sort((a, b) => {
      return Date.parse(b.at) - Date.parse(a.at);
    });

    lines.push('  <article class="incident">');
    lines.push(`    <h3 class="incident-title">${escapeHtml(inc.title)}</h3>`);
    const impactHtml = `Impact: ${escapeHtml(inc.impact)}`;
    const affectedHtml = compNames ? ` &bull; Affected: ${compNames}` : "";
    lines.push(`    <div class="incident-meta">${impactHtml}${affectedHtml}</div>`);
    lines.push('    <div class="incident-updates">');
    for (const u of sortedUpdates) {
      const formattedAt = formatIsoTime(u.at);
      const statusLabel = INCIDENT_STATUS_LABELS[u.status];
      const bodyHtml = escapeHtml(u.body).replace(/\r?\n/g, "<br>");
      lines.push('      <div class="update">');
      lines.push(
        `        <div class="update-header"><span class="update-status">${escapeHtml(
          statusLabel,
        )}</span> - <time datetime="${escapeHtml(u.at)}">${escapeHtml(formattedAt)}</time></div>`,
      );
      lines.push(`        <div class="update-body">${bodyHtml}</div>`);
      lines.push("      </div>");
    }
    lines.push("    </div>");
    lines.push("  </article>");
  };

  if (activeIncidents.length > 0) {
    lines.push("<h2>Active incidents</h2>");
    for (const item of activeIncidents) {
      renderIncidentBlock(item);
    }
  }

  lines.push("<h2>Past incidents</h2>");
  if (pastIncidents.length === 0) {
    lines.push(`<p class="empty">No incidents in the last ${historyDays} days.</p>`);
  } else {
    for (const item of pastIncidents) {
      renderIncidentBlock(item);
    }
  }

  lines.push("</div>");
  lines.push("</body>");
  lines.push("</html>\n");

  return lines.join("\n");
}
