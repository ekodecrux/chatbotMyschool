import { z } from "zod";
import { router, publicProcedure } from "./_core/trpc";
import { performPrioritySearch, correctSpelling } from "./enhancedSemanticSearch";
import { getAIResponse } from "./groqAI";
import { saveChatMessage } from "./chatbotDb";
import { logSearchQuery } from "./analyticsDb";
import { translateAndExtractKeyword } from "./translation_util";

const BASE_URL = "https://portal.myschoolct.com";

function buildSearchUrl(aiResponse: any): string {
  if (aiResponse.searchType === "class_subject" && aiResponse.classNum) {
    if (aiResponse.subject) {
      const subjectCodes: any = { maths: "mat", science: "sci", english: "eng", hindi: "hin", telugu: "tel", social: "soc", evs: "evs", computer: "com" };
      const code = subjectCodes[aiResponse.subject.toLowerCase()] || "";
      if (code) return `${BASE_URL}/views/academic/class/class-${aiResponse.classNum}?main=1&mu=${code}`;
    }
    return `${BASE_URL}/views/academic/class/class-${aiResponse.classNum}`;
  }
  if (aiResponse.searchQuery) {
    return `${BASE_URL}/views/sections/result?text=${encodeURIComponent(aiResponse.searchQuery)}`;
  }
  return "";
}

export const appRouter = router({
  chatbot: router({
    autocomplete: publicProcedure
      .input(z.object({ query: z.string(), language: z.string().optional() }))
      .query(async ({ input }) => {
        if (input.query.length < 2) return { resources: [], images: [] };
        return { resources: [], images: [] };
      }),

    chat: publicProcedure
      .input(z.object({
        message: z.string(),
        sessionId: z.string(),
        language: z.string().optional(),
        history: z.array(z.object({ role: z.string(), content: z.string() })).optional()
      }))
      .mutation(async ({ input }) => {
        const { message, sessionId, language, history } = input;

        try {
          // Step 1: Detect and translate non-English queries (Telugu, Hindi, Gujarati, etc.)
          const translationResult = await translateAndExtractKeyword(message);
          const translatedMessage = translationResult.translatedText;
          
          // Step 2: Apply spell correction to the translated/original message
          const correctedMessage = correctSpelling(translatedMessage);
          
          // Get AI response with conversation context
          const aiResponse = await getAIResponse(correctedMessage, history || []);
          
          // Build URL based on AI understanding
          let resourceUrl = buildSearchUrl(aiResponse);
          let resourceName = "";
          let resourceDescription = "";

          // If AI identified a search, use our search logic for URL
          if (aiResponse.searchQuery && aiResponse.searchType !== "greeting" && aiResponse.searchType !== "clarification") {
            const searchResults = performPrioritySearch(aiResponse.searchQuery);
            if (searchResults.length > 0) {
              resourceUrl = searchResults[0].url;
              resourceName = searchResults[0].name;
              resourceDescription = searchResults[0].description;
            }
          }

          // Save to DB
          saveChatMessage({ sessionId, role: "user", message, language: language || "en" });
          saveChatMessage({ sessionId, role: "assistant", message: aiResponse.message, language: language || "en" });

          if (aiResponse.searchQuery) {
            logSearchQuery({
              query: message,
              translatedQuery: translatedMessage !== message ? translatedMessage : null,
              language: language || "en",
              resultsFound: resourceUrl ? 1 : 0,
              topResultUrl: resourceUrl,
              topResultName: resourceName,
              sessionId
            });
          }

          return {
            response: aiResponse.message,
            resourceUrl,
            resourceName,
            resourceDescription,
            suggestions: aiResponse.suggestions,
            searchType: aiResponse.searchType
          };

        } catch (error) {
          console.error("Chat error:", error);
          return {
            response: "I am here to help! What educational resources are you looking for?",
            resourceUrl: "",
            resourceName: "",
            resourceDescription: "",
            suggestions: ["Class 5 Maths", "Animal Images", "Exam Tips"],
            searchType: "greeting"
          };
        }
      }),
  }),
});

export type AppRouter = typeof appRouter;
