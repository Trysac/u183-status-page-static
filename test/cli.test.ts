import { describe, expect, it } from "vitest";
import { run } from "../src/cli.js";

describe("CLI run", () => {
  const validJson = JSON.stringify({
    title: "Acme Status",
    components: [{ id: "api", name: "API Server", status: "operational" }],
    incidents: [],
  });

  it("acceptance: run(['status.json', '-o', 'index.html'], io) writes page with io.writeFile and returns 0", async () => {
    const files: Record<string, string> = {
      "status.json": validJson,
    };
    let writtenPath = "";
    let writtenData = "";
    const stdoutLogs: string[] = [];
    const stderrLogs: string[] = [];

    const io = {
      stdout: (s: string) => stdoutLogs.push(s),
      stderr: (s: string) => stderrLogs.push(s),
      readFile: async (p: string) => {
        if (files[p]) return files[p];
        throw new Error("File not found");
      },
      writeFile: async (p: string, s: string) => {
        writtenPath = p;
        writtenData = s;
      },
      now: () => new Date("2026-11-15T00:00:00Z"),
    };

    const code = await run(["status.json", "-o", "index.html"], io);
    expect(code).toBe(0);
    expect(writtenPath).toBe("index.html");
    expect(writtenData).toContain("<!doctype html>");
    expect(writtenData).toContain("Acme Status");
    expect(stderrLogs).toHaveLength(0);
  });

  it("acceptance: INVALID_DOC returns 1 with message on stderr", async () => {
    const invalidDocJson = JSON.stringify({
      title: "Acme",
      components: [{ id: "api", name: "API", status: "unknown" }],
      incidents: [],
    });
    const stderrLogs: string[] = [];
    const io = {
      stdout: () => {},
      stderr: (s: string) => stderrLogs.push(s),
      readFile: async () => invalidDocJson,
      writeFile: async () => {},
    };

    const code = await run(["status.json"], io);
    expect(code).toBe(1);
    expect(stderrLogs[0]).toContain("components[0].status");
  });

  it("acceptance: INVALID_JSON or read failure returns 2 with message on stderr", async () => {
    const stderrLogs: string[] = [];
    const ioJsonErr = {
      stdout: () => {},
      stderr: (s: string) => stderrLogs.push(s),
      readFile: async () => "{ bad json",
      writeFile: async () => {},
    };

    const code1 = await run(["status.json"], ioJsonErr);
    expect(code1).toBe(2);
    expect(stderrLogs[0]).toContain("Invalid JSON");

    stderrLogs.length = 0;
    const ioReadErr = {
      stdout: () => {},
      stderr: (s: string) => stderrLogs.push(s),
      readFile: async () => {
        throw new Error("Disk read failure");
      },
      writeFile: async () => {},
    };
    const code2 = await run(["nonexistent.json"], ioReadErr);
    expect(code2).toBe(2);
    expect(stderrLogs[0]).toContain("Failed to read file");
  });

  it("handles stdout output when -o is omitted and default clock", async () => {
    const stdoutLogs: string[] = [];
    const io = {
      stdout: (s: string) => stdoutLogs.push(s),
      stderr: () => {},
      readFile: async () => validJson,
      writeFile: async () => {},
    };
    const code = await run(["status.json"], io);
    expect(code).toBe(0);
    expect(stdoutLogs.join("")).toContain("<!doctype html>");
  });

  it("handles options: --output, --history-days, --history-days=N, and error cases", async () => {
    const stderrLogs: string[] = [];
    const io = {
      stdout: () => {},
      stderr: (s: string) => stderrLogs.push(s),
      readFile: async () => validJson,
      writeFile: async () => {},
    };

    expect(await run([], io)).toBe(2);
    expect(stderrLogs[stderrLogs.length - 1]).toContain("Usage:");

    expect(await run(["file.json", "-o"], io)).toBe(2);
    expect(await run(["file.json", "--history-days"], io)).toBe(2);
    expect(await run(["file.json", "--history-days", "abc"], io)).toBe(2);
    expect(await run(["file.json", "--history-days=100"], io)).toBe(2);
    expect(await run(["file.json", "--unknown-flag"], io)).toBe(2);
    expect(await run(["file.json", "extra-arg"], io)).toBe(2);

    // Test successful --history-days=10 and write error
    const ioWriteFail = {
      stdout: () => {},
      stderr: (s: string) => stderrLogs.push(s),
      readFile: async () => validJson,
      writeFile: async () => {
        throw new Error("Write permission denied");
      },
    };
    expect(
      await run(["status.json", "--output", "out.html", "--history-days=10"], ioWriteFail),
    ).toBe(2);
  });
});
