"use client";

import Image from "next/image";
import Link from "next/link";

import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

export function TeamSwitcher() {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          size="lg"
          asChild
          className="group-data-[collapsible=icon]:!justify-center"
        >
          <Link href="/dashboard">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg p-1">
              <Image
                src="/client_pix_logo.png"
                alt="Client Pix"
                width={32}
                height={32}
                className="h-full w-full object-contain"
                priority
              />
            </div>
            <div className="grid min-w-0 flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
              <span className="truncate font-semibold">Client Pix</span>
              <span className="truncate text-xs text-muted-foreground">
                Photo Gallery
              </span>
            </div>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
