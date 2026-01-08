import { Router } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { User } from "../models/User";

export const router = Router();

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body as { email: string; password: string };

    if (!email || !password) {
      return res.status(400).json({ ok: false, error: "Missing credentials" });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) return res.status(401).json({ ok: false, error: "Invalid credentials" });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ ok: false, error: "Invalid credentials" });

    const secret = process.env.JWT_SECRET;
    if (!secret) return res.status(500).json({ ok: false, error: "JWT_SECRET missing" });

    // ✅ Alla roller får logga in. Rättigheter kontrolleras per route via middleware.
    const token = jwt.sign(
      { userId: user._id.toString(), role: user.role, email: user.email },
      secret,
      { expiresIn: "7d" }
    );

    return res.json({ ok: true, token, role: user.role });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err.message || "Server error" });
  }
});

export default router;
