
"use client";

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation'; // Added useRouter
import React, { useRef, useEffect, useState } from 'react';
import {
  Home,
  UsersRound,
  CalendarCheck,
  PiggyBank,
  Menu,
  Briefcase,
  LogOut,
  Settings, // Added Settings icon
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
import { useAuth } from '@/contexts/AuthContext';

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  matchExact?: boolean;
  adminOnly?: boolean;
}

const navItems: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: Home, matchExact: true, adminOnly: true },
  { href: '/friends', label: 'Friends', icon: UsersRound, adminOnly: true },
  { href: '/meetings', label: 'Meetings', icon: CalendarCheck, adminOnly: false },
  { href: '/reserve-fund', label: 'Reserve Fund', icon: PiggyBank, adminOnly: true },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter(); // Initialize router
  const { isMobile, setOpen, open, openMobile, setOpenMobile, state, toggleSidebar } = useSidebar();
  const { currentUser, isAdmin, loading, signOut } = useAuth();

  const sheetTriggerRef = useRef<HTMLButtonElement>(null);
  const sheetContentRef = useRef<HTMLDivElement>(null);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const handleClose = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
    // For desktop, closing is handled by Link navigation or specific button actions.
    // If desktop sidebar needs explicit close on nav, setOpen(false) could be added,
    // but this might conflict with collapsible="icon" behavior.
  };

  const signOutUser = async () => {
    await signOut();
    handleClose(); // Close sheet/sidebar if open
    // router.push('/login'); // signOut in AuthContext already handles this
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
      {navItems.filter(item => !item.adminOnly || isAdmin).map((item) => {
        const isActive = item.matchExact ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <SidebarMenuItem key={item.href}>
            <SidebarMenuButton
              asChild={!isSheetContext} // Button on mobile, Link (as child) on desktop
              isActive={isActive}
              className="w-full"
              tooltip={isMobile || (state === 'expanded' && !isSheetContext) ? undefined : item.label}
              onClick={() => {
                if (isSheetContext) { // Mobile sheet context
                  router.push(item.href); // Programmatic navigation for mobile
                  handleClose();
                }
                // For desktop, if asChild is true, Link handles navigation.
                // If asChild is false (not typical for nav items here unless direct action), onClick would be primary.
              }}
            >
              {isSheetContext ? (
                // Mobile: Children are icon and text, button is rendered by SidebarMenuButton
                <div className="flex w-full items-center gap-2">
                  <item.icon aria-hidden="true" className="h-5 w-5 shrink-0" />
                  <span className="text-sm truncate">{item.label}</span>
                </div>
              ) : (
                // Desktop: Link is the child, and it contains icon and text.
                <Link href={item.href} className="flex items-center gap-2">
                  <item.icon aria-hidden="true" />
                  <span>{item.label}</span>
                </Link>
              )}
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );


  if (loading || !isClient) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-muted/40">
        <p className="text-xl text-muted-foreground">앱 로딩 중...</p>
      </div>
    );
  }

  if (pathname === '/login') {
    return <main className="flex-1">{children}</main>;
  }

  return (
    <div className="flex min-h-screen w-full bg-muted/40">
      {!isMobile && (
        <Sidebar collapsible="icon" variant="sidebar" side="left" className="border-r group/sidebar">
          <SidebarHeader className="p-4">
            <Link href="/" className="flex items-center gap-2 font-semibold group-data-[collapsible=icon]:justify-center">
              <Briefcase className="h-6 w-6 text-primary group-data-[collapsible=icon]:h-7 group-data-[collapsible=icon]:w-7" />
              <span className="group-data-[collapsible=icon]:hidden">N빵친구</span>
            </Link>
          </SidebarHeader>
          <SidebarContent className="flex-1 p-2">
            {renderNavLinks(false)}
          </SidebarContent>
          <SidebarFooter className="p-2">
            <SidebarMenu>
              {currentUser && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    tooltip={isMobile || state === 'expanded' ? undefined : `로그아웃 (${currentUser.email?.split('@')[0]})`}
                    onClick={signOutUser}
                  >
                    <span className="flex items-center gap-2">
                      <LogOut aria-hidden="true" />
                      <span>로그아웃</span>
                    </span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>
      )}

      {/* Main content area wrapper */}
      <div className="flex flex-1 flex-col overflow-y-auto">
        <header
          className={cn(
            "sticky top-0 z-30 flex h-14 shrink-0 items-center gap-4 border-b bg-background px-4 sm:px-6"
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
                  {currentUser && (
                    <div className="p-2 mt-auto border-t">
                      <SidebarMenu>
                        <SidebarMenuItem>
                          <SidebarMenuButton onClick={signOutUser}>
                            <span className="flex w-full items-center gap-2 text-sm">
                              <LogOut aria-hidden="true" className="h-5 w-5 shrink-0" />
                              <span className="truncate">로그아웃</span>
                              {currentUser.email && (
                                <span className="ml-auto truncate text-xs text-muted-foreground">
                                  ({currentUser.email.split('@')[0]})
                                </span>
                              )}
                            </span>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      </SidebarMenu>
                    </div>
                  )}
                </nav>
              </SheetContent>
            </Sheet>
          )}
          <div className="flex-1">
            {/* Placeholder for potential header content like search or user dropdown on desktop */}
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
