
"use client";

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React, { useRef, useEffect, useState } from 'react';
import {
  Home,
  UsersRound,
  CalendarCheck,
  PiggyBank,
  // Brain, // Removed Brain icon
  Settings,
  Menu,
  Briefcase,
  LogOut,
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
import { useAuth } from '@/contexts/AuthContext'; // Import useAuth

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
  { href: '/meetings', label: 'Meetings', icon: CalendarCheck, adminOnly: false }, // Meetings accessible by all
  { href: '/reserve-fund', label: 'Reserve Fund', icon: PiggyBank, adminOnly: true },
  // { href: '/ai-analysis', label: 'AI Cost Analysis', icon: Brain, adminOnly: false }, // Removed AI Analysis link
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { isMobile, setOpenMobile, openMobile, state } = useSidebar();
  const { currentUser, isAdmin, loading, signOut } = useAuth(); // Get signOut from useAuth

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
              asChild={!isSheetContext}
              isActive={isActive}
              className="w-full"
              tooltip={isMobile || (state === 'expanded' && !isSheetContext) ? undefined : item.label}
              onClick={handleClose}
            >
              <Link href={item.href} passHref legacyBehavior={false}>
                <item.icon aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
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


  // Hide sidebar and main content structure for login page
  if (pathname === '/login') {
    return <main className="flex-1">{children}</main>;
  }


  return (
    <div 
        className={cn(
            "flex min-h-screen w-full flex-col bg-muted/40 transition-[padding-left] duration-300 ease-in-out",
            !isMobile && state === 'expanded' && "sm:pl-[calc(var(--sidebar-width)_+_1rem)]",
            !isMobile && state === 'collapsed' && "sm:pl-[calc(var(--sidebar-width-icon)_+_1rem)]",
            isMobile && "pl-0" 
        )}
    >
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
                {currentUser && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      tooltip={isMobile || state === 'expanded' ? undefined : `로그아웃 (${currentUser.email?.split('@')[0]})`}
                      onClick={async () => {
                        if (isMobile) setOpenMobile(false);
                        await signOut();
                      }}
                    >
                      <span>
                        <LogOut aria-hidden="true" />
                        <span>로그아웃</span>
                      </span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
                {/* Settings button can be added here if needed */}
              </SidebarMenu>
            </SidebarFooter>
          </Sidebar>
        )}

       <header 
        className={cn(
            "sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background px-4",
            "sm:static sm:h-auto sm:border-0 sm:bg-transparent sm:px-6",
            isMobile ? "mb-0" : "sm:mb-6" 
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
                            <SidebarMenuButton
                              onClick={async () => {
                                setOpenMobile(false);
                                await signOut();
                              }}
                            >
                              <span>
                                <LogOut aria-hidden="true" />
                                <span>로그아웃</span>
                                {currentUser.email && <span className="text-xs text-muted-foreground ml-auto truncate">({currentUser.email.split('@')[0]})</span>}
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
           </div>
        </header>
        <main className="flex-1 p-4 sm:px-6 sm:pb-6 sm:pt-0"> 
          {children}
        </main>
    </div>
  );
}
