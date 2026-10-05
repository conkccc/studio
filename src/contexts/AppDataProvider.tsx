'use client';
import React, { useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { getAppQueryClient } from '@/lib/app-query-client';

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(getAppQueryClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
