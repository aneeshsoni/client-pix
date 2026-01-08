"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Loader2 } from "lucide-react";

export default function Home() {
  const { isAuthenticated, isLoading, checkSetupStatus } = useAuth();
  const router = useRouter();

  useEffect(() => {
    const redirect = async () => {
      if (isLoading) return;

      if (isAuthenticated) {
        router.push("/dashboard");
        return;
      }

      // Check if setup is needed
      const needsSetup = await checkSetupStatus();
      if (needsSetup) {
        router.push("/setup");
      } else {
        router.push("/login");
      }
    };

    redirect();
  }, [isAuthenticated, isLoading, checkSetupStatus, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}
