import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "FAQ — MSF Companion",
  description:
    "Frequently asked questions about MSF Companion. Security, subscriptions, data privacy, features, and how to get help.",
};

export default function FaqLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
