import React, { createContext, useContext, useEffect, useState } from 'react';
import { StreamVideo, StreamVideoClient } from '@stream-io/video-react-sdk';
import { useAuth } from './AuthContext';

interface StreamContextType {
  client: StreamVideoClient | null;
  isStreamReady: boolean;
  isStreamConfigured: boolean;
}

const StreamContext = createContext<StreamContextType>({ client: null, isStreamReady: false, isStreamConfigured: false });

export const useStream = () => useContext(StreamContext);

const apiKey = import.meta.env.VITE_STREAM_API_KEY || import.meta.env.STREAM_API_KEY || import.meta.env.VITE_STREAM_KEY;
const isConfiguredKey = !!apiKey && apiKey !== 'YOUR_STREAM_API_KEY' && !apiKey.startsWith('YOUR_');

export const StreamProvider = ({ children }: { children: React.ReactNode }) => {
  const [client, setClient] = useState<StreamVideoClient | null>(null);
  const [isStreamReady, setIsStreamReady] = useState(false);
  const { user, isLoaded } = useAuth();

  useEffect(() => {
    if (!isLoaded || !user) {
      if (client) {
        client.disconnectUser();
        setClient(null);
        setIsStreamReady(false);
      }
      return;
    }

    if (!isConfiguredKey) {
      console.warn('Stream API key is not configured or using default placeholder in .env. Stream features will be disabled until valid credentials from getstream.io are provided.');
      return;
    }

    let isMounted = true;
    let streamClient: StreamVideoClient | null = null;

    const initStream = async () => {
      try {
        // Fetch secure token from our Vite proxy API or Netlify function
        const role = user.role || localStorage.getItem('yadalearn-user-role') || 'user';
        const response = await fetch(`/api/get-stream-token?user_id=${user.id}&role=${role}`);
        
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('text/html')) {
          console.warn('Stream API returned HTML instead of JSON. The Netlify function might still be deploying.');
          return; // Gracefully abort without crashing
        }

        if (response.status === 503) {
          console.warn('Stream token service reported STREAM_SECRET is not configured or placeholder in .env.');
          return;
        }

        if (!response.ok) {
          throw new Error(`Failed to fetch Stream token: ${response.statusText}`);
        }
        
        const text = await response.text();
        if (text.startsWith('<')) {
          console.warn('Stream API returned HTML markup. The serverless function is not reachable.');
          return; // Gracefully abort without crashing
        }

        const { token } = JSON.parse(text);

        // Sanitize image URL to ensure base64 strings or oversized data URLs do not exceed Stream WebSocket 5KB custom data payload limit
        const rawImage = user.imageUrl || (user as any).avatar_url || '';
        const isSafeUrl = rawImage && (rawImage.startsWith('http://') || rawImage.startsWith('https://')) && rawImage.length < 1000;
        const safeImage = isSafeUrl ? rawImage : undefined;

        streamClient = StreamVideoClient.getOrCreateInstance({
          apiKey,
          user: {
            id: user.id,
            name: user.name || 'User',
            image: safeImage,
          },
          token,
        });

        if (isMounted) {
          setClient(streamClient);
          setIsStreamReady(true);
        } else {
          // If unmounted while fetching, clean up immediately
          streamClient.disconnectUser();
        }
      } catch (err) {
        console.error('Error initializing Stream client:', err);
      }
    };

    initStream();

    return () => {
      isMounted = false;
    };
  }, [user?.id, isLoaded]);

  if (!client || !isStreamReady) {
    return (
      <StreamContext.Provider value={{ client: null, isStreamReady: false, isStreamConfigured: isConfiguredKey }}>
        {children}
      </StreamContext.Provider>
    );
  }

  return (
    <StreamContext.Provider value={{ client, isStreamReady, isStreamConfigured: true }}>
      <StreamVideo client={client}>
        {children}
      </StreamVideo>
    </StreamContext.Provider>
  );
};
