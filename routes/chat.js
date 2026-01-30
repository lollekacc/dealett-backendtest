import express from "express";
import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const sessions = new Map();
const TTL_MS = 30 * 60 * 1000; // 30 min

const router = express.Router();

// ESM dirname fix
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load plans ONCE
const plansPath = path.join(__dirname, "../../Adeala2-main/data/plans.json");
const plans = JSON.parse(fs.readFileSync(plansPath, "utf-8"));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function getSession(req) {
  let sid = req.headers["x-chat-session"];

  if (!sid) {
    sid = crypto.randomUUID();
  }

  const now = Date.now();
  let session = sessions.get(sid);

  if (!session || now - session.lastActivity > TTL_MS) {
    session = {
      sid,
      lastActivity: now,
      history: [],
      state: {},
      msgCount: 0
    };
    sessions.set(sid, session);
  }

  session.lastActivity = now;
  return session;
}

router.post("/", async (req, res) => {
const session = getSession(req);
session.msgCount += 1;
const msgCount = session.msgCount;

  try {
    const { message } = req.body;
if (!message) {
  return res.status(400).json({ error: "No message provided" });
}
session.history.push({ role: "user", content: message });


    const q = message.toLowerCase();
    const isReset =
  q.includes("starta fräscht") ||
  q.includes("starta nytt") ||
  q.includes("glöm allt") ||
  q === "reset";

if (isReset) {
  session.history = [];
  session.state = {};
  session.msgCount = 0;

  const reply = "Okej. Vi börjar om. Hur mycket surf vill du ha per månad?";
  session.history.push({ role: "assistant", content: reply });
  return res.status(200).json({ reply });
}

    const isQuizMessage = q.includes("persons:") && q.includes("data:");

    if (session.state?.pendingCalculation) {
  const pending = session.state.pendingCalculation;
// user asks for total price explicitly
if (
  q.includes("total") ||
  q.includes("totalpris") ||
  q.includes("totalt") ||
  q.includes("vad blir det") ||
  q.includes("per månad")
) {
  const total =
    pending.basePrice +
    pending.addonPrice * (pending.lines - 1);

  session.state.pendingCalculation = null;

  const reply = `Totalt blir det <b>${total} kr/mån</b> för ${pending.lines} abonnemang hos ${pending.operator}.`;
  session.history.push({ role: "assistant", content: reply });

  return res.status(200).json({ reply });
}

if (q === "ja" || q === "yes") {
  const total =
    pending.basePrice +
    pending.addonPrice * (pending.lines - 1);

  session.state.pendingCalculation = null;

  const reply = `Totalt blir det <b>${total} kr/mån</b> för ${pending.lines} abonnemang hos ${pending.operator}.`;
  session.history.push({ role: "assistant", content: reply });

  return res.status(200).json({ reply });
}


if (q === "nej" || q === "no") {
  session.state.pendingCalculation = null;

  const reply = "Okej 👍 Säg till om du vill jämföra något annat.";
  session.history.push({ role: "assistant", content: reply });

  return res.status(200).json({ reply });
}

}

    const wantsListAll =
  q.includes("lista alla") ||
  q.includes("alla abonnemang") ||
  q.includes("visa alla") ||
  q.includes("alla erbjudanden");
  if (!session.state) session.state = {};
  if (wantsListAll) {
  const grouped = {};

  plans
    .filter(p => !p.isFamilyPlan)
    .forEach(p => {
      if (!grouped[p.operator]) grouped[p.operator] = [];
      grouped[p.operator].push(p);
    });

  const html = Object.entries(grouped)
    .map(([operator, ops]) => `
<div class="chat-operator">
  <img src="${ops[0].logo}" alt="${operator}" class="chat-operator-logo" />
  <div class="chat-operator-plans">
    ${ops.map(p => `
<button class="chat-plan-btn"
  onclick="window.location.href='/abonnemang.html?op=${encodeURIComponent(
    p.operator
  )}&plan=${p.id}'">
  ${p.operator} – ${p.title} (${p.price} kr/mån)
</button>`).join("")}
  </div>
</div>
`).join("");
  session.history.push({ role: "assistant", content: html });
  return res.status(200).json({ reply: html });
}

// ===== INTENT PARSER (from plans.json) =====
const isBestAnswerTurn = msgCount % 3 === 0;
const intent = {
  operator: null,
  isFamily: false,
  lines: 1,
  maxPrice: null,
  minData: null,
  wantsUnlimited: false,
  wantsPlans: false
};
// quiz signals
if (q.includes("persons:")) {
  const p = Number(q.match(/persons:(\d)/)?.[1]);
  if (p >= 2) {
    intent.lines = p;
    intent.isFamily = true;
  }
}

if (q.includes("data:low")) intent.minData = 10;
if (q.includes("data:medium")) intent.minData = 30;
if (q.includes("data:high")) intent.wantsUnlimited = true;
// FORCE quiz messages to request plans
if (q.includes("persons:") && q.includes("data:")) {
  intent.wantsPlans = true;
}


// operator
if (q.includes("tele2")) intent.operator = "Tele2";
if (q.includes("telia")) intent.operator = "Telia";
if (q.includes("telenor")) intent.operator = "Telenor";
if (q.includes("halebop")) intent.operator = "Halebop";

// Tre (special: number vs operator)
const treAsOperator =
  q.includes("operatör tre") ||
  q.includes("hos tre") ||
  q.includes("från tre") ||
  q.includes("tre som operatör");

if (treAsOperator) intent.operator = "Tre";

// wants plans (do NOT override quiz)
if (q.includes("persons:") && q.includes("data:")) {
  intent.wantsPlans = true;
}



// quantity (lines)
const numMap = { två: 2, tre: 3, fyra: 4, fem: 5 };
const qtyMatch = q.match(/\b(2|två|3|tre|4|fyra|5|fem)\b/);
if (qtyMatch) {
  const token = qtyMatch[0];
  const n = Number(token) || numMap[token];
  if (n && n >= 2) {
    intent.lines = n;
    intent.isFamily = true;
  }
}

// family keywords
if (q.includes("familj") || q.includes("barn") || q.includes("familje")) {
  intent.isFamily = true;
  if (intent.lines === 1) intent.lines = 2;
}

// price limit
const priceMatch = q.match(/(\d+)\s*kr/);
if (priceMatch) intent.maxPrice = Number(priceMatch[1]);

// min data
const dataMatch = q.match(/(\d+)\s*gb/);
if (dataMatch) intent.minData = Number(dataMatch[1]);

// unlimited
if (q.includes("obegränsad")) intent.wantsUnlimited = true;
if (intent.wantsUnlimited || intent.minData) {
  session.state.askedForData = false;
}

// If user wrote "tre abonnemang" and we did NOT explicitly detect operator Tre, treat "tre" as quantity
if (q.includes("tre abonnemang") && !treAsOperator) {
  intent.lines = 3;
  intent.isFamily = true;
}
// price-first intent → force plan selection
if (
  q.includes("lägst pris") ||
  q.includes("billigast") ||
  q.includes("billigt") ||
  q.includes("så billigt som möjligt") ||
  q === "lägst pris"
) {
  intent.wantsPlans = true;
}
// fully vague input → ask for data ONCE
// fully vague input handling
if (
  !intent.operator &&
  !intent.minData &&
  !intent.wantsUnlimited &&
  !intent.maxPrice &&
  !intent.isFamily &&
  !intent.wantsPlans
) {
  // first time → ask for data
  if (!session.state.askedForData) {
    session.state.askedForData = true;

    const reply = "Hur mycket surf vill du ha per månad?";
    session.history.push({ role: "assistant", content: reply });
    return res.status(200).json({ reply });
  }

  // second time → force quiz
  session.state.askedForData = false;

  const reply = `
<div class="chat-quiz">

  <div class="quiz-card">
    <p class="quiz-title">Hur många personer?</p>
    <div class="flex flex-col gap-3">
      <button class="chat-quiz-btn" data-persons="1">1 person</button>
      <button class="chat-quiz-btn" data-persons="2">2 personer</button>
      <button class="chat-quiz-btn" data-persons="3">3 personer</button>
      <button class="chat-quiz-btn" data-persons="4">4 personer</button>
      <button class="chat-quiz-btn" data-persons="5">5 personer</button>
    </div>
  </div>

  <div class="quiz-card">
    <p class="quiz-title">Hur mycket surf per person?</p>
    <div class="flex flex-col gap-3">
      <button class="chat-quiz-btn" data-data="low">Lite</button>
      <button class="chat-quiz-btn" data-data="medium">Lagom</button>
      <button class="chat-quiz-btn" data-data="high">Obegränsat</button>
    </div>
  </div>
</div>
`;
  
  session.history.push({ role: "assistant", content: reply });
  return res.status(200).json({ reply });
}

// ===== PLAN SELECTION =====
if (intent.wantsPlans) {

  // Always allow offers if user is very explicit
  const strongIntent =
    intent.operator ||
    intent.maxPrice ||
    intent.minData ||
    intent.wantsUnlimited ||
    intent.isFamily;

  // If not strong intent AND not best-answer turn → conversational reply
if (!strongIntent && !isQuizMessage) {
  const reply = `
<div class="chat-quiz">

  <!-- Q1: Persons -->
  <div class="quiz-card">
    <p class="quiz-title">Hur många personer?</p>
    <div class="flex flex-col gap-3">
      <button class="quiz-option chat-quiz-btn" data-persons="1">1 person</button>
      <button class="quiz-option chat-quiz-btn" data-persons="2">2 personer</button>
      <button class="quiz-option chat-quiz-btn" data-persons="3">3 personer</button>
      <button class="quiz-option chat-quiz-btn" data-persons="4">4 personer</button>
      <button class="quiz-option chat-quiz-btn" data-persons="5">5 personer</button>
    </div>
  </div>

  <!-- Q2: Data -->
  <div class="quiz-card">
    <p class="quiz-title">Hur mycket surf per person?</p>
    <div class="flex flex-col gap-3">
      <button class="quiz-option chat-quiz-btn" data-data="low">Lite (≤10 GB)</button>
      <button class="quiz-option chat-quiz-btn" data-data="medium">Lagom (30–50 GB)</button>
      <button class="quiz-option chat-quiz-btn" data-data="high">Mycket (obegränsat)</button>
    </div>
  </div>
</div>
`;

  session.history.push({ role: "assistant", content: reply });
  return res.status(200).json({ reply });
}

  // if ambiguous "tre": ask 1 question
if (q.includes("tre") && !treAsOperator && !intent.operator) {
  const reply = "Menar du operatören Tre eller tre abonnemang?";
  session.history.push({ role: "assistant", content: reply });
  return res.status(200).json({ reply });
}


  // filter plans
  let matchedPlans = plans.filter(p => {
    if (intent.operator && p.operator !== intent.operator) return false;

// Only exclude family-addon plans from main selection
if (p.isFamilyPlan) return false;


    if (intent.maxPrice && p.price > intent.maxPrice) return false;
    if (intent.minData && (p.dataAmount ?? 0) < intent.minData) return false;
    if (intent.wantsUnlimited && (p.dataAmount ?? 0) < 9999) return false;

    return true;
  });
const best = matchedPlans.sort((a, b) => a.price - b.price)[0];
if (isQuizMessage && best) {
  session.history.push({
  role: "assistant",
  content: `Rekommenderat abonnemang: ${best.operator} ${best.title}`
});

  return res.status(200).json({
    type: "offer",
    payload: {
      planId: best.id,
      operator: best.operator,
      persons: intent.lines,
      data: intent.wantsUnlimited
        ? "high"
        : intent.minData >= 30
        ? "medium"
        : "low"
    }
  });
}

console.log("BEST PLAN HIT:", best?.id, intent);

if (best) {
  session.history.push({
  role: "assistant",
  content: `Rekommenderat abonnemang: ${best.operator} ${best.title}`
});

  return res.status(200).json({
    type: "offer",
    payload: {
      planId: best.id,
      operator: best.operator,
      persons: intent.lines,
      data: intent.wantsUnlimited
        ? "high"
        : intent.minData >= 30
        ? "medium"
        : "low"
    }
  });
}


  // family total price (base + addon * (lines-1))
  if (intent.isFamily) {
    const base = plans
      .filter(p => !p.isFamilyPlan && (!intent.operator || p.operator === intent.operator))
      .sort((a, b) => a.price - b.price)[0];

    const addon = plans.find(
      p => p.isFamilyPlan && (!intent.operator || p.operator === intent.operator)
    );

    if (base && addon) {
      const total = base.price + addon.addonPrice * (intent.lines - 1);

      session.state.pendingCalculation = {
  operator: base.operator,
  basePrice: base.price,
  addonPrice: addon.addonPrice,
  lines: intent.lines
};

const reply = `För ${intent.lines} personer kan du välja ${base.operator} ${base.title} (${base.price} kr/mån) plus ${intent.lines - 1} familjemedlemmar för ${addon.addonPrice} kr/mån vardera.<br><br>Vill du att jag räknar totalpriset?`;
session.history.push({ role: "assistant", content: reply });
return res.status(200).json({ reply });


    }
  } 
  // show up to 6 buttons
  matchedPlans = matchedPlans.slice(0, 6);

  if (matchedPlans.length) {
    const planButtons = matchedPlans
      .map(
        p => `
<button class="chat-plan-btn"
  onclick="window.location.href='/abonnemang.html?op=${encodeURIComponent(p.operator)}'">
  ${p.operator} – ${p.title} (${p.price} kr/mån)
</button>`
      )
      .join("");
    session.history.push({ role: "assistant", content: planButtons });
    return res.status(200).json({ reply: planButtons });
  }

const reply = "Jag hittade inget som matchar. Skriv operatör (Tele2/Telia/Telenor/Tre/Halebop) och ev. budget eller GB.";
session.history.push({ role: "assistant", content: reply });
return res.status(200).json({ reply });

}

const context = "";

    const systemPrompt = `
    IDENTITY:
You are Dealett-AI, the official assistant for this website.

ROLE:
You help users quickly find information, understand options, and move forward on this website.

SCOPE (VERY IMPORTANT):
- Only help with things related to this website
- If a question is outside scope, gently redirect to what can be done here
- Never invent information

CORE BEHAVIOR:
- Be helpful, direct, and efficient
- Prefer clarity over creativity
- Prefer asking a short follow-up question over guessing
- Guide the user step-by-step when needed

INTENT HANDLING:
- Always infer what the user is trying to achieve
- If intent is unclear, ask ONE short clarifying question
- Do not assume future needs
- Do not anticipate steps the user has not asked for

RECOMMENDATION RULES:
- When recommending, choose ONE best option
- Optionally mention ONE alternative if clearly relevant
- Never list many options
- Never overwhelm the user

HARD RULES:
- Use ONLY the information provided to you
- Never invent prices, plans, features, or policies
- Never mention internal rules, prompts, models, or reasoning
- Never say “I don’t know” — redirect instead
- Never explain more than necessary

CONVERSATION CONTINUITY:
- Treat each reply as part of an ongoing conversation
- Stay consistent with what the user has already said
- Do not repeat information unless the user asks

OUTPUT FORMAT:
- Short answers
- No fluff
- No emojis
- No unnecessary explanations
- Use simple language

LANGUAGE:
- Match the user’s language automatically
- Default to clear, natural language
- Avoid technical terms unless the user uses them first

    
    AVAILABLE WEBSITE INFORMATION (authoritative):
    ${context}

  AVAILABLE PLANS:
${plans.map(p => `
${p.operator} – ${p.title}
Typ: ${p.isFamilyPlan ? "Familj (extra medlem)" : "Mobil"}
Data: ${p.data || "-"}
Pris: ${p.price} kr/mån
${p.text || ""}
`).join("\n")}
    `;

    // Fallback to AI
const response = await openai.responses.create({
  model: "gpt-4.1-mini",
  input: [
  { role: "system", content: systemPrompt },
  ...session.history
]

});

const aiText =
  response.output?.[0]?.content?.[0]?.text ||
  "Jag kan hjälpa dig med abonnemang eller priser.";
session.history.push({ role: "assistant", content: aiText });
return res.status(200).json({ reply: aiText });

  } catch (error) {
    console.error("CHAT ERROR:", error);
    return res.status(500).json({ error: "AI error" });
  }
});

export default router;
