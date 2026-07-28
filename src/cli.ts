#!/usr/bin/env node

import { runTourCli } from "./cli/TourCli";

void runTourCli(process.argv.slice(2), process.cwd(), {
  write: (message) => process.stdout.write(`${message}\n`),
  writeError: (message) => process.stderr.write(`${message}\n`),
}).then((exitCode) => {
  process.exitCode = exitCode;
}, (error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Tour validation failed."}\n`);
  process.exitCode = 2;
});
