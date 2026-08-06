import { AuthShell } from "../components/AuthShell";
import { ForgotPasswordForm } from "../components/AuthForms";

export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  return <AuthShell><ForgotPasswordForm /></AuthShell>;
}
