import { Router } from "express";
import mongoose from "mongoose";
import { requireAuth } from "../middleware/auth";
import { Offer } from "../models/Offer";

const router = Router();

function toObjectId(id: string) {
  if (!mongoose.Types.ObjectId.isValid(id)) throw new Error("Invalid id");
  return new mongoose.Types.ObjectId(id);
}

function pickLang(req: any): "sv" | "en" {
  const q = String(req.query?.lang || "").toLowerCase();
  return q === "en" ? "en" : "sv";
}

// POST /offers  (lägg till item i offert)
router.post("/", requireAuth, async (req, res) => {
  try {
    const userId = (req as any).user.userId;

    const { valuationId, item } = req.body as {
      valuationId?: string;
      item?: {
        // legacy
        title?: string;

        // ✅ flerspråk
        titleSv?: string;
        titleEn?: string;

        priceSek: number;
      };
    };

    if (!valuationId || !item || item.priceSek === undefined) {
      return res.status(400).json({ ok: false, error: "Missing data (valuationId, item, item.priceSek)" });
    }

    const anyTitle = item.titleSv || item.titleEn || item.title;
    if (!anyTitle) {
      return res.status(400).json({ ok: false, error: "Missing data (item.titleSv/titleEn/title)" });
    }

    const valuationObjectId = toObjectId(valuationId);

    const normalizedItem = {
      // legacy title (för bakåtkompatibilitet)
      title: item.title || item.titleSv || item.titleEn,

      // ✅ spara båda så offert kan visas på rätt språk
      titleSv: item.titleSv || item.title || item.titleEn,
      titleEn: item.titleEn || item.title || item.titleSv,

      priceSek: Number(item.priceSek),
    };

    let offer = await Offer.findOne({ valuationId: valuationObjectId, userId });

    if (!offer) {
      offer = await Offer.create({
        valuationId: valuationObjectId,
        userId,
        items: [normalizedItem],
        totalSek: Number(normalizedItem.priceSek),
      });
    } else {
      offer.items.push(normalizedItem as any);
      offer.totalSek += Number(normalizedItem.priceSek);
      await offer.save();
    }

    res.json({ ok: true, offer });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /offers/:valuationId?lang=sv|en (hämta offert för valuation)
router.get("/:valuationId", requireAuth, async (req, res) => {
  try {
    const lang = pickLang(req);

    const userId = (req as any).user.userId;
    const valuationIdStr = req.params.valuationId;

    if (!valuationIdStr) return res.status(400).json({ ok: false, error: "Missing valuationId" });

    const valuationObjectId = toObjectId(valuationIdStr);

    const offer: any = await Offer.findOne({ valuationId: valuationObjectId, userId });

    if (!offer) {
      return res.json({ ok: true, offer: null });
    }

    // ✅ Mappa items så title alltid är rätt språk (men behåll rådata)
    const mapped = {
      _id: offer._id,
      valuationId: offer.valuationId,
      userId: offer.userId,
      totalSek: offer.totalSek,
      items: (offer.items || []).map((it: any) => {
        const titleOut =
          lang === "en"
            ? it.titleEn || it.title || it.titleSv
            : it.titleSv || it.title || it.titleEn;

        return {
          title: titleOut,
          titleSv: it.titleSv,
          titleEn: it.titleEn,
          priceSek: it.priceSek,
        };
      }),
    };

    res.json({ ok: true, offer: mapped });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
