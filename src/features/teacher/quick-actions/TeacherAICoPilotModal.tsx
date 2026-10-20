import { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { useTeacherAI } from '@/hooks/useTeacherAI';
import { Sparkles, Send, BookOpen, CheckSquare, Users } from 'lucide-react';

interface TeacherAICoPilotModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenAction?: (modalName: string) => void;
}

interface ChatMessage {
  id: string;
  sender: 'ai' | 'user';
  text: string;
  time: string;
}

export const TeacherAICoPilotModal = ({ isOpen, onClose, onOpenAction }: TeacherAICoPilotModalProps) => {
  const { user } = useAuth();
  const { askTeacherCoPilot, isLoading } = useTeacherAI();
  const [inputMessage, setInputMessage] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const teacherName = user?.user_metadata?.full_name || 'Educator';

  // Initialize welcome message once opened
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([
        {
          id: 'welcome',
          sender: 'ai',
          text: `Welcome, ${teacherName.split(' ')[0]}. I am Aoede, your AI Teaching Co-Pilot. I can help you draft interactive lesson plans, formulate grading rubrics, design classroom discussion prompts, or analyze student engagement trends. What would you like to prepare today?`,
          time: new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: 'numeric' }).format(new Date())
        }
      ]);
    }
  }, [isOpen, teacherName, messages.length]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputMessage).trim();
    if (!text || isLoading) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      sender: 'user',
      text,
      time: new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: 'numeric' }).format(new Date())
    };

    setMessages(prev => [...prev, userMsg]);
    setInputMessage('');

    const reply = await askTeacherCoPilot(text, teacherName);
    if (reply) {
      const aiMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        sender: 'ai',
        text: reply,
        time: new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: 'numeric' }).format(new Date())
      };
      setMessages(prev => [...prev, aiMsg]);
    }
  };

  const samplePrompts = [
    { label: '5-Minute Icebreaker', prompt: 'Give me a 5-minute interactive warm-up riddle for my next class' },
    { label: 'Socratic Questions', prompt: 'Provide 3 deep conceptual inquiry questions to check for student understanding' },
    { label: 'Engagement Strategy', prompt: 'How can I encourage quieter students to participate in live video sessions?' },
    { label: 'Rubric Criteria', prompt: 'What are key rubric standards for evaluating student problem-solving steps?' }
  ];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="!max-w-3xl mx-auto bg-white dark:bg-zinc-900 text-gray-900 dark:text-white border-0 p-0 overflow-hidden rounded-[2.5rem] h-[85vh] flex flex-col shadow-2xl">
        {/* Top Header */}
        <div className="flex items-center justify-between p-6 pb-4 bg-white dark:bg-zinc-900 border-b border-gray-100 dark:border-zinc-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="size-11 rounded-2xl bg-gradient-to-tr from-[#FF7D46] to-amber-400 flex items-center justify-center p-1.5 shadow-md shadow-orange-500/20">
              <img src="/logo (2).png" alt="Aoede" className="w-full h-full object-contain" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-extrabold text-gray-900 dark:text-white">Aoede Teaching Co-Pilot</h2>
                <span className="text-[10px] bg-orange-100 dark:bg-orange-950/40 text-[#FF7D46] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider">
                  AI Mentor
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-zinc-400">Classroom intelligence & pedagogy assistant</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="size-9 rounded-full bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 flex items-center justify-center text-gray-500 dark:text-zinc-400 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Quick Tools Jump Bar */}
        <div className="bg-orange-50/60 dark:bg-zinc-850/60 px-6 py-2.5 border-b border-orange-100 dark:border-zinc-800 flex items-center gap-3 overflow-x-auto no-scrollbar shrink-0">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-orange-800 dark:text-orange-400 shrink-0">
            Co-Pilot Tools:
          </span>
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenAction?.('review-submissions');
            }}
            className="flex items-center gap-1.5 px-3 py-1 bg-white dark:bg-zinc-800 hover:bg-orange-100 dark:hover:bg-zinc-700 text-xs font-semibold text-gray-700 dark:text-zinc-200 rounded-lg border border-gray-200 dark:border-zinc-700 shadow-sm shrink-0 transition-colors"
          >
            <CheckSquare className="size-3.5 text-orange-500" />
            <span>AI Formative Grading</span>
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenAction?.('create-session');
            }}
            className="flex items-center gap-1.5 px-3 py-1 bg-white dark:bg-zinc-800 hover:bg-orange-100 dark:hover:bg-zinc-700 text-xs font-semibold text-gray-700 dark:text-zinc-200 rounded-lg border border-gray-200 dark:border-zinc-700 shadow-sm shrink-0 transition-colors"
          >
            <BookOpen className="size-3.5 text-orange-500" />
            <span>AI Lesson Planner</span>
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenAction?.('student-overview');
            }}
            className="flex items-center gap-1.5 px-3 py-1 bg-white dark:bg-zinc-800 hover:bg-orange-100 dark:hover:bg-zinc-700 text-xs font-semibold text-gray-700 dark:text-zinc-200 rounded-lg border border-gray-200 dark:border-zinc-700 shadow-sm shrink-0 transition-colors"
          >
            <Users className="size-3.5 text-orange-500" />
            <span>Engagement Radar</span>
          </button>
        </div>

        {/* Conversation Stream */}
        <div ref={scrollRef} className="flex-1 p-6 overflow-y-auto space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex items-start gap-3 ${msg.sender === 'user' ? 'flex-row-reverse' : ''}`}
            >
              {msg.sender === 'ai' ? (
                <div className="size-8 rounded-xl bg-orange-100 dark:bg-orange-950/40 p-1 flex items-center justify-center shrink-0 border border-orange-200 dark:border-orange-900/50">
                  <img src="/logo (2).png" alt="Aoede" className="w-full h-full object-contain" />
                </div>
              ) : (
                <div className="size-8 rounded-xl bg-slate-900 dark:bg-zinc-700 text-white font-bold text-xs flex items-center justify-center shrink-0">
                  {teacherName[0]}
                </div>
              )}
              <div
                className={`max-w-[80%] rounded-2xl p-4 text-sm leading-relaxed ${
                  msg.sender === 'user'
                    ? 'bg-[#FF7D46] text-white font-medium rounded-tr-none shadow-md shadow-orange-500/20'
                    : 'bg-gray-100 dark:bg-zinc-800 text-gray-800 dark:text-zinc-100 rounded-tl-none border border-gray-200/60 dark:border-zinc-700'
                }`}
              >
                <p className="whitespace-pre-wrap">{msg.text}</p>
                <span
                  className={`text-[9px] block mt-1.5 font-medium ${
                    msg.sender === 'user' ? 'text-white/75 text-right' : 'text-gray-400'
                  }`}
                >
                  {msg.time}
                </span>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex items-center gap-3">
              <div className="size-8 rounded-xl bg-orange-100 dark:bg-orange-950/40 p-1 flex items-center justify-center shrink-0 border border-orange-200 dark:border-orange-900/50">
                <img src="/logo (2).png" alt="Aoede" className="w-full h-full object-contain animate-pulse" />
              </div>
              <div className="bg-gray-100 dark:bg-zinc-800 p-3.5 rounded-2xl rounded-tl-none flex items-center gap-2 text-xs text-gray-500 dark:text-zinc-400">
                <div className="size-2 bg-orange-500 rounded-full animate-bounce" />
                <div className="size-2 bg-orange-500 rounded-full animate-bounce [animation-delay:0.2s]" />
                <div className="size-2 bg-orange-500 rounded-full animate-bounce [animation-delay:0.4s]" />
                <span className="ml-1 font-medium">Aoede is thinking...</span>
              </div>
            </div>
          )}
        </div>

        {/* Suggested Quick Inquiries */}
        <div className="px-6 py-2 bg-white dark:bg-zinc-900 border-t border-gray-100 dark:border-zinc-800 flex gap-2 overflow-x-auto no-scrollbar shrink-0">
          {samplePrompts.map((p, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleSendMessage(p.prompt)}
              className="px-3 py-1.5 rounded-full bg-gray-50 dark:bg-zinc-800 hover:bg-orange-50 dark:hover:bg-zinc-750 text-gray-650 dark:text-zinc-300 hover:text-[#FF7D46] dark:hover:text-orange-400 border border-gray-200 dark:border-zinc-700 text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1 active:scale-95"
            >
              <Sparkles className="size-3 text-orange-500" />
              <span>{p.label}</span>
            </button>
          ))}
        </div>

        {/* Input Composer */}
        <div className="p-4 bg-white dark:bg-zinc-900 border-t border-gray-100 dark:border-zinc-800 shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center gap-2 bg-gray-50 dark:bg-zinc-800/80 p-2 rounded-2xl border border-gray-200 dark:border-zinc-700 focus-within:border-orange-500 transition-colors"
          >
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Ask Aoede about teaching strategies, lesson ideas, or grading..."
              className="flex-1 bg-transparent border-0 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-zinc-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!inputMessage.trim() || isLoading}
              className="size-10 rounded-xl bg-[#FF7D46] hover:bg-[#FF6B2E] disabled:opacity-40 text-white flex items-center justify-center transition-all shadow-md shadow-orange-500/20 active:scale-95 shrink-0"
            >
              <Send className="size-4" />
            </button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
};
