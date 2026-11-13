import {
  Bot,
  CalendarClock,
  CalendarRange,
  Clapperboard,
  CreditCard,
  Facebook,
  Link2,
  MessageCircleReply,
  PackageOpen,
  Sparkles,
  Waves,
  type LucideIcon,
} from "lucide-react";
import type { RoadmapIcon as IconName } from "@/lib/roadmap";

const ICONS: Record<IconName, LucideIcon> = {
  link: Link2,
  "calendar-clock": CalendarClock,
  "message-circle-reply": MessageCircleReply,
  "package-open": PackageOpen,
  waves: Waves,
  "credit-card": CreditCard,
  bot: Bot,
  facebook: Facebook,
  sparkles: Sparkles,
  clapperboard: Clapperboard,
  "calendar-range": CalendarRange,
};

export function RoadmapIcon({ name, size = 20 }: { name: IconName; size?: number }) {
  const Icon = ICONS[name];
  return <Icon size={size} aria-hidden />;
}
