import nodemailer from "nodemailer";

const host = process.env.SMTP_HOST;
const port = Number(process.env.SMTP_PORT || 587);
const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS;
const from = process.env.EMAIL_FROM || "Valoris <no-reply@valoris.local>";

if (!host || !user || !pass) {
  console.warn("⚠️ SMTP saknas i .env - mail kommer INTE skickas.");
}

const transporter = nodemailer.createTransport({
  host,
  port,
  auth: { user, pass },
});

transporter.verify((err) => {
  if (err) {
    console.error("❌ SMTP ERROR:", err);
  } else {
    console.log("✅ SMTP READY – Mail server connected");
  }
});

/**
 * ✅ Välkommen-mail (INGEN verify)
 */
export async function sendWelcomeEmail(
  to: string,
  data: {
    name: string;
    loginUrl: string;
  }
) {
  if (!host || !user || !pass) return;

  await transporter.sendMail({
    from,
    to,
    subject: "Välkommen till Valoris 🎉",
    html: `
      <div style="font-family:system-ui">
        <h2>Välkommen ${data.name}!</h2>
        <p>Ditt konto är nu <strong>aktivt efter betalning</strong>.</p>
        <p>Du kan logga in direkt här:</p>
        <p>
          <a href="${data.loginUrl}" style="display:inline-block;padding:10px 16px;background:#111;color:#fff;border-radius:8px;text-decoration:none">
            Logga in
          </a>
        </p>
        <p style="margin-top:16px;color:#666">/Valoris</p>
      </div>
    `,
  });
}
