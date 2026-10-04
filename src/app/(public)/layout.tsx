import { ThemeMenu } from '@/components/layout/ThemeMenu';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <>
    <header className="flex h-14 items-center justify-end px-4 sm:px-6"><ThemeMenu /></header>
    {children}
  </>;
}
