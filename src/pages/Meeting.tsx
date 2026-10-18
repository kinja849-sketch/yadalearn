import React, { useEffect, useState, useRef, useMemo, useCallback, useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  StreamCall, 
  StreamTheme, 
  SpeakerLayout, 
  useCallStateHooks,
  useCall,
  Call,
  StreamParticipant,
  ParticipantView,
  useParticipantViewContext,
  hasAudio,
  hasScreenShare
} from '@stream-io/video-react-sdk';
import { useStream } from '@/contexts/StreamProvider';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

import '@stream-io/video-react-sdk/dist/css/styles.css';

const profileAvatarCache = new Map<string, string>();

interface RaisedHandInfo {
  raised: boolean;
  raisedAt: number;
  userName: string;
}

const MeetingRaisedHandsContext = React.createContext<{
  raisedHands: Record<string, RaisedHandInfo>;
}>({ raisedHands: {} });

interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  text: string;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// 1. Authoritative Meeting Timer Hook
// ---------------------------------------------------------------------------
const useMeetingTimer = (meetingId?: string) => {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!meetingId) return;
    const storageKey = `yadalearn_meeting_start_${meetingId}`;
    let startTime = parseInt(sessionStorage.getItem(storageKey) || '0', 10);
    
    if (!startTime || isNaN(startTime)) {
      startTime = Date.now();
      sessionStorage.setItem(storageKey, startTime.toString());
    }

    const updateTimer = () => {
      const now = Date.now();
      const diff = Math.max(0, Math.floor((now - startTime) / 1000));
      setElapsedSeconds(diff);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [meetingId]);

  const formattedTime = useMemo(() => {
    const hours = Math.floor(elapsedSeconds / 3600);
    const minutes = Math.floor((elapsedSeconds % 3600) / 60);
    const seconds = elapsedSeconds % 60;
    
    const pad = (n: number) => n.toString().padStart(2, '0');
    if (hours > 0) {
      return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    }
    return `${pad(minutes)}:${pad(seconds)}`;
  }, [elapsedSeconds]);

  return formattedTime;
};

// ---------------------------------------------------------------------------
// 2. Custom Video Placeholder (Camera OFF State)
// Matches Google Meet reference screenshots:
// - Centered circular avatar photo or colored initials circle
// - Name pill consistently positioned at lower-left
// - Mic mute badge positioned at upper-right
// - Active speaker blue highlight border
// ---------------------------------------------------------------------------
const CustomVideoPlaceholder = React.forwardRef<HTMLDivElement, { participant?: StreamParticipant }>(
  ({ participant: propParticipant }, ref) => {
    const context = useParticipantViewContext();
    const participant = context?.participant || propParticipant;
    const { user } = useAuth();
    const { useMicrophoneState } = useCallStateHooks();
    const { isMute: isLocalMuted } = useMicrophoneState();

    const [avatarUrl, setAvatarUrl] = useState<string | null>(() => {
      if (!participant) return null;
      if (participant.userId === user?.id && user?.imageUrl) {
        return user.imageUrl;
      }
      if (profileAvatarCache.has(participant.userId)) {
        return profileAvatarCache.get(participant.userId)!;
      }
      return null;
    });
    const [imgError, setImgError] = useState(false);

    useEffect(() => {
      let isMounted = true;
      if (!participant?.userId) return;

      if (participant.userId === user?.id && user?.imageUrl) {
        setAvatarUrl(user.imageUrl);
        profileAvatarCache.set(participant.userId, user.imageUrl);
        return;
      }

      if (profileAvatarCache.has(participant.userId)) {
        setAvatarUrl(profileAvatarCache.get(participant.userId)!);
      }

      supabase
        .from('profiles')
        .select('avatar_url')
        .eq('id', participant.userId)
        .maybeSingle()
        .then(({ data }) => {
          if (isMounted && data?.avatar_url) {
            profileAvatarCache.set(participant.userId, data.avatar_url);
            setAvatarUrl(data.avatar_url);
            setImgError(false);
          }
        })
        .catch(console.error);

      return () => {
        isMounted = false;
      };
    }, [participant?.userId, user?.id, user?.imageUrl]);

    if (!participant) {
      return <div ref={ref} className="w-full h-full bg-[#202124] rounded-xl" />;
    }

    const displayAvatar = !imgError && avatarUrl ? avatarUrl : null;
    const isSelf = participant.userId === user?.id;
    const displayName = participant.name || (isSelf ? (user?.name || 'You') : 'User');

    const initials = displayName
      .split(' ')
      .filter(Boolean)
      .map((n: string) => n[0])
      .join('')
      .substring(0, 2)
      .toUpperCase() || 'U';

    const bgColors = [
      'bg-blue-600',
      'bg-purple-600',
      'bg-emerald-600',
      'bg-amber-600',
      'bg-rose-600',
      'bg-indigo-600',
      'bg-teal-600',
      'bg-cyan-600'
    ];
    const colorIndex = Math.abs(
      (participant.userId || displayName).split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
    ) % bgColors.length;
    const avatarBg = bgColors[colorIndex];

    const { raisedHands } = useContext(MeetingRaisedHandsContext);
    const isHandRaised = Boolean(participant?.userId && raisedHands[participant.userId]?.raised);
    const isMuted = isSelf ? isLocalMuted : !hasAudio(participant);
    const isSpeaking = participant.isSpeaking === true && !isMuted;

    return (
      <div 
        ref={ref} 
        className={`relative w-full h-full bg-[#202124] flex items-center justify-center select-none overflow-hidden rounded-xl border transition-all duration-150 ${
          isSpeaking 
            ? 'border-2 border-[#8ab4f8] shadow-[0_0_12px_rgba(138,180,248,0.5)]' 
            : 'border-white/5'
        }`}
      >
        {/* Top-Left Raised Hand Badge */}
        {isHandRaised && (
          <div className="absolute top-2 left-2 z-20 flex items-center gap-1.5 bg-[#8ab4f8] text-[#202124] px-2.5 py-1 rounded-full shadow-lg font-semibold text-xs animate-bounce pointer-events-none">
            <span className="material-symbols-outlined text-[15px]">front_hand</span>
            <span className="text-[11px] font-bold">Hand raised</span>
          </div>
        )}

        {/* Centered Circular Profile Avatar */}
        <div className="relative flex items-center justify-center z-10">
          {displayAvatar ? (
            <img
              src={displayAvatar}
              alt={displayName}
              onError={() => setImgError(true)}
              className="w-14 h-14 sm:w-16 sm:h-16 md:w-20 md:h-20 lg:w-24 lg:h-24 rounded-full object-cover shadow-xl border border-white/10"
            />
          ) : (
            <div className={`w-14 h-14 sm:w-16 sm:h-16 md:w-20 md:h-20 lg:w-24 lg:h-24 rounded-full ${avatarBg} text-white font-semibold text-lg sm:text-xl md:text-2xl flex items-center justify-center shadow-xl border border-white/10`}>
              {initials}
            </div>
          )}
        </div>

        {/* Top-Right Mute Status Badge */}
        {isMuted && (
          <div className="absolute top-2 right-2 z-20 w-6 h-6 rounded-full bg-[#202124]/90 backdrop-blur-sm flex items-center justify-center text-white/90 border border-white/10 shadow-sm pointer-events-none">
            <span className="material-symbols-outlined text-[13px] text-white">mic_off</span>
          </div>
        )}

        {/* Active Speaking Indicator when unmuted and speaking */}
        {isSpeaking && !isMuted && (
          <div className="absolute top-2 right-2 z-20 w-6 h-6 rounded-full bg-[#1a73e8] backdrop-blur-sm flex items-center justify-center text-white border border-blue-400 shadow-md pointer-events-none">
            <span className="material-symbols-outlined text-[14px]">volume_up</span>
          </div>
        )}

        {/* Lower-Left Participant Name Pill Overlay */}
        <div className="absolute bottom-2 left-2 z-20 max-w-[80%] flex items-center gap-1.5 pointer-events-none">
          <div className="bg-[#202124]/85 backdrop-blur-md px-2 py-0.5 rounded-md border border-white/10 flex items-center gap-1 shadow-sm">
            <span className="text-white text-xs font-medium truncate drop-shadow-sm">
              {displayName} {isSelf && '(You)'}
            </span>
            {isSpeaking && !isMuted && (
              <span className="w-1.5 h-1.5 rounded-full bg-[#8ab4f8] animate-pulse"></span>
            )}
          </div>
        </div>
      </div>
    );
  }
);
CustomVideoPlaceholder.displayName = 'CustomVideoPlaceholder';

// ---------------------------------------------------------------------------
// 3. Custom Participant UI Overlay for Live Video Feed (Camera ON State)
// ---------------------------------------------------------------------------
const CustomParticipantViewUI = ({ participant: propParticipant }: { participant?: StreamParticipant }) => {
  const context = useParticipantViewContext();
  const participant = context?.participant || propParticipant;
  const { user } = useAuth();
  const { useMicrophoneState } = useCallStateHooks();
  const { isMute: isLocalMuted } = useMicrophoneState();
  const { raisedHands } = useContext(MeetingRaisedHandsContext);

  if (!participant) return null;

  const isSelf = participant.userId === user?.id;
  const displayName = participant.name || (isSelf ? (user?.name || 'You') : 'User');
  const isHandRaised = Boolean(participant?.userId && raisedHands[participant.userId]?.raised);
  const isMuted = isSelf ? isLocalMuted : !hasAudio(participant);
  const isSpeaking = participant.isSpeaking === true && !isMuted;

  return (
    <div className={`absolute inset-0 pointer-events-none z-20 overflow-hidden rounded-xl border transition-all duration-150 ${
      isSpeaking 
        ? 'border-2 border-[#8ab4f8] shadow-[0_0_12px_rgba(138,180,248,0.5)]' 
        : 'border-transparent'
    }`}>
      {/* Top-Left Raised Hand Badge */}
      {isHandRaised && (
        <div className="absolute top-2 left-2 z-20 flex items-center gap-1.5 bg-[#8ab4f8] text-[#202124] px-2.5 py-1 rounded-full shadow-lg font-semibold text-xs animate-bounce pointer-events-none">
          <span className="material-symbols-outlined text-[15px]">front_hand</span>
          <span className="text-[11px] font-bold">Hand raised</span>
        </div>
      )}

      {/* Top-Right Mute Status Badge */}
      {isMuted && (
        <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-[#202124]/90 backdrop-blur-sm flex items-center justify-center text-white/90 border border-white/10 shadow-sm">
          <span className="material-symbols-outlined text-[13px] text-white">mic_off</span>
        </div>
      )}

      {/* Active Speaking Sound Badge */}
      {isSpeaking && !isMuted && (
        <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-[#1a73e8] backdrop-blur-sm flex items-center justify-center text-white border border-blue-400 shadow-md">
          <span className="material-symbols-outlined text-[14px]">volume_up</span>
        </div>
      )}

      {/* Lower-Left Participant Name Pill */}
      <div className="absolute bottom-2 left-2 max-w-[80%] flex items-center gap-1.5">
        <div className="bg-[#202124]/85 backdrop-blur-md px-2 py-0.5 rounded-md border border-white/10 flex items-center gap-1 shadow-sm">
          <span className="text-white text-xs font-medium truncate drop-shadow-sm">
            {displayName} {isSelf && '(You)'}
          </span>
          {isSpeaking && !isMuted && (
            <span className="w-1.5 h-1.5 rounded-full bg-[#8ab4f8] animate-pulse"></span>
          )}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 4. Dynamic Mathematical Meet Gallery Grid
// Intelligently calculates optimal rows and columns based on total participants
// and container aspect ratio, matching Google Meet's compact rectangular layout.
// ---------------------------------------------------------------------------
const DynamicMeetGalleryGrid = () => {
  const { useParticipants } = useCallStateHooks();
  const rawParticipants = useParticipants();
  const { user } = useAuth();
  const [currentPage, setCurrentPage] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ 
    width: typeof window !== 'undefined' ? window.innerWidth : 1280, 
    height: typeof window !== 'undefined' ? window.innerHeight : 720 
  });

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setContainerSize({ width, height });
        }
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Place local participant at the end of gallery (or pinned first)
  const participants = useMemo(() => {
    const list = [...rawParticipants];
    const selfIdx = list.findIndex(p => p.userId === user?.id);
    if (selfIdx !== -1 && list.length > 1) {
      const [self] = list.splice(selfIdx, 1);
      list.push(self);
    }
    return list;
  }, [rawParticipants, user?.id]);

  const totalCount = participants.length;
  // Maximum participants per visible gallery page (Google Meet desktop standard is up to 49)
  const maxPerPage = 49;
  const totalPages = Math.ceil(totalCount / maxPerPage);

  const visibleParticipants = useMemo(() => {
    const start = currentPage * maxPerPage;
    return participants.slice(start, start + maxPerPage);
  }, [participants, currentPage, maxPerPage]);

  const count = visibleParticipants.length;
  const isPortrait = containerSize.width < containerSize.height;

  // Calculate dynamic column matrix matching Google Meet and Zoom proportions
  const gridStyle = useMemo(() => {
    let cols = 1;
    let rows = 1;

    if (isPortrait) {
      // Mobile portrait geometry: 2 participants stack vertically (1 col x 2 rows)
      if (count === 1) {
        cols = 1; rows = 1;
      } else if (count === 2) {
        cols = 1; rows = 2;
      } else if (count <= 4) {
        cols = 2; rows = 2;
      } else if (count <= 6) {
        cols = 2; rows = 3;
      } else if (count <= 9) {
        cols = 3; rows = 3;
      } else if (count <= 12) {
        cols = 3; rows = 4;
      } else if (count <= 16) {
        cols = 4; rows = 4;
      } else if (count <= 20) {
        cols = 4; rows = 5;
      } else if (count <= 25) {
        cols = 5; rows = 5;
      } else {
        cols = 6; rows = Math.ceil(count / 6);
      }
    } else {
      // Desktop / Landscape geometry: 2 participants sit side-by-side (2 cols x 1 row)
      if (count === 1) {
        cols = 1; rows = 1;
      } else if (count === 2) {
        cols = 2; rows = 1;
      } else if (count <= 4) {
        cols = 2; rows = 2;
      } else if (count <= 6) {
        cols = 3; rows = 2;
      } else if (count <= 9) {
        cols = 3; rows = 3;
      } else if (count <= 12) {
        cols = 4; rows = 3;
      } else if (count <= 16) {
        cols = 4; rows = 4;
      } else if (count <= 20) {
        cols = 5; rows = 4;
      } else if (count <= 25) {
        cols = 5; rows = 5;
      } else if (count <= 30) {
        cols = 6; rows = 5;
      } else if (count <= 36) {
        cols = 6; rows = 6;
      } else if (count <= 42) {
        cols = 7; rows = 6;
      } else {
        cols = 7; rows = 7; // Up to 49 participants
      }
    }

    return {
      gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
      gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`
    };
  }, [count, isPortrait]);

  return (
    <div 
      ref={containerRef}
      className="w-full h-full min-h-0 min-w-0 flex flex-col items-center justify-center p-2 sm:p-3 overflow-hidden bg-[#131314] relative"
    >
      <div 
        className="w-full h-full max-h-full grid gap-1.5 sm:gap-2 items-center justify-center"
        style={gridStyle}
      >
        {visibleParticipants.map((p) => (
          <div
            key={p.sessionId || p.userId}
            className="relative w-full h-full min-h-0 min-w-0 flex items-center justify-center p-0.5"
          >
            <div className="relative w-full h-full max-w-full max-h-full aspect-video rounded-xl overflow-hidden bg-[#202124] border border-white/5 flex items-center justify-center shadow-md">
              <ParticipantView
                participant={p}
                VideoPlaceholder={CustomVideoPlaceholder}
                ParticipantViewUI={CustomParticipantViewUI}
                className="w-full h-full object-cover rounded-xl"
              />
            </div>
          </div>
        ))}
      </div>

      {/* Pagination controls for ultra-large meetings exceeding 49 participants */}
      {totalPages > 1 && (
        <div className="absolute bottom-4 z-40 bg-[#202124]/90 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 flex items-center gap-2 shadow-xl">
          <button
            onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
            disabled={currentPage === 0}
            className="p-1 rounded-full text-white/80 hover:text-white disabled:opacity-30 disabled:hover:text-white/80"
          >
            <span className="material-symbols-outlined text-sm">chevron_left</span>
          </button>
          <span className="text-xs text-white/90 font-medium">
            Page {currentPage + 1} of {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={currentPage === totalPages - 1}
            className="p-1 rounded-full text-white/80 hover:text-white disabled:opacity-30 disabled:hover:text-white/80"
          >
            <span className="material-symbols-outlined text-sm">chevron_right</span>
          </button>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// 5. Dedicated Screen Share Stage Layout
// Screen share presented on dominant left stage + participant strip on right
// ---------------------------------------------------------------------------
const DedicatedScreenShareLayout = () => {
  const { useParticipants } = useCallStateHooks();
  const participants = useParticipants();

  const screenShareParticipant = participants.find((p) => hasScreenShare(p));

  // Enforce WebRTC motion contentHint on the screen share track for zero-delay scrolling
  useEffect(() => {
    if (!screenShareParticipant?.screenShareStream) return;
    try {
      const [track] = screenShareParticipant.screenShareStream.getVideoTracks();
      if (track && 'contentHint' in track && track.contentHint !== 'motion') {
        track.contentHint = 'motion';
      }
    } catch (e) {
      console.warn('Could not set motion contentHint on incoming screenShare track:', e);
    }
  }, [screenShareParticipant?.screenShareStream]);

  return (
    <div className="w-full h-full min-h-0 flex flex-col md:flex-row p-2 sm:p-3 gap-2 bg-[#131314] overflow-hidden relative">
      {/* Main Screen Share Dominant Stage */}
      <div className="flex-1 min-w-0 min-h-0 w-full h-full relative overflow-hidden bg-black rounded-xl flex items-center justify-center p-1 border border-white/10">
        {screenShareParticipant ? (
          <ParticipantView
            key={`${screenShareParticipant.sessionId || screenShareParticipant.userId}-screenshare`}
            participant={screenShareParticipant}
            trackType="screenShareTrack"
            VideoPlaceholder={CustomVideoPlaceholder}
            ParticipantViewUI={() => null}
            className="w-full h-full object-contain screen-share-video rounded-lg"
          />
        ) : (
          <div className="text-zinc-400 text-sm">Screen presentation loading...</div>
        )}
      </div>

      {/* Participants Column on Desktop / Strip on Mobile (Single responsive mount prevents 0x0 unsubscription and remote video freeze) */}
      <div className="w-full md:w-64 lg:w-72 shrink-0 h-28 md:h-full min-h-0 bg-[#202124]/90 p-2 rounded-xl border border-white/10 flex flex-row md:flex-col gap-2 overflow-x-auto md:overflow-y-auto md:overflow-x-hidden scrollbar-none">
        {participants.map((p) => (
          <div
            key={p.sessionId || p.userId}
            className="relative shrink-0 w-28 md:w-full h-full md:h-auto md:min-h-[90px] md:aspect-video rounded-lg overflow-hidden bg-[#202124] border border-white/10 flex items-center justify-center"
          >
            <ParticipantView
              participant={p}
              VideoPlaceholder={CustomVideoPlaceholder}
              ParticipantViewUI={CustomParticipantViewUI}
              className="w-full h-full object-cover"
            />
          </div>
        ))}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 6. In-Meeting Chat Side Panel
// Authentically recreates Google Meet's right side panel for in-call messaging
// ---------------------------------------------------------------------------
const InMeetingChatPanel = ({
  messages,
  onSendMessage,
  onClose
}: {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  onClose: () => void;
}) => {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    onSendMessage(inputText.trim());
    setInputText('');
  };

  return (
    <div className="w-80 sm:w-96 shrink-0 h-full bg-[#202124] border-l border-white/10 flex flex-col text-white z-30 transition-all duration-300">
      {/* Header */}
      <div className="p-4 border-b border-white/10 flex items-center justify-between shrink-0">
        <h3 className="font-semibold text-base">In-call messages</h3>
        <button
          onClick={onClose}
          className="p-1.5 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
          title="Close chat"
        >
          <span className="material-symbols-outlined text-lg">close</span>
        </button>
      </div>

      {/* Google Meet Disclaimer Box */}
      <div className="p-3 mx-4 my-3 bg-[#303134] rounded-lg text-[12px] text-zinc-300 flex items-start gap-2.5 shrink-0 border border-white/5">
        <span className="material-symbols-outlined text-base text-zinc-400 shrink-0 mt-0.5">info</span>
        <span>Messages can only be seen by people in the call and are deleted when the call ends.</span>
      </div>

      {/* Messages Stream */}
      <div className="flex-1 overflow-y-auto px-4 space-y-4">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-4 text-zinc-500">
            <span className="material-symbols-outlined text-4xl mb-2 text-zinc-600">forum</span>
            <p className="text-xs">No messages yet. Send a message to start the conversation.</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className="flex flex-col space-y-1">
              <div className="flex items-baseline justify-between">
                <span className="font-semibold text-xs text-zinc-200">{msg.senderName}</span>
                <span className="text-[10px] text-zinc-400">{msg.timestamp}</span>
              </div>
              <p className="text-xs text-zinc-300 leading-relaxed break-words bg-[#2d2f31] p-2.5 rounded-lg border border-white/5">
                {msg.text}
              </p>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Form */}
      <div className="p-3 border-t border-white/10 shrink-0 bg-[#202124]">
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Send a message to everyone"
            className="flex-1 bg-[#303134] hover:bg-[#3c4043] focus:bg-[#3c4043] text-white text-xs px-3.5 py-2.5 rounded-full outline-none border border-transparent focus:border-blue-400 transition-all placeholder:text-zinc-400"
          />
          <button
            type="submit"
            disabled={!inputText.trim()}
            className="p-2 rounded-full bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40 disabled:hover:bg-blue-600 transition-colors shrink-0"
            title="Send"
          >
            <span className="material-symbols-outlined text-base">send</span>
          </button>
        </form>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 7. Participants & Disciplinary Management Side Panel
// Authentically recreates Google Meet's right side panel for connected people
// and preserves teacher/host disciplinary controls.
// ---------------------------------------------------------------------------
const ParticipantsPanel = ({
  isHost,
  onClose,
  onLowerHand
}: {
  isHost: boolean;
  onClose: () => void;
  onLowerHand?: (userId: string) => void;
}) => {
  const { useParticipants, useMicrophoneState } = useCallStateHooks();
  const { isMute: isLocalMuted } = useMicrophoneState();
  const { raisedHands } = useContext(MeetingRaisedHandsContext);
  const participants = useParticipants();
  const call = useCall();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredParticipants = useMemo(() => {
    if (!searchQuery.trim()) return participants;
    return participants.filter(p => (p.name || '').toLowerCase().includes(searchQuery.toLowerCase()));
  }, [participants, searchQuery]);

  const handleToggleMuteAudio = async (userId: string, isCurrentlyMuted: boolean) => {
    if (!call || userId === user?.id) return;
    try {
      if (isCurrentlyMuted) {
        await call.grantPermissions(userId, ['send-audio']).catch(() => {});
        await call.sendCustomEvent({ type: 'allow-speak', targetUserId: userId });
      } else {
        await call.muteUser(userId, 'audio').catch(() => {});
        await call.revokePermissions(userId, ['send-audio']).catch(() => {});
        await call.sendCustomEvent({ type: 'mute-audio', targetUserId: userId });
      }
    } catch (e) {
      console.error('Failed to toggle audio mute:', e);
    }
  };

  const handleToggleMuteVideo = async (userId: string, isCurrentlyVideoMuted: boolean) => {
    if (!call || userId === user?.id) return;
    try {
      if (isCurrentlyVideoMuted) {
        await call.grantPermissions(userId, ['send-video']).catch(() => {});
        await call.sendCustomEvent({ type: 'allow-video', targetUserId: userId });
      } else {
        await call.muteUser(userId, 'video').catch(() => {});
        await call.revokePermissions(userId, ['send-video']).catch(() => {});
        await call.sendCustomEvent({ type: 'mute-video', targetUserId: userId });
      }
    } catch (e) {
      console.error('Failed to toggle video mute:', e);
    }
  };

  const handleKickParticipant = async (userId: string) => {
    if (!call || userId === user?.id) return;
    if (window.confirm("Are you sure you want to remove this participant from the meeting?")) {
      try {
        await call.removeMembers([userId]).catch(() => {});
        await call.blockUser(userId).catch(() => {});
        await call.sendCustomEvent({ type: 'kick', targetUserId: userId });
      } catch (e) {
        console.error('Failed to remove participant:', e);
      }
    }
  };

  const handlePinParticipant = async (userId: string) => {
    if (!call) return;
    try {
      const p = participants.find(part => part.userId === userId);
      if (p?.isPinned) {
        await call.unpin(userId);
      } else {
        await call.pin(userId);
      }
    } catch (e) {
      console.error('Failed to toggle pin:', e);
    }
  };

  const handleMuteAllAudio = async () => {
    if (!call) return;
    try {
      await call.muteOthers('audio').catch(() => {});
      await call.sendCustomEvent({ type: 'mute-all-audio' });
    } catch (e) {
      console.error('Failed to mute all audio:', e);
    }
  };

  return (
    <div className="w-80 sm:w-96 shrink-0 h-full bg-[#202124] border-l border-white/10 flex flex-col text-white z-30 transition-all duration-300">
      {/* Header */}
      <div className="p-4 border-b border-white/10 flex items-center justify-between shrink-0">
        <h3 className="font-semibold text-base flex items-center gap-2">
          People
          <span className="text-xs px-2 py-0.5 rounded-full bg-[#303134] text-zinc-300 font-normal">
            {participants.length}
          </span>
        </h3>
        <button
          onClick={onClose}
          className="p-1.5 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
          title="Close panel"
        >
          <span className="material-symbols-outlined text-lg">close</span>
        </button>
      </div>

      {/* Host Mute All Action */}
      {isHost && (
        <div className="px-4 py-2 border-b border-white/5 flex items-center justify-between shrink-0">
          <span className="text-xs text-zinc-400">Classroom actions</span>
          <button
            onClick={handleMuteAllAudio}
            className="text-xs text-blue-400 hover:text-blue-300 font-medium transition-colors"
          >
            Mute all
          </button>
        </div>
      )}

      {/* Search Input */}
      <div className="p-3 shrink-0">
        <div className="relative">
          <span className="material-symbols-outlined absolute left-3 top-2.5 text-zinc-400 text-base">search</span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search for people"
            className="w-full bg-[#303134] text-white text-xs pl-9 pr-3 py-2 rounded-lg outline-none border border-transparent focus:border-blue-400 placeholder:text-zinc-400"
          />
        </div>
      </div>

      {/* Participants List */}
      <div className="flex-1 overflow-y-auto px-2 space-y-1">
        {filteredParticipants.map(p => {
          const isSelf = p.userId === user?.id;
          const isAudioMuted = isSelf ? isLocalMuted : !hasAudio(p);
          const isVideoMuted = !p.isVideoEnabled;
          const isHandRaised = Boolean(raisedHands[p.userId]?.raised);

          return (
            <div 
              key={p.userId} 
              className="flex items-center justify-between p-2 rounded-lg hover:bg-[#303134]/70 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-xs font-semibold shrink-0">
                  {(p.name || 'U')[0].toUpperCase()}
                </div>
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-white truncate max-w-[110px] sm:max-w-[140px]">
                      {p.name || 'User'} {isSelf && '(You)'}
                    </span>
                    {isHandRaised && (
                      <span className="inline-flex items-center gap-0.5 text-[9px] text-[#8ab4f8] font-bold bg-[#8ab4f8]/15 px-1.5 py-0.2 rounded border border-[#8ab4f8]/30 shrink-0">
                        <span className="material-symbols-outlined text-[11px]">front_hand</span>
                        Raised
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-zinc-400">
                    {p.role === 'host' ? 'Meeting host' : 'Participant'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {/* Host Lower Hand Button */}
                {isHost && isHandRaised && onLowerHand && (
                  <button
                    onClick={() => onLowerHand(p.userId)}
                    title="Lower participant's hand"
                    className="p-1.5 rounded-full text-[#8ab4f8] hover:text-white hover:bg-white/10 transition-colors"
                  >
                    <span className="material-symbols-outlined text-base">pan_tool_alt</span>
                  </button>
                )}

                {/* Pin Spotlight button */}
                <button
                  onClick={() => handlePinParticipant(p.userId)}
                  title={p.isPinned ? "Unpin" : "Pin to stage"}
                  className={`p-1.5 rounded-full transition-colors ${
                    p.isPinned ? 'text-blue-400' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <span className="material-symbols-outlined text-base">push_pin</span>
                </button>

                {/* Mic status indicator */}
                <span className="p-1.5 text-zinc-400">
                  <span className="material-symbols-outlined text-base">
                    {isAudioMuted ? 'mic_off' : 'mic'}
                  </span>
                </span>

                {/* Host Controls */}
                {isHost && !isSelf && (
                  <div className="flex items-center gap-1 ml-1 border-l border-white/10 pl-1">
                    <button
                      onClick={() => handleToggleMuteAudio(p.userId, isAudioMuted)}
                      title={isAudioMuted ? "Allow to speak" : "Mute participant"}
                      className="p-1.5 rounded-full text-zinc-400 hover:text-white"
                    >
                      <span className="material-symbols-outlined text-base">
                        {isAudioMuted ? 'mic_off' : 'volume_off'}
                      </span>
                    </button>
                    <button
                      onClick={() => handleKickParticipant(p.userId)}
                      title="Remove from meeting"
                      className="p-1.5 rounded-full text-red-400 hover:text-red-300"
                    >
                      <span className="material-symbols-outlined text-base">remove_circle</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 8. Google Meet Standard Bottom Control Center
// Three-section layout:
// - Left: Timer + Room identifier
// - Center: Circular media action buttons & red end-call pill
// - Right: Info, Participants (with count badge), Chat (with unread badge), Host actions
// ---------------------------------------------------------------------------
const GoogleMeetControlBar = ({
  meetingId,
  layout,
  onToggleLayout,
  onToggleParticipants,
  showParticipants,
  onToggleChat,
  showChat,
  unreadCount,
  onLeave,
  isHost,
  isSelfHandRaised,
  onToggleHandRaise
}: {
  meetingId?: string;
  layout: 'grid' | 'speaker';
  onToggleLayout: () => void;
  onToggleParticipants: () => void;
  showParticipants: boolean;
  onToggleChat: () => void;
  showChat: boolean;
  unreadCount: number;
  onLeave: () => void;
  isHost: boolean;
  isSelfHandRaised: boolean;
  onToggleHandRaise: () => void;
}) => {
  const call = useCall();
  const { useMicrophoneState, useCameraState, useScreenShareState, useParticipants } = useCallStateHooks();
  const { isMute: isMicMuted } = useMicrophoneState();
  const { isMute: isCamMuted } = useCameraState();
  const { isMute: isScreenShareMuted } = useScreenShareState();
  const participants = useParticipants();
  const timer = useMeetingTimer(meetingId);

  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [copied, setCopied] = useState(false);

  const isSharing = !isScreenShareMuted;

  const toggleMic = async () => {
    try {
      await call?.microphone.toggle();
    } catch (e) {
      console.error('Mic toggle error:', e);
    }
  };

  const toggleCam = async () => {
    try {
      await call?.camera.toggle();
    } catch (e) {
      console.error('Cam toggle error:', e);
    }
  };

  const toggleScreenShare = async () => {
    if (!call) return;
    try {
      if (isSharing) {
        await call.screenShare.disable();
        return;
      }

      // Check mobile & browser support
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
      const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
      const hasGetDisplayMedia = typeof navigator !== 'undefined' && 
        Boolean(navigator.mediaDevices && typeof navigator.mediaDevices.getDisplayMedia === 'function');

      if (!hasGetDisplayMedia) {
        if (isIOS && !isSafari) {
          alert("Screen sharing on iOS is restricted by Apple to Safari. Please open this meeting in Apple Safari to share your screen.");
        } else {
          alert("Screen sharing is not supported by your mobile browser. Please use Chrome on Android or Safari on iOS.");
        }
        return;
      }

      // Mobile devices reject getDisplayMedia when audio capture is requested.
      // Disabling audio allows mobile OS screen capture prompts to trigger.
      if (isMobile) {
        await call.screenShare.disableScreenShareAudio();
        try {
          call.screenShare.setDefaultConstraints({
            video: {
              frameRate: { ideal: 30, max: 30 },
              width: { ideal: 1280, max: 1920 },
              height: { ideal: 720, max: 1080 }
            }
          });
        } catch {}
      } else {
        try {
          call.screenShare.setDefaultConstraints({
            video: {
              frameRate: { ideal: 30, max: 30 },
              width: { max: 1920 },
              height: { max: 1080 }
            }
          });
        } catch {}
      }

      // Set WebRTC contentHint to motion for zero-delay, smooth scrolling
      try {
        call.screenShare.setSettings({
          contentHint: 'motion'
        });
      } catch {}

      await call.screenShare.enable();

      // Ensure track contentHint is set to motion
      try {
        const stream = call.publisher?.getMediaStream('screenShareTrack' as any);
        const [track] = stream?.getVideoTracks() || [];
        if (track && 'contentHint' in track) {
          track.contentHint = 'motion';
        }
      } catch {}
    } catch (e: any) {
      if (e?.name === 'NotAllowedError') {
        // User cancelled the screen share prompt
        return;
      }
      console.error('Screen share toggle error:', e);
      alert(`Could not start screen sharing: ${e?.message || 'Unsupported or permission denied'}`);
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="w-full h-[72px] shrink-0 bg-[#202124] border-t border-white/10 px-3 sm:px-6 flex items-center justify-between z-30 select-none">
      {/* Left Section: Time / Elapsed Timer + Room Code */}
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-white text-sm font-medium tracking-wide">
          {timer}
        </span>
        <span className="text-zinc-500 hidden sm:inline">|</span>
        <span className="text-zinc-300 text-xs sm:text-sm font-normal truncate max-w-[120px] sm:max-w-[200px]">
          {meetingId || 'classroom'}
        </span>
      </div>

      {/* Center Section: Compact Circular Controls Toolbar */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Microphone Toggle */}
        <button
          onClick={toggleMic}
          title={isMicMuted ? "Turn on microphone" : "Turn off microphone"}
          className={`size-10 sm:size-11 rounded-full flex items-center justify-center transition-all ${
            isMicMuted
              ? 'bg-[#ea4335] hover:bg-[#d93025] text-white shadow-md'
              : 'bg-[#3c4043] hover:bg-[#474a4d] text-white'
          }`}
        >
          <span className="material-symbols-outlined text-lg sm:text-xl">
            {isMicMuted ? 'mic_off' : 'mic'}
          </span>
        </button>

        {/* Camera Toggle */}
        <button
          onClick={toggleCam}
          title={isCamMuted ? "Turn on camera" : "Turn off camera"}
          className={`size-10 sm:size-11 rounded-full flex items-center justify-center transition-all ${
            isCamMuted
              ? 'bg-[#ea4335] hover:bg-[#d93025] text-white shadow-md'
              : 'bg-[#3c4043] hover:bg-[#474a4d] text-white'
          }`}
        >
          <span className="material-symbols-outlined text-lg sm:text-xl">
            {isCamMuted ? 'videocam_off' : 'videocam'}
          </span>
        </button>

        {/* Raise Hand Button */}
        <button
          onClick={onToggleHandRaise}
          title={isSelfHandRaised ? "Lower hand" : "Raise hand"}
          className={`size-10 sm:size-11 rounded-full flex items-center justify-center transition-all ${
            isSelfHandRaised
              ? 'bg-[#8ab4f8] text-[#202124] shadow-md'
              : 'bg-[#3c4043] hover:bg-[#474a4d] text-white'
          }`}
        >
          <span className="material-symbols-outlined text-lg sm:text-xl">
            {isSelfHandRaised ? 'back_hand' : 'front_hand'}
          </span>
        </button>

        {/* Screen Share Button */}
        <button
          onClick={toggleScreenShare}
          title={isSharing ? "Stop presenting" : "Present now"}
          className={`size-10 sm:size-11 rounded-full flex items-center justify-center transition-all ${
            isSharing
              ? 'bg-[#8ab4f8] text-[#202124] shadow-md'
              : 'bg-[#3c4043] hover:bg-[#474a4d] text-white'
          }`}
        >
          <span className="material-symbols-outlined text-lg sm:text-xl">
            {isSharing ? 'cancel_presentation' : 'present_to_all'}
          </span>
        </button>

        {/* More Options Dropdown Toggle */}
        <div className="relative">
          <button
            onClick={() => setShowMoreMenu(prev => !prev)}
            title="More options"
            className="size-10 sm:size-11 rounded-full bg-[#3c4043] hover:bg-[#474a4d] text-white flex items-center justify-center transition-all"
          >
            <span className="material-symbols-outlined text-lg sm:text-xl">more_vert</span>
          </button>

          {showMoreMenu && (
            <div className="absolute bottom-14 left-1/2 -translate-x-1/2 w-48 bg-[#202124] border border-white/10 rounded-xl shadow-2xl p-1 z-50 text-white animate-in fade-in">
              <button
                onClick={() => {
                  onToggleLayout();
                  setShowMoreMenu(false);
                }}
                className="w-full px-3 py-2 text-xs flex items-center gap-2 hover:bg-[#303134] rounded-lg transition-colors text-left"
              >
                <span className="material-symbols-outlined text-sm">
                  {layout === 'grid' ? 'view_agenda' : 'grid_view'}
                </span>
                {layout === 'grid' ? 'Change to speaker view' : 'Change to grid view'}
              </button>
              <button
                onClick={() => {
                  if (!document.fullscreenElement) {
                    document.documentElement.requestFullscreen().catch(() => {});
                  } else {
                    document.exitFullscreen().catch(() => {});
                  }
                  setShowMoreMenu(false);
                }}
                className="w-full px-3 py-2 text-xs flex items-center gap-2 hover:bg-[#303134] rounded-lg transition-colors text-left"
              >
                <span className="material-symbols-outlined text-sm">fullscreen</span>
                Toggle full screen
              </button>
            </div>
          )}
        </div>

        {/* End Call Button (Prominent Red Pill) */}
        <button
          onClick={onLeave}
          title={isHost ? "End call for everyone" : "Leave call"}
          className="bg-[#ea4335] hover:bg-[#d93025] text-white px-4 sm:px-6 py-2.5 rounded-full flex items-center gap-1.5 shadow-md transition-all active:scale-95"
        >
          <span className="material-symbols-outlined text-lg sm:text-xl">call_end</span>
        </button>
      </div>

      {/* Right Section: Utility Controls (Info, People, Chat, Host) */}
      <div className="flex items-center gap-1 sm:gap-2">
        {/* Meeting Info */}
        <div className="relative">
          <button
            onClick={() => setShowInfoModal(prev => !prev)}
            title="Meeting details"
            className={`size-10 rounded-full flex items-center justify-center transition-colors ${
              showInfoModal ? 'text-blue-400 bg-white/10' : 'text-zinc-300 hover:bg-white/10'
            }`}
          >
            <span className="material-symbols-outlined text-xl">info</span>
          </button>

          {showInfoModal && (
            <div className="absolute bottom-14 right-0 w-72 bg-[#202124] border border-white/10 rounded-xl shadow-2xl p-4 z-50 text-white animate-in fade-in">
              <h4 className="font-semibold text-sm mb-1">Meeting details</h4>
              <p className="text-xs text-zinc-400 mb-3">Joining info</p>
              <div className="bg-[#303134] p-2.5 rounded-lg text-xs font-mono text-zinc-300 break-all mb-3 select-all">
                {window.location.href}
              </div>
              <button
                onClick={handleCopyLink}
                className="w-full py-1.5 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
              >
                <span className="material-symbols-outlined text-sm">content_copy</span>
                {copied ? 'Copied to clipboard' : 'Copy joining info'}
              </button>
            </div>
          )}
        </div>

        {/* People / Participants Panel Toggle */}
        <button
          onClick={onToggleParticipants}
          title="People"
          className={`size-10 rounded-full flex items-center justify-center relative transition-colors ${
            showParticipants ? 'text-blue-400 bg-white/10' : 'text-zinc-300 hover:bg-white/10'
          }`}
        >
          <span className="material-symbols-outlined text-xl">group</span>
          <span className="absolute -top-0.5 -right-0.5 text-[10px] font-bold text-zinc-200 bg-[#3c4043] px-1.5 py-0.2 rounded-full border border-black/40">
            {participants.length}
          </span>
        </button>

        {/* In-Call Chat Panel Toggle */}
        <button
          onClick={onToggleChat}
          title="Chat with everyone"
          className={`size-10 rounded-full flex items-center justify-center relative transition-colors ${
            showChat ? 'text-blue-400 bg-white/10' : 'text-zinc-300 hover:bg-white/10'
          }`}
        >
          <span className="material-symbols-outlined text-xl">chat</span>
          {unreadCount > 0 && !showChat && (
            <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-blue-500 rounded-full ring-2 ring-[#202124]"></span>
          )}
        </button>

        {/* Host / Activities Icon (Shown for teacher/host) */}
        {isHost && (
          <button
            onClick={onToggleParticipants}
            title="Host controls"
            className="size-10 rounded-full flex items-center justify-center text-zinc-300 hover:bg-white/10 transition-colors"
          >
            <span className="material-symbols-outlined text-xl">security</span>
          </button>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 9. Meeting Call Layout Container
// Handles main stage, responsive flexing when side panels open, and custom events.
// ---------------------------------------------------------------------------
const CallLayout = ({ handleLeave, meetingId }: { handleLeave: () => void; meetingId?: string }) => {
  const [layout, setLayout] = useState<'grid' | 'speaker'>('grid');
  const [showParticipants, setShowParticipants] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [raisedHands, setRaisedHands] = useState<Record<string, RaisedHandInfo>>({});
  const [handRaiseToast, setHandRaiseToast] = useState<string | null>(null);

  const { user } = useAuth();
  const role = user?.role || localStorage.getItem('yadalearn-user-role');
  const isHost = role === 'teacher';
  const isSelfHandRaised = Boolean(user?.id && raisedHands[user.id]?.raised);

  const { useHasOngoingScreenShare } = useCallStateHooks();
  const hasScreenShare = useHasOngoingScreenShare();
  const call = useCall();

  // Listen for Stream custom events (chat-message, hand-raise, allow-speak, mute-audio, etc.)
  useEffect(() => {
    if (!call || !user) return;
    const unsubscribe = call.on('custom', (event: any) => {
      const custom = event.custom;
      if (!custom) return;

      if (custom.type === 'chat-message') {
        // Exclude echo to local sender since sender already added it optimistically
        if (custom.senderId === user.id) return;

        const newMsg: ChatMessage = {
          id: custom.id || `msg-${Date.now()}-${Math.random()}`,
          senderId: custom.senderId,
          senderName: custom.senderName || 'Participant',
          senderAvatar: custom.senderAvatar,
          text: custom.text,
          timestamp: custom.timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        setMessages(prev => {
          if (prev.some(m => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
        if (!showChat) {
          setUnreadCount(c => c + 1);
        }
        return;
      }

      if (custom.type === 'hand-raise' && custom.userId) {
        setRaisedHands(prev => {
          if (prev[custom.userId]?.raised === custom.raised) return prev;
          return {
            ...prev,
            [custom.userId]: {
              raised: Boolean(custom.raised),
              raisedAt: custom.timestamp || Date.now(),
              userName: custom.userName || 'Participant'
            }
          };
        });

        if (custom.raised && custom.userId !== user.id) {
          setHandRaiseToast(`${custom.userName || 'A participant'} raised hand`);
          setTimeout(() => setHandRaiseToast(null), 4000);
        }
        return;
      }

      const isTarget = custom.targetUserId === user.id;

      if (custom.type === 'allow-speak' && isTarget) {
        call.microphone.enable().catch(err => console.warn('Mic enable error:', err));
      } else if (custom.type === 'mute-audio' && isTarget) {
        call.microphone.disable().catch(err => console.warn('Mic disable error:', err));
      } else if (custom.type === 'allow-video' && isTarget) {
        call.camera.enable().catch(err => console.warn('Cam enable error:', err));
      } else if (custom.type === 'mute-video' && isTarget) {
        call.camera.disable().catch(err => console.warn('Cam disable error:', err));
      } else if (custom.type === 'mute-all-audio' && !isHost) {
        call.microphone.disable().catch(err => console.warn('Mic disable error:', err));
      } else if (custom.type === 'mute-all-video' && !isHost) {
        call.camera.disable().catch(err => console.warn('Cam disable error:', err));
      } else if (custom.type === 'kick' && isTarget) {
        alert("You have been removed from the classroom by the teacher.");
        handleLeave();
      }
    });

    return () => {
      unsubscribe();
    };
  }, [call, user?.id, isHost, showChat]);

  // Listen for Supabase Realtime broadcast messages & hand raises
  useEffect(() => {
    if (!meetingId || !user) return;
    const channel = supabase.channel(`room-chat-${meetingId}`);
    channel.on('broadcast', { event: 'chat-message' }, ({ payload }) => {
      if (payload && payload.senderId !== user.id) {
        setMessages(prev => {
          if (prev.some(m => m.id === payload.id)) return prev;
          return [...prev, payload];
        });
        if (!showChat) {
          setUnreadCount(c => c + 1);
        }
      }
    });

    channel.on('broadcast', { event: 'hand-raise' }, ({ payload }) => {
      if (payload && payload.userId) {
        setRaisedHands(prev => {
          if (prev[payload.userId]?.raised === payload.raised) return prev;
          return {
            ...prev,
            [payload.userId]: {
              raised: Boolean(payload.raised),
              raisedAt: payload.timestamp || Date.now(),
              userName: payload.userName || 'Participant'
            }
          };
        });

        if (payload.raised && payload.userId !== user.id) {
          setHandRaiseToast(`${payload.userName || 'A participant'} raised hand`);
          setTimeout(() => setHandRaiseToast(null), 4000);
        }
      }
    });

    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [meetingId, user?.id, showChat]);

  // Reset unread count when chat opens
  const handleToggleChat = () => {
    setShowChat(prev => {
      const next = !prev;
      if (next) {
        setShowParticipants(false);
        setUnreadCount(0);
      }
      return next;
    });
  };

  const handleToggleParticipants = () => {
    setShowParticipants(prev => {
      const next = !prev;
      if (next) {
        setShowChat(false);
      }
      return next;
    });
  };

  const handleSendMessage = useCallback(async (text: string) => {
    if (!user) return;
    const newMsg: ChatMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      senderId: user.id,
      senderName: user.name || 'You',
      senderAvatar: user.imageUrl,
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    // Optimistically update local sender messages once
    setMessages(prev => {
      if (prev.some(m => m.id === newMsg.id)) return prev;
      return [...prev, newMsg];
    });

    // Broadcast through Stream call custom event
    if (call) {
      call.sendCustomEvent({
        type: 'chat-message',
        ...newMsg
      }).catch(err => console.warn('Failed to broadcast Stream chat message:', err));
    }

    // Broadcast through Supabase Realtime channel
    const channel = supabase.getChannels().find(c => c.topic === `realtime:room-chat-${meetingId}`);
    if (channel) {
      channel.send({
        type: 'broadcast',
        event: 'chat-message',
        payload: newMsg
      });
    }
  }, [user, call, meetingId]);

  const handleToggleHandRaise = useCallback(async () => {
    if (!user) return;
    const isCurrentlyRaised = Boolean(raisedHands[user.id]?.raised);
    const nextRaised = !isCurrentlyRaised;
    const payload = {
      type: 'hand-raise',
      userId: user.id,
      userName: user.name || 'Participant',
      raised: nextRaised,
      timestamp: Date.now()
    };

    setRaisedHands(prev => ({
      ...prev,
      [user.id]: {
        raised: nextRaised,
        raisedAt: Date.now(),
        userName: user.name || 'Participant'
      }
    }));

    if (call) {
      call.sendCustomEvent(payload).catch(err => console.warn('Stream hand-raise broadcast error:', err));
    }

    const channel = supabase.getChannels().find(c => c.topic === `realtime:room-chat-${meetingId}`);
    if (channel) {
      channel.send({
        type: 'broadcast',
        event: 'hand-raise',
        payload
      });
    }
  }, [user, raisedHands, call, meetingId]);

  const handleLowerParticipantHand = useCallback(async (targetUserId: string) => {
    const payload = {
      type: 'hand-raise',
      userId: targetUserId,
      userName: raisedHands[targetUserId]?.userName || 'Participant',
      raised: false,
      timestamp: Date.now()
    };

    setRaisedHands(prev => ({
      ...prev,
      [targetUserId]: {
        raised: false,
        raisedAt: Date.now(),
        userName: prev[targetUserId]?.userName || 'Participant'
      }
    }));

    if (call) {
      call.sendCustomEvent(payload).catch(err => console.warn('Stream hand-raise lower error:', err));
    }

    const channel = supabase.getChannels().find(c => c.topic === `realtime:room-chat-${meetingId}`);
    if (channel) {
      channel.send({
        type: 'broadcast',
        event: 'hand-raise',
        payload
      });
    }
  }, [call, meetingId, raisedHands]);

  return (
    <MeetingRaisedHandsContext.Provider value={{ raisedHands }}>
      <div className="w-full h-full min-h-0 flex flex-col bg-[#131314] overflow-hidden relative">
        {/* Floating Hand Raise Notification */}
        {handRaiseToast && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-[#8ab4f8] text-[#202124] px-4 py-2 rounded-full font-semibold text-xs flex items-center gap-2 shadow-2xl animate-in fade-in slide-in-from-top-2 pointer-events-none">
            <span className="material-symbols-outlined text-base">front_hand</span>
            <span>{handRaiseToast}</span>
          </div>
        )}

        {/* Main Content Area: Video Stage + Optional Right Side Panel */}
        <div className="flex-1 min-h-0 w-full flex overflow-hidden relative">
          {/* Dynamic Video Stage (Flex-1 shrinks smoothly when side panels open) */}
          <div className="flex-1 min-h-0 min-w-0 w-full h-full relative flex flex-col overflow-hidden transition-all duration-300">
            {hasScreenShare ? (
              <DedicatedScreenShareLayout />
            ) : layout === 'grid' ? (
              <DynamicMeetGalleryGrid />
            ) : (
              <SpeakerLayout
                participantsBarPosition="bottom"
                VideoPlaceholder={CustomVideoPlaceholder}
                ParticipantViewUI={CustomParticipantViewUI}
              />
            )}
          </div>

          {/* Right Drawer: In-Call Messages */}
          {showChat && (
            <InMeetingChatPanel
              messages={messages}
              onSendMessage={handleSendMessage}
              onClose={() => setShowChat(false)}
            />
          )}

          {/* Right Drawer: People / Host Moderation */}
          {showParticipants && (
            <ParticipantsPanel
              isHost={isHost}
              onClose={() => setShowParticipants(false)}
              onLowerHand={handleLowerParticipantHand}
            />
          )}
        </div>

        {/* Google Meet Bottom Control Toolbar */}
        <GoogleMeetControlBar
          meetingId={meetingId}
          layout={layout}
          onToggleLayout={() => setLayout(l => l === 'grid' ? 'speaker' : 'grid')}
          onToggleParticipants={handleToggleParticipants}
          showParticipants={showParticipants}
          onToggleChat={handleToggleChat}
          showChat={showChat}
          unreadCount={unreadCount}
          onLeave={handleLeave}
          isHost={isHost}
          isSelfHandRaised={isSelfHandRaised}
          onToggleHandRaise={handleToggleHandRaise}
        />
      </div>
    </MeetingRaisedHandsContext.Provider>
  );
};

// ---------------------------------------------------------------------------
// 10. Main Meeting Root Component
// ---------------------------------------------------------------------------
const Meeting = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { client, isStreamReady, isStreamConfigured } = useStream();
  const { user, endSession } = useAuth();
  const [call, setCall] = useState<Call | null>(null);
  const [error, setError] = useState('');
  const alreadyLeftRef = useRef(false);

  const [isWaiting, setIsWaiting] = useState(() => {
    const role = user?.role || localStorage.getItem('yadalearn-user-role');
    return role === 'student';
  });
  const [waitingStudents, setWaitingStudents] = useState<
    { id: string; name: string; avatar?: string }[]
  >([]);

  // Verify if session has already ended before joining
  useEffect(() => {
    if (!id) return;
    const checkClassStatus = async () => {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
      const query = isUuid
        ? supabase.from('live_classes').select('status').eq('id', id)
        : supabase.from('live_classes').select('status').eq('room_id', id);
      const { data } = await query.limit(1);

      if (data && data.length > 0) {
        const status = data[0].status?.toLowerCase();
        const role = user?.role || localStorage.getItem('yadalearn-user-role');
        if (status === 'completed' || status === 'ended' || status === 'cancelled') {
          if (role === 'teacher') {
            const updateQuery = isUuid
              ? supabase.from('live_classes').update({ status: 'active' }).eq('id', id)
              : supabase.from('live_classes').update({ status: 'active' }).eq('room_id', id);
            await updateQuery;
          } else {
            setError('This class session has ended and is no longer joinable.');
          }
        }
      }
    };
    checkClassStatus();
  }, [id, user]);

  // Supabase Realtime channel for Waiting Room + Session-Ended listener
  useEffect(() => {
    if (!id || !user) return;
    
    const role = user.role || localStorage.getItem('yadalearn-user-role');
    const channel = supabase.channel(`room-${id}`);

    channel.on('broadcast', { event: 'waiting' }, ({ payload }) => {
      if (role === 'teacher') {
        setWaitingStudents(prev => {
          if (!prev.find(s => s.id === payload.id)) {
            return [...prev, payload];
          }
          return prev;
        });
      }
    });

    channel.on('broadcast', { event: 'admit' }, ({ payload }) => {
      if (role === 'student' && payload.studentId === user.id) {
        setIsWaiting(false);
      }
    });

    channel.on('broadcast', { event: 'session-ended' }, () => {
      if (role === 'student') {
        alreadyLeftRef.current = true;
        endSession().catch(() => {});
        navigate(`/rate-teacher/${id}`);
      }
    });

    let pingInterval: any;
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED' && role === 'student' && isWaiting) {
        channel.send({
          type: 'broadcast',
          event: 'waiting',
          payload: { 
            id: user.id, 
            name: user.name || 'Student', 
            avatar: user.imageUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(user.name || user.id)}` 
          }
        });
        pingInterval = setInterval(() => {
          channel.send({
            type: 'broadcast',
            event: 'waiting',
            payload: { 
              id: user.id, 
              name: user.name || 'Student', 
              avatar: user.imageUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(user.name || user.id)}` 
            }
          });
        }, 5000);
      }
    });

    return () => {
      if (pingInterval) clearInterval(pingInterval);
      supabase.removeChannel(channel);
    };
  }, [id, user, isWaiting]);

  // Join Stream Call & configure host capabilities
  useEffect(() => {
    if (!client || !isStreamReady || !id || isWaiting) return;

    let callObj: Call | null = null;
    let isMounted = true;

    const joinCall = async () => {
      try {
        callObj = client.call('default', id);
        const role = user?.role || localStorage.getItem('yadalearn-user-role');
        const isHost = role === 'teacher';

        await callObj.getOrCreate({
          data: {
            created_by_id: isHost ? user.id : undefined,
            members: [
              {
                user_id: user.id,
                role: isHost ? 'admin' : 'user',
              },
            ],
          },
        });

        if (isHost) {
          try {
            await callObj.updateCallMembers({
              update_members: [
                {
                  user_id: user.id,
                  role: 'admin',
                },
              ],
            });
          } catch (e) {
            console.log('Update call members host role:', e);
          }
        } else if (user?.id && id) {
          try {
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
            if (isUuid) {
              await supabase.from('bookings').update({ status: 'completed' }).eq('id', id).eq('student_id', user.id);
            }
          } catch (e) {
            console.warn('Failed to update booking status on join:', e);
          }
        }

        await callObj.join();

        try {
          callObj.setPreferredIncomingVideoResolution({ width: 1280, height: 720 });
        } catch (e) {
          console.warn('Failed to set preferred incoming video resolution:', e);
        }

        try {
          const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
          if (isMobileDevice) {
            await callObj.screenShare.disableScreenShareAudio();
            callObj.screenShare.setDefaultConstraints({
              video: {
                frameRate: { ideal: 30, max: 30 },
                width: { ideal: 1280, max: 1920 },
                height: { ideal: 720, max: 1080 }
              }
            });
          } else {
            callObj.screenShare.setDefaultConstraints({
              video: {
                frameRate: { ideal: 30, max: 30 },
                width: { max: 1920 },
                height: { max: 1080 }
              }
            });
          }

          callObj.screenShare.setSettings({
            contentHint: 'motion',
          });
        } catch (e) {
          console.warn('Failed to configure screenShare settings:', e);
        }
        
        if (isMounted) {
          setCall(callObj);
        }
      } catch (err: any) {
        console.error('Failed to join call', err);
        if (isMounted) {
          let readableMessage = err?.message || 'Failed to join call';
          if (typeof readableMessage === 'string' && readableMessage.includes('AccessKeyError')) {
            readableMessage = 'Invalid Stream Video API credentials. Please verify your VITE_STREAM_API_KEY and STREAM_SECRET in .env.';
          } else if (typeof readableMessage === 'string' && readableMessage.trim().startsWith('{')) {
            try {
              const parsed = JSON.parse(readableMessage);
              readableMessage = parsed.message || readableMessage;
            } catch {}
          }
          setError(readableMessage);
        }
      }
    };

    joinCall();

    return () => {
      isMounted = false;
      if (callObj && !alreadyLeftRef.current) {
        alreadyLeftRef.current = true;
        try {
          const result = callObj.leave();
          if (result && typeof result.catch === 'function') {
            result.catch((err: any) => console.warn('Cleanup leave error (safe to ignore):', err?.message));
          }
        } catch (err: any) {
          console.warn('Cleanup leave error (safe to ignore):', err?.message);
        }
      }
    };
  }, [client, isStreamReady, id, isWaiting]);

  const handleAdmit = async (studentId: string) => {
    const activeChannel = supabase.getChannels().find(c => c.topic === `realtime:room-${id}`);
    if (activeChannel) {
      await activeChannel.send({
        type: 'broadcast',
        event: 'admit',
        payload: { studentId }
      });
    } else {
      const tempChannel = supabase.channel(`room-${id}`);
      await tempChannel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          tempChannel.send({
            type: 'broadcast',
            event: 'admit',
            payload: { studentId }
          });
          setTimeout(() => supabase.removeChannel(tempChannel), 1000);
        }
      });
    }
    setWaitingStudents(prev => prev.filter(s => s.id !== studentId));
  };

  const handleLeave = async () => {
    if (alreadyLeftRef.current) return;
    alreadyLeftRef.current = true;

    const savedRole = localStorage.getItem('yadalearn-user-role');
    const role = user?.role || savedRole;
    const isHost = role === 'teacher';

    if (isHost && id) {
      try {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
        if (isUuid) {
          await supabase.from('live_classes').update({ status: 'completed' }).eq('id', id);
        } else {
          await supabase.from('live_classes').update({ status: 'completed' }).eq('room_id', id);
        }
      } catch (err) {
        console.error('Failed to update live_classes status:', err);
      }
    }

    if (call) {
      try {
        if (isHost) {
          await call.endCall();
        } else {
          await call.leave();
        }
      } catch (err: any) {
        console.warn('Leave/end call error (safe to ignore):', err?.message);
      }
    }

    if (isHost && id) {
      try {
        const activeChannel = supabase.getChannels().find(c => c.topic === `realtime:room-${id}`);
        if (activeChannel) {
          await activeChannel.send({
            type: 'broadcast',
            event: 'session-ended',
            payload: { endedBy: user?.id }
          });
        }
      } catch (err) {
        console.warn('Failed to broadcast session-ended:', err);
      }
    }

    try {
      await endSession();
    } catch (err) {
      console.warn('endSession error:', err);
    }

    if (role === 'student') {
      navigate(`/rate-teacher/${id}`);
    } else {
      navigate('/teacher-dashboard');
    }
  };

  if (error) {
    return (
      <div className="min-h-screen bg-[#131314] flex flex-col items-center justify-center p-6 text-white">
        <div className="bg-[#202124] rounded-2xl p-8 max-w-md w-full shadow-2xl text-center border border-white/10">
          <span className="material-symbols-outlined text-red-500 text-5xl mb-4">error</span>
          <h2 className="text-xl font-bold mb-2">Connection Error</h2>
          <p className="text-sm text-zinc-400 mb-6">{error}</p>
          <button 
            onClick={() => navigate(-1)}
            className="w-full bg-white text-black px-6 py-3 rounded-full font-semibold hover:bg-zinc-200 transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  if (isWaiting) {
    return (
      <div className="min-h-screen bg-[#131314] flex flex-col items-center justify-center p-6 text-center text-white">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-6"></div>
        <h2 className="text-2xl font-bold mb-2">Waiting for Host</h2>
        <p className="text-zinc-400">The meeting organizer will let you in shortly.</p>
        <button 
          onClick={() => navigate('/student-dashboard')}
          className="mt-8 px-6 py-2.5 rounded-full border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors text-sm"
        >
          Leave
        </button>
      </div>
    );
  }

  if (!isStreamConfigured) {
    return (
      <div className="min-h-screen bg-[#131314] flex flex-col items-center justify-center p-6 text-white">
        <div className="bg-[#202124] rounded-2xl p-8 max-w-lg w-full shadow-2xl text-center border border-white/10">
          <div className="w-16 h-16 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-400 flex items-center justify-center mx-auto mb-4">
            <span className="material-symbols-outlined text-3xl">key</span>
          </div>
          <h2 className="text-xl font-bold mb-2">Stream Video Credentials Required</h2>
          <p className="text-sm text-zinc-400 mb-6 leading-relaxed">
            Live classroom video requires valid Stream Video SDK credentials. Please configure your API key and secret in your project's <span className="text-white font-mono bg-white/10 px-1.5 py-0.5 rounded">.env</span> file:
          </p>
          <div className="bg-black/50 border border-white/10 rounded-xl p-4 text-left font-mono text-xs text-zinc-300 mb-6 space-y-1.5">
            <p className="text-zinc-500"># .env</p>
            <p><span className="text-orange-400">VITE_STREAM_API_KEY</span>=your_stream_api_key</p>
            <p><span className="text-orange-400">STREAM_SECRET</span>=your_stream_secret</p>
          </div>
          <button 
            onClick={() => navigate(-1)}
            className="w-full bg-white text-black px-6 py-3 rounded-full font-semibold hover:bg-zinc-200 transition-colors text-sm"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  if (!call) {
    return (
      <div className="min-h-screen bg-[#131314] flex items-center justify-center p-6 text-white">
        <div className="flex flex-col items-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4"></div>
          <p className="text-zinc-300 text-sm font-medium">Joining meeting...</p>
        </div>
      </div>
    );
  }

  const role = user?.role || localStorage.getItem('yadalearn-user-role');

  return (
    <div className="fixed inset-0 w-screen h-[100dvh] bg-[#131314] flex flex-col z-[100] overflow-hidden">
      {/* Waiting Room Host Notification Panel */}
      {role === 'teacher' && waitingStudents.length > 0 && (
        <div className="absolute top-4 right-6 w-80 bg-[#202124] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden flex flex-col max-h-[50vh] text-white animate-in slide-in-from-top-3">
          <div className="bg-[#303134] p-3 border-b border-white/10 flex justify-between items-center">
            <span className="font-semibold text-xs text-white">Waiting to join ({waitingStudents.length})</span>
          </div>
          <div className="overflow-y-auto p-2 space-y-1">
            {waitingStudents.map(s => {
              const studentAvatar = s.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(s.name || s.id)}`;
              return (
                <div key={s.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-white/5">
                  <div className="flex items-center gap-2">
                    <img src={studentAvatar} alt={s.name} className="w-7 h-7 rounded-full object-cover border border-white/10" />
                    <span className="text-xs font-medium text-white truncate max-w-[120px]">{s.name}</span>
                  </div>
                  <button 
                    onClick={() => handleAdmit(s.id)} 
                    className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-full transition-colors"
                  >
                    Admit
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Video Stream Stage Area */}
      <div className="flex-1 min-h-0 w-full relative flex flex-col overflow-hidden bg-[#131314]">
        <StreamCall call={call}>
          <StreamTheme className="h-full w-full custom-stream-theme flex flex-col min-h-0">
            <CallLayout handleLeave={handleLeave} meetingId={id} />
          </StreamTheme>
        </StreamCall>
      </div>

      {/* Global Style Resets & Meet Gallery CSS Overrides */}
      <style>{`
        .custom-stream-theme {
          --str-video-bg: #131314;
          --str-video-surface-color: #202124;
          width: 100% !important;
          height: 100% !important;
          display: flex !important;
          flex-direction: column !important;
          min-height: 0 !important;
        }

        /* Continuous equal grid overrides */
        .str-video__paginated-grid-layout,
        .str-video__grid-layout {
          display: flex !important;
          flex-direction: column !important;
          width: 100% !important;
          height: 100% !important;
          min-height: 0 !important;
          padding: 8px !important;
          box-sizing: border-box !important;
          background: #131314 !important;
          overflow: hidden !important;
          flex: 1 1 0% !important;
        }

        .str-video__paginated-grid-layout__group,
        .str-video__grid-layout__wrapper {
          display: grid !important;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)) !important;
          grid-auto-rows: 1fr !important;
          width: 100% !important;
          height: 100% !important;
          min-height: 0 !important;
          flex: 1 1 0% !important;
          gap: 8px !important;
          align-items: stretch !important;
          justify-items: stretch !important;
        }

        .str-video__paginated-grid-layout__group > .str-video__participant-view,
        .str-video__paginated-grid-layout__group > div,
        .str-video__grid-layout__wrapper > .str-video__participant-view {
          width: 100% !important;
          height: 100% !important;
          min-height: 0 !important;
          max-height: 100% !important;
          aspect-ratio: unset !important;
        }

        /* Participant tile surface */
        .str-video__participant-view,
        .str-video__participant-view--aspect-ratio {
          border-radius: 0.75rem !important;
          border: 1px solid rgba(255, 255, 255, 0.05) !important;
          outline: none !important;
          background-color: #202124 !important;
          overflow: hidden !important;
          position: relative !important;
          aspect-ratio: unset !important;
        }

        .str-video__video-container,
        .str-video__video-placeholder {
          width: 100% !important;
          height: 100% !important;
          position: absolute !important;
          inset: 0 !important;
        }

        /* Video element framing */
        .str-video__video-element:not(.str-video__screen-share-video) {
          width: 100% !important;
          height: 100% !important;
          object-fit: cover !important;
          border-radius: 0 !important;
        }

        .str-video__screen-share-video,
        video[data-testid="screen-share-video"],
        .str-video__speaker-layout__spotlight video {
          width: 100% !important;
          height: 100% !important;
          object-fit: contain !important;
          background-color: #000000 !important;
          border-radius: 0 !important;
          image-rendering: -webkit-optimize-contrast !important;
          transform: translateZ(0) !important;
          will-change: transform !important;
          backface-visibility: hidden !important;
        }

        /* Hide built-in Stream circular avatar badges */
        .str-video__avatar-fallback,
        .str-video__avatar,
        .str-video__participant-avatar,
        .str-video__avatar-badge {
          display: none !important;
        }
      `}</style>
    </div>
  );
};

export default Meeting;
