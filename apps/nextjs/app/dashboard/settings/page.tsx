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
import {
  Loader2,
  Check,
  User,
  Lock,
  HardDrive,
  Trash2,
  Download,
  Upload,
  Shield,
  Copy,
  QrCode,
  AlertTriangle,
} from "lucide-react";
import {
  getStorageBreakdown,
  getTempFilesInfo,
  cleanupDownloadTempFiles,
  cleanupUploadTempFiles,
  type StorageBreakdown,
  type TempFilesInfo,
} from "@/lib/api";
import { authFetch } from "@/lib/auth";
import { AlbumStorageBar } from "@/components/settings";

const API_URL = "/api";

interface Setup2FAResponse {
  qr_code: string;
  secret: string;
  backup_codes: string[];
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

export default function SettingsPage() {
  const { admin, updateProfile, changePassword } = useAuth();

  // Storage state - now using StorageBreakdown
  const [storageBreakdown, setStorageBreakdown] =
    useState<StorageBreakdown | null>(null);
  const [storageLoading, setStorageLoading] = useState(true);

  // Temp files state
  const [tempFiles, setTempFiles] = useState<TempFilesInfo | null>(null);
  const [tempFilesLoading, setTempFilesLoading] = useState(true);
  const [cleaningDownloads, setCleaningDownloads] = useState(false);
  const [cleaningUploads, setCleaningUploads] = useState(false);
  const [cleanupMessage, setCleanupMessage] = useState<string | null>(null);

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

  // 2FA state
  const [twoFASetupMode, setTwoFASetupMode] = useState(false);
  const [twoFAData, setTwoFAData] = useState<Setup2FAResponse | null>(null);
  const [twoFALoading, setTwoFALoading] = useState(false);
  const [twoFAError, setTwoFAError] = useState("");
  const [twoFASuccess, setTwoFASuccess] = useState("");
  const [twoFACode, setTwoFACode] = useState("");
  const [twoFAPassword, setTwoFAPassword] = useState("");
  const [copiedCode, setCopiedCode] = useState(false);

  useEffect(() => {
    async function fetchStorage() {
      try {
        const data = await getStorageBreakdown();
        setStorageBreakdown(data);
      } catch (err) {
        console.error("Failed to fetch storage breakdown:", err);
      } finally {
        setStorageLoading(false);
      }
    }
    fetchStorage();
  }, []);

  useEffect(() => {
    async function fetchTempFiles() {
      try {
        const data = await getTempFilesInfo();
        setTempFiles(data);
      } catch (err) {
        console.error("Failed to fetch temp files info:", err);
      } finally {
        setTempFilesLoading(false);
      }
    }
    fetchTempFiles();
  }, []);

  const handleCleanupDownloads = async () => {
    setCleaningDownloads(true);
    setCleanupMessage(null);
    try {
      const result = await cleanupDownloadTempFiles();
      setCleanupMessage(
        `Cleaned ${result.cleaned_count} files (${formatBytes(
          result.cleaned_bytes
        )})`
      );
      const data = await getTempFilesInfo();
      setTempFiles(data);
      const storageData = await getStorageBreakdown();
      setStorageBreakdown(storageData);
    } catch (err) {
      console.error("Failed to cleanup downloads:", err);
      setCleanupMessage("Failed to cleanup download files");
    } finally {
      setCleaningDownloads(false);
      setTimeout(() => setCleanupMessage(null), 5000);
    }
  };

  const handleCleanupUploads = async () => {
    setCleaningUploads(true);
    setCleanupMessage(null);
    try {
      const result = await cleanupUploadTempFiles();
      setCleanupMessage(
        `Cleaned ${result.cleaned_count} files (${formatBytes(
          result.cleaned_bytes
        )})`
      );
      const data = await getTempFilesInfo();
      setTempFiles(data);
      const storageData = await getStorageBreakdown();
      setStorageBreakdown(storageData);
    } catch (err) {
      console.error("Failed to cleanup uploads:", err);
      setCleanupMessage("Failed to cleanup upload files");
    } finally {
      setCleaningUploads(false);
      setTimeout(() => setCleanupMessage(null), 5000);
    }
  };

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

  // 2FA Handlers
  const handleSetup2FA = async () => {
    setTwoFALoading(true);
    setTwoFAError("");
    setTwoFASuccess("");
    try {
      const response = await authFetch(`${API_URL}/auth/2fa/setup`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Failed to setup 2FA");
      }
      const data = await response.json();
      setTwoFAData(data);
      setTwoFASetupMode(true);
    } catch (err) {
      setTwoFAError(err instanceof Error ? err.message : "Failed to setup 2FA");
    } finally {
      setTwoFALoading(false);
    }
  };

  const handleEnable2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    setTwoFALoading(true);
    setTwoFAError("");
    try {
      const response = await authFetch(`${API_URL}/auth/2fa/enable`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: twoFACode, password: twoFAPassword }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Failed to enable 2FA");
      }
      setTwoFASuccess("Two-factor authentication enabled successfully!");
      setTwoFASetupMode(false);
      setTwoFACode("");
      setTwoFAPassword("");
      window.location.reload();
    } catch (err) {
      setTwoFAError(
        err instanceof Error ? err.message : "Failed to enable 2FA"
      );
    } finally {
      setTwoFALoading(false);
    }
  };

  const handleDisable2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    setTwoFALoading(true);
    setTwoFAError("");
    try {
      const response = await authFetch(`${API_URL}/auth/2fa/disable`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: twoFACode, password: twoFAPassword }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Failed to disable 2FA");
      }
      setTwoFASuccess("Two-factor authentication disabled");
      setTwoFACode("");
      setTwoFAPassword("");
      setTwoFAData(null);
      window.location.reload();
    } catch (err) {
      setTwoFAError(
        err instanceof Error ? err.message : "Failed to disable 2FA"
      );
    } finally {
      setTwoFALoading(false);
    }
  };

  const handleCancelSetup = () => {
    setTwoFASetupMode(false);
    setTwoFAData(null);
    setTwoFACode("");
    setTwoFAPassword("");
    setTwoFAError("");
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
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

      <div className="flex flex-1 flex-col gap-6 p-4 pt-0 lg:p-6">
        {/* Single column centered layout */}
        <div className="mx-auto w-full max-w-2xl space-y-10">
          {/* Account Section */}
          <div className="space-y-4">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide px-1">
              Account
            </h2>
            <div className="space-y-6">
              {/* Profile Section */}
              <div className="rounded-lg border bg-card p-6">
                <div className="flex items-center gap-2 mb-4">
                  <User className="h-5 w-5 text-muted-foreground" />
                  <h3 className="text-lg font-semibold">Profile</h3>
                </div>

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
                  <h3 className="text-lg font-semibold">Change Password</h3>
                </div>

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

              {/* Two-Factor Authentication Section */}
              <div className="rounded-lg border bg-card p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Shield className="h-5 w-5 text-muted-foreground" />
                  <h3 className="text-lg font-semibold">Two-Factor Auth</h3>
                </div>

                {twoFAError && (
                  <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive mb-4">
                    {twoFAError}
                  </div>
                )}

                {twoFASuccess && (
                  <div className="rounded-md bg-green-500/10 p-3 text-sm text-green-600 dark:text-green-400 flex items-center gap-2 mb-4">
                    <Check className="h-4 w-4" />
                    {twoFASuccess}
                  </div>
                )}

                {!twoFASetupMode ? (
                  <div className="space-y-4">
                    {admin?.totp_enabled ? (
                      <>
                        <div className="flex items-center gap-3 p-3 rounded-lg bg-green-500/10">
                          <div className="rounded-full bg-green-500/20 p-1.5">
                            <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                          </div>
                          <div>
                            <div className="text-sm font-medium text-green-600 dark:text-green-400">
                              2FA is enabled
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Protected with authenticator app
                            </div>
                          </div>
                        </div>

                        <form
                          onSubmit={handleDisable2FA}
                          className="space-y-4 pt-4 border-t"
                        >
                          <p className="text-sm text-muted-foreground">
                            Enter code and password to disable 2FA.
                          </p>

                          <div className="space-y-2">
                            <Label htmlFor="disable2faCode">
                              Verification Code
                            </Label>
                            <Input
                              id="disable2faCode"
                              type="text"
                              inputMode="numeric"
                              placeholder="000000"
                              value={twoFACode}
                              onChange={(e) =>
                                setTwoFACode(e.target.value.replace(/[^0-9]/g, ""))
                              }
                              maxLength={6}
                              required
                              className="font-mono"
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="disable2faPassword">Password</Label>
                            <Input
                              id="disable2faPassword"
                              type="password"
                              placeholder="••••••••"
                              value={twoFAPassword}
                              onChange={(e) => setTwoFAPassword(e.target.value)}
                              required
                            />
                          </div>

                          <Button
                            type="submit"
                            variant="destructive"
                            disabled={
                              twoFALoading ||
                              twoFACode.length !== 6 ||
                              !twoFAPassword
                            }
                          >
                            {twoFALoading ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Disabling...
                              </>
                            ) : (
                              "Disable 2FA"
                            )}
                          </Button>
                        </form>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center gap-3 p-3 rounded-lg bg-yellow-500/10">
                          <div className="rounded-full bg-yellow-500/20 p-1.5">
                            <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                          </div>
                          <div>
                            <div className="text-sm font-medium text-yellow-600 dark:text-yellow-400">
                              2FA is not enabled
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Add extra security to your account
                            </div>
                          </div>
                        </div>

                        <Button onClick={handleSetup2FA} disabled={twoFALoading}>
                          {twoFALoading ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Setting up...
                            </>
                          ) : (
                            <>
                              <QrCode className="mr-2 h-4 w-4" />
                              Enable 2FA
                            </>
                          )}
                        </Button>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {twoFAData && (
                      <>
                        <div className="text-center">
                          <p className="text-sm text-muted-foreground mb-3">
                            Scan with your authenticator app
                          </p>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={twoFAData.qr_code}
                            alt="2FA QR Code"
                            className="mx-auto rounded-lg border bg-white p-2"
                            width={180}
                            height={180}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>Manual Entry Code</Label>
                          <div className="flex items-center gap-2">
                            <Input
                              value={twoFAData.secret}
                              readOnly
                              className="font-mono text-xs"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={() => copyToClipboard(twoFAData.secret)}
                            >
                              {copiedCode ? (
                                <Check className="h-4 w-4" />
                              ) : (
                                <Copy className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </div>

                        <div className="space-y-2 p-3 rounded-lg bg-muted/50">
                          <div className="flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-yellow-600" />
                            <Label className="text-yellow-600 dark:text-yellow-400 text-sm">
                              Save Backup Codes
                            </Label>
                          </div>
                          <div className="grid grid-cols-2 gap-1.5">
                            {twoFAData.backup_codes.map((code, index) => (
                              <div
                                key={index}
                                className="font-mono text-xs bg-background p-1.5 rounded border text-center"
                              >
                                {code}
                              </div>
                            ))}
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="w-full mt-1"
                            onClick={() =>
                              copyToClipboard(twoFAData.backup_codes.join("\n"))
                            }
                          >
                            <Copy className="mr-2 h-3 w-3" />
                            Copy All
                          </Button>
                        </div>

                        <form
                          onSubmit={handleEnable2FA}
                          className="space-y-3 pt-3 border-t"
                        >
                          <div className="space-y-2">
                            <Label htmlFor="enable2faCode">
                              Verification Code
                            </Label>
                            <Input
                              id="enable2faCode"
                              type="text"
                              inputMode="numeric"
                              placeholder="000000"
                              value={twoFACode}
                              onChange={(e) =>
                                setTwoFACode(e.target.value.replace(/[^0-9]/g, ""))
                              }
                              maxLength={6}
                              required
                              className="font-mono text-center text-lg tracking-widest"
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="enable2faPassword">
                              Confirm Password
                            </Label>
                            <Input
                              id="enable2faPassword"
                              type="password"
                              placeholder="••••••••"
                              value={twoFAPassword}
                              onChange={(e) => setTwoFAPassword(e.target.value)}
                              required
                            />
                          </div>

                          <div className="flex gap-2">
                            <Button
                              type="submit"
                              disabled={
                                twoFALoading ||
                                twoFACode.length !== 6 ||
                                !twoFAPassword
                              }
                            >
                              {twoFALoading ? (
                                <>
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  Enabling...
                                </>
                              ) : (
                                "Enable 2FA"
                              )}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={handleCancelSetup}
                              disabled={twoFALoading}
                            >
                              Cancel
                            </Button>
                          </div>
                        </form>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* System Section */}
          <div className="space-y-4">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide px-1">
              System
            </h2>
            <div className="space-y-6">
              {/* Storage Section with Album Breakdown */}
              <div className="rounded-lg border bg-card p-6">
                <div className="flex items-center gap-2 mb-4">
                  <HardDrive className="h-5 w-5 text-muted-foreground" />
                  <h3 className="text-lg font-semibold">Storage</h3>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  Storage usage by album. Double-click a segment for details.
                </p>

                {storageLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : storageBreakdown ? (
                  <div className="space-y-4">
                    {/* Summary stats */}
                    <div className="flex items-baseline justify-between">
                      <div>
                        <div className="text-3xl font-bold">
                          {formatBytes(storageBreakdown.used_bytes)}
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">
                          of {formatBytes(storageBreakdown.total_bytes)} used
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-semibold text-primary">
                          {storageBreakdown.used_percentage.toFixed(1)}%
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {storageBreakdown.albums.length} albums
                        </div>
                      </div>
                    </div>

                    {/* Interactive Album Storage Bar */}
                    <AlbumStorageBar data={storageBreakdown} />
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    Unable to load storage information
                  </div>
                )}
              </div>

              {/* Temporary Files Cleanup Section */}
              <div className="rounded-lg border bg-card p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Trash2 className="h-5 w-5 text-muted-foreground" />
                  <h3 className="text-lg font-semibold">Temporary Files</h3>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  Orphaned temporary files from interrupted uploads or downloads.
                </p>

                {cleanupMessage && (
                  <div className="rounded-md bg-green-500/10 p-3 text-sm text-green-600 dark:text-green-400 flex items-center gap-2 mb-4">
                    <Check className="h-4 w-4" />
                    {cleanupMessage}
                  </div>
                )}

                {tempFilesLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : tempFiles ? (
                  <div className="space-y-3">
                    {/* Downloads temp files */}
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-3">
                        <Download className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <div className="text-sm font-medium">Downloads</div>
                          <div className="text-xs text-muted-foreground">
                            {tempFiles.download_files_count} files ·{" "}
                            {formatBytes(tempFiles.download_files_bytes)}
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleCleanupDownloads}
                        disabled={
                          cleaningDownloads ||
                          tempFiles.download_files_count === 0
                        }
                      >
                        {cleaningDownloads ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          "Clean"
                        )}
                      </Button>
                    </div>

                    {/* Uploads temp files */}
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-3">
                        <Upload className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <div className="text-sm font-medium">Uploads</div>
                          <div className="text-xs text-muted-foreground">
                            {tempFiles.upload_temp_files_count +
                              tempFiles.chunked_uploads_count}{" "}
                            files ·{" "}
                            {formatBytes(
                              tempFiles.upload_temp_files_bytes +
                                tempFiles.chunked_uploads_bytes
                            )}
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleCleanupUploads}
                        disabled={
                          cleaningUploads ||
                          (tempFiles.upload_temp_files_count === 0 &&
                            tempFiles.chunked_uploads_count === 0)
                        }
                      >
                        {cleaningUploads ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          "Clean"
                        )}
                      </Button>
                    </div>

                    {/* Total */}
                    {tempFiles.total_bytes > 0 && (
                      <div className="pt-2 border-t text-sm text-muted-foreground">
                        Total reclaimable:{" "}
                        <span className="font-semibold text-foreground">
                          {formatBytes(tempFiles.total_bytes)}
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    Unable to load temporary files information
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
