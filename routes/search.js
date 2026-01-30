import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const router = express.Router();

// Fix __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load plans.json manually
const plansPath = path.join(__dirname, "../../Adeala2-main/data/plans.json");
const plans = JSON.parse(fs.readFileSync(plansPath, "utf-8"));

router.post("/", (req, res) => {
  const { query } = req.body;

  if (!query) {
    return res.json([]);
  }

  const q = query.toLowerCase();

  const results = plans.filter(plan =>
    plan.title?.toLowerCase().includes(q) ||
    plan.operator?.toLowerCase().includes(q)
  );

  res.json(results.slice(0, 5));
});

export default router;
