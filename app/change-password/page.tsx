import { AuthShell } from "../components/AuthShell";
import { ChangePasswordForm } from "../components/AuthForms";

export const dynamic = "force-dynamic";

export default function ChangePasswordPage() {
  return <AuthShell><ChangePasswordForm /></AuthShell>;
}
