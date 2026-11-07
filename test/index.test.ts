import { describe, expect, it } from "vitest";
import { overallStatus, parseStatus, renderPage, StatusPageError } from "../src/index.js";

describe("overallStatus", () => {
  it("acceptance: computes partial_outage correctly", () => {
    expect(
      overallStatus([
        { status: "operational" },
        { status: "partial_outage" },
        { status: "degraded" },
      ]),
    ).toBe("partial_outage");
  });

  it("returns operational for empty list", () => {
    expect(overallStatus([])).toBe("operational");
  });

  it("orders major_outage > partial_outage > degraded > maintenance > operational", () => {
    expect(overallStatus([{ status: "operational" }, { status: "maintenance" }])).toBe(
      "maintenance",
    );
    expect(overallStatus([{ status: "maintenance" }, { status: "degraded" }])).toBe("degraded");
    expect(overallStatus([{ status: "degraded" }, { status: "major_outage" }])).toBe(
      "major_outage",
    );
    expect(overallStatus([{ status: "partial_outage" }, { status: "major_outage" }])).toBe(
      "major_outage",
    );
  });
});

describe("parseStatus", () => {
  const sampleJson = JSON.stringify({
    title: "Acme Status",
    components: [
      { id: "api", name: "API Server", status: "operational" },
      { id: "web", name: "Web App", status: "degraded" },
    ],
    incidents: [
      {
        id: "inc-1",
        title: "API Latency",
        impact: "minor",
        components: ["api"],
        updates: [
          {
            at: "2026-11-01T09:05:00Z",
            status: "investigating",
            body: "Investigating elevated latency.",
          },
        ],
      },
    ],
  });

  it("parses valid status document", () => {
    const doc = parseStatus(sampleJson);
    expect(doc.title).toBe("Acme Status");
    expect(doc.components).toHaveLength(2);
    expect(doc.incidents).toHaveLength(1);
  });

  it("acceptance: update at '2026-11-01T09:05:00' throws INVALID_DOC naming 'incidents[0].updates[0].at'", () => {
    const invalidJson = JSON.stringify({
      title: "Acme",
      components: [{ id: "api", name: "API", status: "operational" }],
      incidents: [
        {
          id: "inc-1",
          title: "Issue",
          impact: "minor",
          components: ["api"],
          updates: [
            {
              at: "2026-11-01T09:05:00",
              status: "investigating",
              body: "issue",
            },
          ],
        },
      ],
    });
    expect(() => parseStatus(invalidJson)).toThrowError(StatusPageError);
    try {
      parseStatus(invalidJson);
    } catch (e) {
      const err = e as StatusPageError;
      expect(err.code).toBe("INVALID_DOC");
      expect(err.message).toContain("incidents[0].updates[0].at");
    }
  });

  it("acceptance: component status 'down' throws 'INVALID_DOC' naming 'components[0].status'", () => {
    const invalidJson = JSON.stringify({
      title: "Acme",
      components: [{ id: "api", name: "API", status: "down" }],
      incidents: [],
    });
    try {
      parseStatus(invalidJson);
      expect.unreachable("Should have thrown");
    } catch (e) {
      const err = e as StatusPageError;
      expect(err.code).toBe("INVALID_DOC");
      expect(err.message).toContain("components[0].status");
    }
  });

  it("acceptance: parseStatus('{') throws code 'INVALID_JSON'", () => {
    try {
      parseStatus("{");
      expect.unreachable("Should have thrown");
    } catch (e) {
      const err = e as StatusPageError;
      expect(err.code).toBe("INVALID_JSON");
    }
  });

  it("acceptance: 1_000_001-character input throws INPUT_TOO_LARGE and 1_000_000 is accepted", () => {
    const tooLarge = " ".repeat(1_000_001);
    expect(() => parseStatus(tooLarge)).toThrowError(StatusPageError);
    try {
      parseStatus(tooLarge);
    } catch (e) {
      const err = e as StatusPageError;
      expect(err.code).toBe("INPUT_TOO_LARGE");
    }

    // 1_000_000 characters with valid json and padding
    const base = JSON.stringify({ title: "Test", components: [], incidents: [] });
    const padded = base + " ".repeat(1_000_000 - base.length);
    expect(padded.length).toBe(1_000_000);
    const doc = parseStatus(padded);
    expect(doc.title).toBe("Test");
  });

  it("acceptance: 201 components throw LIMIT_EXCEEDED", () => {
    const components = Array.from({ length: 201 }, (_, i) => ({
      id: `c-${i}`,
      name: `Component ${i}`,
      status: "operational",
    }));
    const json = JSON.stringify({ title: "Lots", components, incidents: [] });
    try {
      parseStatus(json);
      expect.unreachable("Should have thrown");
    } catch (e) {
      const err = e as StatusPageError;
      expect(err.code).toBe("LIMIT_EXCEEDED");
      expect(err.message).toContain("components length 201 exceeds max of 200");
    }
  });

  it("validates non-string input, non-object root, invalid title, duplicate component ids", () => {
    // @ts-expect-error test non-string input
    expect(() => parseStatus(123)).toThrow("input must be a string");
    expect(() => parseStatus('"string"')).toThrow("root document must be an object");
    expect(() => parseStatus("[]")).toThrow("root document must be an object");
    expect(() => parseStatus(JSON.stringify({ title: "" }))).toThrow("title must be a string");
    expect(() => parseStatus(JSON.stringify({ title: "A".repeat(101) }))).toThrow(
      "title must be a string",
    );
    expect(() => parseStatus(JSON.stringify({ title: "Ok", components: "not-array" }))).toThrow(
      "components must be an array",
    );

    const duplicateComponents = JSON.stringify({
      title: "Ok",
      components: [
        { id: "api", name: "API", status: "operational" },
        { id: "api", name: "API 2", status: "operational" },
      ],
      incidents: [],
    });
    expect(() => parseStatus(duplicateComponents)).toThrow("components[1].id 'api' must be unique");

    const invalidCompId = JSON.stringify({
      title: "Ok",
      components: [{ id: "API_Bad!", name: "API", status: "operational" }],
      incidents: [],
    });
    expect(() => parseStatus(invalidCompId)).toThrow("components[0].id must match");

    const invalidCompName = JSON.stringify({
      title: "Ok",
      components: [{ id: "api", name: "", status: "operational" }],
      incidents: [],
    });
    expect(() => parseStatus(invalidCompName)).toThrow("components[0].name must be between");

    const nonObjectComp = JSON.stringify({
      title: "Ok",
      components: ["not-an-object"],
      incidents: [],
    });
    expect(() => parseStatus(nonObjectComp)).toThrow("components[0] must be an object");
  });

  it("validates incident fields, unknown components, update limits and formatting", () => {
    expect(() =>
      parseStatus(JSON.stringify({ title: "T", components: [], incidents: "bad" })),
    ).toThrow("incidents must be an array");

    // > 1000 incidents
    const tooManyIncidents = Array.from({ length: 1001 }, (_, i) => ({
      id: `inc-${i}`,
      title: "Test",
      impact: "minor",
      components: [],
      updates: [{ at: "2026-11-01T00:00:00Z", status: "investigating", body: "x" }],
    }));
    expect(() =>
      parseStatus(JSON.stringify({ title: "T", components: [], incidents: tooManyIncidents })),
    ).toThrow("incidents length 1001 exceeds max of 1000");

    const nonObjInc = JSON.stringify({ title: "T", components: [], incidents: [123] });
    expect(() => parseStatus(nonObjInc)).toThrow("incidents[0] must be an object");

    const invalidIncId = JSON.stringify({
      title: "T",
      components: [],
      incidents: [{ id: "", title: "A", impact: "minor", components: [], updates: [] }],
    });
    expect(() => parseStatus(invalidIncId)).toThrow("incidents[0].id must be a non-empty string");

    const invalidIncTitle = JSON.stringify({
      title: "T",
      components: [],
      incidents: [{ id: "1", title: "", impact: "minor", components: [], updates: [] }],
    });
    expect(() => parseStatus(invalidIncTitle)).toThrow(
      "incidents[0].title must be a non-empty string",
    );

    const invalidIncImpact = JSON.stringify({
      title: "T",
      components: [],
      incidents: [{ id: "1", title: "T", impact: "unknown", components: [], updates: [] }],
    });
    expect(() => parseStatus(invalidIncImpact)).toThrow("incidents[0].impact must be one of");

    const invalidIncComponents = JSON.stringify({
      title: "T",
      components: [],
      incidents: [{ id: "1", title: "T", impact: "minor", components: "not-array", updates: [] }],
    });
    expect(() => parseStatus(invalidIncComponents)).toThrow(
      "incidents[0].components must be an array",
    );

    const unknownComp = JSON.stringify({
      title: "T",
      components: [{ id: "api", name: "API", status: "operational" }],
      incidents: [{ id: "1", title: "T", impact: "minor", components: ["unknown"], updates: [] }],
    });
    expect(() => parseStatus(unknownComp)).toThrow(
      "incidents[0].components[0] must reference an existing component id",
    );

    const nonArrayUpdates = JSON.stringify({
      title: "T",
      components: [],
      incidents: [{ id: "1", title: "T", impact: "minor", components: [], updates: "bad" }],
    });
    expect(() => parseStatus(nonArrayUpdates)).toThrow("incidents[0].updates must be an array");

    const emptyUpdates = JSON.stringify({
      title: "T",
      components: [],
      incidents: [{ id: "1", title: "T", impact: "minor", components: [], updates: [] }],
    });
    expect(() => parseStatus(emptyUpdates)).toThrow(
      "incidents[0].updates length must be between 1 and 50",
    );

    const nonObjUpdate = JSON.stringify({
      title: "T",
      components: [],
      incidents: [{ id: "1", title: "T", impact: "minor", components: [], updates: [null] }],
    });
    expect(() => parseStatus(nonObjUpdate)).toThrow("incidents[0].updates[0] must be an object");

    const invalidUpdateStatus = JSON.stringify({
      title: "T",
      components: [],
      incidents: [
        {
          id: "1",
          title: "T",
          impact: "minor",
          components: [],
          updates: [{ at: "2026-11-01T00:00:00Z", status: "bad_status", body: "ok" }],
        },
      ],
    });
    expect(() => parseStatus(invalidUpdateStatus)).toThrow(
      "incidents[0].updates[0].status must be one of",
    );

    const invalidUpdateBody = JSON.stringify({
      title: "T",
      components: [],
      incidents: [
        {
          id: "1",
          title: "T",
          impact: "minor",
          components: [],
          updates: [
            { at: "2026-11-01T00:00:00Z", status: "investigating", body: "a".repeat(5001) },
          ],
        },
      ],
    });
    expect(() => parseStatus(invalidUpdateBody)).toThrow(
      "incidents[0].updates[0].body must be a string of at most 5000 characters",
    );

    const unparseableDate = JSON.stringify({
      title: "T",
      components: [],
      incidents: [
        {
          id: "1",
          title: "T",
          impact: "minor",
          components: [],
          updates: [{ at: "9999-99-99T99:99:99Z", status: "investigating", body: "ok" }],
        },
      ],
    });
    expect(() => parseStatus(unparseableDate)).toThrow(
      "incidents[0].updates[0].at must parse to a valid timestamp",
    );
  });
});

describe("renderPage", () => {
  const baseDoc = {
    title: "Acme Status",
    components: [
      { id: "api", name: "API", status: "operational" as const },
      { id: "web", name: "Web", status: "partial_outage" as const },
      { id: "db", name: "Database", status: "degraded" as const },
    ],
    incidents: [],
  };

  it("acceptance: renders overall partial_outage class and title", () => {
    const html = renderPage(baseDoc, { now: new Date("2026-11-15T00:00:00Z") });
    expect(html).toContain('<h2 class="overall partial_outage">Partial outage</h2>');
  });

  it("acceptance: escapes '<script>alert(1)</script>' and has no '<script', '<link', or 'src='", () => {
    const maliciousDoc = {
      title: "Safe <script>alert(0)</script>",
      components: [
        { id: "test", name: "<script>alert(1)</script>", status: "operational" as const },
      ],
      incidents: [
        {
          id: "inc-x",
          title: "<script>alert(2)</script>",
          impact: "minor" as const,
          components: ["test"],
          updates: [
            {
              at: "2026-11-01T09:05:00Z",
              status: "investigating" as const,
              body: "<script>alert(3)</script>",
            },
          ],
        },
      ],
    };
    const html = renderPage(maliciousDoc, { now: new Date("2026-11-15T00:00:00Z") });
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<link");
    expect(html).not.toContain("src=");
  });

  it(`acceptance: starts with '<!doctype html>\n<html lang="en">', contains '<meta charset="utf-8">', renders UTC times and body newlines`, () => {
    const doc = {
      title: "Status",
      components: [],
      incidents: [
        {
          id: "1",
          title: "Outage",
          impact: "major" as const,
          components: [],
          updates: [
            {
              at: "2026-11-01T09:05:00Z",
              status: "investigating" as const,
              body: "a\nb",
            },
          ],
        },
      ],
    };
    const html = renderPage(doc, { now: new Date("2026-11-15T00:00:00Z") });
    expect(html.startsWith('<!doctype html>\n<html lang="en">')).toBe(true);
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain("2026-11-01 09:05 UTC");
    expect(html).toContain("a<br>b");
  });

  it("acceptance: historyDays filtering for resolved incidents and active incidents display", () => {
    const doc = {
      title: "Status",
      components: [],
      incidents: [
        {
          id: "inc-omitted",
          title: "Older Resolved",
          impact: "minor" as const,
          components: [],
          updates: [
            {
              at: "2026-10-31T23:59:59Z",
              status: "resolved" as const,
              body: "fixed",
            },
          ],
        },
        {
          id: "inc-included",
          title: "Recent Resolved",
          impact: "minor" as const,
          components: [],
          updates: [
            {
              at: "2026-11-01T00:00:00Z",
              status: "resolved" as const,
              body: "fixed now",
            },
          ],
        },
        {
          id: "inc-unresolved",
          title: "Old Active Incident",
          impact: "minor" as const,
          components: [],
          updates: [
            {
              at: "2026-09-01T00:00:00Z",
              status: "investigating" as const,
              body: "still ongoing",
            },
          ],
        },
      ],
    };
    const html = renderPage(doc, {
      now: new Date("2026-11-15T00:00:00Z"),
      historyDays: 14,
    });

    expect(html).not.toContain("Older Resolved");
    expect(html).toContain("Recent Resolved");
    expect(html).toContain("<h2>Active incidents</h2>");
    expect(html).toContain("Old Active Incident");
  });

  it("acceptance: renderPage called twice returns identical strings, throws TypeError without now", () => {
    const doc = {
      title: "Acme Status",
      components: [{ id: "api", name: "API", status: "operational" as const }],
      incidents: [],
    };
    const now = new Date("2026-11-15T00:00:00Z");
    const res1 = renderPage(doc, { now });
    const res2 = renderPage(doc, { now });
    expect(res1).toBe(res2);

    // Test missing now
    expect(() => (renderPage as any)(doc)).toThrow(TypeError);
    // Test invalid now
    expect(() => (renderPage as any)(doc, { now: "invalid" })).toThrow(TypeError);
    // Test invalid historyDays
    expect(() => (renderPage as any)(doc, { now, historyDays: 0 })).toThrow(TypeError);
    // Test historyDays > 90
    expect(() => (renderPage as any)(doc, { now, historyDays: 91 })).toThrow(TypeError);
  });

  it("renders empty incidents text when no past incidents in range", () => {
    const doc = {
      title: "Acme Status",
      components: [],
      incidents: [],
    };
    const html = renderPage(doc, { now: new Date("2026-11-15T00:00:00Z") });
    expect(html).toContain("No incidents in the last 14 days.");
    expect(html).toContain("No components configured.");
    expect(html).not.toContain("<h2>Active incidents</h2>");
  });

  it("sorts incidents and updates deterministically (newest first, ties by id)", () => {
    const doc = {
      title: "Sorting",
      components: [],
      incidents: [
        {
          id: "inc-b",
          title: "Incident B",
          impact: "minor" as const,
          components: [],
          updates: [{ at: "2026-11-10T12:00:00Z", status: "resolved" as const, body: "b" }],
        },
        {
          id: "inc-a",
          title: "Incident A",
          impact: "minor" as const,
          components: [],
          updates: [{ at: "2026-11-10T12:00:00Z", status: "resolved" as const, body: "a" }],
        },
      ],
    };
    const html = renderPage(doc, { now: new Date("2026-11-15T00:00:00Z") });
    const idxA = html.indexOf("Incident A");
    const idxB = html.indexOf("Incident B");
    expect(idxA).toBeLessThan(idxB);
  });
});
