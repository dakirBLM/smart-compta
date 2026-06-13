"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/login");
    else if (user.role === "accountant") router.replace("/accountant/dashboard");
    else router.replace("/client/dashboard");
  }, [user, loading, router]);

  return (
    <div className="flex h-screen items-center justify-center text-brand">
      Chargement…
    </div>
  );
}
