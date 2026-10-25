import * as fs from "fs";
import * as path from "path";

// Simulates 3 fake microservices writing logs to a shared file.
// Run this alongside the ingestion service during your demo.

const LOG_FILE = path.join(__dirname, "..", "app.log");
const SERVICES = ["auth-service", "payment-service", "user-service"];

const NORMAL_MESSAGES = {
  INFO: [
    "Request handled successfully",
    "User login successful",
    "Cache hit for key",
    "Health check passed",
  ],
  WARN: ["Slow query detected", "Retrying request", "Cache miss, fetching from DB"],
  ERROR: ["Request timeout", "Database connection failed", "Invalid auth token"],
  DEBUG: ["Processing request", "Validating input"],
};

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function writeLog(service: string, level: keyof typeof NORMAL_MESSAGES, message?: string) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    service,
    message: message ?? randomChoice(NORMAL_MESSAGES[level]),
  };
  fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + "\n");
}

// Normal traffic: mostly INFO, occasional WARN/ERROR
function emitNormalLog() {
  const service = randomChoice(SERVICES);
  const roll = Math.random();
  let level: keyof typeof NORMAL_MESSAGES = "INFO";
  if (roll < 0.6) level = "INFO";
  else if (roll < 0.8) level = "DEBUG";
  else if (roll < 0.93) level = "WARN";
  else level = "ERROR";
  writeLog(service, level);
}

// Induced incident: burst of errors from one service (for demo anomaly detection)
function emitErrorBurst(service: string, count: number) {
  console.log(`[log-generator] Inducing error burst on ${service} (${count} errors)`);
  for (let i = 0; i < count; i++) {
    writeLog(service, "ERROR", "Database connection failed");
  }
}

console.log(`[log-generator] Writing to ${LOG_FILE}. Ctrl+C to stop.`);

// Normal background traffic every 300-800ms
setInterval(() => {
  emitNormalLog();
}, 300 + Math.random() * 500);

// Trigger an induced anomaly ~40s in, for demo purposes
setTimeout(() => {
  emitErrorBurst("payment-service", 15);
}, 40_000);

// A second, later anomaly on a different service
setTimeout(() => {
  emitErrorBurst("auth-service", 12);
}, 90_000);
