/**
 * CLI entry point for @trysac/status-page-static.
 */

import { parseStatus, renderPage, type StatusDoc, StatusPageError } from "./index.js";

export interface CliIO {
  stdout(s: string): void;
  stderr(s: string): void;
  readFile(p: string): Promise<string>;
  writeFile(p: string, s: string): Promise<void>;
  now?(): Date;
}

export async function run(argv: string[], io: CliIO): Promise<number> {
  try {
    let inputPath: string | undefined;
    let outputPath: string | undefined;
    let historyDays: number | undefined;

    for (let i = 0; i < argv.length; i++) {
      const arg = argv[i]!;
      if (arg === "-o" || arg === "--output") {
        i++;
        if (i >= argv.length) {
          io.stderr(`Error: Missing output path after ${arg}\n`);
          return 2;
        }
        outputPath = argv[i];
      } else if (arg === "--history-days") {
        i++;
        if (i >= argv.length) {
          io.stderr("Error: Missing value for --history-days\n");
          return 2;
        }
        const parsed = Number.parseInt(argv[i] ?? "", 10);
        if (Number.isNaN(parsed) || parsed < 1 || parsed > 90) {
          io.stderr("Error: --history-days must be an integer between 1 and 90\n");
          return 2;
        }
        historyDays = parsed;
      } else if (arg.startsWith("--history-days=")) {
        const val = arg.slice("--history-days=".length);
        const parsed = Number.parseInt(val, 10);
        if (Number.isNaN(parsed) || parsed < 1 || parsed > 90) {
          io.stderr("Error: --history-days must be an integer between 1 and 90\n");
          return 2;
        }
        historyDays = parsed;
      } else if (arg.startsWith("-")) {
        io.stderr(`Error: Unknown option '${arg}'\n`);
        return 2;
      } else if (!inputPath) {
        inputPath = arg;
      } else {
        io.stderr(`Error: Unexpected positional argument '${arg}'\n`);
        return 2;
      }
    }

    if (!inputPath) {
      io.stderr(
        "Usage: status-page-static <status.json> [-o <index.html>] [--history-days <1-90>]\n",
      );
      return 2;
    }

    let content: string;
    try {
      content = await io.readFile(inputPath);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      io.stderr(`Failed to read file '${inputPath}': ${msg}\n`);
      return 2;
    }

    let doc: StatusDoc;
    try {
      doc = parseStatus(content);
    } catch (err) {
      if (err instanceof StatusPageError) {
        if (err.code === "INVALID_DOC") {
          io.stderr(`${err.message}\n`);
          return 1;
        }
        io.stderr(`${err.message}\n`);
        return 2;
      }
      const msg = err instanceof Error ? err.message : String(err);
      io.stderr(`${msg}\n`);
      return 2;
    }

    const now = io.now?.() ?? new Date();
    const renderOpts: { now: Date; historyDays?: number } = { now };
    if (historyDays !== undefined) {
      renderOpts.historyDays = historyDays;
    }
    const html = renderPage(doc, renderOpts);

    if (outputPath) {
      try {
        await io.writeFile(outputPath, html);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        io.stderr(`Failed to write file '${outputPath}': ${msg}\n`);
        return 2;
      }
    } else {
      io.stdout(html);
    }

    return 0;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    io.stderr(`Unexpected error: ${msg}\n`);
    return 2;
  }
}
