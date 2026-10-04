"use client";

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import React, { useEffect, useState } from 'react';
import {
  Home,
  UsersRound,
  CalendarCheck,
  Menu,
  LogOut,
  UserCircle,
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
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import type { User } from '@/lib/types';

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  matchExact?: boolean;
  allowedRoles?: Array<User['role'] | 'authenticatedUser'>;
}

const navItems: NavItem[] = [
  { href: '/', label: '대시보드', icon: Home, matchExact: true, allowedRoles: ['admin', 'user', 'viewer'] },
  { href: '/friends', label: '친구 목록', icon: UsersRound, allowedRoles: ['admin', 'user', 'viewer'] },
  { href: '/meetings', label: '모임 목록', icon: CalendarCheck, allowedRoles: ['admin', 'user', 'viewer'] },
  { href: '/meeting-prep', label: '모임 준비', icon: CalendarCheck, allowedRoles: ['admin', 'user'] },
  { href: '/users', label: '사용자 관리', icon: Briefcase, allowedRoles: ['admin'] },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isMobile, setOpenMobile, openMobile } = useSidebar();
  const { currentUser, appUser, userRole, loading, signOut } = useAuth();
  const roleLabel = userRole ? { admin: '관리자', user: '사용자', viewer: '읽기 전용', none: '승인 대기' }[userRole] : '';

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

  const renderNavLinks = (isSheetContext = false) => (
    <SidebarMenu>
      {navItems
        .filter(item => {
          if (loading || !appUser) return false;
          if (userRole === 'none') return false;

          if (!item.allowedRoles) {
            return true;
          }
          if (item.allowedRoles.includes('authenticatedUser')) {
            return true;
          }
          return item.allowedRoles.includes(appUser.role);
        })
        .map((item) => {
          const isActive = item.matchExact ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton
                asChild
                isActive={isActive}
                className="w-full"
                tooltip={isMobile ? undefined : item.label}
              >
                <Link href={item.href} onClick={handleClose} aria-current={isActive ? 'page' : undefined} className="flex w-full items-center gap-2">
                  <item.icon aria-hidden="true" className={isSheetContext ? 'h-5 w-5 shrink-0' : undefined} />
                  <span>{item.label}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
    </SidebarMenu>
  );

  useEffect(() => {
    if (
      isClient &&
      !loading &&
      (!currentUser || userRole === 'none') &&
      pathname !== '/login' &&
      !pathname.startsWith('/share/meeting')
    ) {
      router.replace('/login');
    }
  }, [currentUser, userRole, pathname, loading, isClient, router]);

  if (loading || !isClient) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-muted/40">
        <p className="text-xl text-muted-foreground">앱 로딩 중...</p>
      </div>
    );
  }

  const canShowAppShell = currentUser && userRole !== null && userRole !== 'none';

  if (pathname === '/login' && !canShowAppShell) {
    return <main className="flex-1">{children}</main>;
  }

  if (!canShowAppShell && pathname !== '/login' && !pathname.startsWith('/share/meeting')) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <p>리디렉션 중...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full bg-muted/40">
      {!isMobile && canShowAppShell && (
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
                    variant="outline"
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
                          {appUser?.email || currentUser.email} ({roleLabel})
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
        "flex flex-1 flex-col overflow-y-auto relative"
      )}>
        <header
          className={cn(
            "sticky top-0 z-30 flex h-14 shrink-0 items-center gap-4 border-b bg-background px-4 sm:px-6",
            !isMobile && canShowAppShell && "sm:relative"
          )}
        >
          {isMobile && canShowAppShell && (
            <Sheet open={openMobile} onOpenChange={setOpenMobile}>
              <SheetTrigger asChild>
                <Button size="icon" variant="outline" className="md:hidden" aria-label="메뉴 토글">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="sm:max-w-xs p-0 flex flex-col">
                <SheetTitle className="sr-only">탐색 메뉴</SheetTitle>
                <SheetDescription className="sr-only">모임과 친구 목록으로 이동할 수 있습니다.</SheetDescription>
                <nav aria-label="주 메뉴" className="grid gap-6 text-lg font-medium">
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
                                {appUser?.email || currentUser.email} ({roleLabel})
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
          {(!currentUser && !loading && isMobile && pathname !== '/login' && !pathname.startsWith('/share/meeting')) && (
            <Button asChild variant="outline" size="sm">
              <Link href="/login">로그인</Link>
            </Button>
          )}
          <div className="flex-1">
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
