import type { OutputChannel } from "vscode";
import type { Logger } from "./Logger";

export class OutputChannelLogger implements Logger {
  public constructor(private readonly output: OutputChannel) {}

  public info(message: string): void {
    this.output.appendLine(`[info] ${message}`);
  }

  public error(message: string, error?: unknown): void {
    const detail = formatError(error);
    this.output.appendLine(`[error] ${message}${detail ? `: ${detail}` : ""}`);
  }
}

function formatError(error: unknown): string {
  if (error === undefined) {
    return "";
  }
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  try {
    return JSON.stringify(error) ?? "Unknown error";
  } catch {
    return "Unserializable error";
  }
}
