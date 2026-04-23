import { SignJWT, jwtVerify } from "jose";

function getSecret(): Uint8Array {
  const raw = process.env.ADMIN_JWT_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!raw || raw.length < 32) {
    throw new Error(
      "ADMIN_JWT_SECRET (or NEXTAUTH_SECRET) must be set to a value with at least 32 characters"
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
  } catch {
    return null;
  }
}
