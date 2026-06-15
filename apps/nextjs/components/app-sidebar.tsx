"use client";

import * as React from "react";
import { Settings2, Images, Folder, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { NavMain } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import { TeamSwitcher } from "@/components/team-switcher";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar";
import { listAlbums, type Album } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { isAuthenticated } = useAuth();
  const pathname = usePathname();
  const [albums, setAlbums] = useState<Album[]>([]);
  const [_isLoadingAlbums, setIsLoadingAlbums] = useState(true);

  const fetchAlbums = useCallback(async () => {
    try {
      setIsLoadingAlbums(true);
      const response = await listAlbums();
      setAlbums(response.albums);
      return true;
    } catch (error) {
      console.error("Failed to fetch albums for sidebar:", error);
      return false;
    } finally {
      setIsLoadingAlbums(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      void fetchAlbums();
    }
  }, [fetchAlbums, isAuthenticated, pathname]);

  useEffect(() => {
    if (!isAuthenticated || albums.length > 0) {
      return;
    }

    const retryId = window.setTimeout(async () => {
      await fetchAlbums();
    }, 2000);

    return () => window.clearTimeout(retryId);
  }, [albums.length, fetchAlbums, isAuthenticated]);

  // Build navigation items with dynamic albums
  const navItems = React.useMemo(() => {
    const galleryItem = {
      title: "Gallery",
      url: "/dashboard/gallery",
      icon: Images,
      isActive: pathname === "/dashboard/gallery" || pathname === "/dashboard",
    };

    const albumsItem = {
      title: "Albums",
      url: "/dashboard/albums",
      icon: Folder,
      isActive: pathname === "/dashboard/albums",
      items: albums.map((album) => ({
        title: album.title,
        url: `/dashboard/albums/${album.slug}`,
        isActive: pathname === `/dashboard/albums/${album.slug}`,
      })),
    };

    const settingsItem = {
      title: "Settings",
      url: "/dashboard/settings",
      icon: Settings2,
      isActive:
        pathname === "/dashboard/settings" ||
        pathname?.startsWith("/dashboard/settings"),
    };

    const peopleItem = {
      title: "People",
      url: "/dashboard/people",
      icon: Users,
      isActive:
        pathname === "/dashboard/people" ||
        pathname?.startsWith("/dashboard/people"),
    };

    return [galleryItem, albumsItem, peopleItem, settingsItem];
  }, [albums, pathname]);

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <TeamSwitcher />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navItems} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
