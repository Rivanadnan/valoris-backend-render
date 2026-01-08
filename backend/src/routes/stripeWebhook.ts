import { Router } from "express";
import Stripe from "stripe";
import mongoose from "mongoose";
import { User } from "../models/User";
import { sendWelcomeEmail } from "../utils/mailer";

const router = Router();

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

if (!STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY missing");
if (!STRIPE_WEBHOOK_SECRET) throw new Error("STRIPE_WEBHOOK_SECRET missing");

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2025-12-15.clover" });

const ONBOARDING_TTL_SECONDS = 60 * 60 * 6; // 6h

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

router.post("/", async (req: any, res) => {
  const sig = req.headers["stripe-signature"] as string | undefined;
  if (!sig) return res.status(400).send("Missing stripe-signature");

  let event: Stripe.Event;

  try {
    // req.body måste vara RAW Buffer (du har redan express.raw i index.ts ✅)
    event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err: any) {
    console.error("❌ Webhook signature error:", err.message);
    return res.status(400).send("Webhook Error");
  }

  // Logga alltid eventtyp så du ser om webhooken ens kommer fram
  console.log("🔔 Stripe webhook received:", event.type);

  // Vi stödjer Payment Element (PaymentIntent) + ev Checkout
  const isIntentSucceeded = event.type === "payment_intent.succeeded";
  const isIntentFailed = event.type === "payment_intent.payment_failed";
  const isCheckout = event.type === "checkout.session.completed";

  if (!isIntentSucceeded && !isIntentFailed && !isCheckout) {
    return res.json({ received: true });
  }

  // 1) Hämta ref (onboarding id) ur metadata
  let ref: string | undefined;
  let paymentIntentId: string | undefined;

  if (isIntentSucceeded || isIntentFailed) {
    const intent = event.data.object as Stripe.PaymentIntent;
    ref = intent.metadata?.ref;
    paymentIntentId = intent.id;

    console.log(isIntentSucceeded ? "✅ payment_intent.succeeded" : "❌ payment_intent.payment_failed", {
      intentId: intent.id,
      ref,
      email: intent.metadata?.email,
    });
  }

  if (isCheckout) {
    const session = event.data.object as Stripe.Checkout.Session;
    ref = (session.client_reference_id as string | undefined) || (session.metadata?.ref as string | undefined);
    console.log("✅ checkout.session.completed", { sessionId: session.id, ref });
  }

  // Om vi saknar ref kan vi inte skapa konto
  if (!ref) {
    console.log("ℹ️ No ref in metadata -> skipping");
    return res.json({ received: true });
  }

  // Om betalning misslyckades: markera inget, bara logga
  if (isIntentFailed) {
    console.log("ℹ️ Payment failed for ref:", ref);
    return res.json({ received: true });
  }

  // 2) Skapa user från OnboardingSession
  try {
    const onboarding = await OnboardingSession.findById(ref);
    if (!onboarding) {
      console.error("❌ OnboardingSession not found/expired:", ref);
      return res.json({ received: true });
    }

    if (onboarding.usedAt) {
      console.log("ℹ️ Onboarding already used:", onboarding.email);
      return res.json({ received: true });
    }

    const { email, name, passwordHash } = onboarding;

    const exists = await User.findOne({ email });
    if (!exists) {
      await User.create({ name, email, passwordHash, role: "creator" });

      // Mail (valfritt, men du har det)
      await sendWelcomeEmail(email, {
        name,
        loginUrl: `${process.env.APP_URL || "http://localhost:5173"}/login`,
      });

      console.log("✅ CREATOR USER CREATED:", { email, ref, paymentIntentId });
    } else {
      console.log("ℹ️ User already exists:", email);
    }

    // Markera onboarding som använd (så det inte kan köras igen)
    await OnboardingSession.updateOne({ _id: onboarding._id }, { $set: { usedAt: new Date() } });

    return res.json({ received: true });
  } catch (err: any) {
    console.error("❌ Error handling webhook:", err.message);
    return res.json({ received: true });
  }
});

export default router;
