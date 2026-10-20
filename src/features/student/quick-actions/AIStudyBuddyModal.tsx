import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useStudentAI } from '@/hooks/useStudentAI';
import { VoiceOrb } from '@/components/agents/voice-orb';
import { audioAnalyzer } from '@/utils/audioAnalyzer';

interface AIStudyBuddyModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const AIStudyBuddyModal = ({ isOpen, onClose }: AIStudyBuddyModalProps) => {
    const [inputMessage, setInputMessage] = useState('');
    const { user } = useAuth();
    const userName = user?.name || 'Student';
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const {
        messages,
        isLoading,
        activeSubject,
        setActiveSubject,
        availableSubjects,
        detectedAssignments,
        activeAssignment,
        setActiveAssignment,
        mode,
        setMode,
        sendMessage,
        isListening,
        isSpeaking,
        isUserSpeaking,
        conversationState,
        liveTranscript,
        toggleListening,
        stopSpeaking,
        clearHistory
    } = useStudentAI();

    // Prevent body scrolling when open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [isOpen]);

    // Handle Escape key to close
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                stopSpeaking();
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose, stopSpeaking]);

    // Auto scroll to bottom in chat mode
    useEffect(() => {
        if (isOpen && mode === 'chat') {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, isLoading, isOpen, mode]);

    // Stop speech when modal closes
    useEffect(() => {
        if (!isOpen) {
            stopSpeaking();
        }
    }, [isOpen, stopSpeaking]);

    const handleTextSend = () => {
        if (!inputMessage.trim() || isLoading) return;
        const text = inputMessage.trim();
        setInputMessage('');
        // Send as 'text' -> Aoede responds strictly in text (silent)
        sendMessage(text, 'text');
    };

    if (!isOpen || typeof document === 'undefined') return null;

    return createPortal(
        <div 
            className="fixed inset-0 z-[9999] w-screen h-[100dvh] bg-white dark:bg-zinc-950 text-gray-900 dark:text-white flex flex-col overflow-hidden m-0 p-0"
            style={{
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                width: '100vw',
                height: '100dvh',
                position: 'fixed',
                transform: 'none',
                zIndex: 9999
            }}
        >
            {/* Top Navigation Header */}
            <header className="shrink-0 flex items-center justify-between px-4 sm:px-6 py-3 bg-white/95 dark:bg-zinc-900/95 backdrop-blur border-b border-gray-200 dark:border-zinc-800 z-20">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => {
                            stopSpeaking();
                            onClose();
                        }}
                        className="text-gray-700 dark:text-gray-300 flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
                        aria-label="Back to dashboard"
                    >
                        <span className="material-symbols-outlined text-[24px]">arrow_back</span>
                    </button>

                    {/* Logo and Brand */}
                    <div className="flex items-center gap-2.5">
                        <div className="size-9 rounded-full bg-white dark:bg-zinc-800 p-1 flex items-center justify-center shrink-0 shadow-sm border border-purple-200 dark:border-zinc-700">
                            <img 
                                src="/logo (2).png" 
                                alt="YadaLearn Logo" 
                                className="size-full object-contain"
                            />
                        </div>
                        <div>
                            <h1 className="text-gray-950 dark:text-white text-base md:text-lg font-bold leading-tight tracking-tight font-sans">
                                Aoede
                            </h1>
                            <p className="text-[11px] text-muted-foreground font-medium">
                                {mode === 'voice' ? '' : 'Text Conversation'}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Mode Switcher Tabs: Text Chat vs Voice-to-Voice */}
                <div className="flex items-center gap-1 sm:gap-2 bg-gray-100 dark:bg-zinc-800/80 p-1 rounded-2xl border border-gray-200 dark:border-zinc-700">
                    <button
                        onClick={() => {
                            stopSpeaking();
                            setMode('chat');
                        }}
                        className={`flex items-center gap-1.5 px-3 sm:px-4 py-1.5 rounded-xl text-xs font-bold transition-all ${
                            mode === 'chat'
                                ? 'bg-white dark:bg-zinc-900 text-[#5B4A9F] dark:text-purple-300 shadow-sm'
                                : 'text-gray-600 dark:text-zinc-400 hover:text-gray-900'
                        }`}
                    >
                        <span className="material-symbols-outlined text-[16px]">chat</span>
                        <span>Chat</span>
                    </button>
                    <button
                        onClick={() => {
                            setMode('voice');
                        }}
                        className={`flex items-center gap-1.5 px-3 sm:px-4 py-1.5 rounded-xl text-xs font-bold transition-all ${
                            mode === 'voice'
                                ? 'bg-[#5B4A9F] text-white shadow-sm'
                                : 'text-gray-600 dark:text-zinc-400 hover:text-gray-900'
                        }`}
                    >
                        <span className="material-symbols-outlined text-[16px]">mic</span>
                        <span>Voice</span>
                    </button>
                </div>

                {/* Subject Selector & Reset Action */}
                <div className="flex items-center gap-2">
                    {availableSubjects.length > 1 && (
                        <select 
                            value={activeSubject}
                            onChange={(e) => setActiveSubject(e.target.value)}
                            className="text-xs font-semibold text-[#5B4A9F] dark:text-purple-400 bg-purple-50 dark:bg-zinc-800 border border-purple-200 dark:border-zinc-700 rounded-full px-3 py-1.5 cursor-pointer focus:ring-0 hidden sm:block"
                        >
                            {availableSubjects.map((subj) => (
                                <option key={subj} value={subj} className="text-gray-900 dark:text-zinc-100 dark:bg-zinc-800">
                                    {subj}
                                </option>
                            ))}
                        </select>
                    )}
                    <button 
                        onClick={clearHistory}
                        title="Reset conversation"
                        className="flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors text-gray-700 dark:text-gray-300"
                        aria-label="Reset conversation"
                    >
                        <span className="material-symbols-outlined text-[20px]">restart_alt</span>
                    </button>
                </div>
            </header>

            {/* Assignment Awareness Banner */}
            {detectedAssignments.length > 0 && (
                <div className="shrink-0 bg-purple-50/80 dark:bg-purple-950/30 border-b border-purple-100 dark:border-zinc-800 px-4 sm:px-6 py-2 flex items-center justify-between gap-2 overflow-x-auto scrollbar-hide">
                    <div className="flex items-center gap-1.5 shrink-0">
                        <span className="material-symbols-outlined text-purple-600 dark:text-purple-400 text-[18px]">assignment</span>
                        <span className="text-xs font-semibold text-purple-900 dark:text-purple-200">
                            Enrolled Assignments:
                        </span>
                    </div>
                    <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
                        {detectedAssignments.map((a) => (
                            <button
                                key={a.id}
                                onClick={() => {
                                    setActiveAssignment(a);
                                    sendMessage(`I need help understanding my assignment ${a.title} in ${a.courseTitle}`, mode === 'voice' ? 'voice' : 'text');
                                }}
                                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors shrink-0 ${
                                    activeAssignment?.id === a.id
                                        ? 'bg-[#5B4A9F] text-white shadow-sm'
                                        : 'bg-white dark:bg-zinc-800 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-zinc-700 hover:bg-purple-100/50'
                                }`}
                            >
                                {a.title} ({a.courseTitle})
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Main Fullscreen Workspace */}
            {mode === 'voice' ? (
                /* DEDICATED FULLSCREEN VOICE-TO-VOICE STAGE (CYBER-SPHERE ON WHITE BACKGROUND) */
                <main className="flex-1 flex flex-col items-center justify-between py-6 px-4 sm:px-6 bg-white dark:bg-zinc-950 relative overflow-hidden select-none">
                    {/* Top status indicator (State-driven activity chip) */}
                    <div className="flex items-center justify-center pt-1 z-10 min-h-[32px]">
                        {conversationState !== 'idle' && (
                            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-purple-50/90 dark:bg-zinc-850 border border-purple-100 dark:border-zinc-700 text-[#5B4A9F] dark:text-purple-300 text-xs font-semibold shadow-sm transition-all animate-in fade-in zoom-in-95 duration-200">
                                <span className={`size-2 rounded-full ${
                                    conversationState === 'speaking' 
                                        ? 'bg-fuchsia-500 animate-ping' 
                                        : conversationState === 'listening' 
                                        ? 'bg-cyan-400 animate-ping' 
                                        : 'bg-purple-400 animate-pulse'
                                }`}></span>
                                <span>
                                    {conversationState === 'speaking'
                                        ? 'Speaking'
                                        : conversationState === 'listening'
                                        ? 'Listening...'
                                        : 'Thinking...'}
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Central Voice Orb Visualization (Voice-reactive WebGL Liquid Orb) */}
                    <div 
                        className="relative flex items-center justify-center my-auto cursor-pointer select-none" 
                        onClick={() => { if (isSpeaking) stopSpeaking(); }} 
                        title={isSpeaking ? "Tap to interrupt Aoede" : ""}
                    >
                        <VoiceOrb 
                            activity={isSpeaking ? Math.min(1, Math.max(0.18, audioAnalyzer.getMetrics().rms * 2.5)) : isUserSpeaking ? 0.35 : 0}
                            analyser={audioAnalyzer.getAnalyser()}
                            className="w-64 sm:w-72 md:w-80"
                            aria-label="Aoede voice visualization"
                        />
                    </div>

                    {/* Live Captions & Controls */}
                    <div className="w-full max-w-lg flex flex-col items-center gap-5 z-10 pb-4">
                        {/* Captions Display - shows live speech transcription or latest response, clean and unobtrusive */}
                        <div className="w-full min-h-[56px] px-5 py-3 rounded-2xl bg-gray-50/90 border border-gray-100 shadow-sm flex items-center justify-center text-center">
                            <p className="text-xs sm:text-sm text-gray-800 leading-relaxed font-sans">
                                {liveTranscript ? (
                                    <span className="text-cyan-700 font-semibold animate-pulse">
                                        "{liveTranscript}"
                                    </span>
                                ) : messages.length > 0 ? (
                                    <span className="text-gray-700">
                                        {messages[messages.length - 1].text}
                                    </span>
                                ) : (
                                    <span className="text-gray-400 text-xs">
                                        Speak aloud to begin...
                                    </span>
                                )}
                            </p>
                        </div>

                        {/* Hands-Free Voice Controls: Mic Toggle, X Button to return to Chat */}
                        <div className="flex items-center justify-center gap-6">
                            {/* Mute/Unmute Mic Toggle */}
                            <button
                                onClick={toggleListening}
                                title={isListening ? "Mute microphone" : "Unmute microphone"}
                                className={`size-12 rounded-full flex items-center justify-center border transition-all ${
                                    isListening 
                                        ? 'bg-purple-50 text-[#5B4A9F] border-purple-200 hover:bg-purple-100' 
                                        : 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'
                                }`}
                                aria-label="Toggle Microphone"
                            >
                                <span className="material-symbols-outlined text-2xl">
                                    {isListening ? 'mic' : 'mic_off'}
                                </span>
                            </button>

                            {/* X Button: Exits voice mode (Return to Chat) */}
                            <button
                                onClick={() => {
                                    stopSpeaking();
                                    setMode('chat');
                                }}
                                title="Return to Chat"
                                className="size-14 rounded-full bg-gray-900 hover:bg-black active:scale-95 text-white flex items-center justify-center shadow-lg transition-all"
                                aria-label="Return to Chat"
                            >
                                <span className="material-symbols-outlined text-2xl">
                                    close
                                </span>
                            </button>
                        </div>
                    </div>
                </main>
            ) : (
                /* DEDICATED FULLSCREEN TEXT CHAT STAGE */
                <main className="flex-1 overflow-y-auto relative w-full bg-gray-50/40 dark:bg-zinc-950/20">
                    <div className="flex flex-col min-h-full px-4 sm:px-8 md:px-12 pt-6 pb-20 max-w-4xl mx-auto w-full gap-5">
                        
                        {messages.map((msg) => {
                            if (msg.sender === 'ai') {
                                return (
                                    <div key={msg.id} className="flex flex-col gap-2">
                                        <div className="flex items-start gap-3">
                                            <div className="size-9 rounded-full bg-white dark:bg-zinc-800 p-1 flex items-center justify-center shrink-0 shadow-sm border border-purple-200 dark:border-zinc-700 mt-0.5">
                                                <img 
                                                    src="/logo (2).png" 
                                                    alt="Aoede Logo" 
                                                    className="size-full object-contain"
                                                />
                                            </div>
                                            <div className="p-4 rounded-2xl rounded-tl-none bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 text-gray-900 dark:text-white max-w-[88%] shadow-sm">
                                                <p className="text-sm leading-relaxed whitespace-pre-wrap font-sans">
                                                    {msg.text}
                                                </p>
                                                <div className="flex items-center justify-between mt-2 pt-1 border-t border-gray-100 dark:border-zinc-800">
                                                    <span className="text-[10px] font-semibold text-[#5B4A9F] dark:text-purple-400">Aoede</span>
                                                    <span className="text-[10px] text-gray-400 font-medium">{msg.time}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            } else {
                                return (
                                    <div key={msg.id} className="flex items-start gap-3 justify-end">
                                        <div className="flex flex-col items-end gap-1 max-w-[85%]">
                                            <div className="p-4 rounded-2xl rounded-tr-none bg-gradient-to-r from-[#5B4A9F] to-[#8F81D6] text-white shadow-md">
                                                <p className="text-sm font-semibold leading-relaxed whitespace-pre-wrap font-sans">
                                                    {msg.text}
                                                </p>
                                            </div>
                                            <span className="text-[10px] text-gray-400 pr-1">{msg.time}</span>
                                        </div>
                                        <div className="size-9 rounded-full bg-gradient-to-br from-[#8F81D6] to-purple-400 overflow-hidden shrink-0 border-2 border-white dark:border-zinc-800 shadow-sm flex items-center justify-center text-white text-xs font-bold mt-0.5">
                                            {userName[0]}
                                        </div>
                                    </div>
                                );
                            }
                        })}

                        {isLoading && (
                            <div className="flex items-center gap-3">
                                <div className="size-9 rounded-full bg-white dark:bg-zinc-800 p-1 flex items-center justify-center shrink-0 border border-purple-200 dark:border-zinc-700 animate-pulse">
                                    <img 
                                        src="/logo (2).png" 
                                        alt="Aoede Logo" 
                                        className="size-full object-contain"
                                    />
                                </div>
                                <div className="p-3.5 px-4 rounded-2xl rounded-tl-none bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 flex items-center gap-1.5 shadow-sm">
                                    <span className="text-xs text-[#5B4A9F] dark:text-purple-400 font-medium mr-1">Aoede is typing</span>
                                    <span className="size-1.5 rounded-full bg-[#5B4A9F] animate-bounce"></span>
                                    <span className="size-1.5 rounded-full bg-[#5B4A9F] animate-bounce [animation-delay:0.2s]"></span>
                                    <span className="size-1.5 rounded-full bg-[#5B4A9F] animate-bounce [animation-delay:0.4s]"></span>
                                </div>
                            </div>
                        )}

                        <div ref={messagesEndRef} />
                    </div>
                </main>
            )}

            {/* Fullscreen Input Footer (Active in Chat Mode) */}
            {mode === 'chat' && (
                <footer className="shrink-0 bg-white dark:bg-zinc-900 p-3 sm:p-4 border-t border-gray-200 dark:border-zinc-800 z-20">
                    <div className="relative flex items-center gap-2 bg-gray-50 dark:bg-zinc-950 border border-gray-250 dark:border-zinc-750 rounded-[28px] p-1.5 sm:p-2 shadow-sm max-w-4xl mx-auto w-full">
                        
                        {/* Switch to Voice Mode Button */}
                        <button
                            onClick={() => setMode('voice')}
                            title="Switch to Voice Mode"
                            className="size-10 sm:size-11 shrink-0 flex items-center justify-center rounded-full bg-purple-100/80 hover:bg-purple-200 dark:bg-zinc-800 text-[#5B4A9F] dark:text-purple-300 transition-colors"
                            aria-label="Switch to Voice Mode"
                        >
                            <span className="material-symbols-outlined text-[20px]">mic</span>
                        </button>

                        {/* Text Input */}
                        <input
                            type="text"
                            value={inputMessage}
                            onChange={(e) => setInputMessage(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleTextSend();
                                }
                            }}
                            className="flex-1 bg-transparent border-0 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-0 py-2 px-2 sm:px-3 text-sm leading-relaxed"
                            placeholder={`Type your question for Aoede in ${activeSubject}... (Enter to send)`}
                            disabled={isLoading}
                        />

                        {/* Send Button */}
                        <button 
                            onClick={handleTextSend}
                            disabled={isLoading || !inputMessage.trim()}
                            className="size-10 sm:size-11 shrink-0 flex items-center justify-center rounded-full bg-gradient-to-r from-[#5B4A9F] to-[#8F81D6] hover:from-[#493a85] hover:to-[#7c6ec4] text-white transition-all duration-200 shadow-md disabled:opacity-40 disabled:cursor-not-allowed"
                            aria-label="Send message"
                        >
                            <span className="material-symbols-outlined filled" style={{ fontVariationSettings: "'FILL' 1" }}>
                                arrow_upward
                            </span>
                        </button>
                    </div>

                    <div className="text-center mt-1.5">
                        <p className="text-[10px] text-gray-400">
                            Chat replies silently in text. Switch to Voice mode anytime for real-time discussion.
                        </p>
                    </div>
                </footer>
            )}
        </div>,
        document.body
    );
};
