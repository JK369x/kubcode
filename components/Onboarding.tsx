import { cookies } from "next/headers";
import { getOnboarding } from "@/lib/onboarding/view";
import { OnboardingChecklist } from "./OnboardingChecklist";

/** Server wrapper: one line per page (`<Onboarding />` or `<Onboarding compact />`). */
export async function Onboarding({ compact = false }: { compact?: boolean }) {
  const data = await getOnboarding(process.env, () => cookies());
  return <OnboardingChecklist data={data} compact={compact} />;
}
