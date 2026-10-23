import "server-only";

// Structured logs that Cloud Logging parses. Never pass secrets, email bodies or document text.
type Level = "INFO" | "WARNING" | "ERROR";

function write(severity: Level, message: string, fields: Record<string, unknown> = {}) {
  const entry = { severity, message, ...fields, time: new Date().toISOString() };
  const line = JSON.stringify(entry, (_k, v) => (v instanceof Error ? { name: v.name, message: v.message } : v));
  if (severity === "ERROR") console.error(line);
  else if (severity === "WARNING") console.warn(line);
  else console.log(line);
}

export const log = {
  info: (message: string, fields?: Record<string, unknown>) => write("INFO", message, fields),
  warn: (message: string, fields?: Record<string, unknown>) => write("WARNING", message, fields),
  error: (message: string, fields?: Record<string, unknown>) => write("ERROR", message, fields),
};
