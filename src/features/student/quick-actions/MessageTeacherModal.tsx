import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { Send, Smile, Check, CheckCheck, Trash2, Edit2, Camera, Mic, Square, X, Play, Pause, Paperclip, FileText, ChevronLeft } from 'lucide-react';
import EmojiPicker from 'emoji-picker-react';
import { AudioRecorder } from 'react-audio-voice-recorder';

const AudioBubblePlayer = ({ src }: { src: string }) => {
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [playbackRate, setPlaybackRate] = useState(1);

    useEffect(() => {
        const audio = new Audio(src);
        audioRef.current = audio;

        const updateTime = () => setCurrentTime(audio.currentTime);
        const updateDuration = () => setDuration(audio.duration || 0);
        const handleEnded = () => setIsPlaying(false);

        audio.addEventListener('timeupdate', updateTime);
        audio.addEventListener('loadedmetadata', updateDuration);
        audio.addEventListener('ended', handleEnded);

        return () => {
            audio.pause();
            audio.removeEventListener('timeupdate', updateTime);
            audio.removeEventListener('loadedmetadata', updateDuration);
            audio.removeEventListener('ended', handleEnded);
        };
    }, [src]);

    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.playbackRate = playbackRate;
        }
    }, [playbackRate]);

    const togglePlay = () => {
        if (!audioRef.current) return;
        if (isPlaying) {
            audioRef.current.pause();
        } else {
            audioRef.current.play().catch(e => console.error(e));
        }
        setIsPlaying(!isPlaying);
    };

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!audioRef.current) return;
        const val = parseFloat(e.target.value);
        audioRef.current.currentTime = val;
        setCurrentTime(val);
    };

    const cycleSpeed = () => {
        const nextRates = [1, 1.5, 2];
        const nextIndex = (nextRates.indexOf(playbackRate) + 1) % nextRates.length;
        setPlaybackRate(nextRates[nextIndex]);
    };

    const formatTime = (time: number) => {
        if (isNaN(time)) return '0:00';
        const mins = Math.floor(time / 60);
        const secs = Math.floor(time % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div className="flex items-center gap-2 bg-black/10 dark:bg-white/10 p-2 rounded-xl min-w-[180px] text-white">
            <button 
                type="button" 
                onClick={togglePlay} 
                className="w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors shrink-0"
            >
                {isPlaying ? <Pause className="h-3.5 w-3.5 fill-white" /> : <Play className="h-3.5 w-3.5 fill-white ml-0.5" />}
            </button>
            <div className="flex-1 flex flex-col gap-0.5 min-w-0">
                <input 
                    type="range" 
                    min={0} 
                    max={duration || 100} 
                    value={currentTime} 
                    onChange={handleSeek} 
                    className="w-full accent-white h-1 rounded cursor-pointer"
                />
                <div className="flex justify-between text-[8px] text-white/70 font-bold">
                    <span>{formatTime(currentTime)}</span>
                    <span>{formatTime(duration)}</span>
                </div>
            </div>
            <button 
                type="button"
                onClick={cycleSpeed}
                className="px-1.5 py-0.5 rounded bg-white/20 hover:bg-white/30 text-[8px] font-bold text-white shrink-0"
            >
                {playbackRate}x
            </button>
        </div>
    );
};

interface MessageTeacherModalProps {
    isOpen: boolean;
    onClose: () => void;
    recipientId?: string;
    onMessagesRead?: () => void;
}


const getAuthToken = async () => {
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
    try {
        const sessionData = await Promise.race([
            supabase.auth.getSession(),
            new Promise(r => setTimeout(() => r({ data: { session: null } }), 1500))
        ]);
        return sessionData?.data?.session?.access_token || supabaseKey;
    } catch {
        return supabaseKey;
    }
};

const rawFetchGlobal = async (table, queryStr, method = 'GET', body = null) => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '') || '';
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
    const token = await getAuthToken();
    
    const headers = {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${token}`
    };
    if (body) {
        headers['Content-Type'] = 'application/json';
        if (method === 'POST' || method === 'PATCH') headers['Prefer'] = 'return=representation';
    }
    
    const url = `${supabaseUrl}/rest/v1/${table}${queryStr ? '?' + queryStr : ''}`;
    
    const res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined
    });
    
    if (!res.ok) throw new Error(`HTTP ${res.status}: ` + await res.text());
    if (res.status === 204) return null;
    return res.json();
};

export const MessageTeacherModal = ({ isOpen, onClose, recipientId, onMessagesRead }: MessageTeacherModalProps) => {
    const { user, userRole: role } = useAuth();
    const userId = user?.id;

    // Chat partner selection
    const [partners, setPartners] = useState<any[]>([]);
    const [selectedPartnerId, setSelectedPartnerId] = useState<string>('');
    const [selectedPartner, setSelectedPartner] = useState<any>(null);
    const [isFallbackMode, setIsFallbackMode] = useState(false);
    const [showProfileModal, setShowProfileModal] = useState(false);

    // Messages state
    const [messages, setMessages] = useState<any[]>([]);
    const [newMessageText, setNewMessageText] = useState('');
    const [loadingMessages, setLoadingMessages] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    // Editing message state
    const [editingMessage, setEditingMessage] = useState<any | null>(null);

    // Audio recording state
    const [isRecording, setIsRecording] = useState(false);
    const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
    const [recordingSeconds, setRecordingSeconds] = useState(0);
    const recordingTimerRef = useRef<any>(null);

    // File input ref for camera/photos
    const fileInputRef = useRef<HTMLInputElement>(null);

    // File input ref for documents
    const documentInputRef = useRef<HTMLInputElement>(null);

    // Scroll ref
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Typing indicator state
    const [typingStatus, setTypingStatus] = useState<string | null>(null);
    const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
    const typingChannelRef = useRef<any>(null);
    const typingTimeoutRef = useRef<any>(null);

    // Delete message modal state
    const [deleteModalMsg, setDeleteModalMsg] = useState<any | null>(null);

    // Deleted for me IDs set
    const [deletedForMeIds, setDeletedForMeIds] = useState<Set<string>>(() => {
        if (!userId) return new Set();
        try {
            const saved = localStorage.getItem(`deleted_messages_${userId}`);
            return saved ? new Set(JSON.parse(saved)) : new Set();
        } catch {
            return new Set();
        }
    });

    useEffect(() => {
        if (!userId) return;
        try {
            const saved = localStorage.getItem(`deleted_messages_${userId}`);
            setDeletedForMeIds(saved ? new Set(JSON.parse(saved)) : new Set());
        } catch {}
    }, [userId]);

    // Live classes meeting link status cache
    const [liveClassStatuses, setLiveClassStatuses] = useState<Record<string, any>>({});

    useEffect(() => {
        if (isRecording) {
            setRecordingSeconds(0);
            recordingTimerRef.current = setInterval(() => {
                setRecordingSeconds(prev => prev + 1);
            }, 1000);
        } else {
            if (recordingTimerRef.current) {
                clearInterval(recordingTimerRef.current);
            }
        }
        return () => {
            if (recordingTimerRef.current) {
                clearInterval(recordingTimerRef.current);
            }
        };
    }, [isRecording]);

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const recorder = new MediaRecorder(stream);
            const chunks: Blob[] = [];

            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    chunks.push(e.data);
                }
            };

            recorder.onstop = async () => {
                const audioBlob = new Blob(chunks, { type: 'audio/webm' });
                const reader = new FileReader();
                reader.readAsDataURL(audioBlob);
                reader.onloadend = async () => {
                    const base64Data = reader.result as string;
                    await handleSendRichMessage(null, 'audio', base64Data);
                };
                stream.getTracks().forEach(track => track.stop());
            };

            recorder.start();
            setMediaRecorder(recorder);
            setIsRecording(true);
        } catch (err) {
            console.error("Failed to start audio recording:", err);
            alert("Could not access microphone.");
        }
    };

    const stopRecording = (cancel: boolean = false) => {
        if (!mediaRecorder || mediaRecorder.state === 'inactive') return;
        if (cancel) {
            mediaRecorder.onstop = () => {
                // Cancelled
            };
        }
        mediaRecorder.stop();
        setIsRecording(false);
        setMediaRecorder(null);
    };

    // 1. Fetch active chat partners (teachers if student, students if teacher)
    useEffect(() => {
        if (!isOpen || !userId || !role) return;

        setIsLoading(true);
        const fetchPartners = async () => {
            console.log("fetchPartners init - role:", role, "userId:", userId, "recipientId:", recipientId);
            try {
                // Completely bypass Supabase JS internal queues by using native fetch!
                const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '') || '';
                const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
                
                const sessionData = await Promise.race([
                    supabase.auth.getSession(),
                    new Promise<any>(r => setTimeout(() => r({ data: { session: null } }), 1500))
                ]);
                const token = sessionData?.data?.session?.access_token || supabaseKey;

                const rawFetch = rawFetchGlobal;

                let list: any[] = [];
                const mergedMap = new Map<string, any>();

                // 1. Fetch chatted user IDs from existing chat_messages
                const chattedUserIds = new Set<string>();
                try {
                    const chatHistory = await rawFetch('chat_messages', `or=(sender_id.eq.${userId},receiver_id.eq.${userId})&select=sender_id,receiver_id&order=created_at.desc&limit=100`);
                    if (chatHistory && Array.isArray(chatHistory)) {
                        chatHistory.forEach((m: any) => {
                            if (m.sender_id && m.sender_id !== userId) chattedUserIds.add(m.sender_id);
                            if (m.receiver_id && m.receiver_id !== userId) chattedUserIds.add(m.receiver_id);
                        });
                    }
                } catch (e) {
                    console.warn("Failed to fetch chat history user IDs:", e);
                }

                const targetPartnerIds = new Set<string>(chattedUserIds);
                if (recipientId) targetPartnerIds.add(recipientId);

                if (role === 'student') {
                    // Fetch teachers from links & bookings
                    const linkData = await rawFetch('teacher_student_links', `student_id=eq.${userId}&status=eq.accepted&select=teacher_id`).catch(() => []);
                    const bookingData = await rawFetch('bookings', `student_id=eq.${userId}&select=teacher_id`).catch(() => []);
                    if (linkData) linkData.forEach((l: any) => l.teacher_id && targetPartnerIds.add(l.teacher_id));
                    if (bookingData) bookingData.forEach((b: any) => b.teacher_id && targetPartnerIds.add(b.teacher_id));

                    // Fetch linked parents
                    const parentLinks = await rawFetch('parent_student_links', `student_id=eq.${userId}&select=parent_id`).catch(() => []);
                    if (parentLinks) parentLinks.forEach((p: any) => p.parent_id && targetPartnerIds.add(p.parent_id));

                } else if (role === 'teacher') {
                    // Fetch students from links & bookings
                    const studentIds = new Set<string>();
                    const linkData = await rawFetch('teacher_student_links', `teacher_id=eq.${userId}&status=eq.accepted&select=student_id`).catch(() => []);
                    const bookingData = await rawFetch('bookings', `teacher_id=eq.${userId}&select=student_id`).catch(() => []);
                    if (linkData) linkData.forEach((l: any) => l.student_id && (studentIds.add(l.student_id), targetPartnerIds.add(l.student_id)));
                    if (bookingData) bookingData.forEach((b: any) => b.student_id && (studentIds.add(b.student_id), targetPartnerIds.add(b.student_id)));

                    // Fetch parents of those students
                    if (studentIds.size > 0) {
                        const studentIdsStr = `(${Array.from(studentIds).join(',')})`;
                        const parentLinks = await rawFetch('parent_student_links', `student_id=in.${studentIdsStr}&select=parent_id`).catch(() => []);
                        if (parentLinks) parentLinks.forEach((p: any) => p.parent_id && targetPartnerIds.add(p.parent_id));
                    }

                } else if (role === 'parent') {
                    // Fetch linked children
                    const linkData = await rawFetch('parent_student_links', `parent_id=eq.${userId}&select=student_id`).catch(() => []);
                    const studentIds = linkData ? linkData.map((l: any) => l.student_id).filter(Boolean) : [];
                    studentIds.forEach(id => targetPartnerIds.add(id));

                    // Fetch teachers of those children
                    if (studentIds.length > 0) {
                        const studentIdsStr = `(${studentIds.join(',')})`;
                        const bookingData = await rawFetch('bookings', `student_id=in.${studentIdsStr}&select=teacher_id`).catch(() => []);
                        if (bookingData) bookingData.forEach((b: any) => b.teacher_id && targetPartnerIds.add(b.teacher_id));
                    }
                }

                // Fetch profiles for all collected partner IDs
                if (targetPartnerIds.size > 0) {
                    const idsStr = `(${Array.from(targetPartnerIds).join(',')})`;
                    const profilesData = await rawFetch('profiles', `id=in.${idsStr}&select=id,full_name,avatar_url,country,subjects,is_online,last_active_at,role,bio,cv_url,teacher_profiles(rating)`).catch(e => { console.error(e); return []; });
                    if (profilesData && Array.isArray(profilesData)) {
                        profilesData.forEach((p: any) => {
                            if (p.id !== userId) mergedMap.set(p.id, p);
                        });
                    }
                }

                list = Array.from(mergedMap.values());

                // Flatten teacher_profiles details into main profile object for teachers
                list = list.map(p => {
                    if (p.teacher_profiles && p.teacher_profiles.length > 0) {
                        return {
                            ...p,
                            rating: p.teacher_profiles[0].rating
                        };
                    }
                    return p;
                });

                setIsFallbackMode(false); // Backend strictness: Never show random fallback profiles!

                if (recipientId && !list.some(p => p.id === recipientId)) {
                    const recipientProfile = await rawFetch('profiles', `id=eq.${recipientId}&select=id,full_name,avatar_url,country,subjects,is_online,last_active_at`).then(d => d[0]).catch(() => null);
                    if (recipientProfile) list = [recipientProfile, ...list];
                }

                console.log("Final compiled partners list length:", list.length);
                setPartners(list);

                if (recipientId && list.some(p => p.id === recipientId)) {
                    setSelectedPartnerId(recipientId);
                    console.log("Selected partner set to recipientId:", recipientId);
                } else if (list.length > 0) {
                    setSelectedPartnerId(list[0].id);
                    console.log("Selected partner auto-set to first in list:", list[0].id);
                } else {
                    console.warn("List is empty! Partner cannot be auto-selected.");
                }
            } catch (err) {
                console.error("CRITICAL ERROR loading chat partners:", err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchPartners();
    }, [isOpen, userId, role, recipientId]);

    // Handle preselected partner changes from props dynamically
    useEffect(() => {
        if (recipientId) {
            setSelectedPartnerId(recipientId);
        }
    }, [recipientId]);

    // Update selectedPartner object when selectedPartnerId changes
    useEffect(() => {
        const found = partners.find(p => p.id === selectedPartnerId);
        setSelectedPartner(found || null);
    }, [selectedPartnerId, partners]);

    // 2. Fetch messages between current user and selected partner
    useEffect(() => {
        if (!userId || !selectedPartnerId) {
            setMessages([]);
            setShowProfileModal(false);
            return;
        }

        const fetchMessages = async () => {
            setLoadingMessages(true);
            try {
                const data = await rawFetchGlobal('chat_messages', `or=(and(sender_id.eq.${userId},receiver_id.eq.${selectedPartnerId}),and(sender_id.eq.${selectedPartnerId},receiver_id.eq.${userId}))&order=created_at.asc&limit=150`);
                setMessages(data || []);
            } catch (err) {
                console.error("Error loading chat messages:", err);
            } finally {
                setLoadingMessages(false);
            }
        };

        fetchMessages();

        // 3. Set up real-time subscription for messages (including UPDATE/DELETE)
        const channel = supabase
            .channel(`chat_thread_${selectedPartnerId}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'chat_messages'
            }, (payload) => {
                if (payload.eventType === 'INSERT') {
                    const newMsg = payload.new;
                    if ((newMsg.sender_id === userId && newMsg.receiver_id === selectedPartnerId) ||
                        (newMsg.sender_id === selectedPartnerId && newMsg.receiver_id === userId)) {
                        setMessages(prev => {
                            if (prev.some(m => m.id === newMsg.id)) return prev;
                            return [...prev, newMsg];
                        });
                    }
                } else if (payload.eventType === 'UPDATE') {
                    const updatedMsg = payload.new;
                    setMessages(prev => prev.map(m => m.id === updatedMsg.id ? updatedMsg : m));
                } else if (payload.eventType === 'DELETE') {
                    const deletedMsg = payload.old;
                    setMessages(prev => prev.filter(m => m.id !== deletedMsg.id));
                }
            })
            .subscribe();

        // Subscribe to presence/online updates of profiles
        const presenceChannel = supabase
            .channel('chat-presence-updates')
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'profiles',
                filter: `id=eq.${selectedPartnerId}`
            }, (payload) => {
                const updatedProfile = payload.new;
                setPartners(prev => prev.map(p => p.id === updatedProfile.id ? { ...p, is_online: updatedProfile.is_online, last_active_at: updatedProfile.last_active_at } : p));
            })
            .subscribe();

        // Subscribe to typing presence
        const roomName = [userId, selectedPartnerId].sort().join('-');
        const typingChannel = supabase.channel(`typing_${roomName}`, {
            config: { presence: { key: userId } }
        });

        typingChannel.on('presence', { event: 'sync' }, () => {
            const state = typingChannel.presenceState();
            const partnerState = state[selectedPartnerId];
            if (partnerState && (partnerState[0] as any)?.isTyping) {
                setTypingStatus('typing...');
            } else {
                setTypingStatus(null);
            }
        }).subscribe();
        
        typingChannelRef.current = typingChannel;

        // Fetch unread counts globally
        const fetchUnread = async () => {
            try {
                const data = await rawFetchGlobal('chat_messages', `receiver_id=eq.${userId}&is_read=eq.false&select=sender_id`);
                if (data) {
                    const counts = data.reduce((acc: any, msg: any) => {
                        acc[msg.sender_id] = (acc[msg.sender_id] || 0) + 1;
                        return acc;
                    }, {});
                    setUnreadCounts(counts);
                }
            } catch (err) {
                console.error(err);
            }
        };
        fetchUnread();

        // Subscribe to global unread incoming
        const unreadChannel = supabase.channel('global-unread-teacher-modal')
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'chat_messages',
                filter: `receiver_id=eq.${userId}`
            }, (payload) => {
                const newMsg = payload.new;
                if (newMsg.sender_id !== selectedPartnerId) {
                    setUnreadCounts(prev => ({
                        ...prev,
                        [newMsg.sender_id]: (prev[newMsg.sender_id] || 0) + 1
                    }));
                }
            })
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'chat_messages',
                filter: `receiver_id=eq.${userId}`
            }, (payload) => {
                const msg = payload.new;
                if (msg.is_read) {
                    setUnreadCounts(prev => ({
                        ...prev,
                        [msg.sender_id]: Math.max(0, (prev[msg.sender_id] || 0) - 1)
                    }));
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
            supabase.removeChannel(presenceChannel);
            supabase.removeChannel(typingChannel);
            supabase.removeChannel(unreadChannel);
        };
    }, [userId, selectedPartnerId]);

    // Mark incoming messages as read when active
    useEffect(() => {
        if (!userId || !selectedPartnerId || !isOpen || messages.length === 0) return;

        const markAsRead = async () => {
            const unread = messages.filter(m => m.sender_id === selectedPartnerId && !m.is_read);
            if (unread.length > 0) {
                await rawFetchGlobal('chat_messages', `sender_id=eq.${selectedPartnerId}&receiver_id=eq.${userId}&is_read=eq.false`, 'PATCH', { is_read: true }).catch(console.error);
                setMessages(prev => prev.map(m => m.sender_id === selectedPartnerId ? { ...m, is_read: true } : m));
                setUnreadCounts(prev => ({ ...prev, [selectedPartnerId]: 0 }));
                onMessagesRead?.();
            }
        };
        markAsRead();
    }, [userId, selectedPartnerId, isOpen, messages.length]);

    // Fetch and subscribe to live class statuses for meeting links in messages
    useEffect(() => {
        if (messages.length === 0) return;

        const roomIds = new Set<string>();
        const meetingRegex = /\/meeting\/([a-zA-Z0-9_-]+)/g;

        messages.forEach(m => {
            if (m.message) {
                let match;
                while ((match = meetingRegex.exec(m.message)) !== null) {
                    if (match[1]) roomIds.add(match[1]);
                }
            }
        });

        if (roomIds.size === 0) return;

        const fetchStatuses = async () => {
            try {
                const data = await rawFetchGlobal('live_classes', `room_id=in.(${Array.from(roomIds).join(',')})`);
                if (data && Array.isArray(data)) {
                    const mapping: Record<string, any> = {};
                    data.forEach((lc: any) => {
                        mapping[lc.room_id] = lc;
                    });
                    setLiveClassStatuses(prev => ({ ...prev, ...mapping }));
                }
            } catch (err) {
                console.error("Error fetching live class statuses:", err);
            }
        };

        fetchStatuses();

        const lcChannel = supabase.channel('live-classes-chat-status')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'live_classes'
            }, (payload) => {
                if (payload.new && (payload.new as any).room_id) {
                    setLiveClassStatuses(prev => ({
                        ...prev,
                        [(payload.new as any).room_id]: payload.new
                    }));
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(lcChannel);
        };
    }, [messages]);

    const automatedMessageSentRef = useRef<Record<string, boolean>>({});

    useEffect(() => {
        if (!isOpen || role !== 'parent' || !userId || !selectedPartnerId || !selectedPartner) return;
        // Automated intro messages are strictly for teachers, NOT for children/students at home
        if (selectedPartner.role !== 'teacher') return;
        if (loadingMessages || messages.length > 0) return;
        if (automatedMessageSentRef.current[selectedPartnerId]) return;
        
        const storageKey = `has_sent_intro_${userId}_${selectedPartnerId}`;
        if (localStorage.getItem(storageKey)) {
            automatedMessageSentRef.current[selectedPartnerId] = true;
            return;
        }

        const sendAutomatedIntro = async () => {
            automatedMessageSentRef.current[selectedPartnerId] = true;
            try {
                // Fetch children names
                const linkData = await rawFetchGlobal('parent_student_links', `parent_id=eq.${userId}&select=student:profiles!parent_student_links_student_id_fkey(full_name)`);
                let childrenNames = '';
                if (linkData && linkData.length > 0) {
                    childrenNames = linkData.map((d: any) => d.student.full_name).join(' and ');
                }

                // Fetch parent gender
                const profileData = await rawFetchGlobal('profiles', `id=eq.${userId}&select=gender`);
                let parentGender = profileData?.[0]?.gender?.toLowerCase();
                let parentRelation = 'parent';
                if (parentGender === 'male') {
                    parentRelation = 'father';
                } else if (parentGender === 'female') {
                    parentRelation = 'mother';
                }

                // We want the parent's actual name, not a constructed string
                // The user object's name was overridden elsewhere, so let's fetch the actual full_name from profiles
                let parentName = user?.name || 'a parent';
                if (profileData?.[0]) {
                   const nameData = await rawFetchGlobal('profiles', `id=eq.${userId}&select=full_name`);
                   if (nameData?.[0]?.full_name) {
                       parentName = nameData[0].full_name;
                   }
                }

                const introText = `Hi, my name is ${parentName}. I am the ${parentRelation} of ${childrenNames}. I'm reaching out to introduce myself, to know the progress of my child.`;
                
                await handleSendRichMessage(introText);
                localStorage.setItem(storageKey, 'true');
            } catch (err) {
                console.error("Failed to send automated intro:", err);
            }
        };

        sendAutomatedIntro();
    }, [isOpen, role, userId, selectedPartnerId, selectedPartner, messages.length, loadingMessages, user]);

    // Scroll to bottom on new messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    
    const handleAudioComplete = (blob) => {
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = async () => {
            const base64Data = reader.result;
            await handleSendRichMessage(null, 'audio', base64Data);
        };
    };

    const handleSendRichMessage = async (text: string | null, attachmentType?: 'image' | 'audio' | 'file', attachmentUrl?: string) => {
        if (!userId || !selectedPartnerId) return;

        try {
            const body = {
                    sender_id: userId,
                    receiver_id: selectedPartnerId,
                    message: text || '',
                    attachment_type: attachmentType || null,
                    attachment_url: attachmentUrl || null
                };
            const dataList = await rawFetchGlobal('chat_messages', '', 'POST', body);
            const data = dataList[0];
            
            setMessages(prev => {
                if (prev.find(m => m.id === data.id)) return prev;
                return [...prev, data];
            });
        } catch (err) {
            console.error("Failed to send rich message:", err);
            alert("Failed to send message.");
        }
    };

    const handleTyping = (e: React.ChangeEvent<HTMLInputElement>) => {
        setNewMessageText(e.target.value);
        if (typingChannelRef.current) {
            typingChannelRef.current.track({ isTyping: true });
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
            typingTimeoutRef.current = setTimeout(() => {
                if (typingChannelRef.current) {
                    typingChannelRef.current.track({ isTyping: false });
                }
            }, 2000);
        }
    };

    // 4. Send/Edit Message function
    const handleSendMessage = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!newMessageText.trim() || !userId || !selectedPartnerId) return;

        const textToSend = newMessageText.trim();
        setNewMessageText(''); // Clear input immediately for responsive UX
        if (typingChannelRef.current) {
            typingChannelRef.current.track({ isTyping: false });
        }

        try {
            if (editingMessage) {
                await rawFetchGlobal('chat_messages', `id=eq.${editingMessage.id}`, 'PATCH', { message: textToSend, is_edited: true });
                setEditingMessage(null);
            } else {
                await handleSendRichMessage(textToSend);
            }
        } catch (err) {
            console.error("Failed to send/edit message:", err);
            alert("Failed to send message.");
        }
    };

    const handleDeleteMessage = async (msgId: string) => {
        try {
            await rawFetchGlobal('chat_messages', `id=eq.${msgId}`, 'DELETE');
            // Update UI state immediately
            setMessages(prev => prev.filter(msg => msg.id !== msgId));
        } catch (err) {
            console.error("Error deleting message:", err);
            alert("Failed to delete message. You may not have permission.");
        }
    };

    const handleDeleteForMe = (msgId: string) => {
        if (!userId) return;
        setDeletedForMeIds(prev => {
            const next = new Set(prev);
            next.add(msgId);
            try {
                localStorage.setItem(`deleted_messages_${userId}`, JSON.stringify(Array.from(next)));
            } catch {}
            return next;
        });
    };

    const handlePhotoSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onloadend = async () => {
            const base64Data = reader.result as string;
            await handleSendRichMessage(null, 'image', base64Data);
        };
        reader.readAsDataURL(file);
    };

    const handleDocumentSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onloadend = async () => {
            const base64Data = reader.result as string;
            await handleSendRichMessage(file.name, 'file', base64Data);
        };
        reader.readAsDataURL(file);
    };

    const groupMessagesByDate = (msgList: any[]) => {
        const groups: { [key: string]: any[] } = {};
        msgList.forEach(msg => {
            const date = new Date(msg.created_at);
            const today = new Date();
            const yesterday = new Date();
            yesterday.setDate(today.getDate() - 1);
            
            let dateStr = '';
            if (date.toDateString() === today.toDateString()) {
                dateStr = 'Today';
            } else if (date.toDateString() === yesterday.toDateString()) {
                dateStr = 'Yesterday';
            } else {
                dateStr = date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
            }
            
            if (!groups[dateStr]) {
                groups[dateStr] = [];
            }
            groups[dateStr].push(msg);
        });
        return groups;
    };

    const formatMessageTime = (dateStr: string) => {
        try {
            const date = new Date(dateStr);
            return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: true });
        } catch (e) {
            return '';
        }
    };

    const [showEmojiBar, setShowEmojiBar] = useState(false);

    const addEmoji = (emoji: string) => {
        setNewMessageText(prev => prev + emoji);
    };

    const visibleMessages = messages.filter(m => !deletedForMeIds.has(m.id));
    const groupedMessages = groupMessagesByDate(visibleMessages);

    const renderMessageText = (text: string) => {
        const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
        const parts = [];
        let lastIndex = 0;
        let match;
        while ((match = linkRegex.exec(text)) !== null) {
            if (match.index > lastIndex) {
                parts.push(text.substring(lastIndex, match.index));
            }
            const label = match[1];
            const url = match[2];

            const meetingMatch = url.match(/\/meeting\/([a-zA-Z0-9_-]+)/);
            let isEnded = false;

            if (meetingMatch && meetingMatch[1]) {
                const roomId = meetingMatch[1];
                const lc = liveClassStatuses[roomId];
                if (lc) {
                    const status = lc.status?.toLowerCase();
                    if (status === 'completed' || status === 'ended' || status === 'cancelled') {
                        isEnded = true;
                    } else if (status === 'scheduled' && lc.scheduled_at) {
                        const scheduledTime = new Date(lc.scheduled_at).getTime();
                        const durationMs = (lc.duration_minutes || 60) * 60 * 1000;
                        // Only mark as ended if past scheduled time + duration + 24 hour grace period
                        if (Date.now() > scheduledTime + durationMs + 24 * 60 * 60 * 1000) {
                            isEnded = true;
                        }
                    }
                }
            }

            if (isEnded) {
                parts.push(
                    <span 
                        key={match.index} 
                        className="inline-flex items-center gap-1 font-bold text-gray-400 dark:text-zinc-500 bg-gray-200/60 dark:bg-zinc-800/60 px-2 py-0.5 rounded text-xs leading-none cursor-not-allowed select-none my-0.5" 
                        title="This class session has ended"
                    >
                        <span className="material-symbols-outlined text-[14px]">event_busy</span>
                        {label} (Ended)
                    </span>
                );
            } else {
                parts.push(
                    <a key={match.index} href={url} className="inline-flex items-center font-extrabold underline decoration-2 underline-offset-2 hover:opacity-80 transition-opacity">
                        {label}
                    </a>
                );
            }
            lastIndex = match.index + match[0].length;
        }
        if (lastIndex < text.length) {
            parts.push(text.substring(lastIndex));
        }
        return parts;
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="!max-w-full !w-screen !h-screen !m-0 !p-0 bg-white dark:bg-zinc-900 text-gray-900 dark:text-white border-0 overflow-hidden rounded-none flex flex-col shadow-none [&>button.absolute]:hidden">
                <DialogTitle className="sr-only">Messages</DialogTitle>
                <DialogDescription className="sr-only">Real-time messenger conversation thread.</DialogDescription>

                <div className="flex-1 flex overflow-hidden">
                    {/* Left Sidebar: Conversations list */}
                    <div className={cn(
                        "w-full md:w-80 border-r border-gray-100 dark:border-zinc-800 flex flex-col bg-gray-50/50 dark:bg-zinc-950/20 shrink-0",
                        selectedPartnerId ? "hidden md:flex" : "flex"
                    )}>
                        <div className="p-5 border-b border-gray-100 dark:border-zinc-800 shrink-0">
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Conversations</h2>
                            {isFallbackMode && (
                                <p className="text-[10px] text-orange-500 dark:text-orange-400 font-semibold mt-1.5 bg-orange-500/10 p-2 rounded-xl border border-orange-500/20 leading-relaxed">
                                    ⚠️ No active connections or bookings found in database. Showing registered profiles of the opposite role.
                                </p>
                            )}
                        </div>
                        <div className="flex-1 overflow-y-auto p-3 space-y-1.5 no-scrollbar">
                            {isLoading ? (
                                <div className="flex flex-col items-center justify-center py-12 gap-3 text-gray-400">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-400"></div>
                                    <span className="text-xs font-semibold">Connecting to database...</span>
                                </div>
                            ) : partners.length > 0 ? (
                                partners.map(p => {
                                    const isSelected = p.id === selectedPartnerId;
                                    return (
                                        <button
                                            key={p.id}
                                            onClick={() => setSelectedPartnerId(p.id)}
                                            className={cn(
                                                "w-full flex items-center gap-3 p-3 rounded-2xl transition-all text-left",
                                                isSelected 
                                                    ? role === 'teacher'
                                                        ? "bg-[#FF7D46]/10 text-[#FF7D46] dark:text-orange-400 font-bold"
                                                        : "bg-[#5B4A9F]/10 text-[#5B4A9F] dark:text-purple-400 font-bold"
                                                    : "hover:bg-gray-100/50 dark:hover:bg-zinc-800/30 text-gray-700 dark:text-gray-300"
                                            )}
                                        >
                                            <div className="relative">
                                                <Avatar className="h-10 w-10 border border-gray-200 dark:border-zinc-800">
                                                    <AvatarImage src={p.avatar_url || `https://i.pravatar.cc/150?u=${p.id}`} />
                                                    <AvatarFallback>{p.full_name?.[0]}</AvatarFallback>
                                                </Avatar>
                                                <div className={cn(
                                                    "absolute bottom-0 right-0 w-2.5 h-2.5 border-2 border-white dark:border-zinc-900 rounded-full",
                                                    p.is_online ? "bg-green-500" : "bg-gray-300"
                                                )} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between">
                                                    <p className="text-sm truncate font-bold">{p.full_name}</p>
                                                    {unreadCounts[p.id] > 0 && (
                                                        <div className="bg-[#5B4A9F] dark:bg-purple-500 text-white text-[10px] font-bold px-1.5 py-0 rounded-full">
                                                            {unreadCounts[p.id]}
                                                        </div>
                                                    )}
                                                </div>
                                                <p className="text-xs text-gray-400 truncate mt-0.5">
                                                    {p.role === 'teacher' ? (p.subjects?.join(', ') || 'Teacher') : (p.role ? p.role.charAt(0).toUpperCase() + p.role.slice(1) : (p.country || 'User'))}
                                                </p>
                                            </div>
                                        </button>
                                    );
                                })
                            ) : (
                                <div className="text-center py-8 text-gray-400 text-xs font-semibold">
                                    No active teachers/students found.
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right Panel: Active Chat Thread */}
                    <div className={cn(
                        "flex-1 flex flex-col overflow-hidden bg-white dark:bg-zinc-900 relative",
                        selectedPartnerId ? "flex" : "hidden md:flex"
                    )}>
                        {selectedPartner ? (
                            <>
                                {/* Chat Header */}
                                <div className="px-6 py-4 border-b border-gray-100 dark:border-zinc-800 flex items-center justify-between shrink-0 relative z-10 bg-white dark:bg-zinc-900">
                                    <div className="flex items-center gap-3">
                                        {/* Back Button for mobile */}
                                        <button 
                                            onClick={() => setSelectedPartnerId('')}
                                            className="md:hidden p-1.5 hover:bg-gray-100 dark:hover:bg-zinc-850 rounded-full text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors mr-1 shrink-0"
                                            title="Back to conversations"
                                        >
                                            <ChevronLeft className="h-5 w-5" />
                                        </button>
                                        <div 
                                            className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
                                            onClick={() => setShowProfileModal(true)}
                                            role="button"
                                            tabIndex={0}
                                        >
                                            <div className="relative">
                                                <Avatar className="h-10 w-10 border border-gray-200 dark:border-zinc-850">
                                                    <AvatarImage src={selectedPartner.avatar_url || `https://i.pravatar.cc/150?u=${selectedPartner.id}`} />
                                                    <AvatarFallback>{selectedPartner.full_name?.[0]}</AvatarFallback>
                                                </Avatar>
                                                <div className={cn(
                                                    "absolute bottom-0 right-0 w-2.5 h-2.5 border-2 border-white dark:border-zinc-900 rounded-full",
                                                    selectedPartner.is_online ? "bg-green-500" : "bg-gray-300"
                                                )} />
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-sm text-gray-900 dark:text-white leading-tight hover:underline">{selectedPartner.full_name}</h3>
                                                <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 max-w-[200px] sm:max-w-xs truncate">
                                                    {selectedPartner.country ? `${selectedPartner.country} • ` : ''} 
                                                    {selectedPartner.bio || (selectedPartner.is_online ? "Active now" : "Offline")}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <button
                                        onClick={onClose}
                                        className="h-9 w-9 rounded-full flex items-center justify-center bg-gray-50 dark:bg-zinc-800 hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors"
                                    >
                                        <span className="material-symbols-outlined text-gray-500 text-lg">close</span>
                                    </button>
                                </div>

                                {/* Profile Overlay Modal */}
                                {showProfileModal && (
                                    <div className="absolute inset-0 z-20 bg-white dark:bg-zinc-900 flex flex-col overflow-hidden animate-in slide-in-from-right-4 duration-300">
                                        <div className="px-6 py-4 border-b border-gray-100 dark:border-zinc-800 flex items-center justify-between shrink-0">
                                            <div className="flex items-center gap-3">
                                                <button 
                                                    onClick={() => setShowProfileModal(false)}
                                                    className="p-1.5 hover:bg-gray-100 dark:hover:bg-zinc-850 rounded-full text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors"
                                                >
                                                    <ChevronLeft className="h-5 w-5" />
                                                </button>
                                                <h2 className="font-bold text-lg text-gray-900 dark:text-white">Profile Details</h2>
                                            </div>
                                        </div>
                                        <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center text-center">
                                            <Avatar className="h-32 w-32 border-4 border-gray-50 dark:border-zinc-800 mb-4 shadow-lg">
                                                <AvatarImage src={selectedPartner.avatar_url || `https://i.pravatar.cc/150?u=${selectedPartner.id}`} />
                                                <AvatarFallback className="text-4xl">{selectedPartner.full_name?.[0]}</AvatarFallback>
                                            </Avatar>
                                            <h2 className="text-2xl font-black text-gray-900 dark:text-white mb-1">{selectedPartner.full_name}</h2>
                                            <p className="text-sm font-medium text-purple-600 dark:text-purple-400 mb-4">
                                                {selectedPartner.country || 'Global'}
                                            </p>
                                            
                                            {selectedPartner.bio && (
                                                <div className="bg-gray-50 dark:bg-zinc-800/50 p-4 rounded-2xl w-full max-w-md mb-6 border border-gray-100 dark:border-zinc-700/50">
                                                    <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed italic">
                                                        "{selectedPartner.bio}"
                                                    </p>
                                                </div>
                                            )}

                                            <div className="grid grid-cols-2 gap-4 w-full max-w-md mb-6">
                                                <div className="bg-gray-50 dark:bg-zinc-800 p-4 rounded-2xl border border-gray-100 dark:border-zinc-700 flex flex-col items-center">
                                                    <span className="material-symbols-outlined text-orange-500 text-2xl mb-1">star</span>
                                                    <span className="text-sm font-bold text-gray-900 dark:text-white">{Number(selectedPartner.rating || 5.0).toFixed(1)} / 5.0</span>
                                                    <span className="text-xs text-gray-500 dark:text-gray-400">Rating</span>
                                                </div>
                                                <div className="bg-gray-50 dark:bg-zinc-800 p-4 rounded-2xl border border-gray-100 dark:border-zinc-700 flex flex-col items-center">
                                                    <span className="material-symbols-outlined text-purple-500 text-2xl mb-1">menu_book</span>
                                                    <span className="text-sm font-bold text-gray-900 dark:text-white truncate w-full px-2">{selectedPartner.subjects?.join(', ') || 'General'}</span>
                                                    <span className="text-xs text-gray-500 dark:text-gray-400">Subjects</span>
                                                </div>
                                            </div>

                                            {role === 'parent' && selectedPartner.cv_url && (
                                                <a 
                                                    href={selectedPartner.cv_url} 
                                                    download={`CV_${selectedPartner.full_name.replace(/\s+/g, '_')}`}
                                                    className="w-full max-w-md px-6 py-4 bg-[#5B4A9F] text-white rounded-xl text-sm font-bold hover:bg-[#4a3b82] transition-colors shadow-lg flex items-center justify-center gap-2"
                                                >
                                                    <FileText className="w-5 h-5" />
                                                    Download Resume / CV
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Messages History List */}
                                <div className="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar bg-slate-50/30 dark:bg-zinc-950/10">
                                    {loadingMessages ? (
                                        <div className="h-full flex items-center justify-center">
                                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600"></div>
                                        </div>
                                    ) : messages.length > 0 ? (
                                        Object.keys(groupedMessages).map((dateKey) => (
                                            <div key={dateKey} className="space-y-3">
                                                {/* Date Header Divider */}
                                                <div className="flex justify-center">
                                                    <span className="px-3 py-1 rounded-full bg-gray-100 dark:bg-zinc-800 text-[10px] font-bold text-gray-500 dark:text-zinc-400 uppercase tracking-wider">
                                                        {dateKey}
                                                    </span>
                                                </div>

                                                {/* Message Bubbles */}
                                                {groupedMessages[dateKey].map((msg) => {
                                                    const isMe = msg.sender_id === userId;
                                                    return (
                                                        <div
                                                            key={msg.id}
                                                            className={cn(
                                                                "flex w-full mb-1",
                                                                isMe ? "justify-end" : "justify-start"
                                                            )}
                                                        >
                                                                <div className="relative group flex items-center" tabIndex={0}>
                                                                    {/* Edit/Delete hover triggers */}
                                                                    {isMe ? (
                                                                        <div className="absolute left-[-60px] top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 group-focus:opacity-100 focus-within:opacity-100 flex items-center gap-1 bg-white dark:bg-zinc-800 shadow-lg border border-gray-100 dark:border-zinc-700 p-1.5 rounded-xl z-20 transition-opacity duration-200">
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => {
                                                                                    setEditingMessage(msg);
                                                                                    setNewMessageText(msg.message);
                                                                                }}
                                                                                title="Edit message"
                                                                                className="text-gray-400 hover:text-blue-500 hover:bg-gray-50 dark:hover:bg-zinc-700 p-1 rounded-lg transition-all"
                                                                            >
                                                                                <Edit2 className="h-3 w-3" />
                                                                            </button>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => setDeleteModalMsg(msg)}
                                                                                title="Delete message"
                                                                                className="text-gray-400 hover:text-red-500 hover:bg-gray-50 dark:hover:bg-zinc-700 p-1 rounded-lg transition-all"
                                                                            >
                                                                                <Trash2 className="h-3 w-3" />
                                                                            </button>
                                                                        </div>
                                                                    ) : (
                                                                        <div className="absolute right-[-36px] top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 group-focus:opacity-100 focus-within:opacity-100 flex items-center gap-1 bg-white dark:bg-zinc-800 shadow-lg border border-gray-100 dark:border-zinc-700 p-1.5 rounded-xl z-20 transition-opacity duration-200">
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => setDeleteModalMsg(msg)}
                                                                                title="Delete message"
                                                                                className="text-gray-400 hover:text-red-500 hover:bg-gray-50 dark:hover:bg-zinc-700 p-1 rounded-lg transition-all"
                                                                            >
                                                                                <Trash2 className="h-3 w-3" />
                                                                            </button>
                                                                        </div>
                                                                    )}

                                                                    <div
                                                                        className={cn(
                                                                            "rounded-2xl px-4 py-2.5 shadow-sm flex flex-col gap-1 relative",
                                                                            isMe 
                                                                                ? role === 'teacher'
                                                                                    ? "bg-[#FF7D46] text-white rounded-br-sm pr-16"
                                                                                    : role === 'parent'
                                                                                        ? "bg-emerald-500 text-white rounded-br-sm pr-16"
                                                                                        : "bg-[#5B4A9F] text-white rounded-br-sm pr-16"
                                                                                : "bg-gray-100 dark:bg-zinc-850 text-gray-900 dark:text-white rounded-bl-sm pr-16"
                                                                    )}
                                                                >
                                                                    {msg.attachment_type === 'image' && (
                                                                        <img 
                                                                            src={msg.attachment_url} 
                                                                            alt="Attachment" 
                                                                            className="max-w-[200px] rounded-lg mb-1 shadow-sm object-cover" 
                                                                        />
                                                                    )}
                                                                    {msg.attachment_type === 'audio' && (
                                                                        <AudioBubblePlayer src={msg.attachment_url} />
                                                                    )}
                                                                    {msg.attachment_type === 'file' && (
                                                                        <a 
                                                                            href={msg.attachment_url} 
                                                                            download={msg.message || 'Document'}
                                                                            className="flex items-center gap-2.5 p-3 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 transition-colors border border-black/5 dark:border-white/5 mb-1 text-left min-w-[200px]"
                                                                        >
                                                                            <div className="h-9 w-9 rounded-lg bg-blue-500/10 dark:bg-blue-400/10 flex items-center justify-center text-blue-500 dark:text-blue-400 shrink-0">
                                                                                <FileText className="h-5 w-5" />
                                                                            </div>
                                                                            <div className="overflow-hidden">
                                                                                <p className="text-xs font-bold truncate text-gray-900 dark:text-white leading-tight">
                                                                                    {msg.message || 'Document'}
                                                                                </p>
                                                                                <p className="text-[10px] text-gray-500 dark:text-zinc-400 mt-0.5 font-medium uppercase tracking-wider">
                                                                                    Click to download
                                                                                </p>
                                                                            </div>
                                                                        </a>
                                                                    )}
                                                                    {msg.message && msg.attachment_type !== 'file' && (
                                                                        <p className="text-sm font-medium leading-relaxed break-words whitespace-pre-wrap">
                                                                            {renderMessageText(msg.message)}
                                                                        </p>
                                                                    )}
                                                                    {msg.is_edited && (
                                                                        <span className="text-[8px] opacity-60 font-semibold block text-right mt-0.5">
                                                                            (edited)
                                                                        </span>
                                                                    )}
                                                                    <span className={cn(
                                                                        "text-[8px] absolute bottom-1 right-2 font-bold flex items-center gap-0.5",
                                                                        isMe ? "text-white/70" : "text-gray-450 dark:text-zinc-500"
                                                                    )}>
                                                                        {formatMessageTime(msg.created_at)}
                                                                        {isMe && (
                                                                            msg.is_read 
                                                                                ? <CheckCheck className="h-3 w-3 text-cyan-200 font-bold" title="Read" /> 
                                                                                : selectedPartner?.is_online 
                                                                                    ? <CheckCheck className="h-3 w-3 text-white/60" title="Delivered" /> 
                                                                                    : <Check className="h-3 w-3 text-white/40" title="Sent" />
                                                                        )}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ))
                                    ) : (
                                        <div className="h-full flex flex-col items-center justify-center text-center text-gray-450 gap-2">
                                            <span className="material-symbols-outlined text-4xl text-gray-300">chat</span>
                                            <p className="text-xs font-semibold">No messages yet. Say hello to get started!</p>
                                        </div>
                                    )}
                                    <div ref={messagesEndRef} />
                                </div>

                                {/* Full Emoji Picker */}
                                {showEmojiBar && (
                                    <div className="absolute bottom-[80px] left-4 z-50 shadow-2xl rounded-2xl overflow-hidden border border-gray-150 dark:border-zinc-800 bg-white dark:bg-zinc-950">
                                        <EmojiPicker 
                                            onEmojiClick={(emojiData) => addEmoji(emojiData.emoji)} 
                                            skinTonesDisabled
                                            width={320}
                                            height={380}
                                        />
                                    </div>
                                )}

                                {/* Editing Message Indicator */}
                                {editingMessage && (
                                    <div className="px-6 py-2 bg-blue-50/50 dark:bg-blue-950/20 border-t border-blue-100 dark:border-blue-900/40 flex items-center justify-between shrink-0 text-xs font-bold text-blue-600 dark:text-blue-400">
                                        <div className="flex items-center gap-1.5">
                                            <Edit2 className="h-3.5 w-3.5" />
                                            <span>Editing message...</span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setEditingMessage(null);
                                                setNewMessageText('');
                                            }}
                                            className="text-blue-500 hover:text-blue-700 dark:hover:text-blue-300"
                                        >
                                            <X className="h-4 w-4" />
                                        </button>
                                    </div>
                                )}

                                {/* Hidden file input for Photo Upload */}
                                <input 
                                    type="file" 
                                    accept="image/*" 
                                    ref={fileInputRef}
                                    onChange={handlePhotoSelected}
                                    className="hidden" 
                                />

                                {/* Hidden file input for Document Upload */}
                                <input 
                                    type="file" 
                                    accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt" 
                                    ref={documentInputRef}
                                    onChange={handleDocumentSelected}
                                    className="hidden" 
                                />

                                {/* Message Compose Form Input */}
                                <form onSubmit={handleSendMessage} className="p-2 sm:p-3 border-t border-gray-100 dark:border-zinc-800 flex items-end gap-2 shrink-0 bg-[#F0F2F5] dark:bg-zinc-900/90 relative">
                                    <div className="flex-1 bg-white dark:bg-zinc-800 rounded-[22px] min-h-[44px] flex items-end overflow-hidden shadow-sm">
                                            <button 
                                                type="button" 
                                                onClick={() => setShowEmojiBar(!showEmojiBar)}
                                                className="h-[44px] w-11 flex items-center justify-center text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors shrink-0"
                                            >
                                                <Smile className="h-6 w-6" />
                                            </button>
                                            
                                            <input
                                                type="text"
                                                value={newMessageText}
                                                onChange={handleTyping}
                                                placeholder="Message"
                                                className="flex-1 bg-transparent border-0 h-[44px] px-1 text-[15px] focus:ring-0 outline-none text-gray-900 dark:text-white placeholder-gray-500"
                                            />
                                            
                                            <button 
                                                type="button" 
                                                onClick={() => documentInputRef.current?.click()}
                                                className="h-[44px] w-10 flex items-center justify-center text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors shrink-0"
                                            >
                                                <Paperclip className="h-5 w-5 -rotate-45" />
                                            </button>
                                            
                                            <button 
                                                type="button" 
                                                onClick={() => fileInputRef.current?.click()}
                                                className="h-[44px] w-10 flex items-center justify-center text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors shrink-0 mr-1"
                                            >
                                                <Camera className="h-5 w-5" />
                                            </button>
                                        </div>

                                    {/* Mic / Send Button */}
                                    {!newMessageText.trim() && !editingMessage ? (
                                        <div className="flex items-center justify-center shrink-0">
                                            <AudioRecorder 
                                              onRecordingComplete={handleAudioComplete}
                                              audioTrackConstraints={{
                                                noiseSuppression: true,
                                                echoCancellation: true,
                                              }} 
                                              downloadOnSavePress={false}
                                              downloadFileExtension="webm"
                                            />
                                        </div>
                                    ) : (
                                        <button
                                            type="submit"
                                            disabled={!newMessageText.trim()}
                                            className={cn(
                                                "h-[44px] w-[44px] rounded-full flex items-center justify-center text-white transition-all shadow-sm shrink-0 disabled:opacity-50",
                                                role === 'teacher' ? "bg-[#FF7D46] hover:bg-[#e06530]" : "bg-[#5B4A9F] hover:bg-[#473980]"
                                            )}
                                        >
                                            <Send className="h-5 w-5 ml-0.5" />
                                        </button>
                                    )}
                                </form>
                            </>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-center text-gray-450 gap-3">
                                <span className="material-symbols-outlined text-5xl">forum</span>
                                <h3 className="font-bold text-base text-gray-800 dark:text-zinc-200">Select a Conversation</h3>
                                <p className="text-xs px-6 max-w-sm leading-relaxed">
                                    Choose an active teacher or student from the sidebar panel to begin chatting in real-time.
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </DialogContent>

            {/* Delete Message Options Modal */}
            {deleteModalMsg && (
                <Dialog open={true} onOpenChange={() => setDeleteModalMsg(null)}>
                    <DialogContent className="sm:max-w-[400px] rounded-3xl p-6 bg-white dark:bg-zinc-900 border-0 shadow-2xl z-[100]">
                        <div className="flex flex-col gap-4">
                            <div className="flex items-center gap-3 text-red-500">
                                <div className="p-3 bg-red-100 dark:bg-red-950/30 rounded-2xl">
                                    <Trash2 className="h-6 w-6" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-lg text-gray-900 dark:text-white">Delete Message</h3>
                                    <p className="text-xs text-gray-500 dark:text-zinc-400">Choose how you want to delete this message.</p>
                                </div>
                            </div>

                            <div className="flex flex-col gap-2 mt-2">
                                {deleteModalMsg.sender_id === userId && (
                                    <button
                                        onClick={async () => {
                                            const msgId = deleteModalMsg.id;
                                            setDeleteModalMsg(null);
                                            await handleDeleteMessage(msgId);
                                        }}
                                        className="w-full py-3 px-4 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold text-sm transition-colors shadow-sm flex items-center justify-center gap-2"
                                    >
                                        Delete for Everybody
                                    </button>
                                )}
                                <button
                                    onClick={() => {
                                        const msgId = deleteModalMsg.id;
                                        setDeleteModalMsg(null);
                                        handleDeleteForMe(msgId);
                                    }}
                                    className="w-full py-3 px-4 bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 text-gray-900 dark:text-white rounded-xl font-bold text-sm transition-colors flex items-center justify-center gap-2"
                                >
                                    Delete for Me Only
                                </button>
                                <button
                                    onClick={() => setDeleteModalMsg(null)}
                                    className="w-full py-2.5 px-4 text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white font-semibold text-xs transition-colors"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>
            )}
        </Dialog>
    );
};
