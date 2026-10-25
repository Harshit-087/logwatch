import * as fs from "fs";
import * as path from "path";
import { PrismaClient, LogLevel } from "@prisma/client";

const prisma = new PrismaClient();
const LOG_FILE = path.join(__dirname, "..", "..", "app.log");

interface RawLogLine {
  timestamp: string;
  level: string;
  service: string;
  message: string;
}


// after (start at current end of file; add REINGEST=true to .env to read everything)
let filePosition =
  process.env.REINGEST === "true" || !fs.existsSync(LOG_FILE)
    ? 0
    : fs.statSync(LOG_FILE).size;

function parseLine(line: string): RawLogLine | null {
  try {
    const parsed = JSON.parse(line);
    if (!parsed.timestamp || !parsed.level || !parsed.service || !parsed.message) return null;
    return parsed;
  } catch {
    return null; // skip malformed lines rather than crashing ingestion
  }
}

async function ingestNewLines() {
  if (!fs.existsSync(LOG_FILE)) return;

  const stats = fs.statSync(LOG_FILE);
  if (stats.size < filePosition) {
    // file was truncated/rotated — restart from beginning
    filePosition = 0;
  }
  if (stats.size === filePosition) return; // nothing new

  const stream = fs.createReadStream(LOG_FILE, {
    start: filePosition,
    end: stats.size,
    encoding: "utf-8",
  });

  let buffer = "";
  for await (const chunk of stream) {
    buffer += chunk;
  }
  filePosition = stats.size;

  const lines = buffer.split("\n").filter((l) => l.trim().length > 0);
  const parsedEntries = lines.map(parseLine).filter((e): e is RawLogLine => e !== null);

  if (parsedEntries.length === 0) return;

  await prisma.logEntry.createMany({
    data: parsedEntries.map((e) => ({
      timestamp: new Date(e.timestamp),
      level: e.level.toUpperCase() as LogLevel,
      service: e.service,
      message: e.message,
    })),
  });

  console.log(`[ingest] wrote ${parsedEntries.length} log entries`);
}

// Poll the log file every second. Simple, reliable, good enough for a minor-project demo.
export function startIngestion() {
  console.log(`[ingest] watching ${LOG_FILE}`);
  setInterval(() => {
    ingestNewLines().catch((err) => console.error("[ingest] error:", err));
  }, 1000);
}
