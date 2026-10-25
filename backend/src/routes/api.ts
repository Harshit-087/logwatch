import { Router } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
export const apiRouter = Router();

// Recent logs, most recent first
apiRouter.get("/logs", async (req, res) => {
  const limit = Number(req.query.limit) || 100;
  const logs = await prisma.logEntry.findMany({
    orderBy: { timestamp: "desc" },
    take: limit,
  });
  res.json(logs);
});

// Recent anomalies, most recent first
apiRouter.get("/anomalies", async (req, res) => {
  const limit = Number(req.query.limit) || 50;
  const anomalies = await prisma.anomaly.findMany({
    orderBy: { detectedAt: "desc" },
    take: limit,
  });
  res.json(anomalies);
});

// Basic stats: log volume + error rate over the last N minutes, bucketed per minute
apiRouter.get("/stats", async (req, res) => {
  const minutes = Number(req.query.minutes) || 15;
  const since = new Date(Date.now() - minutes * 60_000);

  const logs = await prisma.logEntry.findMany({
    where: { timestamp: { gte: since } },
    select: { timestamp: true, level: true },
  });

  const buckets = new Map<string, { total: number; errors: number }>();
  for (const log of logs) {
    const bucketKey = new Date(log.timestamp).toISOString().slice(0, 16); // minute precision
    const bucket = buckets.get(bucketKey) ?? { total: 0, errors: 0 };
    bucket.total += 1;
    if (log.level === "ERROR") bucket.errors += 1;
    buckets.set(bucketKey, bucket);
  }

  const series = Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([minute, counts]) => ({ minute, ...counts }));

  res.json(series);
});
