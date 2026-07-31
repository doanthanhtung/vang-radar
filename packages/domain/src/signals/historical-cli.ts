import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import {
  recomputeHistoricalSignals,
  SIGNAL_ENGINE_VERSION,
  type HistoricalSignalRow
} from "./historical.js";

interface CliOptions {
  inputPath: string;
  outputPath?: string;
}

function parseOptions(args: string[]): CliOptions {
  let inputPath: string | undefined;
  let outputPath: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--input") {
      inputPath = args[index + 1];
      index += 1;
    } else if (argument === "--output") {
      outputPath = args[index + 1];
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  if (!inputPath) {
    throw new Error("Usage: historical-signals --input <path> [--output <path>]");
  }
  return outputPath ? { inputPath, outputPath } : { inputPath };
}

export async function runHistoricalSignalCli(args: string[]): Promise<string> {
  const options = parseOptions(args);
  const envelope = JSON.parse(await readFile(options.inputPath, "utf8")) as {
    rows?: HistoricalSignalRow[];
  };
  if (!Array.isArray(envelope.rows)) {
    throw new Error("Input JSON must contain a rows array");
  }

  const serialized = JSON.stringify(
    {
      engineVersion: SIGNAL_ENGINE_VERSION,
      rows: recomputeHistoricalSignals(envelope.rows)
    },
    null,
    2
  );
  if (options.outputPath) {
    await writeFile(options.outputPath, serialized, "utf8");
  }
  return serialized;
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  runHistoricalSignalCli(process.argv.slice(2))
    .then((serialized) => {
      if (!process.argv.includes("--output")) {
        process.stdout.write(`${serialized}\n`);
      }
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`historical-signals: ${message}\n`);
      process.exitCode = 1;
    });
}
