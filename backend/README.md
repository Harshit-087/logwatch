# Vigil

Log aggregation and anomaly detection system (minor project).

## Setup

```bash
npm install
cp .env.example .env
# edit .env with your PostgreSQL connection string
npx prisma migrate dev --name init
npm run prisma:generate
```

## Run (two terminals)

Terminal 1 — API server + ingestion + anomaly detection:
```bash
npm run dev
```

Terminal 2 — fake log traffic generator (simulates 3 microservices, includes induced anomalies at 40s and 90s):
```bash
npm run generate-logs
```

## Endpoints

- `GET /api/logs?limit=100` — recent logs
- `GET /api/anomalies?limit=50` — recent flagged anomalies
- `GET /api/stats?minutes=15` — log volume / error rate per minute, for charting

## Architecture

```
log-generator.ts → app.log (file)
                       ↓
                  ingest.ts (polls file, parses, writes to Postgres)
                       ↓
                  PostgreSQL (LogEntry, Anomaly tables)
                       ↓
        anomaly.ts (rule checks every 5s) → Anomaly table
                       ↓
                  api.ts (REST endpoints) → frontend dashboard
```

## Anomaly rules (minor version — rule-based)

1. **Error spike**: ≥8 errors from one service in a rolling 1-minute window
2. **Repeated error**: same error message from one service ≥5 times in 1 minute
3. **Service silence**: no logs from a known service for 30+ seconds

## Next (major version)

- Multiple real network-connected agents instead of one shared log file (reuse TCP broker framing/delivery patterns)
- Replace rule-based checks with an Isolation Forest / statistical anomaly model
- LLM-generated plain-English incident summaries (reuse DevLog's LangChain pattern)
