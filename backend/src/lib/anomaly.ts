import { AnomalyType } from "@prisma/client";

// The connection module is JavaScript and does not currently provide type declarations.
// @ts-expect-error -- intentionally importing the untyped JavaScript Prisma client.
import prisma from "../../config/connection.js";

const ERROR_SPIKE_THRESHOLD = 8; // errors per rolling window = spike
const WINDOW_MS = 60_000; // 1 minute rolling window
const SILENCE_THRESHOLD_MS = 30_000; // no logs from a service for 30s = silence

const knownServices = new Set<string>();

async function checkErrorSpikes() {
  const windowStart = new Date(Date.now() - WINDOW_MS);
  const windowEnd = new Date();

  const errorCounts = await prisma.logEntry.groupBy({
    by: ["service"],
    where: { level: "ERROR", timestamp: { gte: windowStart } },
    _count: { _all: true },
  });

  for (const row of errorCounts) {
    knownServices.add(row.service);
    if (row._count._all >= ERROR_SPIKE_THRESHOLD) {
      // avoid duplicate alerts for the same ongoing spike
      const recent = await prisma.anomaly.findFirst({
        where: {
          type: AnomalyType.ERROR_SPIKE,
          service: row.service,
          detectedAt: { gte: new Date(Date.now() - WINDOW_MS) },
        },
      });
      if (recent) continue;

      await prisma.anomaly.create({
        data: {
          type: AnomalyType.ERROR_SPIKE,
          service: row.service,
          description: `${row._count._all} errors in the last minute (threshold: ${ERROR_SPIKE_THRESHOLD})`,
          severity: row._count._all > ERROR_SPIKE_THRESHOLD * 2 ? 5 : 3,
          windowStart,
          windowEnd,
        },
      });
      console.log(`[anomaly] ERROR_SPIKE on ${row.service}: ${row._count._all} errors`);
    }
  }
}

async function checkRepeatedErrors() {
  const windowStart = new Date(Date.now() - WINDOW_MS);

  const recentErrors = await prisma.logEntry.findMany({
    where: { level: "ERROR", timestamp: { gte: windowStart } },
    select: { service: true, message: true },
  });

  const grouped = new Map<string, number>();
  for (const e of recentErrors) {
    const key = `${e.service}::${e.message}`;
    grouped.set(key, (grouped.get(key) ?? 0) + 1);
  }

  for (const [key, count] of grouped.entries()) {
    if (count >= 5) {
      const [service, message] = key.split("::");
      const recent = await prisma.anomaly.findFirst({
        where: {
          type: AnomalyType.REPEATED_ERROR,
          service,
          description: { contains: message },
          detectedAt: { gte: new Date(Date.now() - WINDOW_MS) },
        },
      });
      if (recent) continue;

      await prisma.anomaly.create({
        data: {
          type: AnomalyType.REPEATED_ERROR,
          service,
          description: `Same error repeated ${count}x: "${message}"`,
          severity: 4,
          windowStart,
          windowEnd: new Date(),
        },
      });
      console.log(`[anomaly] REPEATED_ERROR on ${service}: "${message}" x${count}`);
    }
  }
}

async function checkServiceSilence() {
  for (const service of knownServices) {
    const lastLog = await prisma.logEntry.findFirst({
      where: { service },
      orderBy: { timestamp: "desc" },
    });
    if (!lastLog) continue;

    const silentFor = Date.now() - lastLog.timestamp.getTime();
    if (silentFor >= SILENCE_THRESHOLD_MS) {
      const recent = await prisma.anomaly.findFirst({
        where: {
          type: AnomalyType.SERVICE_SILENCE,
          service,
          detectedAt: { gte: new Date(Date.now() - SILENCE_THRESHOLD_MS) },
        },
      });
      if (recent) continue;

      await prisma.anomaly.create({
        data: {
          type: AnomalyType.SERVICE_SILENCE,
          service,
          description: `No logs from ${service} for ${Math.round(silentFor / 1000)}s`,
          severity: 2,
          windowStart: lastLog.timestamp,
          windowEnd: new Date(),
        },
      });
      console.log(`[anomaly] SERVICE_SILENCE on ${service}`);
    }
  }
}

export function startAnomalyDetection() {
  console.log("[anomaly] detection loop started");
  setInterval(() => {
    checkErrorSpikes().catch((err) => console.error("[anomaly] spike check error:", err));
    checkRepeatedErrors().catch((err) => console.error("[anomaly] repeated check error:", err));
    checkServiceSilence().catch((err) => console.error("[anomaly] silence check error:", err));
  }, 5000); // check every 5s
}
