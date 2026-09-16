import type { Metadata } from "next";
import { Faq } from "@/components/Faq";

export const metadata: Metadata = { title: "FAQ" };

export default function FaqPage() {
  return <div className="wrap section"><Faq /></div>;
}
