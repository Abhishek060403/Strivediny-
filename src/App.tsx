import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Play, Square, Languages, MessageSquare, Settings2, Loader2, Volume2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { AudioStreamer, createLiveSession, LiveSessionConfig } from './services/geminiLive';
import { AudioVisualizer } from './components/AudioVisualizer';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  timestamp: number;
}

const LANGUAGES = [
  { code: 'English', name: 'English', flag: '🇺🇸' },
  { code: 'Spanish', name: 'Spanish', flag: '🇪🇸' },
  { code: 'French', name: 'French', flag: '🇫🇷' },
  { code: 'German', name: 'German', flag: '🇩🇪' },
  { code: 'Japanese', name: 'Japanese', flag: '🇯🇵' },
  { code: 'Korean', name: 'Korean', flag: '🇰🇷' },
  { code: 'Chinese', name: 'Chinese', flag: '🇨🇳' },
  { code: 'Italian', name: 'Italian', flag: '🇮🇹' },
];

const LEVELS = ['Beginner', 'Intermediate', 'Advanced'];

export default function App() {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [config, setConfig] = useState<LiveSessionConfig>({
    language: 'English',
    level: 'Beginner',
    topic: 'Ordering food at a restaurant',
  });
  
  const [userStream, setUserStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  
  const sessionRef = useRef<any>(null);
  const audioStreamerRef = useRef<AudioStreamer | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const startSession = async () => {
    setIsConnecting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setUserStream(stream);

      audioStreamerRef.current = new AudioStreamer();
      await audioStreamerRef.current.start();

      const session = await createLiveSession(
        process.env.GEMINI_API_KEY!,
        config,
        {
          onAudioData: (base64) => {
            audioStreamerRef.current?.playPCM(base64);
          },
          onTranscription: (text, isInterim, isModel) => {
            if (!isInterim) {
              setMessages(prev => {
                return [...prev, {
                  id: Math.random().toString(36).substr(2, 9),
                  text,
                  sender: isModel ? 'ai' : 'user',
                  timestamp: Date.now(),
                }];
              });
            }
          },
          onInterrupted: () => {
            console.log("AI Interrupted");
          },
          onError: (err) => {
            console.error("Session Error:", err);
            stopSession();
          },
          onClose: () => {
            console.log("Session Closed");
            stopSession();
          }
        }
      );

      sessionRef.current = session;

      const audioContext = new AudioContext({ sampleRate: 16000 });
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);

      source.connect(processor);
      processor.connect(audioContext.destination);

      processor.onaudioprocess = (e) => {
        if (isMuted) return;
        
        const inputData = e.inputBuffer.getChannelData(0);
        const pcmData = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
        }
        
        const base64Data = btoa(String.fromCharCode(...new Uint8Array(pcmData.buffer)));
        session.sendRealtimeInput({
          media: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
        });
      };

      setIsConnected(true);
    } catch (err) {
      console.error("Failed to start session:", err);
      alert("Could not access microphone or connect to AI. Please check permissions.");
    } finally {
      setIsConnecting(false);
    }
  };

  const stopSession = () => {
    sessionRef.current?.close();
    sessionRef.current = null;
    
    userStream?.getTracks().forEach(track => track.stop());
    setUserStream(null);
    
    audioStreamerRef.current?.stop();
    audioStreamerRef.current = null;
    
    setIsConnected(false);
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  return (
    <div className="relative min-h-screen overflow-hidden font-sans">
      <div className="fixed inset-0 atmosphere pointer-events-none" />

      <main className="relative z-10 max-w-5xl mx-auto px-6 py-12 h-screen flex flex-col">
        <header className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#ff4e00] rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/20">
              <Languages className="text-white w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-serif italic font-medium tracking-tight">strivediny</h1>
              <p className="text-xs text-white/50 uppercase tracking-widest font-mono">Real-time Language Partner</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {isConnected && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                <span className="text-xs font-medium text-emerald-500 uppercase tracking-wider">Live Session</span>
              </div>
            )}
          </div>
        </header>

        {!isConnected ? (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex-1 flex flex-col items-center justify-center"
          >
            <div className="glass-panel p-8 w-full max-w-md">
              <h2 className="text-xl font-serif italic mb-6 text-center">Customize Your Practice</h2>
              
              <div className="space-y-6">
                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-white/50 mb-2">Language</label>
                  <div className="grid grid-cols-4 gap-2">
                    {LANGUAGES.map(lang => (
                      <button
                        key={lang.code}
                        onClick={() => setConfig({ ...config, language: lang.code })}
                        className={cn(
                          "flex flex-col items-center justify-center p-2 rounded-xl border transition-all",
                          config.language === lang.code 
                            ? "bg-white/10 border-white/30 text-white" 
                            : "border-white/5 text-white/40 hover:bg-white/5"
                        )}
                      >
                        <span className="text-xl mb-1">{lang.flag}</span>
                        <span className="text-[10px] font-medium">{lang.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-white/50 mb-2">Proficiency Level</label>
                  <div className="flex gap-2">
                    {LEVELS.map(level => (
                      <button
                        key={level}
                        onClick={() => setConfig({ ...config, level })}
                        className={cn(
                          "flex-1 py-2 rounded-xl border text-xs font-medium transition-all",
                          config.level === level 
                            ? "bg-white/10 border-white/30 text-white" 
                            : "border-white/5 text-white/40 hover:bg-white/5"
                        )}
                      >
                        {level}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-white/50 mb-2">Practice Topic</label>
                  <input 
                    type="text"
                    value={config.topic}
                    onChange={(e) => setConfig({ ...config, topic: e.target.value })}
                    placeholder="e.g. Booking a hotel, Daily routine..."
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-white/30 transition-all"
                  />
                </div>

                <button
                  onClick={startSession}
                  disabled={isConnecting}
                  className="w-full bg-[#ff4e00] hover:bg-[#ff6a2a] disabled:opacity-50 text-white font-medium py-4 rounded-2xl shadow-xl shadow-orange-500/20 transition-all flex items-center justify-center gap-2 group"
                >
                  {isConnecting ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <Play className="w-5 h-5 fill-current group-hover:scale-110 transition-transform" />
                      Start Conversation
                    </>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        ) : (
          <div className="flex-1 flex flex-col gap-6 overflow-hidden">
            <div className="flex-1 glass-panel overflow-hidden flex flex-col">
              <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide">
                <AnimatePresence initial={false}>
                  {messages.length === 0 && (
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-40"
                    >
                      <MessageSquare className="w-12 h-12" />
                      <p className="font-serif italic text-lg">Start speaking to begin your practice session...</p>
                    </motion.div>
                  )}
                  {messages.map((msg) => (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      className={cn(
                        "flex flex-col max-w-[80%]",
                        msg.sender === 'user' ? "ml-auto items-end" : "mr-auto items-start"
                      )}
                    >
                      <div className={cn(
                        "px-4 py-3 rounded-2xl text-sm leading-relaxed",
                        msg.sender === 'user' 
                          ? "bg-white/10 text-white rounded-tr-none" 
                          : "bg-[#ff4e00]/20 text-white border border-[#ff4e00]/20 rounded-tl-none"
                      )}>
                        {msg.text}
                      </div>
                      <span className="text-[10px] font-mono text-white/30 mt-1 uppercase tracking-tighter">
                        {msg.sender === 'user' ? 'You' : 'Lingo'} • {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </motion.div>
                  ))}
                </AnimatePresence>
                <div ref={messagesEndRef} />
              </div>

              <div className="p-4 border-t border-white/5 bg-black/20 grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-[10px] font-mono uppercase tracking-widest text-white/40">Your Voice</span>
                    {isMuted && <MicOff className="w-3 h-3 text-red-500" />}
                  </div>
                  <AudioVisualizer stream={userStream} isActive={!isMuted} color="#ffffff" />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-[10px] font-mono uppercase tracking-widest text-white/40">AI Partner</span>
                    <Volume2 className="w-3 h-3 text-[#ff4e00]" />
                  </div>
                  <AudioVisualizer stream={userStream} isActive={true} color="#ff4e00" />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-center gap-6 pb-6">
              <button
                onClick={toggleMute}
                className={cn(
                  "w-14 h-14 rounded-full flex items-center justify-center transition-all border",
                  isMuted 
                    ? "bg-red-500/20 border-red-500/50 text-red-500" 
                    : "bg-white/5 border-white/10 text-white hover:bg-white/10"
                )}
              >
                {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
              </button>

              <button
                onClick={stopSession}
                className="w-20 h-20 bg-white text-black rounded-full flex items-center justify-center shadow-2xl hover:scale-105 transition-transform group"
              >
                <Square className="w-8 h-8 fill-current" />
              </button>

              <button
                className="w-14 h-14 rounded-full bg-white/5 border border-white/10 text-white flex items-center justify-center hover:bg-white/10 transition-all"
              >
                <Settings2 className="w-6 h-6" />
              </button>
            </div>
          </div>
        )}
      </main>

      <div className="fixed top-20 right-20 w-64 h-64 bg-[#ff4e00]/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="fixed bottom-20 left-20 w-96 h-96 bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none" />
    </div>
  );
}
