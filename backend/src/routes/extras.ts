import { Router } from "express";
import mongoose from "mongoose";
import { requireAuth, requireRole } from "../middleware/auth";
import { ExtraService } from "../models/ExtraService";

const router = Router();

// Helper: säkra ObjectId
function toObjectId(id: string) {
  if (!mongoose.Types.ObjectId.isValid(id)) throw new Error("Invalid id");
  return new mongoose.Types.ObjectId(id);
}

function pickLang(req: any): "sv" | "en" {
  const q = String(req.query?.lang || "").toLowerCase();
  return q === "en" ? "en" : "sv";
}

/**
 * ADMIN/CREATOR:
 * GET /extras/admin/all
 * Lista alla extras (för admin/mäklare).
 */
router.get("/admin/all", requireAuth, requireRole("admin", "creator"), async (_req, res) => {
  try {
    const extras = await ExtraService.find().sort({ updatedAt: -1 });
    res.json({ ok: true, extras });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * ADMIN/CREATOR:
 * PATCH /extras/admin/:id
 * Uppdatera (sv/en + legacy)
 */
router.patch("/admin/:id", requireAuth, requireRole("admin", "creator"), async (req, res) => {
  try {
    const idStr = req.params.id;
    if (!idStr) return res.status(400).json({ ok: false, error: "Missing id" });

    const id = toObjectId(idStr);

    const {
      title,
      description,
      titleSv,
      titleEn,
      descriptionSv,
      descriptionEn,
      priceSek,
      propertyType,
    } = req.body;

    const updated = await ExtraService.findByIdAndUpdate(
      id,
      {
        ...(title !== undefined ? { title } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(titleSv !== undefined ? { titleSv } : {}),
        ...(titleEn !== undefined ? { titleEn } : {}),
        ...(descriptionSv !== undefined ? { descriptionSv } : {}),
        ...(descriptionEn !== undefined ? { descriptionEn } : {}),
        ...(priceSek !== undefined ? { priceSek: Number(priceSek) } : {}),
        ...(propertyType !== undefined ? { propertyType } : {}),
      },
      { new: true }
    );

    if (!updated) return res.status(404).json({ ok: false, error: "Not found" });

    res.json({ ok: true, extra: updated });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * CREATOR/ADMIN:
 * GET /extras/:valuationId?lang=sv|en
 */
router.get("/:valuationId", requireAuth, requireRole("admin", "creator"), async (req, res) => {
  try {
    const lang = pickLang(req);

    const valuationIdStr = req.params.valuationId;
    if (!valuationIdStr) return res.status(400).json({ ok: false, error: "Missing valuationId" });

    const valuationId = toObjectId(valuationIdStr);

    let extras = await ExtraService.find({ valuationId }).sort({ createdAt: 1 });

    // Skapa defaults om tomt
    if (extras.length === 0) {
      const defaults = [
        {
          valuationId,
          // Legacy (sv)
          title: "Homestyling",
          description: "Förbered bostaden för visning (möblering + styling).",

          // ✅ Flerspråk
          titleSv: "Homestyling",
          titleEn: "Home staging",
          descriptionSv: "Förbered bostaden för visning (möblering + styling).",
          descriptionEn: "Prepare the home for viewings (furnishing + styling).",

          priceSek: 15000,
          propertyType: "both" as const,
        },
        {
          valuationId,
          title: "Proffsfoto",
          description: "Fotograf + redigering för bättre annons.",

          titleSv: "Proffsfoto",
          titleEn: "Professional photos",
          descriptionSv: "Fotograf + redigering för bättre annons.",
          descriptionEn: "Photographer + editing for a better listing.",

          priceSek: 4500,
          propertyType: "both" as const,
        },
        {
          valuationId,
          title: "3D / Planritning",
          description: "Planritning / 3D-visning för annons.",

          titleSv: "3D / Planritning",
          titleEn: "3D / Floor plan",
          descriptionSv: "Planritning / 3D-visning för annons.",
          descriptionEn: "Floor plan / 3D viewing for the listing.",

          priceSek: 3500,
          propertyType: "both" as const,
        },
      ];

      extras = await ExtraService.insertMany(defaults);
    }

    // ✅ Returnera “title/description” i rätt språk + behåll sv/en fälten också
    const mapped = extras.map((e: any) => {
      const titleOut =
        lang === "en"
          ? e.titleEn || e.title || e.titleSv
          : e.titleSv || e.title;

      const descOut =
        lang === "en"
          ? e.descriptionEn || e.description || e.descriptionSv
          : e.descriptionSv || e.description;

      return {
        _id: e._id,
        valuationId: e.valuationId,
        priceSek: e.priceSek,
        propertyType: e.propertyType,

        // ✅ UI-fält (rätt språk)
        title: titleOut,
        description: descOut,

        // ✅ rådata (för att spara i offert osv)
        titleSv: e.titleSv || e.title,
        titleEn: e.titleEn || e.title,
        descriptionSv: e.descriptionSv || e.description,
        descriptionEn: e.descriptionEn || e.description,
      };
    });

    res.json({ ok: true, extras: mapped });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
