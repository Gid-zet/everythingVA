import { redirect } from "next/navigation";
import { getKindeServerSession } from "@/lib/kinde";
import { ProcurementShell } from "./components/shell";

export const metadata = { title: "Procurement · everythingVA" };

export default async function ProcurementLayout({ children }: { children: React.ReactNode }) {
  const { getUser } = await getKindeServerSession();
  const user = await getUser();
  if (!user?.id) redirect("/sign-in");
  return <ProcurementShell>{children}</ProcurementShell>;
}
