import { useEffect } from 'react';
import { apiRequest } from '@/lib/api';

export const useHeartbeat = (isLoggedIn: boolean) => {
  useEffect(() => {
    if (!isLoggedIn) return;

    const sendHeartbeat = async () => {
      try {
        await apiRequest('/api/users/heartbeat', 'POST');
      } catch (error) {
        console.error('Heartbeat failed', error);
      }
    };

    // Send immediately on mount
    sendHeartbeat();

    // Set up interval (every 60 seconds)
    const interval = setInterval(sendHeartbeat, 60000);

    return () => clearInterval(interval);
  }, [isLoggedIn]);
};
