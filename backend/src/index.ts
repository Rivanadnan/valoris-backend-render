import dotenv from "dotenv";

// Lokal dev: läs .env
dotenv.config();

import express from "express";
import cors from "cors";
import mongoose from "mongoose";

import { requireAuth } from "./middleware/auth";
import { User } from "./models/User";

import authRouter from "./routes/auth";
import onboardRouter from "./routes/onboard";
import stripeWebhookRouter from "./routes/stripeWebhook";

import valuationsRouter from "./routes/valuations";
import extrasRouter from "./routes/extras";
import offersRouter from "./routes/offers";

const app = express();

/**
 * ✅ MongoDB connection cache (serverless-friendly, funkar även på Render)
 */
declare global {
  // eslint-disable-next-line no-var
  var __mongooseConn:
    | { promise: Promise<typeof mongoose> | null; conn: typeof mongoose | null }
    | undefined;
}

global.__mongooseConn = global.__mongooseConn || { promise: null, conn: null };

async function connectDb() {
  if (global.__mongooseConn?.conn) return global.__mongooseConn.conn;

  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI saknas");
  }

  if (!global.__mongooseConn?.promise) {
    global.__mongooseConn = global.__mongooseConn || { promise: null, conn: null };
    global.__mongooseConn.promise = mongoose.connect(process.env.MONGO_URI);
  }

  global.__mongooseConn.conn = await global.__mongooseConn.promise;
  return global.__mongooseConn.conn;
}

/**
 * ✅ DB-middleware (körs innan routes)
 */
app.use(async (_req, res, next) => {
  try {
    await connectDb();
    next();
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || "DB connection failed" });
  }
});

/**
 * ✅ Om du fortfarande har frontend som anropar /api/... (tidigare Vercel)
 * Så strippar vi /api prefix.
 */
app.use((req, _res, next) => {
  if (req.url.startsWith("/api/")) req.url = req.url.slice(4); // tar bort "/api"
  if (req.url === "/api") req.url = "/"; // edge case
  next();
});

/**
 * ⚠️ Stripe webhook MUST ligga före express.json()
 * POST /webhooks/stripe
 */
app.use("/webhooks/stripe", express.raw({ type: "application/json" }), stripeWebhookRouter);

/**
 * ✅ CORS (robust)
 * - FRONTEND_URL kan råka ha trailing slash -> vi normaliserar
 * - Origin matchar EXAKT, så vi normaliserar origin också
 */
function normalizeOrigin(url?: string) {
  if (!url) return "";
  return url.trim().replace(/\/+$/, ""); // tar bort trailing slashes
}

const allowedOrigins = [
  normalizeOrigin(process.env.FRONTEND_URL), // prod
  "http://localhost:5173", // dev
].filter(Boolean) as string[];

function isAllowedOrigin(origin: string) {
  const o = normalizeOrigin(origin);

  // Exakt whitelist
  if (allowedOrigins.includes(o)) return true;

  // Tillåt Vercel preview-domäner (valfritt men hjälper i verkligheten)
  if (o.endsWith(".vercel.app")) return true;

  return false;
}

app.use(
  cors({
    origin: (origin, callback) => {
      // Tillåt requests utan origin (curl/server-to-server)
      if (!origin) return callback(null, true);

      if (isAllowedOrigin(origin)) return callback(null, true);

      // Istället för att krascha hårt: blocka snyggt
      return callback(null, false);
    },
    credentials: true,
  })
);

/**
 * Om CORS blockar (origin: false), kan Express annars svara konstigt.
 * Vi fångar det med en tydlig response på preflight & vanliga requests.
 */
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && !isAllowedOrigin(origin)) {
    return res.status(403).json({ ok: false, error: `CORS blocked for origin: ${origin}` });
  }
  next();
});

app.use(express.json());

// Logga även i production (hjälper när man deployar)
console.log("✅ FRONTEND_URL (raw):", process.env.FRONTEND_URL);
console.log("✅ CORS allowed origins:", allowedOrigins);

// Health
app.get("/health", (_req, res) => {
  res.json({ ok: true, app: "Valoris API" });
});

// Routes
app.use("/auth", authRouter);
app.use("/onboard", onboardRouter);

app.use("/valuations", valuationsRouter);
app.use("/extras", extrasRouter);
app.use("/offers", offersRouter);

// Test auth
app.get("/me", requireAuth, (req, res) => {
  res.json({ ok: true, user: req.user });
});

// Dev helper
if (process.env.NODE_ENV !== "production") {
  app.post("/test/create-user", async (_req, res) => {
    try {
      const newUser = await User.create({
        name: "Test User",
        email: `test${Date.now()}@mail.com`,
        passwordHash: "not-real-hash",
        role: "user",
      });

      res.json({ ok: true, user: newUser });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });
}

/**
 * ✅ Render (och vanlig Node): måste lyssna på PORT
 */
const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ API listening on port ${PORT}`);
});
