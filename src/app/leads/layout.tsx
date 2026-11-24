import { redirect } from "next/navigation";
import { getKindeServerSession } from "@/lib/kinde";

export const metadata = { title: "Leads · everythingVA" };

export default async function LeadsLayout({ children }: { children: React.ReactNode }) {
  const { getUser } = await getKindeServerSession();
  const user = await getUser();
  if (!user?.id) redirect("/sign-in");
  return children;
}
