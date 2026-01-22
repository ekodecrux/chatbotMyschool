import { ChatWidget } from "@/components/ChatWidget";

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-4xl h-[85vh] rounded-2xl overflow-hidden bg-white flex flex-col">
        <ChatWidget isEmbedded={true} />
      </div>
      
      <div className="mt-6 text-center text-gray-500 text-sm">
        <p>© 2026 MySchool Assistant. All rights reserved.</p>
      </div>
    </div>
  );
}
