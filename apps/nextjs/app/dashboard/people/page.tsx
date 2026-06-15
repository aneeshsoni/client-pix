"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  Eye,
  EyeOff,
  Info,
  Loader2,
  RefreshCw,
  ScanFace,
  Settings,
  UserRound,
} from "lucide-react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  getFaceCropUrl,
  getFaceScanStatus,
  getPerson,
  getSecureImageUrl,
  listPeople,
  startFaceBackfill,
  updatePerson,
  type FaceDetection,
  type FaceScanStatus,
  type Person,
  type PersonDetail,
  type Photo,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";

function getPhotoFace(photo: Photo, faces: FaceDetection[]): FaceDetection | null {
  return (
    faces
      .filter((face) => face.file_hash_id === photo.file_hash_id)
      .sort((left, right) => right.quality - left.quality)[0] ?? null
  );
}

export default function PeoplePage() {
  const { token } = useAuth();
  const [people, setPeople] = useState<Person[]>([]);
  const [status, setStatus] = useState<FaceScanStatus | null>(null);
  const [includeHidden, setIncludeHidden] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [activePersonId, setActivePersonId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PersonDetail | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [coverFaceId, setCoverFaceId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isStatusOpen, setIsStatusOpen] = useState(false);

  const fetchPeople = useCallback(async () => {
    const response = await listPeople(includeHidden);
    setPeople(response.people);
  }, [includeHidden]);

  const fetchStatus = useCallback(async () => {
    setStatus(await getFaceScanStatus());
  }, []);

  const refresh = useCallback(async () => {
    try {
      setIsLoading(true);
      setMessage(null);
      await Promise.all([fetchPeople(), fetchStatus()]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to load people");
    } finally {
      setIsLoading(false);
    }
  }, [fetchPeople, fetchStatus]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (
      !status ||
      (status.ready && status.queued === 0 && status.processing === 0)
    ) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void fetchStatus();
      void fetchPeople();
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [fetchPeople, fetchStatus, status]);

  useEffect(() => {
    if (!activePersonId) {
      setDetail(null);
      setNameDraft("");
      setCoverFaceId(null);
      return;
    }

    let cancelled = false;

    async function fetchDetail() {
      try {
        setIsDetailLoading(true);
        const nextDetail = await getPerson(activePersonId as string);
        if (cancelled) return;
        setDetail(nextDetail);
        setNameDraft(nextDetail.display_name);
        setCoverFaceId(nextDetail.cover_face_id);
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "Failed to load person");
        }
      } finally {
        if (!cancelled) {
          setIsDetailLoading(false);
        }
      }
    }

    void fetchDetail();

    return () => {
      cancelled = true;
    };
  }, [activePersonId]);

  const activePerson = useMemo(
    () => people.find((person) => person.id === activePersonId) ?? null,
    [activePersonId, people],
  );

  const indexedLabel = status
    ? `${status.completed}/${status.total_images} indexed`
    : "Loading";

  const handleBackfill = async () => {
    setIsScanning(true);
    setMessage(null);
    try {
      const result = await startFaceBackfill(false);
      setMessage(`Queued ${result.queued_count} images`);
      await Promise.all([fetchStatus(), fetchPeople()]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to start scan");
    } finally {
      setIsScanning(false);
    }
  };

  const handleSave = async () => {
    if (!detail || !nameDraft.trim()) return;

    setIsSaving(true);
    try {
      const updated = await updatePerson(detail.id, {
        display_name: nameDraft.trim(),
        cover_face_id: coverFaceId,
      });
      setPeople((current) =>
        current.map((person) => (person.id === updated.id ? updated : person)),
      );
      setActivePersonId(null);
      await fetchPeople();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save person");
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleHidden = async () => {
    if (!detail) return;
    setIsSaving(true);
    try {
      await updatePerson(detail.id, { hidden: !detail.hidden });
      setActivePersonId(null);
      await fetchPeople();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to update person");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-4" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage>People</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-sm text-muted-foreground md:inline">
            {status?.ready ? indexedLabel : status?.reason || indexedLabel}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsStatusOpen(true)}
            aria-label="Face recognition status"
          >
            <Info className="h-4 w-4" />
            <span className="hidden sm:inline">Status</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIncludeHidden((value) => !value)}
            aria-label={includeHidden ? "Show visible people" : "Show hidden people"}
          >
            {includeHidden ? (
              <Eye className="h-4 w-4" />
            ) : (
              <EyeOff className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refresh()}
            aria-label="Refresh people"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button size="sm" onClick={handleBackfill} disabled={isScanning}>
            {isScanning ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ScanFace className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">Scan</span>
          </Button>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-6">
        {message && (
          <div className="mb-4 rounded-md border bg-background px-3 py-2 text-sm text-muted-foreground">
            {message}
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : people.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
            No people indexed
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
            {people.map((person) => (
              <button
                key={person.id}
                type="button"
                onClick={() => setActivePersonId(person.id)}
                className={`group relative overflow-hidden rounded-lg bg-muted text-left outline-none ring-offset-background transition focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                  person.hidden ? "opacity-55" : ""
                }`}
              >
                <div className="relative aspect-square">
                  {person.cover_face_id ? (
                    <Image
                      src={getFaceCropUrl(person.cover_face_id, token || undefined)}
                      alt={person.display_name}
                      fill
                      className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                      sizes="(max-width: 768px) 50vw, (max-width: 1280px) 25vw, 16vw"
                      unoptimized
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <UserRound className="h-12 w-12 text-muted-foreground" />
                    </div>
                  )}
                </div>
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-black/0 opacity-95" />
                <div className="absolute inset-x-0 bottom-0 p-3">
                  <p className="truncate text-sm font-medium text-white">
                    {person.display_name}
                  </p>
                  <p className="text-xs text-white/75">{person.photo_count} photos</p>
                </div>
                <div className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                  <Settings className="h-4 w-4" />
                </div>
              </button>
            ))}
          </div>
        )}
      </main>

      <Dialog
        open={Boolean(activePersonId)}
        onOpenChange={(open) => {
          if (!open) setActivePersonId(null);
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{activePerson?.display_name ?? "Person"}</DialogTitle>
            <DialogDescription>
              Change the name and choose which photo should represent this person.
            </DialogDescription>
          </DialogHeader>

          {isDetailLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : detail ? (
            <div className="space-y-6">
              <div>
                <label className="text-sm font-medium" htmlFor="person-name">
                  Name
                </label>
                <Input
                  id="person-name"
                  className="mt-2"
                  value={nameDraft}
                  onChange={(event) => setNameDraft(event.target.value)}
                />
              </div>

              <div>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-medium">Cover Photo</h3>
                  <span className="text-xs text-muted-foreground">
                    {detail.photos.length} photos
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {detail.photos.map((photo) => {
                    const face = getPhotoFace(photo, detail.faces);
                    const isSelected = Boolean(face && coverFaceId === face.id);

                    return (
                      <button
                        key={photo.id}
                        type="button"
                        disabled={!face}
                        onClick={() => {
                          if (face) setCoverFaceId(face.id);
                        }}
                        className={`group/photo relative aspect-square overflow-hidden rounded-md bg-muted outline-none ring-offset-background transition focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
                          isSelected ? "ring-2 ring-primary ring-offset-2" : ""
                        }`}
                      >
                        <Image
                          src={getSecureImageUrl(
                            photo.id,
                            "thumbnail",
                            token || undefined,
                          )}
                          alt={photo.original_filename}
                          fill
                          className="object-cover"
                          sizes="160px"
                          unoptimized
                        />
                        <div className="absolute inset-0 bg-black/0 transition-colors group-hover/photo:bg-black/10" />
                        {isSelected && (
                          <div className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
                            <Check className="h-4 w-4" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}

          <DialogFooter className="gap-2 sm:justify-between sm:space-x-0">
            <Button
              variant="outline"
              onClick={handleToggleHidden}
              disabled={!detail || isSaving}
            >
              {detail?.hidden ? "Unhide" : "Hide"}
            </Button>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setActivePersonId(null)}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={!detail || !nameDraft.trim() || isSaving}
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Save"
                )}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isStatusOpen} onOpenChange={setIsStatusOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Face Recognition</DialogTitle>
            <DialogDescription>
              Model and indexing status for the People view.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-md border p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium">Model</span>
                <span className="text-right text-sm text-muted-foreground">
                  {status?.model_version ?? "Loading"}
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="text-sm font-medium">State</span>
                <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      status?.ready ? "bg-emerald-500" : "bg-amber-500"
                    }`}
                  />
                  {status?.ready ? "Ready" : "Not ready"}
                </span>
              </div>
              {status?.reason && (
                <p className="mt-3 text-sm text-muted-foreground">
                  {status.reason}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-md border p-3">
                <p className="text-muted-foreground">Images</p>
                <p className="mt-1 font-medium">{status?.total_images ?? 0}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-muted-foreground">Indexed</p>
                <p className="mt-1 font-medium">{status?.completed ?? 0}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-muted-foreground">Queued</p>
                <p className="mt-1 font-medium">{status?.queued ?? 0}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-muted-foreground">Failed</p>
                <p className="mt-1 font-medium">{status?.failed ?? 0}</p>
              </div>
            </div>

            {status?.last_error && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                {status.last_error}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
