"use client";

import { useState, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import { Copy, Check, Lock, Globe, Trash2, Loader2, Clock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createShareLink,
  getShareLinks,
  deleteShareLink,
  updateShareLink,
  type ShareLink,
} from "@/lib/api";

// Helper to calculate expiration date from duration
function getExpirationDate(duration: string): string | undefined {
  if (duration === "never") return undefined;

  const now = new Date();
  const days = parseInt(duration, 10);

  if (isNaN(days)) return undefined;

  now.setDate(now.getDate() + days);
  return now.toISOString();
}

// Helper to format remaining time
function formatTimeRemaining(expiresAt: string | null): {
  text: string;
  isExpired: boolean;
  isWarning: boolean;
} {
  if (!expiresAt)
    return { text: "Never expires", isExpired: false, isWarning: false };

  const now = new Date();
  const expiry = new Date(expiresAt);
  const diffMs = expiry.getTime() - now.getTime();

  if (diffMs <= 0) {
    return { text: "Expired", isExpired: true, isWarning: false };
  }

  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.ceil(diffMs / (1000 * 60 * 60));

  if (diffHours < 24) {
    return {
      text: `Expires in ${diffHours} hour${diffHours !== 1 ? "s" : ""}`,
      isExpired: false,
      isWarning: true,
    };
  } else if (diffDays === 1) {
    return { text: "Expires tomorrow", isExpired: false, isWarning: true };
  } else if (diffDays <= 7) {
    return { text: `${diffDays} days left`, isExpired: false, isWarning: true };
  } else {
    return {
      text: `${diffDays} days left`,
      isExpired: false,
      isWarning: false,
    };
  }
}

interface ShareModalProps {
  albumId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShareModal({ albumId, open, onOpenChange }: ShareModalProps) {
  const [shareLinks, setShareLinks] = useState<ShareLink[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [isPasswordProtected, setIsPasswordProtected] = useState(false);
  const [customSlug, setCustomSlug] = useState("");
  const [slugError, setSlugError] = useState<string | null>(null);
  const [expirationDuration, setExpirationDuration] = useState("never");

  const fetchShareLinks = useCallback(async () => {
    if (!open || !albumId) return;

    setIsLoading(true);
    try {
      const links = await getShareLinks(albumId);
      setShareLinks(links);
    } catch (error) {
      console.error("Failed to fetch share links:", error);
    } finally {
      setIsLoading(false);
    }
  }, [albumId, open]);

  useEffect(() => {
    fetchShareLinks();
  }, [fetchShareLinks]);

  const handleCreateLink = useCallback(async () => {
    if (!albumId) return;

    setIsCreating(true);
    setSlugError(null);
    try {
      const expiresAt = getExpirationDate(expirationDuration);
      const newLink = await createShareLink(
        albumId,
        isPasswordProtected ? password : undefined,
        customSlug.trim() || undefined,
        expiresAt,
      );
      setShareLinks((prev) => [newLink, ...prev]);
      setPassword("");
      setIsPasswordProtected(false);
      setCustomSlug("");
      setExpirationDuration("never");
    } catch (error) {
      console.error("Failed to create share link:", error);
      if (error instanceof Error && error.message.includes("slug")) {
        setSlugError(error.message);
      }
    } finally {
      setIsCreating(false);
    }
  }, [albumId, password, isPasswordProtected, customSlug, expirationDuration]);

  const handleCopyLink = useCallback(async (link: ShareLink) => {
    try {
      await navigator.clipboard.writeText(link.share_url);
      setCopiedLinkId(link.id);
      setTimeout(() => setCopiedLinkId(null), 2000);
    } catch (error) {
      console.error("Failed to copy link:", error);
    }
  }, []);

  const handleDeleteLink = useCallback(
    async (linkId: string) => {
      if (!albumId) return;

      try {
        await deleteShareLink(albumId, linkId);
        setShareLinks((prev) => prev.filter((link) => link.id !== linkId));
      } catch (error) {
        console.error("Failed to delete share link:", error);
      }
    },
    [albumId],
  );

  const handleToggleRevoke = useCallback(
    async (link: ShareLink) => {
      if (!albumId) return;

      try {
        const updated = await updateShareLink(albumId, link.id, {
          is_revoked: !link.is_revoked,
        });
        setShareLinks((prev) =>
          prev.map((l) => (l.id === link.id ? updated : l)),
        );
      } catch (error) {
        console.error("Failed to update share link:", error);
      }
    },
    [albumId],
  );

  const handleClose = useCallback(() => {
    if (isCreating) return;
    onOpenChange(false);
  }, [isCreating, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>Share Album</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4 overflow-hidden">
          {/* Create New Link Section */}
          <div className="space-y-4 rounded-lg border p-4">
            <h3 className="text-sm font-medium">Create Share Link</h3>

            <div className="space-y-3">
              {/* Custom Slug */}
              <div>
                <Label htmlFor="custom-slug">Custom Link (optional)</Label>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-sm text-muted-foreground">/share/</span>
                  <Input
                    id="custom-slug"
                    value={customSlug}
                    onChange={(e) => {
                      setCustomSlug(
                        e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
                      );
                      setSlugError(null);
                    }}
                    placeholder="my-wedding-photos"
                    className="flex-1"
                  />
                </div>
                {slugError && (
                  <p className="text-xs text-destructive mt-1">{slugError}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  Leave blank for a random link. Use letters, numbers, and
                  hyphens.
                </p>
              </div>

              <div className="flex items-center justify-between">
                <Label
                  htmlFor="password-protect"
                  className="flex items-center gap-2"
                >
                  <Lock className="h-4 w-4" />
                  Password Protected
                </Label>
                <Switch
                  id="password-protect"
                  checked={isPasswordProtected}
                  onCheckedChange={setIsPasswordProtected}
                />
              </div>

              {isPasswordProtected && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password (min 4 characters)"
                    className="mt-1.5"
                    minLength={4}
                  />
                </motion.div>
              )}

              {/* Expiration Setting */}
              <div>
                <Label htmlFor="expiration" className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Link Expiration
                </Label>
                <Select
                  value={expirationDuration}
                  onValueChange={setExpirationDuration}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="Select expiration" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="never">Never expires</SelectItem>
                    <SelectItem value="1">1 day</SelectItem>
                    <SelectItem value="7">7 days</SelectItem>
                    <SelectItem value="14">14 days</SelectItem>
                    <SelectItem value="30">30 days</SelectItem>
                    <SelectItem value="90">90 days</SelectItem>
                    <SelectItem value="180">6 months</SelectItem>
                    <SelectItem value="365">1 year</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Link will automatically stop working after this period.
                </p>
              </div>

              <Button
                onClick={handleCreateLink}
                disabled={
                  isCreating ||
                  (isPasswordProtected && password.length < 4) ||
                  (customSlug.length > 0 && customSlug.length < 3)
                }
                className="w-full"
              >
                {isCreating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Globe className="h-4 w-4 mr-2" />
                    Create Share Link
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Existing Links */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium">
              Share Links ({shareLinks.length})
            </h3>

            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : shareLinks.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No share links created yet
              </p>
            ) : (
              <div className="space-y-2">
                {shareLinks.map((link) => {
                  const expStatus = formatTimeRemaining(link.expires_at);
                  return (
                    <motion.div
                      key={link.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`flex items-center gap-3 rounded-lg border p-3 overflow-hidden ${
                        expStatus.isExpired || link.is_revoked
                          ? "opacity-60"
                          : ""
                      }`}
                    >
                      <div className="flex-1 min-w-0 overflow-hidden">
                        <div className="flex items-center gap-2 mb-1">
                          {link.is_password_protected ? (
                            <Lock className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                          ) : (
                            <Globe className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                          )}
                          <span className="text-xs text-muted-foreground truncate block overflow-hidden">
                            {link.share_url}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                          <span>
                            Created{" "}
                            {new Date(link.created_at).toLocaleDateString()}
                          </span>
                          {link.is_revoked ? (
                            <>
                              <span>•</span>
                              <span className="text-destructive">Revoked</span>
                            </>
                          ) : expStatus.isExpired ? (
                            <>
                              <span>•</span>
                              <span className="text-destructive">
                                {expStatus.text}
                              </span>
                            </>
                          ) : (
                            <>
                              <span>•</span>
                              <span
                                className={
                                  expStatus.isWarning ? "text-orange-500" : ""
                                }
                              >
                                {expStatus.text}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCopyLink(link)}
                          className="h-8 w-8 p-0"
                        >
                          {copiedLinkId === link.id ? (
                            <Check className="h-4 w-4 text-green-600" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleRevoke(link)}
                          className="h-8 w-8 p-0"
                          title={
                            link.is_revoked ? "Restore link" : "Revoke link"
                          }
                        >
                          {link.is_revoked ? (
                            <Globe className="h-4 w-4" />
                          ) : (
                            <Lock className="h-4 w-4" />
                          )}
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteLink(link.id)}
                          className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
