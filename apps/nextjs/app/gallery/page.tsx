import { mockAlbums } from "@/lib/mock-data";
import { AlbumGrid } from "@/components/gallery";
import { Plus } from "lucide-react";
import Link from "next/link";

export const metadata = {
  title: "Gallery | Client Pix",
  description: "Your photo albums",
};

export default function GalleryPage() {
  return (
    <main className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Albums</h1>
              <p className="text-sm text-muted-foreground">
                {mockAlbums.length} albums
              </p>
            </div>
            
            <button className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">New Album</span>
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <AlbumGrid albums={mockAlbums} />
      </div>
    </main>
  );
}

