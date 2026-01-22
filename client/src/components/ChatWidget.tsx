import React, { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { MessageCircle, X, Send, Mic, Image as ImageIcon, Loader2, Volume2, VolumeX, Languages, ExternalLink, Search, GraduationCap } from "lucide-react";
import { Streamdown } from "streamdown";

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

export function ChatWidget({ autoOpen = false, isEmbedded = false }: ChatWidgetProps = {}) {
  const [isOpen, setIsOpen] = useState(isEmbedded || autoOpen);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [sessionId, setSessionId] = useState<string>("");
  const [isRecording, setIsRecording] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState<string>("en");
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
    
    if (savedSessionId) {
      setSessionId(savedSessionId);
    } else {
      const newSessionId = `session_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      setSessionId(newSessionId);
      localStorage.setItem("myschool_chat_session", newSessionId);
    }
    
    if (savedLanguage) {
      setSelectedLanguage(savedLanguage);
    }
    
    if (savedHistory) {
      try {
        setSearchHistory(JSON.parse(savedHistory));
      } catch (e) {}
    }
    
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
      "Try using voice input for hands-free learning!",
      "Explore our Smart Wall for interactive displays",
      "Check out the Image Bank with 80,000+ educational images"
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
        const transcript = event.results[0][0].transcript;
        setInputValue(transcript);
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
      
      if (isSpeaking) {
        const plainText = response.response.replace(/[*_~`#\[\]()]/g, "");
        speakText(plainText);
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
    if (isRecording) {
      recognitionRef.current.stop();
    } else {
      setIsRecording(true);
      recognitionRef.current.start();
    }
  };

  const speakText = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SynthesisUtterance(text);
      utterance.lang = selectedLanguage === 'en' ? 'en-US' : selectedLanguage === 'hi' ? 'hi-IN' : selectedLanguage === 'te' ? 'te-IN' : 'gu-IN';
      utterance.onend = () => setIsSpeaking(false);
      window.speechSynthesis.speak(utterance);
      setIsSpeaking(true);
    }
  };

  const stopSpeaking = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  };

  const handleImageError = (id: string) => {
    setImageErrors(prev => ({ ...prev, [id]: true }));
  };

  const chatContent = (
    <Card className={`${isEmbedded ? "w-full h-full border-none shadow-none rounded-none" : "fixed bottom-4 right-4 w-full max-w-[calc(100vw-2rem)] sm:w-96 h-[calc(100vh-2rem)] sm:h-[600px] sm:bottom-6 sm:right-6 shadow-2xl z-50 rounded-2xl"} flex flex-col overflow-hidden bg-white`}>
      {!isEmbedded && (
        <div className="p-4 text-white flex items-center justify-between shrink-0" style={{ backgroundColor: "#E91E63" }}>
          <div className="flex items-center gap-3 min-w-0 flex-1 overflow-hidden">
            <div className="h-10 w-10 rounded-full bg-white/20 flex-shrink-0 flex items-center justify-center">
              <GraduationCap className="h-6 w-6 text-white" />
            </div>
            <div className="min-w-0 flex-1 overflow-hidden">
              <h3 className="font-bold text-sm leading-tight truncate">MySchool Assistant</h3>
              <p className="text-[10px] opacity-80 truncate">Your intelligent guide for portal.myschoolct.com</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 ml-2 overflow-hidden">
            <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)} className="text-white hover:bg-pink-600 h-8 w-8">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {dailyTip && (
        <div className="px-4 py-2 bg-yellow-50 border-b border-yellow-100 text-[11px] flex items-center gap-2 shrink-0">
          <span className="font-bold text-yellow-800">💡 Tip:</span>
          <span className="text-yellow-700 truncate">{dailyTip}</span>
        </div>
      )}

      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/50 scroll-smooth">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center p-6 opacity-40">
            <MessageCircle className="h-12 w-12 mb-3" />
            <p className="text-sm font-medium">Hi! I'm your MySchool Navigator.</p>
          </div>
        )}
        {messages.map((msg, idx) => (
          <div 
            key={msg.id} 
            ref={idx === messages.length - 1 ? lastMessageRef : null}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div className={`max-w-[90%] p-3 rounded-2xl shadow-sm ${msg.role === "user" ? "bg-[#E91E63] text-white rounded-tr-none" : "bg-white border border-gray-100 text-gray-800 rounded-tl-none"}`}>
              <div className="text-sm leading-relaxed">
                {msg.role === "assistant" ? (
                  <div className="space-y-3">
                    {msg.resourceName && (
                      <div className="border-b border-gray-50 pb-2 mb-1">
                        <h4 className="font-bold text-gray-900 text-base">{msg.resourceName}</h4>
                        {msg.resourceDescription && <p className="text-xs text-gray-500 mt-0.5">{msg.resourceDescription}</p>}
                      </div>
                    )}
                    <Streamdown content={msg.content} />
                    {msg.resourceUrl && (
                      <div className="mt-2">
                        <a
                          href={msg.resourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center gap-2 w-full py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-all shadow-md active:scale-[0.98]"
                        >
                          Open Resource <ExternalLink className="h-4 w-4" />
                        </a>
                      </div>
                    )}
                  </div>
                ) : (
                  msg.content
                )}
              </div>
              <div className={`text-[9px] mt-1.5 opacity-50 ${msg.role === "user" ? "text-right" : "text-left"}`}>
                {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
          </div>
        ))}
        {chatMutation.isPending && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-100 p-3 rounded-2xl rounded-tl-none shadow-sm">
              <Loader2 className="h-4 w-4 animate-spin text-pink-500" />
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-gray-100 bg-white p-3 space-y-3 relative shrink-0">
        {showAutocomplete && inputValue.length >= 2 && (autocompleteQuery.data?.images?.length > 0 || autocompleteQuery.data?.resources?.length > 0) && (
          <div ref={autocompleteRef} className="absolute bottom-full left-3 right-3 mb-2 bg-white rounded-xl shadow-2xl border border-gray-100 overflow-hidden z-[60] animate-in slide-in-from-bottom-2 duration-200">
            {autocompleteQuery.data.images.length > 0 && (
              <div className="p-3 border-b border-gray-50">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Found Images</div>
                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                  {autocompleteQuery.data.images.map((img: any) => (
                    <div key={img.id} className="flex-shrink-0 w-16 group cursor-pointer" onClick={() => handleSendMessage(img.title)}>
                      <div className="aspect-square rounded-lg bg-gray-100 overflow-hidden border border-gray-100 group-hover:border-pink-300 transition-colors flex items-center justify-center">
                        {!imageErrors[img.id] ? (
                          <img 
                            src={img.url} 
                            alt={img.title} 
                            className="w-full h-full object-cover" 
                            onError={() => handleImageError(img.id)}
                          />
                        ) : (
                          <div className="text-[10px] font-bold text-pink-500 text-center px-1 leading-tight">
                            {img.title}
                          </div>
                        )}
                      </div>
                      <div className="text-[8px] text-gray-500 mt-1 truncate text-center">{img.title}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {autocompleteQuery.data.resources.length > 0 && (
              <div className="p-2">
                {autocompleteQuery.data.resources.map((res: any, idx: number) => (
                  <button
                    key={idx}
                    onClick={() => handleSendMessage(res.name)}
                    className="w-full flex items-center gap-3 p-2 hover:bg-gray-50 rounded-lg transition-colors text-left group"
                  >
                    <div className="h-7 w-7 rounded-md bg-pink-50 flex items-center justify-center group-hover:bg-pink-100 transition-colors">
                      <Search className="h-3.5 w-3.5 text-pink-500" />
                    </div>
                    <div>
                      <div className="text-xs font-medium text-gray-800">{res.name}</div>
                      <div className="text-[10px] text-gray-400 truncate max-w-[200px]">{res.description}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
            <button 
              onClick={() => handleSendMessage(inputValue)}
              className="w-full p-2.5 bg-gray-50 hover:bg-gray-100 text-[11px] text-gray-600 flex items-center justify-between transition-colors border-t border-gray-50"
            >
              <span className="flex items-center gap-2"><ImageIcon className="h-3.5 w-3.5" /> Search Images: "{inputValue}"</span>
              <ExternalLink className="h-3 w-3 opacity-40" />
            </button>
          </div>
        )}

        <div className="flex gap-2 items-center">
          <Button variant="outline" size="icon" onClick={() => setShowLanguageMenu(!showLanguageMenu)} className="h-9 w-9 rounded-xl border-gray-200">
            <Languages className="h-4 w-4 text-gray-600" />
          </Button>
          <Button variant="outline" size="icon" onClick={isSpeaking ? stopSpeaking : () => {}} className={`h-9 w-9 rounded-xl border-gray-200 ${isSpeaking ? "bg-green-50 border-green-200" : ""}`}>
            {isSpeaking ? <Volume2 className="h-4 w-4 text-green-600" /> : <VolumeX className="h-4 w-4 text-gray-600" />}
          </Button>
          <div className="flex-1 relative">
            <Input
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);
                setShowAutocomplete(true);
              }}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), handleSendMessage())}
              placeholder="Type your message..."
              className="h-10 rounded-xl border-gray-200 focus-visible:ring-[#E91E63] pr-10"
            />
          </div>
          <Button variant="outline" size="icon" onClick={startListening} className={`h-10 w-10 rounded-xl border-gray-200 ${isRecording ? "bg-pink-50 border-pink-200" : ""}`}>
            <Mic className={`h-4 w-4 ${isRecording ? "text-pink-600 animate-pulse" : "text-gray-600"}`} />
          </Button>
          <Button onClick={() => handleSendMessage()} disabled={!inputValue.trim() || chatMutation.isPending} className="h-10 w-10 rounded-xl shadow-md" style={{ backgroundColor: "#E91E63" }}>
            <Send className="h-4 w-4 text-white" />
          </Button>
        </div>

        {searchHistory.length > 0 && (
          <div className="pt-1">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 px-1">Recent Searches</div>
            <div className="flex flex-wrap gap-1.5">
              {searchHistory.map((query, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSendMessage(query)}
                  className="px-2.5 py-1 text-[11px] text-gray-600 bg-gray-50 hover:bg-gray-100 border border-gray-100 rounded-lg transition-colors truncate max-w-[120px]"
                >
                  {query}
                </button>
              ))}
            </div>
          </div>
        )}

        {showLanguageMenu && (
          <div className="pt-2 border-t border-gray-50">
            <div className="flex flex-wrap gap-1.5">
              {[{ name: "English", code: "en", flag: "🇺🇸" }, { name: "Hindi", code: "hi", flag: "🇮🇳" }, { name: "Telugu", code: "te", flag: "🇮🇳" }, { name: "Gujarati", code: "gu", flag: "🇮🇳" }].map((lang) => (
                <Button
                  key={lang.code}
                  variant={selectedLanguage === lang.code ? "default" : "outline"}
                  size="sm"
                  onClick={() => { setSelectedLanguage(lang.code); localStorage.setItem("myschool_chat_language", lang.code); setShowLanguageMenu(false); }}
                  className="h-7 text-[10px] rounded-lg"
                  style={selectedLanguage === lang.code ? { backgroundColor: "#E91E63" } : {}}
                >
                  {lang.flag} {lang.name}
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
        <Button onClick={() => setIsOpen(true)} className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 h-14 w-14 rounded-full shadow-2xl z-50 animate-bounce" style={{ backgroundColor: "#E91E63" }}>
          <MessageCircle className="h-6 w-6 text-white" />
        </Button>
      )}
      {isOpen && chatContent}
    </>
  );
}
