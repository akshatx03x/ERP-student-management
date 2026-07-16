import { redirect } from "next/navigation";
import { getSession } from "@/server/auth/session";

export default async function HomePage() {
  const session = await getSession();
  if (session?.user) {
    redirect("/dashboard");
  }
  redirect("/login");
}
