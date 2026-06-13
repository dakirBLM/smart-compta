"use client";

import { RoleGuard } from "@/components/RoleGuard";

export default function AccountantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RoleGuard role="accountant">{children}</RoleGuard>;
}
