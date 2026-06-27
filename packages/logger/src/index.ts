import pino from "pino";

export function createLogger(name: string) {
  return pino({
    name,
    level: process.env.LOG_LEVEL ?? "info",
    redact: [
      "GOLDAPI_KEY",
      "METALS_DEV_API_KEY",
      "METALS_API_KEY",
      "VNAPPMOB_API_KEY",
      "ADMIN_PASSWORD",
      "EMAIL_PASSWORD"
    ]
  });
}
