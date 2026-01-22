import { ChatWidget } from "@/components/ChatWidget";
import { GraduationCap } from "lucide-react";

export default function Home() {
  return (
    <div className="h-screen w-full flex flex-col bg-white overflow-hidden">
      {/* Sticky Header - Never scrolls */}
      <div className="sticky top-0 z-50 p-4 text-white flex items-center justify-between shrink-0 shadow-md" style={{ backgroundColor: "#E91E63" }}>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center">
            <GraduationCap className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold">MySchool Assistant</h1>
            <p className="text-xs opacity-80">Your intelligent guide for portal.myschoolct.com</p>
          </div>
        </div>
      </div>
      
      {/* Chat Widget - Scrollable content area */}
      <div className="flex-1 overflow-hidden">
        <ChatWidget isEmbedded={true} />
      </div>
      
      {/* Footer */}
      <div className="py-2 text-center text-gray-500 text-xs bg-white border-t shrink-0">
        <p>© 2026 MySchool Assistant. All rights reserved.</p>
      </div>
    </div>
  );
}
