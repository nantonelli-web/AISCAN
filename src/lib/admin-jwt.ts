import { SignJWT, jwtVerify } from "jose";
import { logger } from "@/lib/logger";

function getSecret(): Uint8Array {
  const dedicated = process.env.ADMIN_JWT_SECRET;
  const raw = dedicated ?? process.env.NEXTAUTH_SECRET;
  if (!raw || raw.length < 32) {
    throw new Error(
      "ADMIN_JWT_SECRET (or NEXTAUTH_SECRET) must be set to a value with at least 32 characters"
    );
  }
  // Key-separation hygiene: the admin trust domain should have its own
  // secret. Falling back to NEXTAUTH_SECRET means a leak of the general
  // app secret also forges admin sessions. Warn loudly in production.
  if (!dedicated && process.env.NODE_ENV === "production") {
    logger.warn(
      "ADMIN_JWT_SECRET not set — falling back to NEXTAUTH_SECRET. Set a dedicated ADMIN_JWT_SECRET to isolate the admin trust domain.",
      { channel: "admin-jwt", event: "secret.fallback" },
    );
  }
  return new TextEncoder().encode(raw);
}

export async function createAdminToken(payload: {
  adminId: string;
  email: string;
  role: string;
}) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("4h")
    .sign(getSecret());
}

export async function verifyAdminToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as {
      adminId: string;
      email: string;
      role: string;
    };
  } catch (err) {
    logger.debug("jwt verify failed", {
      channel: "admin-jwt",
      event: "jwt.verify_failed",
      errorType: err instanceof Error ? err.name : typeof err,
    });
    return null;
  }
}
