import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { Valuation } from "../models/Valuation";

const router = Router();

type Features = {
  balcony?: boolean;
  renovatedKitchen?: boolean;
  renovatedBathroom?: boolean;
  parking?: boolean;
  elevator?: boolean;
  storage?: boolean;
  garden?: boolean;
  seaView?: boolean;
  fireplace?: boolean;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

// 🔒 Tar bara emot kända feature-keys (ignorera skräp från client)
function sanitizeFeatures(input: any): Features {
  const safe: Features = {};
  if (!input || typeof input !== "object") return safe;

  const keys: (keyof Features)[] = [
    "balcony",
    "renovatedKitchen",
    "renovatedBathroom",
    "parking",
    "elevator",
    "storage",
    "garden",
    "seaView",
    "fireplace",
  ];

  for (const k of keys) {
    if (typeof input[k] === "boolean") safe[k] = input[k];
  }
  return safe;
}

// Enkel “estimat-motor” (nu med features)
function estimatePriceSek(input: {
  propertyType: "apartment" | "house";
  livingArea: number;
  rooms?: number;
  city?: string;
  yearBuilt?: number | null;
  features?: Features;
}) {
  const basePerSqm = input.propertyType === "apartment" ? 55000 : 38000;
  const roomFactor = input.rooms && input.rooms >= 4 ? 1.05 : 1.0;

  let estimate = input.livingArea * basePerSqm * roomFactor;

  // Liten ålder-effekt (valfritt)
  if (typeof input.yearBuilt === "number") {
    const age = clamp(new Date().getFullYear() - input.yearBuilt, 0, 200);
    estimate *= 1 - clamp(age * 0.001, 0, 0.12); // max -12%
  }

  // ✅ Features-påslag
  const f = input.features || {};
  let featureMultiplier = 1;

  if (f.balcony) featureMultiplier += 0.02; // +2%
  if (f.renovatedKitchen) featureMultiplier += 0.03; // +3%
  if (f.renovatedBathroom) featureMultiplier += 0.025; // +2.5%
  if (f.parking) featureMultiplier += 0.015; // +1.5%
  if (f.storage) featureMultiplier += 0.01; // +1%
  if (f.seaView) featureMultiplier += 0.05; // +5%
  if (f.fireplace) featureMultiplier += 0.01; // +1%

  if (input.propertyType === "apartment" && f.elevator) featureMultiplier += 0.015; // +1.5%
  if (input.propertyType === "house" && f.garden) featureMultiplier += 0.02; // +2%

  featureMultiplier = clamp(featureMultiplier, 0.85, 1.25);
  estimate *= featureMultiplier;

  estimate = Math.round(estimate);

  const low = Math.round(estimate * 0.92);
  const high = Math.round(estimate * 1.08);

  const confidence = 62;

  return { estimate, low, high, confidence };
}

// POST /valuations  (skapa värdering)
router.post("/", requireAuth, async (req, res) => {
  try {
    const userId = (req as any).user.userId;

    const { address, city, propertyType, livingArea, rooms, yearBuilt, features } = req.body as {
      address: string;
      city?: string;
      propertyType: "apartment" | "house";
      livingArea: number | string;
      rooms?: number | string;
      yearBuilt?: number | string | null;
      features?: Features;
    };

    if (!address || !propertyType || !livingArea) {
      return res.status(400).json({ ok: false, error: "address, propertyType, livingArea krävs" });
    }

    const livingAreaNum = Number(livingArea);
    const roomsNum = Number(rooms || 1);
    const yearBuiltNum =
      yearBuilt === null || yearBuilt === undefined || yearBuilt === "" ? null : Number(yearBuilt);

    const estimateInput: {
      propertyType: "apartment" | "house";
      livingArea: number;
      rooms?: number;
      city?: string;
      yearBuilt?: number | null;
      features?: Features;
    } = {
      propertyType,
      livingArea: livingAreaNum,
      rooms: roomsNum,
      yearBuilt: yearBuiltNum,
    };

    if (typeof city === "string" && city.trim() !== "") {
      estimateInput.city = city.trim();
    }

    const safeFeatures = sanitizeFeatures(features);
    estimateInput.features = safeFeatures;

    const { estimate, low, high, confidence } = estimatePriceSek(estimateInput);

    const valuation = await Valuation.create({
      userId,
      address,
      city: city || "",
      propertyType,
      livingArea: livingAreaNum,
      rooms: roomsNum,
      yearBuilt: yearBuiltNum,

      features: safeFeatures,

      estimateSek: estimate,
      lowSek: low,
      highSek: high,
      confidence,
      status: "done",
    });

    res.json({ ok: true, valuation });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ✅ PATCH /valuations/:id/features (uppdatera features + räkna om)
router.patch("/:id/features", requireAuth, async (req, res) => {
  try {
    const userId = (req as any).user.userId;
    const { id } = req.params;

    const valuation = await Valuation.findById(id);
    if (!valuation) return res.status(404).json({ ok: false, error: "Not found" });

    // säkerhet: bara ägaren får ändra
    if (String((valuation as any).userId) !== String(userId)) {
      return res.status(403).json({ ok: false, error: "Forbidden" });
    }

    const safeFeatures = sanitizeFeatures((req.body as any)?.features);

    // spara features
    (valuation as any).features = safeFeatures;

    // räkna om pris baserat på befintlig input + nya features
    const { estimate, low, high, confidence } = estimatePriceSek({
      propertyType: (valuation as any).propertyType,
      livingArea: Number((valuation as any).livingArea),
      rooms: Number((valuation as any).rooms || 1),
      city: (valuation as any).city || undefined,
      yearBuilt: (valuation as any).yearBuilt ?? null,
      features: safeFeatures,
    });

    (valuation as any).estimateSek = estimate;
    (valuation as any).lowSek = low;
    (valuation as any).highSek = high;
    (valuation as any).confidence = confidence;

    await valuation.save();

    res.json({ ok: true, valuation });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /valuations/mine (mina värderingar)
router.get("/mine", requireAuth, async (req, res) => {
  try {
    const userId = (req as any).user.userId;
    const valuations = await Valuation.find({ userId }).sort({ createdAt: -1 });
    res.json({ ok: true, valuations });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ✅ GET /valuations/:id (detaljer för 1 värdering)
router.get("/:id", requireAuth, async (req, res) => {
  try {
    const userId = (req as any).user.userId;
    const { id } = req.params;

    const valuation = await Valuation.findById(id);
    if (!valuation) return res.status(404).json({ ok: false, error: "Not found" });

    // säkerhet: bara ägaren får se
    if (String((valuation as any).userId) !== String(userId)) {
      return res.status(403).json({ ok: false, error: "Forbidden" });
    }

    res.json({ ok: true, valuation });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
