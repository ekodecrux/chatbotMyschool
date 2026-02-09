import React, { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { MessageCircle, X, Send, Mic, Image as ImageIcon, Loader2, Volume2, VolumeX, Languages, ExternalLink, Search, GraduationCap, Bot, User } from "lucide-react";
import { SimpleText } from "./SimpleText";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  suggestions?: string[];
  resourceUrl?: string;
  resourceName?: string;
  resourceDescription?: string;
}

interface ChatWidgetProps {
  autoOpen?: boolean;
  isEmbedded?: boolean;
}

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  hi: "Hindi",
  te: "Telugu",
  gu: "Gujarati"
};

export function ChatWidget({ autoOpen = false, isEmbedded = false }: ChatWidgetProps = {}) {
  const [isOpen, setIsOpen] = useState(isEmbedded || autoOpen);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [sessionId, setSessionId] = useState<string>("");
  const [isRecording, setIsRecording] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState<string>("en");
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);
  const [dailyTip, setDailyTip] = useState<string>("");
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastMessageRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const autocompleteRef = useRef<HTMLDivElement>(null);

  const chatMutation = trpc.chatbot.chat.useMutation();
  const autocompleteQuery = trpc.chatbot.autocomplete.useQuery(
    { query: inputValue, language: selectedLanguage },
    { enabled: inputValue.length >= 2 && showAutocomplete }
  );

  useEffect(() => {
    const savedSessionId = localStorage.getItem("myschool_chat_session");
    const savedLanguage = localStorage.getItem("myschool_chat_language");
    const savedHistory = localStorage.getItem("myschool_search_history");
    const savedVoice = localStorage.getItem("myschool_voice_enabled");
    
    if (savedSessionId) {
      setSessionId(savedSessionId);
    } else {
      const newSessionId = `session_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      setSessionId(newSessionId);
      localStorage.setItem("myschool_chat_session", newSessionId);
    }
    
    if (savedLanguage) setSelectedLanguage(savedLanguage);
    if (savedHistory) { try { setSearchHistory(JSON.parse(savedHistory)); } catch (e) {} }
    if (savedVoice === "true") setVoiceEnabled(true);
    
    setupSpeechRecognition();

    const handleClickOutside = (event: MouseEvent) => {
      if (autocompleteRef.current && !autocompleteRef.current.contains(event.target as Node)) {
        setShowAutocomplete(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const tips = [
      "Try voice input for hands-free search!",
      "Explore our Smart Wall for interactive learning",
      "Access 80,000+ educational images in Image Bank"
    ];
    setDailyTip(tips[Math.floor(Math.random() * tips.length)]);
  }, []);

  useEffect(() => {
    if (lastMessageRef.current) {
      lastMessageRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [messages]);

  const setupSpeechRecognition = () => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognitionConstructor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognitionConstructor();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      const langMap: Record<string, string> = { 'en': 'en-US', 'hi': 'hi-IN', 'te': 'te-IN', 'gu': 'gu-IN' };
      recognitionRef.current.lang = langMap[selectedLanguage] || 'en-US';
      recognitionRef.current.onresult = (event: any) => {
        setInputValue(event.results[0][0].transcript);
        setIsRecording(false);
        setShowAutocomplete(true);
      };
      recognitionRef.current.onerror = () => setIsRecording(false);
      recognitionRef.current.onend = () => setIsRecording(false);
    }
  };

  useEffect(() => {
    if (recognitionRef.current) {
      const langMap: Record<string, string> = { 'en': 'en-US', 'hi': 'hi-IN', 'te': 'te-IN', 'gu': 'gu-IN' };
      recognitionRef.current.lang = langMap[selectedLanguage] || 'en-US';
    }
  }, [selectedLanguage]);

  const toggleVoice = () => {
    const newValue = !voiceEnabled;
    setVoiceEnabled(newValue);
    localStorage.setItem("myschool_voice_enabled", String(newValue));
    if (!newValue && isSpeaking) stopSpeaking();
  };

  const handleSendMessage = async (messageText?: string) => {
    const textToSend = messageText || inputValue.trim();
    if (!textToSend) return;

    const userMessage: Message = {
      id: `user_${Date.now()}`,
      role: "user",
      content: textToSend,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setShowAutocomplete(false);
    
    setSearchHistory(prev => {
      const updated = [textToSend, ...prev.filter(q => q !== textToSend)].slice(0, 5);
      localStorage.setItem("myschool_search_history", JSON.stringify(updated));
      return updated;
    });

    try {
      const response = await chatMutation.mutateAsync({
        message: textToSend,
        sessionId: sessionId,
        language: selectedLanguage,
      });

      const assistantMessage: Message = {
        id: `assistant_${Date.now()}`,
        role: "assistant",
        content: response.response,
        resourceUrl: response.resourceUrl,
        resourceName: response.resourceName,
        resourceDescription: response.resourceDescription,
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
      
      if (voiceEnabled) {
        speakText(response.response.replace(/[*_~`#\[\]()]/g, ""));
      }
    } catch (error) {
      setMessages((prev) => [...prev, {
        id: `error_${Date.now()}`,
        role: "assistant",
        content: "Sorry, I encountered an error. Please try again.",
        timestamp: new Date().toISOString(),
      }]);
    }
  };

  const startListening = () => {
    if (!recognitionRef.current) return;
    if (isRecording) recognitionRef.current.stop();
    else { setIsRecording(true); recognitionRef.current.start(); }
  };

  const speakText = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = selectedLanguage === 'en' ? 'en-US' : selectedLanguage === 'hi' ? 'hi-IN' : selectedLanguage === 'te' ? 'te-IN' : 'gu-IN';
      utterance.onend = () => setIsSpeaking(false);
      window.speechSynthesis.speak(utterance);
      setIsSpeaking(true);
    }
  };

  const stopSpeaking = () => {
    if ('speechSynthesis' in window) { window.speechSynthesis.cancel(); setIsSpeaking(false); }
  };

  const getUniqueImages = (images: any[]) => {
    const seen = new Set<string>();
    return images.filter((img: any) => {
      const key = img.id || img.url;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const chatContent = (
    <Card className={`${isEmbedded ? "w-full h-full border-none shadow-none rounded-none" : "fixed bottom-4 right-4 w-full max-w-[calc(100vw-2rem)] sm:w-96 h-[calc(100vh-2rem)] sm:h-[600px] sm:bottom-6 sm:right-6 shadow-2xl z-50 rounded-2xl"} flex flex-col overflow-hidden bg-gradient-to-b from-gray-50 to-white`}>
      {!isEmbedded && (
        <div className="p-4 text-white flex items-center justify-between shrink-0 shadow-lg" style={{ background: "linear-gradient(135deg, #E91E63 0%, #C2185B 100%)" }}>
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="h-11 w-11 rounded-full bg-white/25 backdrop-blur-sm flex items-center justify-center shadow-inner">
              <GraduationCap className="h-6 w-6 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-base leading-tight">MySchool Assistant</h3>
              <p className="text-[11px] opacity-90">Your intelligent guide</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 ml-2">
            <div className="bg-white/25 backdrop-blur-sm px-2.5 py-1 rounded-lg text-xs font-medium shadow-sm">
              {LANGUAGE_NAMES[selectedLanguage] || "English"}
            </div>
            <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)} className="text-white hover:bg-white/20 h-9 w-9 rounded-full">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {dailyTip && (
        <div className="px-4 py-2.5 bg-gradient-to-r from-amber-50 to-yellow-50 border-b border-amber-100/50 text-xs flex items-center gap-2 shrink-0">
          <span className="text-amber-500 text-lg">💡</span>
          <span className="text-amber-800 font-medium">{dailyTip}</span>
        </div>
      )}

      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-pink-100 to-pink-50 flex items-center justify-center mb-4 shadow-lg">
              <Bot className="h-10 w-10 text-pink-500" />
            </div>
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Welcome!</h3>
            <p className="text-sm text-gray-500 max-w-[250px]">I'm your MySchool Navigator. Ask me about classes, subjects, or resources!</p>
            <div className="mt-6 flex flex-wrap gap-2 justify-center">
              {["Class 5 Maths", "Science Videos", "Exam Tips"].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => handleSendMessage(suggestion)}
                  className="px-3 py-1.5 text-xs font-medium text-pink-600 bg-pink-50 hover:bg-pink-100 rounded-full transition-all hover:scale-105 shadow-sm"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}
        
        {messages.map((msg, idx) => (
          <div 
            key={msg.id} 
            ref={idx === messages.length - 1 ? lastMessageRef : null}
            className={`flex items-end gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"} animate-in slide-in-from-bottom-2 duration-300`}
          >
            {msg.role === "assistant" && (
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-500 to-pink-600 flex items-center justify-center shadow-md flex-shrink-0">
                <Bot className="h-4 w-4 text-white" />
              </div>
            )}
            <div className={`max-w-[80%] p-3.5 shadow-md ${msg.role === "user" 
              ? "bg-gradient-to-br from-pink-500 to-pink-600 text-white rounded-2xl rounded-br-md" 
              : "bg-white text-gray-800 rounded-2xl rounded-bl-md border border-gray-100"}`}
            >
              <div className="text-sm leading-relaxed">
                {msg.role === "assistant" ? (
                  <div className="space-y-3">
                    {msg.resourceName && (
                      <div className="border-b border-gray-100 pb-2 mb-2">
                        <h4 className="font-semibold text-gray-900">{msg.resourceName}</h4>
                        {msg.resourceDescription && <p className="text-xs text-gray-500 mt-1">{msg.resourceDescription}</p>}
                      </div>
                    )}
                    <SimpleText content={msg.content} />
                    {msg.resourceUrl && (
                      <a
                        href={msg.resourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 flex items-center justify-center gap-2 w-full py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl text-sm font-semibold hover:from-blue-600 hover:to-blue-700 transition-all shadow-md hover:shadow-lg active:scale-[0.98]"
                      >
                        Open Resource <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                ) : msg.content}
              </div>
              <div className={`text-[10px] mt-2 ${msg.role === "user" ? "text-white/70 text-right" : "text-gray-400"}`}>
                {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
            {msg.role === "user" && (
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-600 to-gray-700 flex items-center justify-center shadow-md flex-shrink-0">
                <User className="h-4 w-4 text-white" />
              </div>
            )}
          </div>
        ))}
        
        {chatMutation.isPending && (
          <div className="flex items-end gap-2 justify-start animate-in slide-in-from-bottom-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-500 to-pink-600 flex items-center justify-center shadow-md">
              <Bot className="h-4 w-4 text-white" />
            </div>
            <div className="bg-white p-4 rounded-2xl rounded-bl-md shadow-md border border-gray-100">
              <div className="flex gap-1.5">
                <div className="w-2 h-2 bg-pink-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <div className="w-2 h-2 bg-pink-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <div className="w-2 h-2 bg-pink-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-gray-100 bg-white p-3 space-y-3 relative shrink-0 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
        {showAutocomplete && inputValue.length >= 2 && (autocompleteQuery.data?.images?.length > 0 || autocompleteQuery.data?.resources?.length > 0) && (
          <div ref={autocompleteRef} className="absolute bottom-full left-3 right-3 mb-2 bg-white rounded-xl shadow-2xl border border-gray-100 overflow-hidden z-[60]">
            {autocompleteQuery.data.images.length > 0 && (
              <div className="p-3 border-b border-gray-50">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Found Images</div>
                <div className="flex gap-3 overflow-x-auto pb-1 px-2 scrollbar-hide">
                  {getUniqueImages(autocompleteQuery.data.images).map((img: any) => (
                    <div key={img.id} className="flex-shrink-0 w-16 group cursor-pointer" onClick={() => handleSendMessage(img.title)}>
                      <div className="aspect-square rounded-lg bg-gray-100 overflow-hidden border-2 border-transparent group-hover:border-pink-400 transition-all">
                        <img src={img.url} alt={img.title} className="w-full h-full object-cover" onError={(e) => (e.currentTarget.style.display = 'none')} />
                      </div>
                      <div className="text-[9px] text-gray-500 mt-1 truncate text-center">{img.title}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {autocompleteQuery.data.resources.length > 0 && (
              <div className="p-2">
                {autocompleteQuery.data.resources.map((res: any, idx: number) => (
                  <button key={idx} onClick={() => handleSendMessage(res.name)} className="w-full flex items-center gap-3 p-2.5 hover:bg-pink-50 rounded-lg transition-colors text-left group">
                    <div className="h-8 w-8 rounded-lg bg-pink-100 flex items-center justify-center group-hover:bg-pink-200 transition-colors">
                      <Search className="h-4 w-4 text-pink-600" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-800">{res.name}</div>
                      <div className="text-xs text-gray-400 truncate max-w-[200px]">{res.description}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2 items-center">
          <Button variant="outline" size="icon" onClick={() => setShowLanguageMenu(!showLanguageMenu)} className="h-10 w-10 rounded-xl border-gray-200 hover:bg-gray-50 hover:border-gray-300 transition-all" title="Change Language">
            <Languages className="h-4 w-4 text-gray-600" />
          </Button>
          <Button variant="outline" size="icon" onClick={toggleVoice} className={`h-10 w-10 rounded-xl transition-all ${voiceEnabled ? "bg-green-50 border-green-300 hover:bg-green-100" : "border-gray-200 hover:bg-gray-50"}`} title={voiceEnabled ? "Voice ON" : "Voice OFF"}>
            {voiceEnabled ? <Volume2 className="h-4 w-4 text-green-600" /> : <VolumeX className="h-4 w-4 text-gray-400" />}
          </Button>
          <div className="flex-1 relative">
            <Input
              value={inputValue}
              onChange={(e) => { setInputValue(e.target.value); setShowAutocomplete(true); }}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), handleSendMessage())}
              placeholder="Ask me anything..."
              className="h-11 rounded-xl border-gray-200 focus-visible:ring-pink-500 focus-visible:border-pink-300 pr-10 text-sm"
            />
          </div>
          <Button variant="outline" size="icon" onClick={startListening} className={`h-10 w-10 rounded-xl transition-all ${isRecording ? "bg-pink-50 border-pink-300 animate-pulse" : "border-gray-200 hover:bg-gray-50"}`} title="Voice input">
            <Mic className={`h-4 w-4 ${isRecording ? "text-pink-600" : "text-gray-600"}`} />
          </Button>
          <Button onClick={() => handleSendMessage()} disabled={!inputValue.trim() || chatMutation.isPending} className="h-11 w-11 rounded-xl shadow-lg hover:shadow-xl transition-all disabled:opacity-50" style={{ background: "linear-gradient(135deg, #E91E63 0%, #C2185B 100%)" }}>
            <Send className="h-4 w-4 text-white" />
          </Button>
        </div>

        {searchHistory.length > 0 && !showLanguageMenu && (
          <div className="pt-1">
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">Recent</div>
            <div className="flex flex-wrap gap-1.5">
              {searchHistory.slice(0, 3).map((query, idx) => (
                <button key={idx} onClick={() => handleSendMessage(query)} className="px-3 py-1.5 text-xs text-gray-600 bg-gray-50 hover:bg-gray-100 border border-gray-100 rounded-full transition-all hover:scale-105 truncate max-w-[120px]">
                  {query}
                </button>
              ))}
            </div>
          </div>
        )}

        {showLanguageMenu && (
          <div className="pt-2 border-t border-gray-50">
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Select Language</div>
            <div className="flex flex-wrap gap-2">
              {[{ name: "English", code: "en" }, { name: "हिंदी", code: "hi" }, { name: "తెలుగు", code: "te" }, { name: "ગુજરાતી", code: "gu" }].map((lang) => (
                <Button
                  key={lang.code}
                  variant={selectedLanguage === lang.code ? "default" : "outline"}
                  size="sm"
                  onClick={() => { setSelectedLanguage(lang.code); localStorage.setItem("myschool_chat_language", lang.code); setShowLanguageMenu(false); }}
                  className={`h-8 text-xs rounded-lg transition-all ${selectedLanguage === lang.code ? "shadow-md" : "hover:scale-105"}`}
                  style={selectedLanguage === lang.code ? { background: "linear-gradient(135deg, #E91E63 0%, #C2185B 100%)" } : {}}
                >
                  {lang.name}
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );

  return isEmbedded ? chatContent : (
    <>
      {!isOpen && (
        <Button onClick={() => setIsOpen(true)} className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 h-14 w-14 rounded-full shadow-2xl z-50 hover:scale-110 transition-transform" style={{ background: "linear-gradient(135deg, #E91E63 0%, #C2185B 100%)" }}>
          <MessageCircle className="h-6 w-6 text-white" />
        </Button>
      )}
      {isOpen && chatContent}
    </>
  );
}
