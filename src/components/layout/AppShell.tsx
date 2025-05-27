
"use client";

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React, { useRef, useEffect } from 'react';
import {
  Home,
  UsersRound,
  CalendarCheck,
  PiggyBank,
  Brain,
  Settings,
  Menu,
  Briefcase,
} from 'lucide-react';

import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  useSidebar,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  matchExact?: boolean;
}

const navItems: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: Home, matchExact: true },
  { href: '/friends', label: 'Friends', icon: UsersRound },
  { href: '/meetings', label: 'Meetings', icon: CalendarCheck },
  { href: '/reserve-fund', label: 'Reserve Fund', icon: PiggyBank },
  { href: '/ai-analysis', label: 'AI Cost Analysis', icon: Brain },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { isMobile, setOpen, open, openMobile, setOpenMobile, toggleSidebar, state } = useSidebar();

  const sheetTriggerRef = useRef<HTMLButtonElement>(null);
  const sheetContentRef = useRef<HTMLDivElement>(null);

  const handleClose = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
    // For desktop, we might not want to close an expanded sidebar on nav click
    // but if it's 'icon' (collapsed), this won't affect it.
    // If `open` is managed by `collapsible="icon"`, then `setOpen` might not be needed here for desktop.
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        openMobile &&
        sheetContentRef.current &&
        !sheetContentRef.current.contains(event.target as Node) &&
        sheetTriggerRef.current &&
        !sheetTriggerRef.current.contains(event.target as Node)
      ) {
        setOpenMobile(false);
      }
    };

    if (openMobile) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [openMobile, setOpenMobile, sheetTriggerRef, sheetContentRef]);


  const renderNavLinks = (isSheetContext = false) => (
    <SidebarMenu>
      {navItems.map((item) => {
        const isActive = item.matchExact ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <SidebarMenuItem key={item.href}>
            <Link href={item.href} passHref legacyBehavior={false}>
              <SidebarMenuButton
                asChild={!isSheetContext} 
                isActive={isActive}
                className="w-full"
                tooltip={isMobile || (state === 'expanded' && !isSheetContext) ? undefined : item.label}
                onClick={handleClose}
              >
                <span> {/* This span is crucial for asChild with multiple children */}
                  <item.icon aria-hidden="true" />
                  <span>{item.label}</span>
                </span>
              </SidebarMenuButton>
            </Link>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );

  return (
    <div 
        className={cn(
            "flex min-h-screen w-full flex-col bg-muted/40 transition-[padding-left] duration-300 ease-in-out",
            !isMobile && state === 'expanded' && "sm:pl-[calc(var(--sidebar-width)_+_1rem)]",
            !isMobile && state === 'collapsed' && "sm:pl-[calc(var(--sidebar-width-icon)_+_1rem)]",
            isMobile && "pl-0" // Ensure no padding-left on mobile
        )}
    >
        {/* Desktop Sidebar */}
        {!isMobile && (
          <Sidebar collapsible="icon" variant="sidebar" side="left" className="border-r group/sidebar">
            <SidebarHeader className="p-4">
              <Link href="/" className="flex items-center gap-2 font-semibold group-data-[collapsible=icon]:justify-center" onClick={handleClose}>
                <Briefcase className="h-6 w-6 text-primary group-data-[collapsible=icon]:h-7 group-data-[collapsible=icon]:w-7" />
                <span className="group-data-[collapsible=icon]:hidden">N빵친구</span>
              </Link>
            </SidebarHeader>
            <SidebarContent className="flex-1 p-2">
              {renderNavLinks(false)}
            </SidebarContent>
            <SidebarFooter className="p-2">
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    tooltip={isMobile || state === 'expanded' ? undefined : "Settings"}
                    onClick={() => {
                      // For settings, always close mobile if open
                      if (isMobile) setOpenMobile(false);
                      // Potentially open settings modal or navigate
                      console.log("Settings clicked");
                    }}
                  >
                    <span>
                      <Settings aria-hidden="true" />
                      <span>Settings</span>
                    </span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarFooter>
          </Sidebar>
        )}

       <header 
        className={cn(
            "sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background px-4",
            "sm:static sm:h-auto sm:border-0 sm:bg-transparent sm:px-6",
            isMobile ? "mb-0" : "mb-6" // No bottom margin for mobile header, margin for desktop
        )}
       >
          {isMobile && (
            <Sheet open={openMobile} onOpenChange={setOpenMobile}>
              <SheetTrigger asChild>
                <Button ref={sheetTriggerRef} size="icon" variant="outline" className="sm:hidden" aria-label="Toggle Menu">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent ref={sheetContentRef} side="left" className="sm:max-w-xs p-0">
                <nav className="grid gap-6 text-lg font-medium">
                  <Link
                    href="/"
                    className="group flex h-16 items-center justify-center gap-2 border-b px-6 text-lg font-semibold text-primary"
                    onClick={handleClose}
                  >
                    <Briefcase className="h-7 w-7" />
                    <span>N빵친구</span>
                  </Link>
                  <div className="p-2">
                    {renderNavLinks(true)}
                  </div>
                </nav>
              </SheetContent>
            </Sheet>
          )}
           <div className="flex-1">
             {/* Optional: Breadcrumbs or Page Title for desktop header */}
           </div>
           {/* Optional: User Menu for desktop header */}
        </header>
        <main className="flex-1 p-4 sm:px-6 sm:pb-6 sm:pt-0"> {/* Adjusted padding for main content */}
          {children}
        </main>
    </div>
  );
}
