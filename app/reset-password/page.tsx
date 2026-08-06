import { AuthShell } from "../components/AuthShell";
import { ResetPasswordForm } from "../components/AuthForms";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const params = await searchParams;
  return <AuthShell><ResetPasswordForm token={params.token ?? ""} /></AuthShell>;
}
