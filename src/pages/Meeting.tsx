import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  StreamCall, 
  StreamTheme, 
  SpeakerLayout, 
  PaginatedGridLayout, 
  CallControls, 
  useCallStateHooks,
  useCall,
  Call,
  StreamParticipant,
  ParticipantView,
  useParticipantViewContext
} from '@stream-io/video-react-sdk';
import { useStream } from '@/contexts/StreamProvider';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

import '@stream-io/video-react-sdk/dist/css/styles.css';

const profileAvatarCache = new Map<string, string>();

// Custom Video Placeholder when participant camera is OFF
// Displays centered circular avatar photo (or color initials circle) with participant name centered underneath
const CustomVideoPlaceholder = React.forwardRef<HTMLDivElement, { participant?: StreamParticipant }>(
  ({ participant: propParticipant }, ref) => {
    const context = useParticipantViewContext();
    const participant = propParticipant || context?.participant;

    const { user } = useAuth();
    const [avatarUrl, setAvatarUrl] = useState<string | null>(() => {
      if (!participant) return null;
      if (participant.image) return participant.image;
      if (participant.userId === user?.id && user?.imageUrl) {
        return user.imageUrl;
      }
      return profileAvatarCache.get(participant.userId) || null;
    });
    const [imgError, setImgError] = useState(false);

    useEffect(() => {
      let isMounted = true;
      if (!participant) return;

      if (participant.userId === user?.id && user?.imageUrl) {
        setAvatarUrl(user.imageUrl);
        profileAvatarCache.set(participant.userId, user.imageUrl);
        return;
      }

      if (participant.image) {
        setAvatarUrl(participant.image);
        profileAvatarCache.set(participant.userId, participant.image);
        return;
      }

      if (!avatarUrl && participant.userId) {
        if (profileAvatarCache.has(participant.userId)) {
          setAvatarUrl(profileAvatarCache.get(participant.userId)!);
          return;
        }

        // Fetch actual profile image from Supabase 'profiles' table for this user
        supabase
          .from('profiles')
          .select('avatar_url, full_name')
          .eq('id', participant.userId)
          .maybeSingle()
          .then(({ data }) => {
            if (isMounted && data?.avatar_url) {
              profileAvatarCache.set(participant.userId, data.avatar_url);
              setAvatarUrl(data.avatar_url);
            }
          })
          .catch(console.error);
      }

      return () => {
        isMounted = false;
      };
    }, [participant?.userId, participant?.image, user?.id, user?.imageUrl, avatarUrl]);

    if (!participant) {
      return <div ref={ref} className="w-full h-full bg-[#202124] flex items-center justify-center rounded-2xl" />;
    }

    const displayAvatar = !imgError && avatarUrl ? avatarUrl : null;
    const displayName = participant.name || 'User';

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

    const isMuted = participant.isMuted || !participant.isAudioEnabled;

    return (
      <div ref={ref} className="relative w-full h-full bg-[#202124] flex flex-col items-center justify-center p-3 select-none overflow-hidden rounded-2xl border border-white/10 shadow-inner">
        {/* Centered Circular Profile Avatar */}
        <div className="relative flex flex-col items-center justify-center max-w-full max-h-full z-10">
          {displayAvatar ? (
            <img
              src={displayAvatar}
              alt={displayName}
              onError={() => setImgError(true)}
              className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 rounded-full object-cover shadow-2xl border-2 border-white/15 ring-2 ring-black/40"
            />
          ) : (
            <div className={`w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 rounded-full ${avatarBg} text-white font-bold text-xl sm:text-2xl md:text-3xl flex items-center justify-center shadow-2xl border-2 border-white/15 ring-2 ring-black/40`}>
              {initials}
            </div>
          )}

          {/* Display Name Centered Below Circular Avatar */}
          <span className="mt-2.5 sm:mt-3 text-white font-medium text-xs sm:text-sm md:text-base text-center truncate max-w-[150px] sm:max-w-[220px] drop-shadow-md tracking-wide">
            {displayName}
          </span>
        </div>

        {/* Top-Right Mute Status Badge */}
        {isMuted && (
          <div className="absolute top-3 right-3 z-20 w-7 h-7 rounded-full bg-black/65 backdrop-blur-md flex items-center justify-center text-white/90 border border-white/15 shadow-lg pointer-events-none">
            <span className="material-symbols-outlined text-sm">mic_off</span>
          </div>
        )}

        {/* Active Speaking Highlight Glow Box */}
        {participant.isSpeaking && (
          <div className="absolute inset-0 rounded-2xl border-2 border-blue-500 z-30 pointer-events-none shadow-[0_0_15px_rgba(59,130,246,0.6)] animate-pulse" />
        )}
      </div>
    );
  }
);
CustomVideoPlaceholder.displayName = 'CustomVideoPlaceholder';

// Custom Participant UI overlay for live video feed
const CustomParticipantViewUI = ({ participant: propParticipant }: { participant?: StreamParticipant }) => {
  const context = useParticipantViewContext();
  const participant = propParticipant || context?.participant;

  if (!participant) return null;

  const isMuted = participant.isMuted || !participant.isAudioEnabled;

  return (
    <div className="absolute inset-0 pointer-events-none z-20 overflow-hidden rounded-2xl">
      {/* Top-Right Mute Badge */}
      {isMuted && (
        <div className="absolute top-3 right-3 w-7 h-7 rounded-full bg-black/65 backdrop-blur-md flex items-center justify-center text-white/90 border border-white/15 shadow-lg">
          <span className="material-symbols-outlined text-sm">mic_off</span>
        </div>
      )}

      {/* Bottom-Left Name Overlay Pill */}
      <div className="absolute bottom-3 left-3 bg-black/65 backdrop-blur-md px-3 py-1 rounded-lg border border-white/10 shadow-md">
        <span className="text-white font-medium text-xs truncate max-w-[180px] block">
          {participant.name || 'User'}
        </span>
      </div>

      {/* Active Speaking Indicator Ring */}
      {participant.isSpeaking && (
        <div className="absolute inset-0 rounded-2xl border-2 border-blue-500 pointer-events-none shadow-[0_0_15px_rgba(59,130,246,0.6)] animate-pulse" />
      )}
    </div>
  );
};

// Dynamic Participant Grid Layout — Meet-style equal tiles, responsive to orientation
const CustomResponsiveGridLayout = () => {
  const { useParticipants } = useCallStateHooks();
  const participants = useParticipants();

  // Detect portrait vs landscape orientation reactively
  const [isPortrait, setIsPortrait] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.matchMedia('(orientation: portrait)').matches;
    }
    return false;
  });

  useEffect(() => {
    const mql = window.matchMedia('(orientation: portrait)');
    const handler = (e: MediaQueryListEvent) => setIsPortrait(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  const count = participants.length;

  // Calculate columns and rows based on participant count AND orientation
  let cols = 1;
  let rows = 1;

  if (count <= 1) {
    cols = 1;
    rows = 1;
  } else if (count === 2) {
    // Portrait: stack vertically (1 col, 2 rows) — Meet-style
    // Landscape: side by side (2 cols, 1 row)
    cols = isPortrait ? 1 : 2;
    rows = isPortrait ? 2 : 1;
  } else if (count <= 4) {
    cols = 2;
    rows = 2;
  } else if (count <= 6) {
    cols = isPortrait ? 2 : 3;
    rows = isPortrait ? 3 : 2;
  } else if (count <= 9) {
    cols = 3;
    rows = 3;
  } else if (count <= 12) {
    cols = isPortrait ? 3 : 4;
    rows = isPortrait ? 4 : 3;
  } else if (count <= 16) {
    cols = 4;
    rows = 4;
  } else if (count <= 20) {
    cols = isPortrait ? 4 : 5;
    rows = isPortrait ? 5 : 4;
  } else if (count <= 24) {
    cols = isPortrait ? 4 : 6;
    rows = isPortrait ? 6 : 4;
  } else {
    cols = isPortrait ? 4 : 6;
    rows = Math.ceil(count / cols);
  }

  return (
    <div
      className="w-full h-full grid gap-2 sm:gap-3 p-2 sm:p-4 overflow-hidden bg-zinc-950 items-stretch justify-stretch"
      style={{
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
      }}
    >
      {participants.map((participant) => (
        <div
          key={participant.sessionId || participant.userId}
          className="relative w-full h-full min-h-0 min-w-0 flex items-center justify-center overflow-hidden rounded-2xl bg-[#202124] border border-white/10 shadow-lg"
        >
          <ParticipantView
            participant={participant}
            VideoPlaceholder={CustomVideoPlaceholder}
            ParticipantViewUI={CustomParticipantViewUI}
            className="w-full h-full object-cover"
          />
        </div>
      ))}
    </div>
  );
};

// Dedicated Screen Share Main Stage Layout (Full width main stage + participant strip)
const DedicatedScreenShareLayout = () => {
  const { useParticipants } = useCallStateHooks();
  const participants = useParticipants();

  // Screen share participant or fall back to first active participant
  const screenShareParticipant = participants.find((p) => p.hasScreenShare) || participants[0];

  return (
    <div className="w-full h-full flex flex-col bg-zinc-950 overflow-hidden relative">
      {/* Participants Top Strip (single equal strip) */}
      <div className="w-full shrink-0 bg-black/70 backdrop-blur-md p-2 flex items-center gap-2.5 overflow-x-auto border-b border-white/10 z-10 scrollbar-none">
        {participants.map((p) => (
          <div
            key={p.sessionId || p.userId}
            className="relative shrink-0 w-28 sm:w-36 h-20 sm:h-24 rounded-xl overflow-hidden bg-[#202124] border border-white/10 shadow-md"
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

      {/* Main Screen Share Surface (Bleed Area with Crisp object-fit: contain) */}
      <div className="flex-1 w-full h-full relative overflow-hidden bg-black flex items-center justify-center p-2">
        {screenShareParticipant ? (
          <ParticipantView
            participant={screenShareParticipant}
            trackType="screenShareTrack"
            VideoPlaceholder={CustomVideoPlaceholder}
            ParticipantViewUI={() => null}
            className="w-full h-full object-contain screen-share-video"
          />
        ) : (
          <div className="text-zinc-400 text-sm">Screen share loading...</div>
        )}
      </div>
    </div>
  );
};

// Teacher Host & Moderator Controls Panel (Stream SDK powered)
const TeacherModeratorPanel = ({ onClose }: { onClose: () => void }) => {
  const { useParticipants, useCall } = useCallStateHooks();
  const participants = useParticipants();
  const call = useCall();
  const { user } = useAuth();

  const handleMuteAudio = async (userId: string) => {
    if (!call) return;
    try {
      await call.muteUser(userId, 'audio');
    } catch (e) {
      console.error('Failed to mute audio:', e);
    }
  };

  const handleMuteVideo = async (userId: string) => {
    if (!call) return;
    try {
      await call.muteUser(userId, 'video');
    } catch (e) {
      console.error('Failed to mute video:', e);
    }
  };

  const handleKickParticipant = async (userId: string) => {
    if (!call) return;
    if (window.confirm("Are you sure you want to remove this participant from the classroom?")) {
      try {
        await call.removeMembers([userId]);
      } catch (e) {
        console.error('Failed to remove participant:', e);
        try {
          await call.blockUser(userId);
        } catch (err) {
          console.error('Failed to block user:', err);
        }
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
      await call.muteAllUsers('audio');
    } catch (e) {
      console.error('Failed to mute all audio:', e);
    }
  };

  const handleMuteAllVideo = async () => {
    if (!call) return;
    try {
      await call.muteAllUsers('video');
    } catch (e) {
      console.error('Failed to mute all video:', e);
    }
  };

  const studentParticipants = participants.filter(p => p.userId !== user?.id);

  return (
    <div className="absolute top-20 right-6 w-80 sm:w-96 bg-zinc-900/95 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-2xl z-50 overflow-hidden text-white animate-in slide-in-from-top-4">
      <div className="bg-purple-950/60 p-4 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-purple-400 text-xl">admin_panel_settings</span>
          <h3 className="font-bold text-sm">Host Controls ({studentParticipants.length})</h3>
        </div>
        <button onClick={onClose} className="p-1 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white transition-colors">
          <span className="material-symbols-outlined text-base">close</span>
        </button>
      </div>

      <div className="p-3 border-b border-white/5 flex gap-2">
        <button
          onClick={handleMuteAllAudio}
          className="flex-1 bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 font-bold text-xs py-2 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5"
        >
          <span className="material-symbols-outlined text-sm">mic_off</span>
          Mute Audio
        </button>
        <button
          onClick={handleMuteAllVideo}
          className="flex-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 font-bold text-xs py-2 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5"
        >
          <span className="material-symbols-outlined text-sm">videocam_off</span>
          Mute Video
        </button>
      </div>

      <div className="max-h-[50vh] overflow-y-auto p-2 space-y-1">
        {studentParticipants.length === 0 ? (
          <p className="text-xs text-zinc-400 text-center py-6">No active participants connected.</p>
        ) : (
          studentParticipants.map(p => (
            <div key={p.userId} className="flex items-center justify-between p-2.5 rounded-2xl bg-zinc-800/40 hover:bg-zinc-800/80 transition-colors border border-white/5">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-xs font-bold shrink-0">
                  {(p.name || 'S')[0].toUpperCase()}
                </div>
                <span className="text-xs font-bold truncate max-w-[100px]">{p.name || 'Student'}</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handlePinParticipant(p.userId)}
                  title={p.isPinned ? "Unpin" : "Pin Spotlight"}
                  className={`p-1.5 rounded-lg text-xs font-bold transition-colors ${p.isPinned ? 'bg-purple-600 text-white' : 'bg-white/10 hover:bg-white/20 text-zinc-300'}`}
                >
                  <span className="material-symbols-outlined text-base">push_pin</span>
                </button>
                <button
                  onClick={() => handleMuteAudio(p.userId)}
                  title="Mute Audio"
                  className={`p-1.5 rounded-lg text-xs font-bold transition-colors ${p.isMuted ? 'bg-red-500/20 text-red-400' : 'bg-white/10 hover:bg-white/20 text-zinc-300'}`}
                >
                  <span className="material-symbols-outlined text-base">{p.isMuted ? 'mic_off' : 'mic'}</span>
                </button>
                <button
                  onClick={() => handleMuteVideo(p.userId)}
                  title="Mute Video"
                  className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-zinc-300 text-xs font-bold transition-colors"
                >
                  <span className="material-symbols-outlined text-base">videocam_off</span>
                </button>
                <button
                  onClick={() => handleKickParticipant(p.userId)}
                  title="Remove Participant"
                  className="p-1.5 rounded-lg bg-red-600/80 hover:bg-red-600 text-white text-xs font-bold transition-colors"
                >
                  <span className="material-symbols-outlined text-base">person_remove</span>
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// Internal Layout switcher component (Grid View vs Speaker View)
const CallLayout = ({ handleLeave }: { handleLeave: () => void }) => {
  const [layout, setLayout] = useState<'grid' | 'speaker'>('grid');
  const [showModPanel, setShowModPanel] = useState(false);
  const { user } = useAuth();
  const role = user?.role || localStorage.getItem('yadalearn-user-role');
  const { useHasOngoingScreenShare } = useCallStateHooks();
  const hasScreenShare = useHasOngoingScreenShare();
  const call = useCall();

  // Configure high-quality screen share track parameters whenever call instance is ready
  useEffect(() => {
    if (call?.screenShare) {
      try {
        call.screenShare.setSettings({
          maxBitrate: 7500000,
          maxFramerate: 30,
          contentHint: 'detail',
        });
      } catch (e) {
        console.warn('Failed to configure screenShare settings:', e);
      }
    }
  }, [call]);

  // Automatically switch to speaker layout when screen sharing is active
  useEffect(() => {
    if (hasScreenShare) {
      setLayout('speaker');
    }
  }, [hasScreenShare]);

  return (
    <div className="absolute inset-0 flex flex-col w-full h-full overflow-hidden bg-zinc-950">
      {/* Video Stream Area - Natural Fullscreen Viewport */}
      <div className="flex-1 w-full h-full overflow-hidden p-0 relative">
        {hasScreenShare ? (
          <DedicatedScreenShareLayout />
        ) : layout === 'grid' ? (
          <CustomResponsiveGridLayout />
        ) : (
          <SpeakerLayout participantsBarPosition="top" VideoPlaceholder={CustomVideoPlaceholder} />
        )}
      </div>

      {/* Host Controls Trigger for Teacher */}
      {role === 'teacher' && (
        <button
          onClick={() => setShowModPanel(!showModPanel)}
          className="absolute top-4 right-4 z-50 bg-purple-600/90 hover:bg-purple-600 text-white backdrop-blur-md px-4 py-2 rounded-full font-bold text-xs flex items-center gap-2 shadow-2xl border border-purple-400/30 transition-all active:scale-95 pointer-events-auto"
        >
          <span className="material-symbols-outlined text-base">admin_panel_settings</span>
          Host Controls
        </button>
      )}

      {showModPanel && <TeacherModeratorPanel onClose={() => setShowModPanel(false)} />}

      {/* Floating Control Bar Overlay */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-black/85 backdrop-blur-2xl rounded-full px-5 py-2.5 flex items-center gap-3 z-50 shadow-2xl border border-white/15 pointer-events-auto">
        <button
          onClick={() => setLayout(l => l === 'grid' ? 'speaker' : 'grid')}
          title={layout === 'grid' ? "Switch to Speaker View" : "Switch to Grid View"}
          className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all duration-200 flex items-center justify-center"
        >
          <span className="material-symbols-outlined text-xl">
            {layout === 'grid' ? 'grid_view' : 'featured_video'}
          </span>
        </button>
        <div className="w-[1px] h-6 bg-white/20" />
        <CallControls onLeave={handleLeave} />
      </div>
    </div>
  );
};

const Meeting = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { client, isStreamReady } = useStream();
  const { user, endSession } = useAuth();
  const [call, setCall] = useState<Call | null>(null);
  const [error, setError] = useState('');
  const alreadyLeftRef = React.useRef(false);

  const [isWaiting, setIsWaiting] = useState(() => {
    const role = user?.role || localStorage.getItem('yadalearn-user-role');
    return role === 'student';
  });
  const [waitingStudents, setWaitingStudents] = useState<
    { id: string; name: string; avatar?: string }[]
  >([]);
  // Verify if session has already ended
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
        if (status === 'completed' || status === 'ended' || status === 'cancelled') {
          setError('This class session has ended and is no longer joinable.');
        }
      }
    };
    checkClassStatus();
  }, [id]);

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

    // Listen for host ending the session – students auto-leave
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

  useEffect(() => {
    if (!client || !isStreamReady || !id || isWaiting) return;

    let callObj: Call | null = null;
    let isMounted = true;

    const joinCall = async () => {
      try {
        callObj = client.call('default', id);
        const role = user?.role || localStorage.getItem('yadalearn-user-role');
        const isHost = role === 'teacher';

        // Assign host role to teacher when creating/joining call
        await callObj.getOrCreate({
          data: {
            members: [
              {
                user_id: user.id,
                role: isHost ? 'host' : 'user',
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
                  role: 'host',
                },
              ],
            });
          } catch (e) {
            console.log('Update call members host role:', e);
          }
        }

        await callObj.join();

        // Configure Stream screen-share track for high quality (maxBitrate 7.5 Mbps, 30 FPS, detail content hint)
        try {
          callObj.screenShare.setSettings({
            maxBitrate: 7500000,
            maxFramerate: 30,
            contentHint: 'detail',
          });
        } catch (e) {
          console.warn('Failed to set screenShare settings:', e);
        }
        
        if (isMounted) {
          setCall(callObj);
        }
      } catch (err: any) {
        console.error('Failed to join call', err);
        if (isMounted) {
          setError(err.message || 'Failed to join call');
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
    // Prevent double-leave (Stream CallControls already calls leave before onLeave fires)
    if (alreadyLeftRef.current) return;
    alreadyLeftRef.current = true;

    const savedRole = localStorage.getItem('yadalearn-user-role');
    const role = user?.role || savedRole;
    const isHost = role === 'teacher';

    // 1. Mark class completed in Supabase ONLY IF user is host (teacher)
    if (isHost && id) {
      try {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
        const updateQuery = isUuid
          ? supabase.from('live_classes').update({ status: 'completed' }).eq('id', id)
          : supabase.from('live_classes').update({ status: 'completed' }).eq('room_id', id);
        await updateQuery;
      } catch (err) {
        console.error('Failed to update class status:', err);
      }
    }

    // 2. End or leave the Stream call
    if (call) {
      try {
        if (isHost) {
          // Host: endCall() ends the call for ALL participants (not just self)
          await call.endCall();
        } else {
          // Student: leave() only removes this user
          await call.leave();
        }
      } catch (err: any) {
        // "already been left" or "already ended" is safe to ignore
        console.warn('Leave/end call:', err?.message);
      }
    }

    // 3. Host: broadcast 'session-ended' so every student client navigates away
    if (isHost && id) {
      try {
        const activeChannel = supabase.getChannels().find(c => c.topic === `realtime:room-${id}`);
        if (activeChannel) {
          await activeChannel.send({
            type: 'broadcast',
            event: 'session-ended',
            payload: { endedBy: user?.id }
          });
        } else {
          const tempChannel = supabase.channel(`room-${id}`);
          tempChannel.subscribe((status) => {
            if (status === 'SUBSCRIBED') {
              tempChannel.send({
                type: 'broadcast',
                event: 'session-ended',
                payload: { endedBy: user?.id }
              });
              setTimeout(() => supabase.removeChannel(tempChannel), 1000);
            }
          });
        }
      } catch (err) {
        console.warn('Failed to broadcast session-ended:', err);
      }
    }

    // 4. Clean up auth session and navigate
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
      <div className="min-h-screen bg-gray-50 dark:bg-zinc-950 flex flex-col items-center justify-center p-6">
        <div className="bg-white dark:bg-zinc-900 rounded-[2.5rem] p-8 max-w-md w-full shadow-2xl text-center">
          <span className="material-symbols-outlined text-red-500 text-5xl mb-4">error</span>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Connection Error</h2>
          <p className="text-sm text-gray-500 mb-6">{error}</p>
          <button 
            onClick={() => navigate(-1)}
            className="w-full bg-black text-white px-6 py-3 rounded-full font-bold hover:bg-gray-800 transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  if (isWaiting) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mb-6"></div>
        <h2 className="text-2xl font-bold text-white mb-2">Waiting for Host</h2>
        <p className="text-zinc-400">The teacher will let you in shortly.</p>
        <button 
          onClick={() => navigate('/student-dashboard')}
          className="mt-8 px-6 py-2 rounded-full border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors"
        >
          Leave
        </button>
      </div>
    );
  }

  if (!call) {
    return (
      <div className="min-h-screen gradient-welcome flex items-center justify-center p-6">
        <div className="flex flex-col items-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mb-4"></div>
          <p className="text-purple-900 font-medium">Connecting to secure classroom...</p>
        </div>
      </div>
    );
  }

  const role = user?.role || localStorage.getItem('yadalearn-user-role');

  return (
    <div className="fixed inset-0 w-screen h-[100dvh] bg-zinc-950 flex flex-col z-[100] overflow-hidden">
      {/* Top Bar */}
      <div className="absolute top-0 w-full z-40 bg-gradient-to-b from-black/80 to-transparent p-4 md:p-6 shrink-0 transition-opacity pointer-events-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={handleLeave}
              className="flex size-10 items-center justify-center rounded-full hover:bg-zinc-800 text-white transition-colors"
            >
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
            <div>
              <h2 className="text-lg font-bold text-white leading-tight">Live Classroom</h2>
              <p className="text-xs text-green-400 font-medium flex items-center gap-1">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
                Live Grid Stream
              </p>
            </div>
          </div>
        </div>
      </div>

      {role === 'teacher' && waitingStudents.length > 0 && (
        <div className="absolute top-20 right-6 w-80 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl z-50 overflow-hidden flex flex-col max-h-[50vh]">
          <div className="bg-purple-900/30 p-3 border-b border-zinc-800 flex justify-between items-center">
            <span className="font-bold text-sm text-white">Waiting Room ({waitingStudents.length})</span>
          </div>
          <div className="overflow-y-auto p-2">
            {waitingStudents.map(s => {
              const studentAvatar = s.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(s.name || s.id)}`;
              return (
                <div key={s.id} className="flex items-center justify-between p-2 rounded-xl hover:bg-zinc-800/50">
                  <div className="flex items-center gap-2">
                    <img src={studentAvatar} alt={s.name} className="w-8 h-8 rounded-full object-cover border border-white/10" />
                    <span className="text-sm font-medium text-white truncate max-w-[100px]">{s.name}</span>
                  </div>
                  <button onClick={() => handleAdmit(s.id)} className="px-3 py-1 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-full transition-colors">
                    Admit
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Video Stream Area */}
      <div className="flex-1 w-full h-full relative">
        <div className="absolute inset-0 bg-zinc-950 overflow-hidden">
          <StreamCall call={call}>
            <StreamTheme className="h-full w-full custom-stream-theme">
              <CallLayout handleLeave={handleLeave} />
            </StreamTheme>
          </StreamCall>
        </div>
      </div>

      {/* Custom CSS overrides for uncompressed full-viewport video & screen share */}
      <style>{`
        .custom-stream-theme {
          --str-video-bg: #09090b;
          --str-video-surface-color: #09090b;
          width: 100% !important;
          height: 100% !important;
          display: flex !important;
          flex-direction: column !important;
        }

        /* Prevent Stream SDK from forcing aspect ratios or max heights that compress the layout */
        .str-video__paginated-grid-layout,
        .str-video__grid-layout {
          display: flex !important;
          flex-direction: column !important;
          width: 100% !important;
          height: 100% !important;
          padding: 8px !important;
          box-sizing: border-box !important;
          background: #09090b !important;
          overflow: hidden !important;
          flex: 1 !important;
        }

        .str-video__paginated-grid-layout__group,
        .str-video__grid-layout__wrapper {
          display: flex !important;
          flex-direction: row !important;
          flex-wrap: wrap !important;
          width: 100% !important;
          height: 100% !important;
          flex: 1 !important;
          gap: 8px !important;
          align-items: stretch !important;
          justify-content: center !important;
        }

        /* Participant view tiles — equal cells, not forced full-height */
        .str-video__paginated-grid-layout__group > .str-video__participant-view,
        .str-video__paginated-grid-layout__group > div,
        .str-video__grid-layout__wrapper > .str-video__participant-view {
          flex: 1 1 auto !important;
          min-height: 0 !important;
          max-height: 100% !important;
          aspect-ratio: unset !important;
        }

        .str-video__paginated-grid-layout__group > .str-video__participant-view:only-child,
        .str-video__paginated-grid-layout__group > div:only-child,
        .str-video__grid-layout__wrapper > .str-video__participant-view:only-child {
          flex: 1 1 100% !important;
          width: 100% !important;
          max-height: 100% !important;
        }

        /* Speaker Layout overrides to fill 100% viewport & sharp rendering */
        .str-video__speaker-layout__wrapper {
          flex: 1 1 0% !important;
          width: 100% !important;
          height: 100% !important;
          min-height: 0 !important;
          position: relative !important;
          display: flex !important;
          flex-direction: column !important;
          overflow: hidden !important;
        }

        .str-video__speaker-layout {
          display: flex !important;
          flex-direction: column !important;
          width: 100% !important;
          height: 100% !important;
          padding: 8px !important;
          box-sizing: border-box !important;
          background: #09090b !important;
          position: relative !important;
          flex: 1 1 0% !important;
          min-height: 0 !important;
          overflow: hidden !important;
        }

        .str-video__speaker-layout--variant-top {
          flex-direction: column-reverse !important;
        }

        /* Main surface / Spotlight displaying screen-share or main video */
        .str-video__speaker-layout__spotlight {
          width: 100% !important;
          height: 100% !important;
          min-height: 0 !important;
          min-width: 0 !important;
          flex: 1 1 0% !important;
          border-radius: 1rem !important;
          overflow: hidden !important;
          aspect-ratio: unset !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          background: #000000 !important;
          position: relative !important;
        }

        .str-video__speaker-layout__spotlight .str-video__participant-view {
          width: 100% !important;
          height: 100% !important;
          max-width: 100% !important;
          max-height: 100% !important;
          min-height: 0 !important;
          min-width: 0 !important;
          border-radius: 1rem !important;
          overflow: hidden !important;
          background: #000000 !important;
          position: relative !important;
        }

        /* Participants Bar in Speaker View / Screen Share */
        .str-video__speaker-layout__participants-bar-buttons-wrapper {
          width: 100% !important;
          max-width: 100% !important;
          display: flex !important;
          justify-content: center !important;
          align-items: center !important;
          flex-shrink: 0 !important;
          z-index: 30 !important;
          padding: 4px 0 !important;
        }

        .str-video__speaker-layout__participants-bar-wrapper {
          width: 100% !important;
          max-width: 100% !important;
          overflow-x: auto !important;
          overflow-y: hidden !important;
          scrollbar-width: none !important;
          padding: 4px 8px !important;
        }

        .str-video__participants-bar,
        .str-video__speaker-layout__participants-bar {
          display: flex !important;
          flex-direction: row !important;
          gap: 10px !important;
          padding: 4px 8px !important;
          align-items: center !important;
          justify-content: center !important;
          width: auto !important;
          min-width: 100% !important;
          max-height: 125px !important;
          background: rgba(9, 9, 11, 0.75) !important;
          backdrop-filter: blur(12px) !important;
          border-radius: 1rem !important;
          border: 1px solid rgba(255, 255, 255, 0.1) !important;
        }

        /* Equal cell sizing for participant tiles in bar */
        .str-video__speaker-layout__participant-tile {
          width: 170px !important;
          min-width: 170px !important;
          max-width: 170px !important;
          height: 105px !important;
          min-height: 105px !important;
          max-height: 105px !important;
          flex: 0 0 170px !important;
          padding: 0 !important;
          margin: 0 !important;
          box-sizing: border-box !important;
          border-radius: 0.85rem !important;
          overflow: hidden !important;
          border: 1px solid rgba(255, 255, 255, 0.15) !important;
          background-color: #202124 !important;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5) !important;
        }

        .str-video__participants-bar .str-video__participant-view,
        .str-video__speaker-layout__participants-bar .str-video__participant-view,
        .str-video__speaker-layout__participant-tile .str-video__participant-view {
          width: 100% !important;
          height: 100% !important;
          min-width: 100% !important;
          max-width: 100% !important;
          min-height: 100% !important;
          max-height: 100% !important;
          flex-shrink: 0 !important;
          border-radius: 0.85rem !important;
          overflow: hidden !important;
          border: none !important;
          aspect-ratio: unset !important;
        }

        /* General Participant View resets */
        .str-video__participant-view,
        .str-video__participant-view--aspect-ratio {
          border-radius: 1rem !important;
          border: 1px solid rgba(255, 255, 255, 0.1) !important;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5) !important;
          outline: none !important;
          background-color: #09090b !important;
          overflow: hidden !important;
          position: relative !important;
          aspect-ratio: unset !important;
          max-width: none !important;
          max-height: none !important;
        }

        .str-video__video-container,
        .str-video__video-placeholder {
          width: 100% !important;
          height: 100% !important;
          position: absolute !important;
          inset: 0 !important;
        }

        /* Camera feed vs Screen Share video scaling */
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
          image-rendering: crisp-edges !important;
        }

        /* Name Tag overlay */
        .str-video__participant-details {
          position: absolute !important;
          bottom: 12px !important;
          left: 12px !important;
          z-index: 30 !important;
          background: rgba(0, 0, 0, 0.75) !important;
          backdrop-filter: blur(12px) !important;
          padding: 4px 10px !important;
          border-radius: 0.75rem !important;
          border: 1px solid rgba(255, 255, 255, 0.15) !important;
          color: #ffffff !important;
          font-weight: 600 !important;
          font-size: 0.8125rem !important;
          display: flex !important;
          align-items: center !important;
          gap: 6px !important;
        }

        .str-video__call-controls {
          background: transparent !important;
          border: none !important;
          padding: 0 !important;
        }

        /* Hide built-in Stream circular avatars */
        .str-video__avatar-fallback,
        .str-video__avatar,
        .str-video__participant-avatar,
        .str-video__avatar-badge {
          display: none !important;
        }
        
        .str-video__menu,
        .str-video__menu-container {
          background-color: #18181b !important;
          color: white !important;
          border: 1px solid rgba(255,255,255,0.1) !important;
          border-radius: 1rem !important;
          font-family: inherit !important;
        }

        .str-video__menu-item:hover,
        .str-video__button:hover {
          background-color: rgba(255,255,255,0.1) !important;
        }

        .str-video__composite-button {
          background: rgba(255,255,255,0.1) !important;
          color: white !important;
          border-radius: 1rem !important;
          transition: all 0.2s;
        }

        .str-video__composite-button:hover {
          background: rgba(255,255,255,0.2) !important;
        }

        .str-video__composite-button--danger {
          background: #ef4444 !important;
        }

        .str-video__composite-button--danger:hover {
          background: #dc2626 !important;
        }

        .str-video__avatar-fallback,
        .str-video__avatar {
          display: none !important;
        }
      `}</style>
    </div>
  );
};

export default Meeting;

