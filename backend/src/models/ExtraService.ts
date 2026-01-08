import mongoose, { Schema } from "mongoose";

const ExtraServiceSchema = new Schema(
  {
    valuationId: { type: Schema.Types.ObjectId, ref: "Valuation", required: true },

    // Legacy (sv) – behåll för bakåtkompatibilitet
    title: { type: String, required: true },
    description: { type: String, required: true },

    // ✅ Flerspråkigt (riktigt)
    titleSv: { type: String, required: true },
    titleEn: { type: String, required: true },
    descriptionSv: { type: String, required: true },
    descriptionEn: { type: String, required: true },

    priceSek: { type: Number, required: true },

    propertyType: {
      type: String,
      enum: ["apartment", "house", "both"],
      required: true,
    },
  },
  { timestamps: true }
);

export const ExtraService = mongoose.model("ExtraService", ExtraServiceSchema);
