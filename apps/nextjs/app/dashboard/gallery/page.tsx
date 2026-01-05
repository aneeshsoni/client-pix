import { mockAlbums } from "@/lib/mock-data";
import { AlbumGrid } from "@/components/gallery";
import { GalleryHeader } from "@/components/gallery/GalleryHeader";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

export const metadata = {
  title: "Gallery | Client Pix",
  description: "Your photo albums",
};

export default function GalleryPage() {
  return (
    <>
      {/* Header */}
      <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-4" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage>Gallery</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <GalleryHeader albumCount={mockAlbums.length} />
      </header>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <AlbumGrid albums={mockAlbums} />
      </div>
    </>
  );
}
