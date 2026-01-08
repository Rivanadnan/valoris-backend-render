import mongoose, { Schema, InferSchemaType } from "mongoose";

const OfferSchema = new Schema(
  {
    valuationId: { type: Schema.Types.ObjectId, ref: "Valuation", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },

    items: [
      {
        // Legacy (behåll)
        title: { type: String },

        // ✅ Flerspråkigt
        titleSv: { type: String },
        titleEn: { type: String },

        priceSek: { type: Number, required: true },
      },
    ],

    totalSek: { type: Number, required: true },
  },
  { timestamps: true }
);

export type OfferType = InferSchemaType<typeof OfferSchema>;
export const Offer = mongoose.model("Offer", OfferSchema);
