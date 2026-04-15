import { getIronSession, SessionOptions } from "iron-session";
import { cookies } from "next/headers";

export interface AdminSessionData {
  isAdmin?: boolean;
}

const adminSessionOptions: SessionOptions = {
  password: process.env.ADMIN_SESSION_SECRET!,
  cookieName: "admin-session",
  ttl: 86400, // 24 hours
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax" as const,
  },
};

export async function getAdminSession() {
  return getIronSession<AdminSessionData>(await cookies(), adminSessionOptions);
}
