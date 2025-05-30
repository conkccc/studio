
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
  LogOut,
  UserCircle,
  Briefcase, // For Users menu
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
  userOrAdmin?: boolean;
}

const navItems: NavItem[] = [
  { href: '/', label: '대시보드', icon: Home, matchExact: true, userOrAdmin: true },
  { href: '/friends', label: '친구 목록', icon: UsersRound, adminOnly: true },
  { href: '/meetings', label: '모임 목록', icon: CalendarCheck, userOrAdmin: true },
  { href: '/reserve-fund', label: '회비 관리', icon: PiggyBank, adminOnly: true },
  { href: '/users', label: '사용자 관리', icon: Briefcase, adminOnly: true },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isMobile, setOpenMobile, openMobile } = useSidebar();
  const { currentUser, appUser, isAdmin, userRole, loading, signOut } = useAuth();

  const sheetTriggerRef = useRef<HTMLButtonElement>(null);
  const sheetContentRef = useRef<HTMLDivElement>(null);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true); // Ensure client-side only logic runs after mount
  }, []);

  const handleClose = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  const signOutUser = async () => {
    await signOut();
    handleClose(); // Ensure sidebar closes after sign out attempt
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
          if (loading) return false;
          if (userRole === 'none') return item.href === '/'; // 'none' role only sees Dashboard
          if (item.adminOnly) return isAdmin;
          if (item.userOrAdmin) return isAdmin || userRole === 'user';
          return true;
        })
        .map((item) => {
          const isActive = item.matchExact ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton
                asChild={!isSheetContext} // Link is child only in desktop sidebar
                isActive={isActive}
                className="w-full"
                tooltip={isMobile ? undefined : item.label}
                onClick={() => {
                  if (isSheetContext) { // In mobile sheet, button itself handles navigation via router.push
                    router.push(item.href);
                  }
                  handleClose(); // Always close on click
                }}
              >
                {isSheetContext ? (
                  // Mobile: Button contains icon and text directly
                  <div className="flex w-full items-center gap-2 text-sm">
                    <item.icon aria-hidden="true" className="h-5 w-5 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </div>
                ) : (
                  // Desktop: Button wraps Link (asChild=true implicitly by not being isSheetContext)
                  // So, Link becomes the actual button content
                  <Link href={item.href} className="flex w-full items-center gap-2">
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

  if ((loading && process.env.NEXT_PUBLIC_DEV_MODE_SKIP_AUTH !== "true") || !isClient) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-muted/40">
        <p className="text-xl text-muted-foreground">앱 로딩 중...</p>
      </div>
    );
  }
  
  // If dev mode skip auth is on, or if user is logged in and has a role, show the app shell
  const canShowAppShell = process.env.NEXT_PUBLIC_DEV_MODE_SKIP_AUTH === "true" || (currentUser && userRole !== null);

  if (pathname === '/login' && !canShowAppShell) {
    return <main className="flex-1">{children}</main>; // Render login page without shell
  }
  
  if (!canShowAppShell && pathname !== '/login' && !pathname.startsWith('/share/meeting')) {
     // This case should ideally be handled by middleware redirecting to /login
     // If middleware is not perfectly catching all, this is a fallback.
     // Or, if a user with role 'none' tries to access a non-dashboard page.
     return (
        <div className="flex justify-center items-center min-h-screen">
            <p>리디렉션 중...</p>
        </div>
     );
  }


  return (
    <div className="flex min-h-screen w-full bg-muted/40">
      {!isMobile && canShowAppShell && userRole !== 'none' && (
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
                        <span className="text-muted-foreground truncate">
                          {appUser?.email || currentUser.email} ({userRole || 'N/A'})
                        </span>
                      </div>
                    </div>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    tooltip={isMobile ? undefined : `로그아웃`}
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

      <div className={cn(
        "flex flex-1 flex-col overflow-y-auto",
        // Desktop: Apply left margin when sidebar is present and not mobile
        !isMobile && canShowAppShell && userRole !== 'none' && "sm:ml-[var(--sidebar-width)] group-data-[state=collapsed]/sidebar-wrapper:sm:ml-[var(--sidebar-width-icon)] transition-[margin-left] duration-300 ease-in-out"
      )}>
        <header
          className={cn(
            "sticky top-0 z-30 flex h-14 shrink-0 items-center gap-4 border-b bg-background px-4 sm:px-6",
            // If not mobile and app shell is shown, header might be simpler or part of main content flow
            !isMobile && canShowAppShell && "sm:relative" // Adjust as needed for desktop header
          )}
        >
          {isMobile && canShowAppShell && ( // Show menu trigger only on mobile and if app shell is visible
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
                              <span className="text-xs text-muted-foreground truncate">
                                {appUser?.email || currentUser.email} ({userRole || 'N/A'})
                              </span>
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
           {(!currentUser && !loading && process.env.NEXT_PUBLIC_DEV_MODE_SKIP_AUTH !== "true") && isMobile && pathname !== '/login' && !pathname.startsWith('/share/meeting') && (
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
