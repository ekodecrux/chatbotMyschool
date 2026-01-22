import { z } from "zod";
import { router, publicProcedure } from "./_core/trpc";
import { performPrioritySearch, getSuggestions } from "./enhancedSemanticSearch";
import { translateAndExtractKeyword } from "./translation_util";
import { saveChatMessage } from "./chatbotDb";
import { logSearchQuery } from "./analyticsDb";

// Greetings and casual phrases
const GREETINGS = ["hi", "hello", "hey", "hii", "hiii", "good morning", "good afternoon", "good evening", "namaste", "howdy", "sup", "yo"];
const CASUAL_PHRASES = ["how are you", "what's up", "whatsup", "wassup", "thank you", "thanks", "bye", "goodbye", "ok", "okay", "hmm", "what", "who are you", "help"];

function isGreetingOrCasual(text: string): boolean {
  const lower = text.toLowerCase().trim();
  return GREETINGS.some(g => lower === g || lower.startsWith(g + " ")) || 
         CASUAL_PHRASES.some(p => lower.includes(p));
}

function getInteractiveResponse(text: string): { response: string; suggestions: string[] } {
  const lower = text.toLowerCase().trim();
  
  if (GREETINGS.some(g => lower === g || lower.startsWith(g + " "))) {
    return {
      response: "Hello! 👋 I'm your MySchool Assistant. I can help you find educational resources. What are you looking for today?",
      suggestions: ["Class 5 Maths", "Animals Images", "Telugu Poems", "Science Experiments"]
    };
  }
  
  if (lower.includes("thank")) {
    return {
      response: "You're welcome! 😊 Is there anything else I can help you find?",
      suggestions: ["Image Bank", "Smart Wall", "MCQ Bank"]
    };
  }
  
  if (lower.includes("help") || lower.includes("what can you do")) {
    return {
      response: "I can help you find:\n• **Class Resources** - Try \"Class 5 Science\"\n• **Images** - Try \"Animals\" or \"Flowers\"\n• **Study Materials** - Try \"MCQ Bank\" or \"Exam Tips\"\n\nJust type what you're looking for!",
      suggestions: ["Class 3 English", "Lion Images", "Telugu Stories"]
    };
  }
  
  if (lower.includes("who are you")) {
    return {
      response: "I'm MySchool Assistant - your intelligent guide to portal.myschoolct.com! I help students and teachers find educational resources quickly. Try searching for a topic!",
      suggestions: ["Animals", "Class 4 Maths", "Smart Wall"]
    };
  }
  
  return {
    response: "I'm not sure what you're looking for. Could you try searching for something specific like:\n• A class and subject (e.g., \"Class 5 Science\")\n• An image topic (e.g., \"Animals\", \"Flowers\")\n• A resource (e.g., \"MCQ Bank\", \"Smart Wall\")",
    suggestions: ["Class 6 Maths", "Tiger Images", "Exam Tips"]
  };
}

export const appRouter = router({
  chatbot: router({
    autocomplete: publicProcedure
      .input(z.object({
        query: z.string(),
        language: z.string().optional()
      }))
      .query(async ({ input }) => {
        const { query, language } = input;
        if (query.length < 2) return { resources: [], images: [] };

        let processedQuery = query;
        if (language && language !== 'en') {
          const translation = await translateAndExtractKeyword(query);
          processedQuery = translation.keyword;
        }

        const rawSuggestions = getSuggestions(processedQuery);
        
        return {
          resources: rawSuggestions.map(s => ({
            name: s.name,
            url: s.url,
            description: s.description
          })).slice(0, 4),
          images: []
        };
      }),

    chat: publicProcedure
      .input(
        z.object({
          message: z.string(),
          sessionId: z.string(),
          language: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { message, sessionId, language } = input;

        try {
          // Check for greetings/casual first
          if (isGreetingOrCasual(message)) {
            const interactive = getInteractiveResponse(message);
            
            saveChatMessage({ sessionId, role: "user", message, language: language || "en" });
            saveChatMessage({ sessionId, role: "assistant", message: interactive.response, language: language || "en" });
            
            return {
              response: interactive.response,
              resourceUrl: "",
              resourceName: "",
              resourceDescription: "",
              suggestions: interactive.suggestions
            };
          }

          let queryToSearch = message;
          let translatedQuery = null;
          
          if (language && language !== 'en') {
            const translationResult = await translateAndExtractKeyword(message);
            translatedQuery = translationResult.translatedText;
            queryToSearch = translationResult.keyword;
          }

          const searchResults = performPrioritySearch(queryToSearch);
          const topResult = searchResults[0];

          // Check if no good match
          const isNoMatch = topResult.confidence < 0.3 || topResult.category === 'none';
          
          let responseText = "";
          let finalUrl = topResult.url;
          let finalName = topResult.name;
          let finalDescription = topResult.description;

          if (isNoMatch) {
            responseText = "Relevant results not found. Please find nearest matching results below.";
            finalUrl = "https://portal.myschoolct.com/views/academic";
            finalName = "Browse Academic Resources";
            finalDescription = "Explore all academic resources, classes, and subjects";
          } else {
            responseText = `**${topResult.name}**`;
          }

          saveChatMessage({ sessionId, role: "user", message, language: language || "en" });
          saveChatMessage({ sessionId, role: "assistant", message: responseText, language: language || "en" });

          logSearchQuery({
            query: message,
            translatedQuery,
            language: language || "en",
            resultsFound: !isNoMatch ? 1 : 0,
            topResultUrl: finalUrl,
            topResultName: finalName,
            sessionId,
          });

          return {
            response: responseText,
            resourceUrl: finalUrl,
            resourceName: finalName,
            resourceDescription: finalDescription,
          };

        } catch (error) {
          console.error("Chat error:", error);
          throw new Error("Internal server error");
        }
      }),
  }),
});

export type AppRouter = typeof appRouter;
