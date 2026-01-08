import { Router } from "express";
import Stripe from "stripe";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const router = Router();

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
if (!STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY missing");

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2023-10-16" });

const ONBOARDING_TTL_SECONDS = 60 * 60 * 6; // 6h
const PRICE_SEK = 199;

type OnboardingSessionDoc = {
  _id: mongoose.Types.ObjectId;
  name: string;
  email: string;
  passwordHash: string;
  role: "creator";
  usedAt?: Date | null;
  createdAt: Date;
};

const OnboardingSession =
  (mongoose.models.OnboardingSession as mongoose.Model<OnboardingSessionDoc>) ||
  mongoose.model<OnboardingSessionDoc>(
    "OnboardingSession",
    new mongoose.Schema<OnboardingSessionDoc>(
      {
        name: { type: String, required: true, trim: true },
        email: { type: String, required: true, lowercase: true, trim: true, index: true },
        passwordHash: { type: String, required: true },
        role: { type: String, enum: ["creator"], required: true },
        usedAt: { type: Date, default: null },
        createdAt: { type: Date, default: Date.now, expires: ONBOARDING_TTL_SECONDS },
      },
      { versionKey: false }
    )
  );

// ✅ FRONTEND kallar /onboard/creator/create-intent
router.post("/creator/create-intent", async (req, res) => {
  try {
    const { name, email, password } = req.body as { name: string; email: string; password: string };

    if (!name?.trim() || !email?.trim() || !password) {
      return res.status(400).json({ ok: false, error: "Missing fields" });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const passwordHash = await bcrypt.hash(password, 10);

    const onboarding = await OnboardingSession.create({
      name: name.trim(),
      email: normalizedEmail,
      passwordHash,
      role: "creator",
    });

    const intent = await stripe.paymentIntents.create({
      amount: PRICE_SEK * 100,
      currency: "sek",
      automatic_payment_methods: { enabled: true },
      metadata: {
        ref: String(onboarding._id),
        email: normalizedEmail,
        role: "creator",
      },
      description: "Valoris – Creator onboarding (199 SEK)",
    });

    return res.json({
      ok: true,
      clientSecret: intent.client_secret,
      ref: String(onboarding._id),
    });
  } catch (err: any) {
    console.error("create-intent error:", err.message);
    return res.status(500).json({ ok: false, error: "Failed to create payment intent" });
  }
});

export default router;
