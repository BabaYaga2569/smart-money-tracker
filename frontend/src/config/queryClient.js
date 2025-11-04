import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Cache data for 5 minutes
      staleTime: 5 * 60 * 1000,
      
      // Keep cached data for 10 minutes
      gcTime: 10 * 60 * 1000,
      
      // Refetch on window focus (user returns to tab)
      refetchOnWindowFocus: true,
      
      // Refetch on reconnect (network comes back)
      refetchOnReconnect: true,
      
      // Don't retry failed queries immediately
      retry: 1,
    },
    mutations: {
      // Retry failed mutations once
      retry: 1,
    },
  },
});
