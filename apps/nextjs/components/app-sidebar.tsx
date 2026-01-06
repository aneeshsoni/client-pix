"use client";

import * as React from "react";
import { Home, CreditCard, User, Settings2, Images, Folder } from "lucide-react";
import { useUser } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { NavMain } from "@/components/nav-main";
import UserSection from "@/components/UserSection";
import { TeamSwitcher } from "@/components/team-switcher";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar";
import { listAlbums, type Album } from "@/lib/api";

// Base navigation items (without dynamic albums)
const baseNavItems = [
  {
    title: "Home",
    url: "/dashboard",
    icon: Home,
    isActive: false,
  },
  {
    title: "Billing",
    url: "/dashboard/billing",
    icon: CreditCard,
    isActive: false,
  },
  {
    title: "Settings",
    url: "/dashboard/settings",
    icon: Settings2,
    isActive: false,
  },
];

// This is sample data for teams - you can customize this
const data = {
  teams: [
    {
      name: "Personal",
      logo: User,
      plan: "Free",
    },
    {
      name: "Pro Team",
      logo: CreditCard,
      plan: "Pro",
    },
    {
      name: "Enterprise",
      logo: Settings2,
      plan: "Enterprise",
    },
  ],
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { user, isLoaded } = useUser();
  const pathname = usePathname();
  const [albums, setAlbums] = useState<Album[]>([]);
  const [isLoadingAlbums, setIsLoadingAlbums] = useState(true);

  // Fetch albums for sidebar
  useEffect(() => {
    const fetchAlbums = async () => {
      try {
        const response = await listAlbums();
        setAlbums(response.albums);
      } catch (error) {
        console.error("Failed to fetch albums for sidebar:", error);
      } finally {
        setIsLoadingAlbums(false);
      }
    };

    if (isLoaded) {
      fetchAlbums();
    }
  }, [isLoaded]);

  // Build navigation items with dynamic albums
  const navItems = React.useMemo(() => {
    const galleryItem = {
      title: "Gallery",
      url: "/dashboard/gallery",
      icon: Images,
      isActive: pathname === "/dashboard/gallery",
    };

    const albumsItem = {
      title: "Albums",
      url: "/dashboard/albums",
      icon: Folder,
      isActive: pathname === "/dashboard/albums" || pathname?.startsWith("/dashboard/albums/"),
      items: albums.map((album) => ({
        title: album.title,
        url: `/dashboard/albums/${album.slug}`,
        isActive: pathname === `/dashboard/albums/${album.slug}`,
      })),
    };

    // Update base nav items with active state
    const updatedBaseNavItems = baseNavItems.map((item) => ({
      ...item,
      isActive: pathname === item.url || (item.url !== "/dashboard" && pathname?.startsWith(item.url)),
    }));

    return [updatedBaseNavItems[0], galleryItem, albumsItem, ...updatedBaseNavItems.slice(1)];
  }, [albums, pathname]);

  // Don't render if Clerk is not loaded or user is not authenticated
  if (!isLoaded) {
    return null;
  }

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <TeamSwitcher teams={data.teams} />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navItems} />
      </SidebarContent>
      <SidebarFooter>
        <UserSection
          user={
            user
              ? {
                  firstName: user.firstName,
                  lastName: user.lastName,
                  email: user.emailAddresses[0]?.emailAddress,
                }
              : undefined
          }
        />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
