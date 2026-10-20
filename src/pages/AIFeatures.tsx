import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Send, RotateCcw, Volume2, VolumeX, Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useStudentAI } from "@/hooks/useStudentAI";

const AIFeatures = () => {
  const navigate = useNavigate();
  const [inputVal, setInputVal] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  const {
    messages,
    isLoading,
    activeSubject,
    setActiveSubject,
    availableSubjects,
    detectedAssignments,
    activeAssignment,
    setActiveAssignment,
    sendMessage,
    isVoiceMode,
    setIsVoiceMode,
    isListening,
    isSpeaking,
    toggleListening,
    stopSpeaking,
    clearHistory
  } = useStudentAI();

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  useEffect(() => {
    return () => {
      stopSpeaking();
    };
  }, [stopSpeaking]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputVal.trim() || isLoading) return;
    const text = inputVal.trim();
    setInputVal("");
    sendMessage(text);
  };

  return (
    <div className="min-h-screen bg-background pb-12">
      {/* Header */}
      <header className="border-b border-border bg-gradient-to-r from-primary/10 to-secondary/10 px-4 py-4">
        <div className="mx-auto max-w-6xl">
          <Button variant="ghost" onClick={() => navigate(-1)} className="mb-4">
            ← Back
          </Button>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="size-12 rounded-full bg-white dark:bg-zinc-800 p-1 flex items-center justify-center shrink-0 shadow-md border border-purple-200 dark:border-zinc-700">
                <img src="/logo (2).png" alt="Aoede Logo" className="size-full object-contain" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-foreground font-sans">Aoede</h1>
                <p className="text-sm text-muted-foreground">Conversational Voice & Text Study Companion</p>
              </div>
            </div>

            {/* Subject Selector & Audio Controls */}
            <div className="flex items-center gap-2">
              {availableSubjects.length > 0 && (
                <div className="flex items-center gap-2 bg-background/80 backdrop-blur p-1.5 rounded-xl border border-border">
                  <span className="text-xs font-medium text-muted-foreground pl-2">Subject:</span>
                  <select
                    value={activeSubject}
                    onChange={(e) => setActiveSubject(e.target.value)}
                    className="bg-transparent text-sm font-semibold text-foreground border-0 focus:ring-0 cursor-pointer pr-4"
                  >
                    {availableSubjects.map((s) => (
                      <option key={s} value={s} className="dark:bg-zinc-800">
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  if (isSpeaking) stopSpeaking();
                  setIsVoiceMode(prev => !prev);
                }}
                className={`rounded-xl ${isVoiceMode ? 'text-primary bg-primary/10 border-primary/30' : 'text-muted-foreground'}`}
                title={isVoiceMode ? "Voice playback active" : "Voice muted"}
              >
                {isVoiceMode ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Chat Section */}
          <div className="lg:col-span-2">
            <Card className="h-[640px] flex flex-col shadow-sm">
              <CardHeader className="border-b flex flex-row items-center justify-between py-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <img src="/logo (2).png" alt="Aoede" className="size-5 object-contain" />
                  Dialogue with Aoede — {activeSubject}
                </CardTitle>
                <div className="flex items-center gap-2">
                  {isSpeaking && (
                    <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 text-xs animate-pulse">
                      Aoede Speaking
                    </Badge>
                  )}
                  {isListening && (
                    <Badge variant="destructive" className="animate-ping text-xs">
                      Listening
                    </Badge>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearHistory}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    <RotateCcw className="h-3.5 w-3.5 mr-1" />
                    Reset
                  </Button>
                </div>
              </CardHeader>

              {/* Detected Assignments Bar */}
              {detectedAssignments.length > 0 && (
                <div className="bg-purple-50/60 dark:bg-purple-950/20 px-4 py-2 border-b border-purple-100 dark:border-zinc-800 flex items-center gap-2 overflow-x-auto scrollbar-hide">
                  <span className="text-xs font-semibold text-purple-900 dark:text-purple-300 shrink-0">
                    Active Assignment:
                  </span>
                  {detectedAssignments.map((a) => (
                    <Button
                      key={a.id}
                      variant={activeAssignment?.id === a.id ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        setActiveAssignment(a);
                        sendMessage(`I need help understanding my assignment ${a.title} in ${a.courseTitle}`);
                      }}
                      className="rounded-full text-xs shrink-0 h-7"
                    >
                      {a.title} ({a.courseTitle})
                    </Button>
                  ))}
                </div>
              )}

              <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"}`}
                  >
                    {msg.sender === "ai" && (
                      <div className="size-8 rounded-full bg-white dark:bg-zinc-800 p-0.5 flex items-center justify-center shrink-0 shadow-sm border border-purple-200 dark:border-zinc-700 mr-2 mt-1">
                        <img src="/logo (2).png" alt="Aoede" className="size-full object-contain" />
                      </div>
                    )}
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm ${
                        msg.sender === "user"
                          ? "bg-primary text-primary-foreground rounded-tr-none font-medium"
                          : "bg-muted text-foreground rounded-tl-none border border-border"
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap leading-relaxed font-sans">{msg.text}</p>
                      <span className="text-[10px] opacity-70 block text-right mt-1">{msg.time}</span>
                    </div>
                  </div>
                ))}

                {isLoading && (
                  <div className="flex justify-start items-center gap-2">
                    <div className="size-8 rounded-full bg-white dark:bg-zinc-800 p-0.5 flex items-center justify-center shrink-0 border border-purple-200">
                      <img src="/logo (2).png" alt="Aoede" className="size-full object-contain" />
                    </div>
                    <div className="bg-muted text-foreground rounded-2xl rounded-tl-none px-4 py-3 border border-border flex items-center gap-2">
                      <span className="text-xs text-primary font-medium">Aoede is thinking...</span>
                      <span className="size-1.5 rounded-full bg-primary animate-bounce"></span>
                      <span className="size-1.5 rounded-full bg-primary animate-bounce [animation-delay:0.2s]"></span>
                      <span className="size-1.5 rounded-full bg-primary animate-bounce [animation-delay:0.4s]"></span>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </CardContent>

              {/* Conversational Voice & Text Bar */}
              <div className="border-t p-3 bg-background">
                <form onSubmit={handleSendMessage} className="flex items-center gap-2">
                  <Button
                    type="button"
                    onClick={toggleListening}
                    variant={isListening ? "destructive" : "secondary"}
                    size="icon"
                    className={`rounded-xl shrink-0 ${isListening ? 'animate-pulse' : ''}`}
                    title={isListening ? "Listening... click to send" : "Speak to Aoede"}
                  >
                    {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                  </Button>

                  <Input
                    value={inputVal}
                    onChange={(e) => setInputVal(e.target.value)}
                    placeholder={isListening ? "Listening to your voice..." : `Ask Aoede anything about ${activeSubject}...`}
                    className="flex-1 rounded-xl"
                    disabled={isLoading}
                  />

                  <Button type="submit" size="icon" disabled={isLoading || !inputVal.trim()} className="rounded-xl shrink-0">
                    <Send className="h-4 w-4" />
                  </Button>
                </form>
              </div>
            </Card>
          </div>

          {/* AI Features Sidebar */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <img src="/logo (2).png" alt="Aoede" className="size-5 object-contain" />
                  Voice Mentor: Aoede
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Aoede is designed for instantaneous voice-to-voice and text discussion. Speak aloud or type your question naturally.
                </p>
                <div className="rounded-lg bg-primary/5 p-3 border border-primary/15">
                  <p className="text-xs font-semibold text-primary mb-1">Human Step-by-Step Guidance</p>
                  <p className="text-xs text-muted-foreground">
                    Aoede will never simply give you formulas or answers. She guides you step by step through your real assignments.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-primary/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base text-purple-700 dark:text-purple-300">
                  Detected Course Assignments
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {detectedAssignments.length > 0 ? (
                  detectedAssignments.map((a) => (
                    <div 
                      key={a.id} 
                      onClick={() => {
                        setActiveAssignment(a);
                        sendMessage(`I don't understand my ${a.title} assignment in ${a.courseTitle}, please help me.`);
                      }}
                      className="p-2.5 rounded-lg border border-purple-100 dark:border-zinc-800 bg-purple-50/40 dark:bg-zinc-850 hover:bg-purple-100/50 cursor-pointer transition-colors"
                    >
                      <p className="text-xs font-semibold text-gray-900 dark:text-zinc-100">{a.title}</p>
                      <p className="text-[11px] text-muted-foreground">{a.courseTitle} • {a.status}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground">No pending assignments found in your enrolled courses.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
};

export default AIFeatures;
