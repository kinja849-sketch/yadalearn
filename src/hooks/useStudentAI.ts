import { useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { audioAnalyzer } from '@/utils/audioAnalyzer';
import { LiveAudioStreamer } from '@/utils/liveAudioStreamer';
import type { AIMessage, DetectedAssignment, StudentAIRequest, StudentAIResponse, GeminiLiveServerEvent } from '@/types/ai';

const stripSymbols = (text: string): string => {
  if (!text) return '';
  return text
    .replace(/[*#_~`]/g, '')
    .replace(/^[•\-\*]\s+/gm, '')
    .replace(/\n\s*[-•]\s*/g, ' ')
    .replace(/•/g, '')
    .replace(/\$\$/g, '')
    .replace(/\$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
};

export type ConversationState = 'idle' | 'listening' | 'processing' | 'speaking';

export const useStudentAI = (initialSubject?: string) => {
  const { user, subjects } = useAuth();
  const userName = user?.name || 'Student';
  const defaultSubject = initialSubject || (subjects && subjects.length > 0 ? subjects[0] : 'General Studies');

  const [activeSubject, setActiveSubject] = useState<string>(defaultSubject);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [detectedAssignments, setDetectedAssignments] = useState<DetectedAssignment[]>([]);
  const [activeAssignment, setActiveAssignment] = useState<DetectedAssignment | null>(null);

  // Mode: 'chat' (silent text) or 'voice' (voice-to-voice conversation)
  const [mode, setMode] = useState<'chat' | 'voice'>('chat');
  const [isListening, setIsListening] = useState<boolean>(false);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [isUserSpeaking, setIsUserSpeaking] = useState<boolean>(false);
  const [liveTranscript, setLiveTranscript] = useState<string>('');

  const recognitionRef = useRef<any>(null);
  const isSpeakingRef = useRef<boolean>(false);
  const isVoiceCallActiveRef = useRef<boolean>(false);
  const silenceTimerRef = useRef<any>(null);
  const accumulatedSpeechRef = useRef<string>('');
  const currentAISpokenTextRef = useRef<string>('');
  const recentAISpokenTextsRef = useRef<string[]>([]);
  const isEchoCooldownRef = useRef<boolean>(false);
  const cooldownTimerRef = useRef<any>(null);
  const sendMessageRef = useRef<any>(null);

  // Turn management & barge-in cancellation tracking
  const turnIdRef = useRef<number>(0);
  const activeAbortControllerRef = useRef<AbortController | null>(null);
  const lastSentUtteranceRef = useRef<string>('');
  const lastSentTimeRef = useRef<number>(0);

  // Real-time Gemini Live WebSocket and Audio Streamer refs
  const liveStreamerRef = useRef<LiveAudioStreamer | null>(null);
  const liveWsRef = useRef<WebSocket | null>(null);
  const currentTurnTextRef = useRef<string>('');

  // Conversation messages (starts empty until user speaks or types)
  const [messages, setMessages] = useState<AIMessage[]>([]);

  // Stop any active speech/audio immediately (Barge-in / Interruption)
  const stopSpeaking = useCallback(() => {
    // 1. Terminate live streaming playback and audio analyzer
    if (liveStreamerRef.current) {
      liveStreamerRef.current.stopPlayback();
    }
    audioAnalyzer.stopAudio();

    // 2. Abort any in-flight /api/student-ai or /api/tts HTTP requests
    if (activeAbortControllerRef.current) {
      activeAbortControllerRef.current.abort();
      activeAbortControllerRef.current = null;
    }

    if (liveWsRef.current?.readyState === WebSocket.OPEN) {
      try {
        liveWsRef.current.send(JSON.stringify({ type: 'interrupt' }));
      } catch (e) {}
    }

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

    currentTurnTextRef.current = '';
    setIsSpeaking(false);
    isSpeakingRef.current = false;
  }, []);

  // Play Aoede authentic human neural voice audio with real-time Web Audio API analysis
  const speakAoedeVoice = useCallback(async (textToSpeak: string, expectedTurnId?: number) => {
    stopSpeaking();
    const clean = stripSymbols(textToSpeak);
    if (!clean) return;

    // Check if turn was invalidated while waiting
    if (expectedTurnId !== undefined && turnIdRef.current !== expectedTurnId) {
      return;
    }

    try {
      setIsSpeaking(true);
      isSpeakingRef.current = true;
      currentAISpokenTextRef.current = clean;
      recentAISpokenTextsRef.current = [clean, ...recentAISpokenTextsRef.current.slice(0, 4)];

      const abortController = new AbortController();
      activeAbortControllerRef.current = abortController;

      // Server-side Aoede neural voice synthesis (Google Gemini Aoede model)
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: clean }),
        signal: abortController.signal
      });

      if (res.ok) {
        const data = await res.json();
        // If the user interrupted while audio was synthesizing or turn changed, cancel
        if (!isSpeakingRef.current || (expectedTurnId !== undefined && turnIdRef.current !== expectedTurnId)) {
          return;
        }

        if (data.audioContent) {
          // Play through Web Audio API bridge with real-time AnalyserNode
          await audioAnalyzer.playBase64Audio(data.audioContent, () => {
            setIsSpeaking(false);
            isSpeakingRef.current = false;

            // Post-speech echo grace window (prevent room reverberations from re-triggering speech recognition)
            isEchoCooldownRef.current = true;
            if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
            cooldownTimerRef.current = setTimeout(() => {
              isEchoCooldownRef.current = false;
            }, 850);
          });
        } else {
          setIsSpeaking(false);
          isSpeakingRef.current = false;
        }
      } else {
        setIsSpeaking(false);
        isSpeakingRef.current = false;
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        console.warn('[Aoede Audio] Neural voice request error:', e);
      }
      setIsSpeaking(false);
      isSpeakingRef.current = false;
    }
  }, [stopSpeaking]);

  // Fetch real enrolled assignments from Supabase
  useEffect(() => {
    let isMounted = true;
    async function loadAssignments() {
      if (!user?.id) return;
      try {
        const { data: enrollments } = await supabase
          .from('enrollments')
          .select(`
            course:courses (
              title,
              assignments (
                id,
                title,
                due_date,
                description
              )
            )
          `)
          .eq('student_id', user.id);

        const { data: submissions } = await supabase
          .from('submissions')
          .select('assignment_id, grade')
          .eq('student_id', user.id);

        const list: DetectedAssignment[] = [];
        enrollments?.forEach((enrollment: any) => {
          if (enrollment.course && enrollment.course.assignments) {
            enrollment.course.assignments.forEach((a: any) => {
              const sub = submissions?.find((s: any) => s.assignment_id === a.id);
              list.push({
                id: a.id,
                title: a.title,
                description: a.description,
                courseTitle: enrollment.course.title,
                dueDate: a.due_date,
                status: sub ? 'Submitted' : 'Pending'
              });
            });
          }
        });

        if (isMounted) {
          setDetectedAssignments(list);
          if (list.length > 0 && !activeAssignment) {
            setActiveAssignment(list[0]);
          }
          // Set proactive initial greeting if conversation is currently empty
          setMessages(prev => {
            if (prev.length > 0) return prev;
            const firstName = userName.split(' ')[0] || 'there';
            let initialText = '';
            if (list.length === 0) {
              initialText = `Hello ${firstName}! Since today you don't have assignments, is there something that is on your mind that you want to work on?`;
            } else {
              initialText = `Hello ${firstName}! I see you have ${list[0].title} for ${list[0].courseTitle}. Shall we work on that, or is there something else on your mind?`;
            }
            return [
              {
                id: `ai-init-${Date.now()}`,
                sender: 'ai',
                text: initialText,
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                subject: activeSubject,
                assignmentTitle: list[0]?.title
              }
            ];
          });
        }
      } catch (err) {
        console.error('[useStudentAI] Error fetching assignments:', err);
      }
    }

    loadAssignments();
    return () => {
      isMounted = false;
    };
  }, [user?.id, activeSubject, userName]);

  // Core Send Message function with turn management, low-latency pipeline & barge-in
  const sendMessage = useCallback(
    async (content: string, inputSource: 'text' | 'voice' = 'text') => {
      const trimmed = stripSymbols(content);
      if (!trimmed || isLoading) return;

      // Prevent duplicate queries within 2.5 seconds
      const now = Date.now();
      if (
        trimmed === lastSentUtteranceRef.current &&
        now - lastSentTimeRef.current < 2500
      ) {
        return;
      }

      // CRITICAL SELF-AWARENESS GUARD:
      // If the incoming text echoes what Aoede just spoke, discard it completely!
      const incomingLower = trimmed.toLowerCase().replace(/[^a-z0-9\s]/g, '');
      const incomingWords = incomingLower.split(/\s+/).filter(w => w.length > 2);

      const recentAITexts = [
        currentAISpokenTextRef.current,
        ...recentAISpokenTextsRef.current
      ].map(t => (t || '').toLowerCase().replace(/[^a-z0-9\s]/g, '')).filter(Boolean);

      for (const aiText of recentAITexts) {
        if (!aiText) continue;
        // 1. Direct or reverse containment
        if (aiText.includes(incomingLower) || incomingLower.includes(aiText)) {
          console.warn('[Aoede Guard] Discarded acoustic self-echo (containment):', trimmed);
          return;
        }

        // 2. Keyword/phrase overlap check (e.g. "energized and excited", "help you learn today")
        if (incomingWords.length >= 3) {
          const matchingWords = incomingWords.filter(w => aiText.includes(w));
          const overlapRatio = matchingWords.length / incomingWords.length;
          if (overlapRatio >= 0.25) {
            console.warn(`[Aoede Guard] Discarded acoustic self-echo (${Math.round(overlapRatio * 100)}% match):`, trimmed);
            return;
          }
        }
      }

      lastSentUtteranceRef.current = trimmed;
      lastSentTimeRef.current = now;

      // Increment turn ID so any superseded responses are discarded
      turnIdRef.current++;
      const currentTurnId = turnIdRef.current;

      stopSpeaking();

      const userMsg: AIMessage = {
        id: `user-${Date.now()}`,
        sender: 'user',
        text: trimmed,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        subject: activeSubject,
        assignmentTitle: activeAssignment?.title
      };

      setMessages(prev => [...prev, userMsg]);

      // If in Voice Mode with active Gemini Live WebSocket, send turn directly over WebSocket for streaming speech!
      if ((mode === 'voice' || inputSource === 'voice') && liveWsRef.current?.readyState === WebSocket.OPEN) {
        liveWsRef.current.send(JSON.stringify({ type: 'text', text: trimmed }));
        return;
      }

      setIsLoading(true);

      const abortController = new AbortController();
      activeAbortControllerRef.current = abortController;

      try {
        const payload: any = {
          messages: [...messages, userMsg].map(m => ({
            role: m.sender === 'user' ? 'user' : 'assistant',
            content: m.text
          })),
          subject: activeSubject,
          studentName: userName,
          activeAssignment,
          detectedAssignments,
          isVoiceMode: inputSource === 'voice' || mode === 'voice',
          currentDate: new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
          currentTime: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
          hasAssignments: detectedAssignments.length > 0
        };

        const res = await fetch('/api/student-ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: abortController.signal
        });

        if (!res.ok) {
          throw new Error(`Server returned status ${res.status}`);
        }

        // If turn was superseded while in-flight, discard response
        if (turnIdRef.current !== currentTurnId) {
          return;
        }

        const data: StudentAIResponse = await res.json();
        const replyClean = stripSymbols(data.reply || "Let us think through this together. What is your first step?");

        const aiMsg: AIMessage = {
          id: `ai-${Date.now()}`,
          sender: 'ai',
          text: replyClean,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          subject: activeSubject,
          assignmentTitle: activeAssignment?.title
        };

        setMessages(prev => [...prev, aiMsg]);

        // STRICT SEPARATION: Only speak aloud if input was from Voice Mode!
        if (inputSource === 'voice' || mode === 'voice') {
          speakAoedeVoice(replyClean, currentTurnId);
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          return;
        }
        console.error('[useStudentAI] Error sending message:', err);
        if (turnIdRef.current !== currentTurnId) return;

        const fallback = stripSymbols(`I am right here with you. What is the very first step or definition in this problem? Tell me what you see.`);
        const fallbackMsg: AIMessage = {
          id: `ai-err-${Date.now()}`,
          sender: 'ai',
          text: fallback,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          subject: activeSubject
        };
        setMessages(prev => [...prev, fallbackMsg]);

        if (inputSource === 'voice' || mode === 'voice') {
          speakAoedeVoice(fallback, currentTurnId);
        }
      } finally {
        if (turnIdRef.current === currentTurnId) {
          setIsLoading(false);
        }
      }
    },
    [activeAssignment, activeSubject, detectedAssignments, isLoading, messages, mode, speakAoedeVoice, stopSpeaking, userName]
  );

  sendMessageRef.current = sendMessage;

  // Stop live voice session and clean up streaming audio resources
  const stopLiveVoiceSession = useCallback(() => {
    isVoiceCallActiveRef.current = false;
    currentTurnTextRef.current = '';
    setLiveTranscript('');
    setIsUserSpeaking(false);
    stopSpeaking();

    if (liveStreamerRef.current) {
      liveStreamerRef.current.stopCapture();
      liveStreamerRef.current.stopPlayback();
    }

    if (liveWsRef.current) {
      try {
        liveWsRef.current.close();
      } catch (e) {}
      liveWsRef.current = null;
    }

    setIsListening(false);
  }, [stopSpeaking]);

  // Start real-time bidirectional Gemini Live session
  const startLiveVoiceSession = useCallback(async () => {
    stopLiveVoiceSession();
    isVoiceCallActiveRef.current = true;

    try {
      if (!liveStreamerRef.current) {
        liveStreamerRef.current = new LiveAudioStreamer({
          onAudioChunk: (pcmBase64: string) => {
            if (liveWsRef.current?.readyState === WebSocket.OPEN) {
              liveWsRef.current.send(JSON.stringify({ type: 'audio', pcmBase64 }));
            }
          },
          onUserSpeechLevel: (rms: number) => {
            setIsUserSpeaking(rms > 0.04);
          },
          onPlaybackStateChange: (playing: boolean) => {
            setIsSpeaking(playing);
            isSpeakingRef.current = playing;
          },
          onError: (err: Error) => {
            console.warn('[useStudentAI] Live audio streamer error:', err);
          }
        });
      }

      const streamer = liveStreamerRef.current;
      await streamer.ensureAudioContext();

      // Bridge analyser for VoiceOrb visualization
      const analyser = streamer.getAnalyser();
      if (analyser) {
        audioAnalyzer.setExternalAnalyser(analyser);
      }

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const wsUrl = `${protocol}//${host}/api/gemini-live-ws?userId=${user?.id || ''}&studentName=${encodeURIComponent(userName)}&subject=${encodeURIComponent(activeSubject)}`;

      const ws = new WebSocket(wsUrl);
      liveWsRef.current = ws;

      ws.onopen = () => {
        console.log('[useStudentAI] Gemini Live WebSocket gateway connected.');
      };

      ws.onmessage = async (event) => {
        try {
          const data: GeminiLiveServerEvent = JSON.parse(event.data);

          if (data.type === 'setupComplete') {
            console.log('[useStudentAI] Gemini Live setup complete. Starting microphone capture...');
            await streamer.startCapture();
            setIsListening(true);
          } else if (data.type === 'audio' && data.data) {
            // Immediate real-time streaming audio playback
            await streamer.playPcmChunk(data.data);
          } else if (data.type === 'text' && data.text) {
            currentTurnTextRef.current += data.text;
            setLiveTranscript(currentTurnTextRef.current);
          } else if (data.type === 'interrupted') {
            // Server-side VAD barge-in interruption detected
            streamer.stopPlayback();
            setIsSpeaking(false);
            isSpeakingRef.current = false;
            currentTurnTextRef.current = '';
            setLiveTranscript('');
          } else if (data.type === 'turnComplete') {
            if (currentTurnTextRef.current.trim()) {
              const clean = stripSymbols(currentTurnTextRef.current);
              setMessages((prev) => [
                ...prev,
                {
                  id: `ai-live-${Date.now()}`,
                  sender: 'ai',
                  text: clean,
                  time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                  subject: activeSubject
                }
              ]);
            }
            currentTurnTextRef.current = '';
            setLiveTranscript('');
          } else if (data.type === 'error') {
            console.warn('[useStudentAI] Gemini Live server error:', data.error);
          }
        } catch (msgErr) {
          console.warn('[useStudentAI] Error parsing gateway message:', msgErr);
        }
      };

      ws.onerror = (err) => {
        console.warn('[useStudentAI] Gemini Live WebSocket connection error:', err);
      };

      ws.onclose = () => {
        console.log('[useStudentAI] Gemini Live WebSocket closed.');
        setIsListening(false);
      };
    } catch (err) {
      console.error('[useStudentAI] Failed to start Gemini Live voice session:', err);
      setIsListening(false);
    }
  }, [activeSubject, stopLiveVoiceSession, user?.id, userName]);

  // Activate Gemini Live voice session whenever mode is 'voice'
  useEffect(() => {
    if (mode === 'voice') {
      startLiveVoiceSession();
    } else {
      stopLiveVoiceSession();
    }
    return () => {
      stopLiveVoiceSession();
    };
  }, [mode, startLiveVoiceSession, stopLiveVoiceSession]);

  const toggleListening = useCallback(() => {
    if (isListening) {
      liveStreamerRef.current?.stopCapture();
      setIsListening(false);
    } else {
      liveStreamerRef.current?.startCapture().then(() => {
        setIsListening(true);
      }).catch((e) => {
        console.warn('[useStudentAI] Toggle startCapture failed:', e);
      });
    }
  }, [isListening]);

  const clearHistory = useCallback(() => {
    stopSpeaking();
    turnIdRef.current++;
    const firstName = userName.split(' ')[0] || 'there';
    let text = '';
    if (detectedAssignments.length === 0) {
      text = `Hello ${firstName}! Since today you don't have assignments, is there something that is on your mind that you want to work on?`;
    } else {
      text = `Hello ${firstName}! I see you have ${detectedAssignments[0].title} for ${detectedAssignments[0].courseTitle}. Shall we work on that, or is there something else on your mind?`;
    }
    setMessages([
      {
        id: `init-reset-${Date.now()}`,
        sender: 'ai',
        text: stripSymbols(text),
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        subject: activeSubject
      }
    ]);
  }, [activeSubject, detectedAssignments, stopSpeaking, userName]);

  // Conversational state calculation
  const conversationState: ConversationState = isSpeaking
    ? 'speaking'
    : isUserSpeaking
    ? 'listening'
    : isLoading
    ? 'processing'
    : 'idle';

  return {
    messages,
    isLoading,
    activeSubject,
    setActiveSubject,
    availableSubjects: subjects && subjects.length > 0 ? subjects : [defaultSubject],
    detectedAssignments,
    activeAssignment,
    setActiveAssignment,
    mode,
    setMode,
    isVoiceMode: mode === 'voice',
    setIsVoiceMode: (valOrFn: any) => {
      setMode((prev) => {
        const nextBool = typeof valOrFn === 'function' ? valOrFn(prev === 'voice') : !!valOrFn;
        return nextBool ? 'voice' : 'chat';
      });
    },
    sendMessage,
    isListening,
    isSpeaking,
    isUserSpeaking,
    conversationState,
    liveTranscript,
    toggleListening,
    startLiveVoiceSession,
    stopLiveVoiceSession,
    startContinuousVoiceDialogue: startLiveVoiceSession,
    stopContinuousVoiceDialogue: stopLiveVoiceSession,
    speakAoedeVoice,
    stopSpeaking,
    clearHistory
  };
};
