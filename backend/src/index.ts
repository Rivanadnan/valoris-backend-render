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

app.use(cors());
app.use(express.json());

// Debug (ok i dev)
if (process.env.NODE_ENV !== "production") {
  console.log("✅ ENV loaded:", {
    hasMongo: !!process.env.MONGO_URI,
    hasJwt: !!process.env.JWT_SECRET,
    hasStripeKey: !!process.env.STRIPE_SECRET_KEY,
    hasWebhookSecret: !!process.env.STRIPE_WEBHOOK_SECRET,
    appUrl: process.env.APP_URL,
  });
}

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
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ API listening on port ${PORT}`);
});
