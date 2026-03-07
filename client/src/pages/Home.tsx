import { ChatWidget } from "@/components/ChatWidget";
import { GraduationCap } from "lucide-react";
import { useState, useEffect } from "react";

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  hi: "हिंदी",
  te: "తెలుగు",
  gu: "ગુજરાતી"
};

export default function Home() {
  const [selectedLanguage, setSelectedLanguage] = useState<string>("en");

  useEffect(() => {
    const savedLanguage = localStorage.getItem("myschool_chat_language");
    if (savedLanguage) setSelectedLanguage(savedLanguage);

    const handleStorage = () => {
      const lang = localStorage.getItem("myschool_chat_language");
      if (lang) setSelectedLanguage(lang);
    };
    window.addEventListener("storage", handleStorage);
    
    const interval = setInterval(() => {
      const lang = localStorage.getItem("myschool_chat_language");
      if (lang && lang !== selectedLanguage) setSelectedLanguage(lang);
    }, 500);

    return () => { window.removeEventListener("storage", handleStorage); clearInterval(interval); };
  }, [selectedLanguage]);

  return (
    <div className="h-screen w-full flex flex-col bg-gradient-to-b from-gray-50 to-white overflow-hidden">
      {/* Header with gradient */}
      <div className="sticky top-0 z-50 px-4 py-3 text-white flex items-center justify-between shrink-0 shadow-lg" style={{ background: "linear-gradient(135deg, #E91E63 0%, #C2185B 100%)" }}>
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-full bg-white/25 backdrop-blur-sm flex items-center justify-center shadow-inner">
            <GraduationCap className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">MySchool Assistant</h1>
            <p className="text-xs opacity-90">Your intelligent guide for portal.myschoolct.com</p>
          </div>
        </div>
        <div className="bg-white/25 backdrop-blur-sm px-3 py-1.5 rounded-lg text-sm font-medium shadow-sm">
          {LANGUAGE_NAMES[selectedLanguage] || "English"}
        </div>
      </div>
      
      {/* Chat Widget */}
      <div className="flex-1 overflow-hidden">
        <ChatWidget isEmbedded={true} />
      </div>
      
      {/* Footer */}
      <div className="py-2 text-center text-gray-400 text-xs bg-white border-t border-gray-100 shrink-0">
        <p>© 2026 MySchool Assistant. All rights reserved.</p>
      </div>
    </div>
  );
}
