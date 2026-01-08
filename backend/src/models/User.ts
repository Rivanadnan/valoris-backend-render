import mongoose from "mongoose";

export type UserRole = "user" | "creator" | "admin";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["user", "creator", "admin"], default: "user" },
  },
  { timestamps: true, versionKey: false }
);

// ✅ Exportera BÅDE named + default (så imports aldrig bråkar)
export const User = mongoose.model("User", userSchema);
export default User;
