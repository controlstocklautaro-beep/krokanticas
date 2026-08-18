import { KrokanticasPanel } from "./KrokanticasPanel";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { activeBusinessIdFromCookieHeader, getAppUserBySessionToken, sessionTokenFromCookieHeader } from "@/lib/server/app-auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const requestHeaders = await headers();
  const cookieHeader = requestHeaders.get("cookie");
  const user = await getAppUserBySessionToken(
    sessionTokenFromCookieHeader(cookieHeader),
    activeBusinessIdFromCookieHeader(cookieHeader),
  );
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/change-password");
  return <KrokanticasPanel
    business={{ id: user.businessId, name: user.businessName, modules: user.modules }}
    user={{ id: user.id, displayName: user.name, email: user.email, role: user.role }}
  />;
}
