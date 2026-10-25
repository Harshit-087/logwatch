import express from "express";
import dotenv from "dotenv"
import cors from "cors";
import { apiRouter } from "./routes/api";
import { startIngestion } from "./lib/ingest";
import { startAnomalyDetection } from "./lib/anomaly";
dotenv.config()

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());
app.use("/api", apiRouter);

app.get("/", (_req, res) => {
  res.json({ status: "Vigil is running" });
});

app.listen(PORT, () => {
  console.log(`[vigil] server listening on http://localhost:${PORT}`);
  startIngestion();
  startAnomalyDetection();
});
