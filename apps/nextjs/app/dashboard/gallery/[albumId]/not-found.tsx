import Link from "next/link";
import { FolderX, ArrowLeft } from "lucide-react";

export default function AlbumNotFound() {
  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="text-center">
        <FolderX className="h-16 w-16 text-muted-foreground mx-auto mb-6" />
        <h1 className="text-2xl font-semibold mb-2">Album not found</h1>
        <p className="text-muted-foreground mb-8">
          The album you're looking for doesn't exist or has been removed.
        </p>
        <Link
          href="/dashboard/gallery"
          className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to albums
        </Link>
      </div>
    </main>
  );
}
