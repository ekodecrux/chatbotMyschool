import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { X, ChevronRight, ChevronLeft } from "lucide-react";

interface OnboardingTutorialProps {
  onComplete: () => void;
}

const tutorialSteps = [
  {
    title: "Welcome to MySchool Assistant! 👋",
    description: "Let me show you how to use this chatbot to navigate demo.myschool.in easily.",
    image: "🎓",
  },
  {
    title: "Voice Input 🎤",
    description: "Click the microphone button to speak your questions naturally. The chatbot understands English, Hindi, Telugu, and Gujarati!",
    image: "🗣️",
  },
  {
    title: "Image Analysis 📸",
    description: "Upload images of textbook pages, worksheets, or diagrams. The AI will analyze them and suggest relevant MySchool resources.",
    image: "🖼️",
  },
  {
    title: "Language Support 🌐",
    description: "Switch between English, Hindi, Telugu, and Gujarati using the language selector. Your preference is saved automatically!",
    image: "🌍",
  },
];

export default function OnboardingTutorial({ onComplete }: OnboardingTutorialProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const hasSeenTutorial = localStorage.getItem("myschool-tutorial-seen");
    if (!hasSeenTutorial) {
      setTimeout(() => setIsVisible(true), 500);
    }
  }, []);

  const handleNext = () => {
    if (currentStep < tutorialSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = () => {
    localStorage.setItem("myschool-tutorial-seen", "true");
    setIsVisible(false);
    onComplete();
  };

  const handleSkip = () => {
    localStorage.setItem("myschool-tutorial-seen", "true");
    setIsVisible(false);
    onComplete();
  };

  if (!isVisible) return null;

  const step = tutorialSteps[currentStep];

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md relative animate-in fade-in zoom-in duration-300">
        <button
          onClick={handleSkip}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Close tutorial"
        >
          <X className="h-5 w-5" />
        </button>

        <CardContent className="pt-8 pb-6 px-6">
          <div className="text-center mb-6">
            <div className="text-6xl mb-4">{step.image}</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-3">{step.title}</h2>
            <p className="text-gray-600 leading-relaxed">{step.description}</p>
          </div>

          <div className="flex items-center justify-center gap-2 mb-6">
            {tutorialSteps.map((_, index) => (
              <div
                key={index}
                className={`h-2 rounded-full transition-all duration-300 ${
                  index === currentStep
                    ? "w-8 bg-pink-600"
                    : "w-2 bg-gray-300"
                }`}
              />
            ))}
          </div>

          <div className="flex gap-3">
            {currentStep > 0 && (
              <Button
                variant="outline"
                onClick={handlePrevious}
                className="flex-1"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Previous
              </Button>
            )}
            
            <Button
              onClick={handleNext}
              className="flex-1 bg-pink-600 hover:bg-pink-700 text-white"
            >
              {currentStep === tutorialSteps.length - 1 ? (
                "Get Started"
              ) : (
                <>
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </>
              )}
            </Button>
          </div>

          <button
            onClick={handleSkip}
            className="w-full text-center text-sm text-gray-500 hover:text-gray-700 mt-4 transition-colors"
          >
            Don't show this again
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
