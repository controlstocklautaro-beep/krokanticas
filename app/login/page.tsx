import { AuthShell } from "../components/AuthShell";
import { LoginForm } from "../components/AuthForms";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return <AuthShell><LoginForm /></AuthShell>;
}
