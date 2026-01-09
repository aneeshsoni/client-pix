"use client";

import { useState, useEffect } from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { Loader2, Check, User, Lock, HardDrive } from "lucide-react";
import { getStorageInfo, type StorageInfo } from "@/lib/api";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

export default function SettingsPage() {
  const { admin, updateProfile, changePassword } = useAuth();

  // Storage state
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [storageLoading, setStorageLoading] = useState(true);

  // Profile form state
  const [name, setName] = useState(admin?.name || "");
  const [email, setEmail] = useState(admin?.email || "");
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileSuccess, setProfileSuccess] = useState(false);

  // Password form state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  useEffect(() => {
    async function fetchStorage() {
      try {
        const data = await getStorageInfo();
        setStorage(data);
      } catch (err) {
        console.error("Failed to fetch storage info:", err);
      } finally {
        setStorageLoading(false);
      }
    }
    fetchStorage();
  }, []);

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError("");
    setProfileSuccess(false);
    setProfileLoading(true);

    try {
      await updateProfile({
        email: email !== admin?.email ? email : undefined,
        name: name !== admin?.name ? name : undefined,
      });
      setProfileSuccess(true);
      setTimeout(() => setProfileSuccess(false), 3000);
    } catch (err) {
      setProfileError(
        err instanceof Error ? err.message : "Failed to update profile"
      );
    } finally {
      setProfileLoading(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError("");
    setPasswordSuccess(false);

    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match");
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError("Password must be at least 8 characters");
      return;
    }

    setPasswordLoading(true);

    try {
      await changePassword(currentPassword, newPassword);
      setPasswordSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => setPasswordSuccess(false), 3000);
    } catch (err) {
      setPasswordError(
        err instanceof Error ? err.message : "Failed to change password"
      );
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <>
      <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
        <div className="flex items-center gap-2 px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage>Settings</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-6 p-4 pt-0 max-w-2xl">
        {/* Storage Section */}
        <div className="rounded-lg border bg-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <HardDrive className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Storage</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Your current storage usage.
          </p>

          {storageLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : storage ? (
            <div className="space-y-4">
              <div className="flex items-baseline justify-between">
                <div>
                  <div className="text-3xl font-bold">
                    {formatBytes(storage.used_bytes)}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    of {formatBytes(storage.total_bytes)} used
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-semibold text-primary">
                    {storage.used_percentage.toFixed(1)}%
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatBytes(storage.free_bytes)} free
                  </div>
                </div>
              </div>

              {/* Storage bar */}
              <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    storage.used_percentage > 90
                      ? "bg-destructive"
                      : storage.used_percentage > 75
                      ? "bg-yellow-500"
                      : "bg-primary"
                  }`}
                  style={{
                    width: `${Math.min(storage.used_percentage, 100)}%`,
                  }}
                />
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              Unable to load storage information
            </div>
          )}
        </div>

        {/* Profile Section */}
        <div className="rounded-lg border bg-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <User className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Profile</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Update your account information.
          </p>

          <form onSubmit={handleProfileSubmit} className="space-y-4">
            {profileError && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {profileError}
              </div>
            )}

            {profileSuccess && (
              <div className="rounded-md bg-green-500/10 p-3 text-sm text-green-600 dark:text-green-400 flex items-center gap-2">
                <Check className="h-4 w-4" />
                Profile updated successfully
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                type="text"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <Button type="submit" disabled={profileLoading}>
              {profileLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </form>
        </div>

        {/* Password Section */}
        <div className="rounded-lg border bg-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <Lock className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Change Password</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Update your password to keep your account secure.
          </p>

          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            {passwordError && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {passwordError}
              </div>
            )}

            {passwordSuccess && (
              <div className="rounded-md bg-green-500/10 p-3 text-sm text-green-600 dark:text-green-400 flex items-center gap-2">
                <Check className="h-4 w-4" />
                Password changed successfully
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="currentPassword">Current Password</Label>
              <Input
                id="currentPassword"
                type="password"
                placeholder="••••••••"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password</Label>
              <Input
                id="newPassword"
                type="password"
                placeholder="••••••••"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                Must be at least 8 characters
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm New Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>

            <Button type="submit" disabled={passwordLoading}>
              {passwordLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Changing...
                </>
              ) : (
                "Change Password"
              )}
            </Button>
          </form>
        </div>
      </div>
    </>
  );
}
