import mongoose, { Schema, InferSchemaType } from "mongoose";

const FeaturesSchema = new Schema(
  {
    balcony: { type: Boolean, default: false },
    renovatedKitchen: { type: Boolean, default: false },
    renovatedBathroom: { type: Boolean, default: false },
    parking: { type: Boolean, default: false },
    elevator: { type: Boolean, default: false },
    storage: { type: Boolean, default: false },
    garden: { type: Boolean, default: false },
    seaView: { type: Boolean, default: false },
    fireplace: { type: Boolean, default: false },
  },
  { _id: false }
);

const ValuationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },

    address: { type: String, required: true },
    city: { type: String, default: "" },
    propertyType: { type: String, enum: ["apartment", "house"], required: true },
    livingArea: { type: Number, required: true },
    rooms: { type: Number, default: 1 },
    yearBuilt: { type: Number, default: null },

    features: { type: FeaturesSchema, default: {} },

    estimateSek: { type: Number, required: true },
    lowSek: { type: Number, required: true },
    highSek: { type: Number, required: true },
    confidence: { type: Number, required: true },

    status: { type: String, enum: ["draft", "done"], default: "done" },
  },
  { timestamps: true }
);

export type ValuationType = InferSchemaType<typeof ValuationSchema>;

export const Valuation =
  (mongoose.models.Valuation as mongoose.Model<ValuationType>) ||
  mongoose.model("Valuation", ValuationSchema);
