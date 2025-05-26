
"use client";

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React, { useRef, useEffect } from 'react'; // Added useRef and useEffect
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
  // Ensure all necessary values are destructured from useSidebar
  const { isMobile, setOpen, openMobile, setOpenMobile, state } = useSidebar();

  const sheetTriggerRef = useRef<HTMLButtonElement>(null);
  const sheetContentRef = useRef<HTMLDivElement>(null);

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
                tooltip={isMobile || state === 'expanded' ? undefined : item.label}
                onClick={() => {
                  if (isMobile) setOpenMobile(false);
                  // For desktop, nav clicks shouldn't close an expanded sidebar by default
                }}
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
    <div className={cn(
        "flex min-h-screen w-full flex-col bg-muted/40 transition-[padding-left] duration-300 ease-in-out",
        !isMobile && state === 'expanded' && "sm:pl-[calc(var(--sidebar-width)_+_1rem)]",
        !isMobile && state === 'collapsed' && "sm:pl-[calc(var(--sidebar-width-icon)_+_1rem)]",
        isMobile && "sm:pl-0"
      )}>
        {/* Desktop Sidebar */}
        {!isMobile && (
          <Sidebar collapsible="icon" variant="sidebar" side="left" className="border-r group/sidebar">
            <SidebarHeader className="p-4">
              <Link href="/" className="flex items-center gap-2 font-semibold group-data-[collapsible=icon]:justify-center" onClick={() => { if (isMobile) setOpenMobile(false); }}>
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
                      if (isMobile) setOpenMobile(false);
                      // Potentially open settings modal or navigate
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

       <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background px-4 sm:static sm:h-auto sm:border-0 sm:bg-transparent sm:px-6 mb-4">
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
                    onClick={() => setOpenMobile(false)}
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
             {/* Optional: Breadcrumbs or Page Title */}
           </div>
           {/* Optional: User Menu */}
        </header>
        <main className="flex-1 p-4 sm:px-6 sm:py-0">
          {children}
        </main>
    </div>
  );
}
