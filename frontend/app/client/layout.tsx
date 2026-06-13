"use client";

import { RoleGuard } from "@/components/RoleGuard";

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RoleGuard role="client">{children}</RoleGuard>;
}
