// src/components/layout/AppShell.tsx
"use client";

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
  // SidebarTrigger, // Not used directly in this file, but available from sidebar export
  // SidebarInset, // Not used directly
  useSidebar,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

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
  // Destructure all needed properties from useSidebar
  const { isMobile, setOpen, setOpenMobile, toggleSidebar, open, state } = useSidebar();

  // Define handleClose based on the context (mobile or desktop)
  const handleClose = () => {
    if (isMobile) {
      setOpenMobile(false);
    } else {
      // For desktop, this will collapse the sidebar if it's 'icon' collapsible and open
      setOpen(false);
    }
  };

  const renderNavLinks = (isSheet = false) => (
    <SidebarMenu>
      {navItems.map((item) => {
        const isActive = item.matchExact ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <SidebarMenuItem key={item.href}>
            <Link href={item.href} passHref legacyBehavior onClick={isSheet ? handleClose : undefined}>
              <SidebarMenuButton
                asChild={!isSheet}
                isActive={isActive}
                className="w-full"
                tooltip={isMobile ? undefined : item.label}
              >
                {/* Ensure single child for Slot when asChild is true */}
                <span>
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
    <div className="flex min-h-screen w-full flex-col bg-muted/40">
      {!isMobile && (
        <Sidebar collapsible="icon" variant="default" side="left" className="border-r group/sidebar"> {/* Added group/sidebar for data state access */}
          <SidebarHeader className="p-4">
            <Link href="/" className="flex items-center gap-2 font-semibold group-data-[collapsible=icon]:justify-center">
              <Briefcase className="h-6 w-6 text-primary group-data-[collapsible=icon]:h-7 group-data-[collapsible=icon]:w-7" />
              <span className="group-data-[collapsible=icon]:hidden">N빵친구</span>
            </Link>
          </SidebarHeader>
          <SidebarContent className="flex-1 p-2">
            {renderNavLinks()}
          </SidebarContent>
          <SidebarFooter className="p-2">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip={isMobile ? undefined : "Settings"}
                  onClick={handleClose} // Use defined handleClose
                >
                  {/* Ensure single child wrapper even if asChild is false (default) for consistency */}
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

      <div className={`flex flex-col sm:gap-4 sm:py-4 ${isMobile ? 'sm:pl-0' : 'sm:pl-[calc(var(--sidebar-width-icon)_+_1rem)] group-data-[state=expanded]/sidebar-wrapper:sm:pl-[calc(var(--sidebar-width)_+_1rem)]'} transition-[padding-left] duration-300 ease-in-out`}>
        <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background px-4 sm:static sm:h-auto sm:border-0 sm:bg-transparent sm:px-6">
          {isMobile && (
            <Sheet>
              <SheetTrigger asChild>
                <Button size="icon" variant="outline" className="sm:hidden">
                  <Menu className="h-5 w-5" />
                  <span className="sr-only">Toggle Menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="sm:max-w-xs p-0">
                <nav className="grid gap-6 text-lg font-medium">
                  <Link
                    href="/"
                    className="group flex h-16 items-center justify-center gap-2 border-b px-6 text-lg font-semibold text-primary"
                    onClick={handleClose} // Close sheet on navigating from sheet header link
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
    </div>
  );
}
