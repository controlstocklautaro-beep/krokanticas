import { KrokanticasPanel } from "./KrokanticasPanel";
import { requireChatGPTUser } from "./chatgpt-auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requireChatGPTUser("/");
  return <KrokanticasPanel user={{ displayName: user.displayName, email: user.email }} />;
}
