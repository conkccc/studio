'use client';

import React from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { parseTheme } from '@/lib/theme';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

const labels = { system: '시스템 설정', light: '밝게', dark: '어둡게' };
export function ThemeMenu() {
  const { preference, ready, setPreference } = useTheme();
  const Icon = preference === 'system' ? Monitor : preference === 'dark' ? Moon : Sun;
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="outline" size="sm" disabled={!ready} aria-label={`화면 테마: ${labels[preference]}`} title="화면 테마 변경">
        <Icon aria-hidden="true" className="h-4 w-4" /><span className="ml-2 hidden sm:inline">{labels[preference]}</span>
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuLabel>화면 테마</DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuRadioGroup value={preference} onValueChange={value => setPreference(parseTheme(value))}>
        <DropdownMenuRadioItem value="system"><Monitor aria-hidden="true" className="mr-2 h-4 w-4" />시스템 설정</DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="light"><Sun aria-hidden="true" className="mr-2 h-4 w-4" />밝게</DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="dark"><Moon aria-hidden="true" className="mr-2 h-4 w-4" />어둡게</DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>;
}
