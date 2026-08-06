import { KrokanticasPanel } from "./KrokanticasPanel";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAppUserBySessionToken, sessionTokenFromCookieHeader } from "@/lib/server/app-auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const requestHeaders = await headers();
  const user = await getAppUserBySessionToken(sessionTokenFromCookieHeader(requestHeaders.get("cookie")));
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/change-password");
  return <KrokanticasPanel user={{ id: user.id, displayName: user.name, email: user.email, role: user.role }} />;
}
