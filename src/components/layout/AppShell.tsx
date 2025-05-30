
"use client";

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import React, { useRef, useEffect, useState } from 'react';
import {
  Home,
  UsersRound, // For Friends
  CalendarCheck,
  PiggyBank,
  Menu,
  Briefcase, // For N빵친구 title and Users
  LogOut,
  Settings,
  UserCircle, // For user info
  Users as UsersIcon, // For Users menu, renamed to avoid conflict
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
import type { User } from '@/lib/types'; // App's User type

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  matchExact?: boolean;
  adminOnly?: boolean;
  userOrAdmin?: boolean; // For items visible to 'user' or 'admin'
  nonNoneUser?: boolean; // For items visible to any logged-in user not 'none'
}

const navItems: NavItem[] = [
  { href: '/', label: '대시보드', icon: Home, matchExact: true, nonNoneUser: true }, // Visible if role is 'user' or 'admin'
  { href: '/friends', label: '친구 목록', icon: UsersRound, adminOnly: true },
  { href: '/meetings', label: '모임 목록', icon: CalendarCheck, nonNoneUser: true }, // Visible if role is 'user' or 'admin'
  { href: '/reserve-fund', label: '회비 관리', icon: PiggyBank, adminOnly: true },
  { href: '/users', label: '사용자 관리', icon: UsersIcon, adminOnly: true },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isMobile, setOpenMobile, openMobile, toggleSidebar, state } = useSidebar();
  const { currentUser, appUser, isAdmin, userRole, loading, signOut } = useAuth();

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
  };

  const signOutUser = async () => {
    await signOut();
    handleClose();
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
  }, [openMobile, setOpenMobile]);

  const renderNavLinks = (isSheetContext = false) => (
    <SidebarMenu>
      {navItems
        .filter(item => {
          if (loading) return false; // Don't render menu items while auth is loading
          if (item.adminOnly) return isAdmin;
          if (item.userOrAdmin) return isAdmin || userRole === 'user';
          if (item.nonNoneUser) return userRole === 'user' || userRole === 'admin'; // General access for logged-in users with a role
          return true; // Default to visible if no specific role restriction
        })
        .map((item) => {
          const isActive = item.matchExact ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton
                asChild={!isSheetContext}
                isActive={isActive}
                className="w-full"
                tooltip={isMobile || (state === 'expanded' && !isSheetContext) ? undefined : item.label}
                onClick={() => {
                  if (isSheetContext) {
                    router.push(item.href);
                  }
                  handleClose(); // Always close on click for both mobile and desktop (if desired for desktop too)
                }}
              >
                {!isSheetContext ? (
                  <Link href={item.href} className="flex w-full items-center gap-2">
                    <item.icon aria-hidden="true" />
                    <span>{item.label}</span>
                  </Link>
                ) : (
                  <div className="flex w-full items-center gap-2 text-sm">
                    <item.icon aria-hidden="true" className="h-5 w-5 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </div>
                )}
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
    </SidebarMenu>
  );

  if ((loading && !process.env.NEXT_PUBLIC_DEV_MODE_SKIP_AUTH) || !isClient) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-muted/40">
        <p className="text-xl text-muted-foreground">앱 로딩 중...</p>
      </div>
    );
  }

  if (pathname === '/login' && !currentUser && process.env.NEXT_PUBLIC_DEV_MODE_SKIP_AUTH !== "true") {
    return <main className="flex-1">{children}</main>;
  }

  return (
    <div className="flex min-h-screen w-full bg-muted/40">
      {!isMobile && currentUser && userRole !== 'none' && (
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
          <SidebarFooter className="p-2 border-t">
             {currentUser && (
              <SidebarMenu>
                <SidebarMenuItem>
                   <SidebarMenuButton
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start text-left h-auto py-1.5 px-2 cursor-default hover:bg-transparent focus-visible:ring-0"
                      asChild={false}
                      tooltip={appUser?.email || currentUser.email || undefined}
                    >
                      <div className="flex items-center gap-2">
                        <UserCircle className="h-5 w-5 text-muted-foreground" />
                        <div className="flex flex-col text-xs group-data-[collapsible=icon]:hidden">
                          <span className="font-medium truncate">{appUser?.name || currentUser.displayName || '사용자'}</span>
                          <span className="text-muted-foreground truncate">{appUser?.email || currentUser.email} ({appUser?.role || 'N/A'})</span>
                        </div>
                      </div>
                    </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    tooltip={isMobile || state === 'expanded' ? undefined : `로그아웃`}
                    onClick={signOutUser}
                    className="w-full"
                  >
                    <LogOut aria-hidden="true" />
                    <span>로그아웃</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            )}
          </SidebarFooter>
        </Sidebar>
      )}

      <div className="flex flex-1 flex-col overflow-y-auto">
        <header
          className={cn(
            "sticky top-0 z-30 flex h-14 shrink-0 items-center gap-4 border-b bg-background px-4 sm:px-6",
            // Desktop header might be minimal or non-existent if sidebar takes full height
            // For mobile, it contains the sheet trigger
          )}
        >
          {isMobile && currentUser && userRole !== 'none' && (
            <Sheet open={openMobile} onOpenChange={setOpenMobile}>
              <SheetTrigger asChild>
                <Button ref={sheetTriggerRef} size="icon" variant="outline" className="sm:hidden" aria-label="메뉴 토글">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent ref={sheetContentRef} side="left" className="sm:max-w-xs p-0 flex flex-col">
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
                {currentUser && (
                  <div className="p-2 mt-auto border-t">
                    <SidebarMenu>
                       <SidebarMenuItem>
                          <div className="flex items-center gap-2 p-2 text-sm">
                            <UserCircle className="h-5 w-5 text-muted-foreground" />
                            <div className="flex flex-col">
                              <span className="font-medium truncate">{appUser?.name || currentUser.displayName || '사용자'}</span>
                              <span className="text-xs text-muted-foreground truncate">{appUser?.email || currentUser.email} ({appUser?.role || 'N/A'})</span>
                            </div>
                          </div>
                      </SidebarMenuItem>
                      <SidebarMenuItem>
                        <SidebarMenuButton onClick={signOutUser} className="w-full">
                           <div className="flex w-full items-center gap-2 text-sm">
                              <LogOut aria-hidden="true" className="h-5 w-5 shrink-0" />
                              <span className="truncate">로그아웃</span>
                           </div>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    </SidebarMenu>
                  </div>
                )}
              </SheetContent>
            </Sheet>
          )}
           {(!currentUser || userRole === 'none' && !loading && process.env.NEXT_PUBLIC_DEV_MODE_SKIP_AUTH !== "true") && isMobile && pathname !== '/login' && (
             <Button asChild variant="outline" size="sm">
               <Link href="/login">로그인</Link>
             </Button>
           )}
          <div className="flex-1">
            {/* Potential header content for desktop if needed */}
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
