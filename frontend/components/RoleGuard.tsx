"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { Role } from "@/lib/types";
import { Spinner } from "./ui";

export function RoleGuard({
  role,
  children,
}: {
  role: Role;
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/login");
    else if (user.role !== role)
      router.replace(
        user.role === "accountant" ? "/accountant/dashboard" : "/client/dashboard"
      );
  }, [user, loading, role, router]);

  if (loading || !user || user.role !== role) {
    return (
      <div className="flex h-screen items-center justify-center text-brand">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }
  return <>{children}</>;
}
