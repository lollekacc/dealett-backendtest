import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const router = express.Router();

// Fix __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load plans.json manually
const plansPath = path.join(__dirname, "../plans.json");
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



// next part????

// offers.engine.js
// PURE DATA + LOGIC ONLY

let PLANS_CACHE = [];

export async function loadPlansOnce() {
  if (PLANS_CACHE.length) return PLANS_CACHE;

  const res = await fetch("./data/plans.json");
  PLANS_CACHE = await res.json();
  return PLANS_CACHE;
}

function getFamilyAddon(plans, operator) {
  return plans.find(p =>
    p.operator === operator &&
    p.isFamilyPlan === true &&
    p.familyPriceType === "addon"
  );
}

export function filterPlans(plans, state) {
  return plans
    .filter(p => !p.isFamilyPlan)
    .filter(p => !state.operator || p.operator === state.operator)
    .filter(p => {
      if (state.data === "low") return p.dataAmount < 30;
      if (state.data === "medium") return p.dataAmount >= 20 && p.dataAmount < 999;
      if (state.data === "high") return p.dataAmount >= 999;
      return true;
    })
    .map(p => pricePlan(p, plans, state))
    .filter(Boolean)
    .sort((a, b) => a.finalPrice - b.finalPrice);
}

function pricePlan(plan, plans, state) {
  let totalPrice = plan.price;
  let pricePerPerson = plan.price;

  if (state.persons > 1) {
    const addon = getFamilyAddon(plans, plan.operator);
    if (!addon) return null;

    totalPrice =
      plan.price + (state.persons - 1) * addon.addonPrice;

    pricePerPerson = Math.round(totalPrice / state.persons);
  }

  return {
    ...plan,
    finalPrice: totalPrice,
    pricePerPerson
  };
}

export function hasValidPlan(plans, state) {
  return plans.some(p => {
    if (p.isFamilyPlan) return false;
    if (state.operator && p.operator !== state.operator) return false;

    if (state.data === "low" && p.dataAmount >= 30) return false;
    if (state.data === "medium" && (p.dataAmount < 20 || p.dataAmount >= 999)) return false;
    if (state.data === "high" && p.dataAmount < 999) return false;

    return true;
  });
}

export function initialOffers(plans) {
  return plans
    .filter(p => !p.isFamilyPlan)
    .map(p => ({
      ...p,
      finalPrice: p.price,
      pricePerPerson: p.price
    }))
    .sort((a, b) => a.finalPrice - b.finalPrice);
}