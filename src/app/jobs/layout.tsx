import { redirect } from "next/navigation";
import { getKindeServerSession } from "@/lib/kinde";

export const metadata = { title: "Jobs · everythingVA" };

export default async function JobsLayout({ children }: { children: React.ReactNode }) {
  const { getUser } = await getKindeServerSession();
  const user = await getUser();
  if (!user?.id) redirect("/sign-in");
  return children;
}
