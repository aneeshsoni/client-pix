"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Camera, Loader2, Shield } from "lucide-react";

export default function LoginPage() {
  const { login, verify2FA, isAuthenticated, isLoading, checkSetupStatus } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [checkingSetup, setCheckingSetup] = useState(true);

  // 2FA state
  const [requires2FA, setRequires2FA] = useState(false);
  const [tempToken, setTempToken] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const totpInputRef = useRef<HTMLInputElement>(null);

  // Check if setup is needed
  useEffect(() => {
    const check = async () => {
      const needsSetup = await checkSetupStatus();
      if (needsSetup) {
        router.push("/setup");
      }
      setCheckingSetup(false);
    };
    check();
  }, [checkSetupStatus, router]);

  // Redirect if already authenticated
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.push("/dashboard");
    }
  }, [isLoading, isAuthenticated, router]);

  // Focus TOTP input when 2FA is required
  useEffect(() => {
    if (requires2FA && totpInputRef.current) {
      totpInputRef.current.focus();
    }
  }, [requires2FA]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const result = await login(email, password);
      if (result.requires2FA && result.tempToken) {
        setRequires2FA(true);
        setTempToken(result.tempToken);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handle2FASubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tempToken) return;

    setError("");
    setIsSubmitting(true);

    try {
      await verify2FA(tempToken, totpCode);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
      setTotpCode(""); // Clear code on error
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBack = () => {
    setRequires2FA(false);
    setTempToken(null);
    setTotpCode("");
    setError("");
  };

  if (isLoading || checkingSetup) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // 2FA verification screen
  if (requires2FA) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm space-y-8">
          {/* Logo */}
          <div className="flex flex-col items-center space-y-2">
            <div className="rounded-full bg-primary/10 p-3">
              <Shield className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-2xl font-bold">Two-Factor Authentication</h1>
            <p className="text-sm text-muted-foreground text-center">
              Enter the 6-digit code from your authenticator app
            </p>
          </div>

          {/* 2FA Form */}
          <form onSubmit={handle2FASubmit} className="space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="totp">Verification Code</Label>
              <Input
                ref={totpInputRef}
                id="totp"
                type="text"
                inputMode="numeric"
                pattern="[0-9A-Fa-f]*"
                placeholder="000000"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/[^0-9A-Fa-f]/g, ""))}
                className="text-center text-2xl tracking-widest font-mono"
                maxLength={8}
                required
                autoComplete="one-time-code"
              />
              <p className="text-xs text-muted-foreground text-center">
                You can also use a backup code
              </p>
            </div>

            <Button type="submit" className="w-full" disabled={isSubmitting || totpCode.length < 6}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verifying...
                </>
              ) : (
                "Verify"
              )}
            </Button>

            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={handleBack}
              disabled={isSubmitting}
            >
              Back to login
            </Button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-8">
        {/* Logo */}
        <div className="flex flex-col items-center space-y-2">
          <div className="rounded-full bg-primary/10 p-3">
            <Camera className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">Client Pix</h1>
          <p className="text-sm text-muted-foreground">
            Sign in to your account
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="admin@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Signing in...
              </>
            ) : (
              "Sign in"
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
