import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/lib/supabase';
import { LiveKitRoom, VideoConference } from '@livekit/components-react';
import '@livekit/components-styles';

interface JoinClassModalProps {
    isOpen: boolean;
    onClose: () => void;
    className: string;
    teacherName?: string;
}

type VirtualBackground = 'none' | 'blur' | 'library' | 'space' | 'office';

export const JoinClassModal = ({ isOpen, onClose, className, teacherName }: JoinClassModalProps) => {
    const [micEnabled, setMicEnabled] = useState(true);
    const [cameraEnabled, setCameraEnabled] = useState(true);
    const [selectedBackground, setSelectedBackground] = useState<VirtualBackground>('blur');
    const [cameraError, setCameraError] = useState<string | null>(null);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const streamRef = useRef<MediaStream | null>(null);

    // LiveKit States
    const [sessionStatus, setSessionStatus] = useState<'pre-live' | 'live'>('pre-live');
    const [livekitToken, setLivekitToken] = useState<string>('');
    const [livekitUrl, setLivekitUrl] = useState<string>(import.meta.env.VITE_LIVEKIT_URL || '');

    const setVideoRef = (node: HTMLVideoElement | null) => {
        videoRef.current = node;
        if (node && streamRef.current) {
            node.srcObject = streamRef.current;
        }
    };

    // Request camera access
    useEffect(() => {
        if (isOpen && cameraEnabled) {
            navigator.mediaDevices.getUserMedia({ video: true, audio: false })
                .then((stream) => {
                    streamRef.current = stream;
                    if (videoRef.current) {
                        videoRef.current.srcObject = stream;
                    }
                    setCameraError(null);
                })
                .catch((error) => {
                    console.warn('Camera access error:', error);
                    setCameraError('Camera access denied. Please enable camera permissions.');
                });
        }

        // Cleanup function
        return () => {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
                streamRef.current = null;
            }
        };
    }, [isOpen, cameraEnabled]);

    // Handle camera toggle
    const handleCameraToggle = () => {
        if (cameraEnabled && streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        setCameraEnabled(!cameraEnabled);
    };

    const handleJoinClass = async () => {
        setSessionStatus('live');
        
        // Stop preview camera so LiveKit can capture the device exclusively
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }

        // Try fetching LiveKit token for the class room
        if (livekitUrl) {
            try {
                // Find active room for this class / teacher in Supabase
                const { data: activeClasses, error: dbError } = await supabase
                    .from('live_classes')
                    .select('room_id')
                    .eq('status', 'active')
                    .order('created_at', { ascending: false })
                    .limit(1);

                if (dbError) throw dbError;
                
                const roomName = (activeClasses && activeClasses[0]) 
                    ? activeClasses[0].room_id 
                    : `class-join-sim-${Date.now()}`;

                // Fetch access token for student
                const { data, error } = await supabase.functions.invoke('livekit-token', {
                    body: { roomName, participantName: 'Student' }
                });

                if (error) throw error;
                if (data && data.token) {
                    setLivekitToken(data.token);
                }
            } catch (err) {
                console.warn('LiveKit joining token lookup failed, using local simulation:', err);
            }
        }
    };

    const handleLeaveLive = () => {
        setLivekitToken('');
        setSessionStatus('pre-live');
        onClose();
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent 
                className={sessionStatus === 'live'
                    ? "!max-w-none !w-screen !h-screen !max-h-none !rounded-none !m-0 !p-0 bg-student-bg-dark border-0 flex flex-col text-white transition-all duration-300"
                    : "!max-w-3xl mx-auto bg-student-bg-dark text-white border-0 p-0 overflow-hidden rounded-[2.5rem] max-h-[85vh] flex flex-col shadow-2xl transition-all duration-300"
                }
            >
                <DialogTitle className="sr-only">Join Class - {className}</DialogTitle>
                <DialogDescription className="sr-only">Perform a pre-class camera and mic check before entering the classroom.</DialogDescription>

                {sessionStatus === 'live' ? (
                    livekitToken ? (
                        <LiveKitRoom
                            video={cameraEnabled}
                            audio={micEnabled}
                            token={livekitToken}
                            serverUrl={livekitUrl}
                            connect={true}
                            onDisconnected={handleLeaveLive}
                            className="flex-1 w-full h-full bg-zinc-950 flex flex-col text-white relative"
                        >
                            <div className="flex-1 flex items-center justify-center p-4 bg-zinc-900 relative">
                                <VideoConference />
                                <button
                                    onClick={handleLeaveLive}
                                    className="absolute bottom-6 right-6 px-6 h-12 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-sm shadow-lg shadow-red-600/25 active:scale-95 z-50"
                                >
                                    Leave Room
                                </button>
                            </div>
                        </LiveKitRoom>
                    ) : (
                        <div className="flex-grow w-full h-full bg-zinc-950 flex flex-col text-white relative">
                            {/* Simulated Teacher Screen */}
                            <div className="flex-1 flex items-center justify-center bg-zinc-900 relative p-4">
                                <div className="text-center">
                                    <span className="material-symbols-outlined text-student-primary text-6xl mb-2 animate-bounce">school</span>
                                    <p className="text-lg font-bold text-zinc-300">Connected to {teacherName || 'Teacher'}</p>
                                    <p className="text-xs text-zinc-500 mt-1">Live classroom simulation active.</p>
                                </div>

                                {/* Picture in Picture Student Feed */}
                                {cameraEnabled && (
                                    <div className="absolute top-6 right-6 w-36 md:w-48 aspect-video rounded-2xl overflow-hidden border border-white/20 shadow-2xl bg-zinc-950 z-10">
                                        <video
                                            ref={setVideoRef}
                                            autoPlay
                                            playsInline
                                            muted
                                            className="w-full h-full object-cover"
                                        />
                                    </div>
                                )}
                            </div>

                            {/* Controls */}
                            <div className="bg-zinc-950/90 border-t border-white/5 p-4 flex items-center justify-between z-40 shrink-0">
                                <div className="flex items-center gap-3">
                                    <button 
                                        onClick={() => setMicEnabled(!micEnabled)}
                                        className={`size-12 rounded-xl flex items-center justify-center transition-all ${micEnabled ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-red-500/20 text-red-500 hover:bg-red-500/30'}`}
                                    >
                                        <span className="material-symbols-outlined">{micEnabled ? 'mic' : 'mic_off'}</span>
                                    </button>
                                    <button 
                                        onClick={handleCameraToggle}
                                        className={`size-12 rounded-xl flex items-center justify-center transition-all ${cameraEnabled ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-red-500/20 text-red-500 hover:bg-red-500/30'}`}
                                    >
                                        <span className="material-symbols-outlined">{cameraEnabled ? 'videocam' : 'videocam_off'}</span>
                                    </button>
                                </div>
                                <button 
                                    onClick={handleLeaveLive}
                                    className="px-6 h-12 rounded-xl bg-red-600 hover:bg-red-700 active:scale-95 text-white font-bold text-sm transition-all shadow-lg shadow-red-600/20"
                                >
                                    Leave Classroom
                                </button>
                            </div>
                        </div>
                    )
                ) : (
                    <>
                        {/* Header */}
                        <div className="flex items-center p-6 pb-2 justify-between z-10 shrink-0 border-b border-white/5 bg-student-bg-dark">
                            <button
                                onClick={onClose}
                                className="text-white flex size-10 shrink-0 items-center justify-center rounded-full active:bg-white/10 transition-colors"
                            >
                                <span className="material-symbols-outlined text-[24px]">close</span>
                            </button>
                            <h2 className="text-white text-xl font-extrabold leading-tight tracking-[-0.015em] text-center">
                                Pre-Class Check
                            </h2>
                            <button className="flex h-10 px-2 items-center justify-end rounded-full active:bg-white/10 transition-colors">
                                <p className="text-student-primary text-sm font-bold leading-normal tracking-[0.015em] shrink-0">
                                    Help
                                </p>
                            </button>
                        </div>

                        {/* Scrollable Main Content */}
                        <div className="flex-1 overflow-y-auto no-scrollbar p-6 pb-28">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                {/* Left Column: Webcam Preview */}
                                <div className="space-y-4">
                                    <div className="relative w-full aspect-video bg-student-surface-dark rounded-3xl overflow-hidden shadow-2xl border border-white/5 ring-1 ring-white/5 group">
                                    {/* Camera Feed */}
                                    {cameraEnabled ? (
                                        cameraError ? (
                                            <div className="w-full h-full flex items-center justify-center bg-zinc-800">
                                                <div className="text-center px-4">
                                                    <span className="material-symbols-outlined text-6xl text-red-500 mb-2">error</span>
                                                    <p className="text-gray-400 text-sm">{cameraError}</p>
                                                </div>
                                            </div>
                                        ) : (
                                            <video
                                                ref={setVideoRef}
                                                autoPlay
                                                playsInline
                                                muted
                                                className={`w-full h-full object-cover ${selectedBackground === 'blur' ? 'blur-sm' : ''}`}
                                            />
                                        )
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-zinc-900">
                                            <div className="text-center">
                                                <span className="material-symbols-outlined text-6xl text-gray-600 mb-2">videocam_off</span>
                                                <p className="text-gray-500 text-sm">Camera Off</p>
                                            </div>
                                        </div>
                                    )}

                                    {/* Overlay Gradient */}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20 pointer-events-none"></div>

                                    {/* Floating Controls Overlay */}
                                    <div className="absolute bottom-6 left-0 right-0 flex items-center justify-center gap-6 px-4 z-20">
                                        {/* Mic Toggle */}
                                        <div className="flex flex-col items-center gap-2">
                                            <button
                                                onClick={() => setMicEnabled(!micEnabled)}
                                                className={`flex shrink-0 items-center justify-center rounded-full size-12 shadow-lg transition-transform active:scale-95 ${micEnabled
                                                    ? 'bg-white text-student-bg-dark hover:bg-gray-200'
                                                    : 'bg-red-500 text-white hover:bg-red-600'
                                                    }`}
                                            >
                                                <span className="material-symbols-outlined text-[24px]">
                                                    {micEnabled ? 'mic' : 'mic_off'}
                                                </span>
                                            </button>
                                            <span className="text-[11px] font-medium text-white/90">
                                                {micEnabled ? 'Mic On' : 'Mic Off'}
                                            </span>
                                        </div>

                                        {/* Camera Toggle (Primary) */}
                                        <div className="flex flex-col items-center gap-2">
                                            <button
                                                onClick={handleCameraToggle}
                                                className={`flex shrink-0 items-center justify-center rounded-full size-16 shadow-[0_0_20px_rgba(143,129,214,0.4)] transition-transform active:scale-95 ${cameraEnabled
                                                        ? 'bg-student-primary text-student-bg-dark hover:brightness-110'
                                                        : 'bg-red-500 text-white hover:bg-red-600'
                                                    }`}
                                            >
                                                <span className="material-symbols-outlined text-[32px] font-variation-settings-fill">
                                                    {cameraEnabled ? 'videocam' : 'videocam_off'}
                                                </span>
                                            </button>
                                            <span className="text-[11px] font-medium text-white/90">
                                                {cameraEnabled ? 'Cam On' : 'Cam Off'}
                                            </span>
                                        </div>

                                        {/* Effects Toggle */}
                                        <div className="flex flex-col items-center gap-2">
                                            <button className="flex shrink-0 items-center justify-center rounded-full size-12 bg-student-surface-dark/80 backdrop-blur-md text-white border border-white/10 shadow-lg hover:bg-student-surface-dark transition-transform active:scale-95">
                                                <span className="material-symbols-outlined text-[24px]">auto_awesome</span>
                                            </button>
                                            <span className="text-[11px] font-medium text-white/90">Effects</span>
                                        </div>
                                    </div>

                                    {/* Connection Status Badge (Top Right) */}
                                    <div className="absolute top-4 right-4 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/40 backdrop-blur-md border border-white/10">
                                        <span className="material-symbols-outlined text-student-primary text-[16px]">wifi</span>
                                        <span className="text-xs font-medium text-white">Good</span>
                                    </div>
                                    </div>
                                </div>

                                {/* Right Column: Class Details & Hardware checks */}
                                <div className="space-y-6 text-left">
                                    {/* Class Info */}
                                    <div className="flex flex-col items-start px-1">
                                        <h1 className="text-white tracking-tight text-[24px] font-extrabold leading-tight mb-1">
                                            {className}
                                        </h1>
                                        <div className="flex items-center gap-2 text-student-primary/85 text-xs font-semibold">
                                            <span>{teacherName || 'Prof. Alan Grant'}</span>
                                            <span className="size-1 rounded-full bg-student-primary/50"></span>
                                            <span className="text-student-primary flex items-center gap-1">
                                                <span className="material-symbols-outlined text-[14px] fill-1">timer</span>
                                                Starts in 04:12
                                            </span>
                                        </div>
                                    </div>

                                    {/* Microphone & Output Dropdowns */}
                                    <div className="flex flex-col gap-3">
                                        <label className="text-xs font-extrabold text-white/50 uppercase tracking-wider pl-1">Devices</label>
                                        <div className="flex gap-3 overflow-x-auto no-scrollbar">
                                            <button className="flex items-center gap-2 px-4 py-3 bg-student-surface-dark rounded-xl border border-white/5 flex-shrink-0 active:bg-white/5 transition-colors">
                                                <span className="material-symbols-outlined text-student-primary text-[20px]">mic</span>
                                                <div className="flex flex-col items-start">
                                                    <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Microphone</span>
                                                    <span className="text-sm font-medium text-white truncate max-w-[105px]">MacBook Pro Mic</span>
                                                </div>
                                                <span className="material-symbols-outlined text-gray-500 text-[20px]">expand_more</span>
                                            </button>
                                            <button className="flex items-center gap-2 px-4 py-3 bg-student-surface-dark rounded-xl border border-white/5 flex-shrink-0 active:bg-white/5 transition-colors">
                                                <span className="material-symbols-outlined text-student-primary text-[20px]">headphones</span>
                                                <div className="flex flex-col items-start">
                                                    <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Output</span>
                                                    <span className="text-sm font-medium text-white truncate max-w-[105px]">AirPods Pro</span>
                                                </div>
                                                <span className="material-symbols-outlined text-gray-500 text-[20px]">expand_more</span>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Virtual Backgrounds */}
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between mb-1 px-1">
                                            <h3 className="text-white text-sm font-bold">Virtual Background</h3>
                                            <button className="text-student-primary text-xs font-semibold">View All</button>
                                        </div>
                                        <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
                                            {/* None Option */}
                                            <button
                                                onClick={() => setSelectedBackground('none')}
                                                className="flex flex-col gap-2 items-center group shrink-0"
                                            >
                                                <div className={`size-16 rounded-2xl border-2 flex items-center justify-center transition-all ${selectedBackground === 'none'
                                                    ? 'border-student-primary bg-student-primary/10 shadow-[0_0_15px_rgba(143,129,214,0.3)]'
                                                    : 'border-white/10 bg-student-surface-dark group-hover:border-white/30'
                                                    }`}>
                                                    <span className={`material-symbols-outlined text-[24px] ${selectedBackground === 'none' ? 'text-student-primary' : 'text-gray-400'
                                                        }`}>block</span>
                                                </div>
                                                <span className={`text-xs font-medium ${selectedBackground === 'none' ? 'text-student-primary' : 'text-gray-400'
                                                    }`}>None</span>
                                            </button>

                                            {/* Blur Option */}
                                            <button
                                                onClick={() => setSelectedBackground('blur')}
                                                className="flex flex-col gap-2 items-center group shrink-0"
                                            >
                                                <div className={`size-16 rounded-2xl border-2 overflow-hidden relative transition-all ${selectedBackground === 'blur'
                                                    ? 'border-student-primary shadow-[0_0_15px_rgba(143,129,214,0.3)]'
                                                    : 'border-transparent group-hover:border-white/20'
                                                    }`}>
                                                    <div className="w-full h-full bg-gradient-to-br from-purple-400 to-pink-400 blur-sm opacity-50"></div>
                                                    <div className="absolute inset-0 flex items-center justify-center">
                                                        <span className={`material-symbols-outlined text-[24px] drop-shadow-md ${selectedBackground === 'blur' ? 'text-student-primary' : 'text-white'
                                                            }`}>blur_on</span>
                                                    </div>
                                                </div>
                                                <span className={`text-xs font-medium ${selectedBackground === 'blur' ? 'text-student-primary' : 'text-gray-400 group-hover:text-gray-300'
                                                    }`}>Blur</span>
                                            </button>

                                            {/* Library Option */}
                                            <button
                                                onClick={() => setSelectedBackground('library')}
                                                className="flex flex-col gap-2 items-center group shrink-0"
                                            >
                                                <div className={`size-16 rounded-2xl border-2 overflow-hidden transition-all ${selectedBackground === 'library'
                                                    ? 'border-student-primary shadow-[0_0_15px_rgba(143,129,214,0.3)]'
                                                    : 'border-transparent group-hover:border-white/20'
                                                    }`}>
                                                    <div className="w-full h-full bg-gradient-to-br from-amber-700 to-amber-900 opacity-80 group-hover:opacity-100 transition-opacity"></div>
                                                </div>
                                                <span className={`text-xs font-medium ${selectedBackground === 'library' ? 'text-student-primary' : 'text-gray-400 group-hover:text-gray-300'
                                                    }`}>Library</span>
                                            </button>

                                            {/* Space Option */}
                                            <button
                                                onClick={() => setSelectedBackground('space')}
                                                className="flex flex-col gap-2 items-center group shrink-0"
                                            >
                                                <div className={`size-16 rounded-2xl border-2 overflow-hidden transition-all ${selectedBackground === 'space'
                                                    ? 'border-student-primary shadow-[0_0_15px_rgba(143,129,214,0.3)]'
                                                    : 'border-transparent group-hover:border-white/20'
                                                    }`}>
                                                    <div className="w-full h-full bg-gradient-to-br from-indigo-900 to-black opacity-80 group-hover:opacity-100 transition-opacity"></div>
                                                </div>
                                                <span className={`text-xs font-medium ${selectedBackground === 'space' ? 'text-student-primary' : 'text-gray-400 group-hover:text-gray-300'
                                                    }`}>Space</span>
                                            </button>

                                            {/* Office Option */}
                                            <button
                                                onClick={() => setSelectedBackground('office')}
                                                className="flex flex-col gap-2 items-center group shrink-0"
                                            >
                                                <div className={`size-16 rounded-2xl border-2 overflow-hidden transition-all ${selectedBackground === 'office'
                                                    ? 'border-student-primary shadow-[0_0_15px_rgba(143,129,214,0.3)]'
                                                    : 'border-transparent group-hover:border-white/20'
                                                    }`}>
                                                    <div className="w-full h-full bg-gradient-to-br from-gray-100 to-gray-300 opacity-80 group-hover:opacity-100 transition-opacity"></div>
                                                </div>
                                                <span className={`text-xs font-medium ${selectedBackground === 'office' ? 'text-student-primary' : 'text-gray-400 group-hover:text-gray-300'
                                                    }`}>Office</span>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Sticky Footer */}
                        <div className="absolute bottom-0 left-0 right-0 bg-student-bg-dark/95 backdrop-blur-xl border-t border-white/5 p-4 z-50 pb-8">
                            <button 
                                onClick={handleJoinClass}
                                className="w-full bg-student-primary hover:bg-[#7c6ec4] text-student-bg-dark font-bold text-lg h-14 rounded-2xl shadow-[0_4px_20px_rgba(143,129,214,0.25)] flex items-center justify-center gap-3 transition-all active:scale-[0.98]"
                            >
                                <span>Join Class Now</span>
                                <span className="material-symbols-outlined text-[24px]">arrow_forward</span>
                            </button>
                        </div>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
};
