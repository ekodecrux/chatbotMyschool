import { z } from "zod";
import { router, publicProcedure } from "./_core/trpc";
import { performPrioritySearch, getSuggestions } from "./enhancedSemanticSearch";
import { translateAndExtractKeyword } from "./translation_util";
import { saveChatMessage } from "./chatbotDb";
import { logSearchQuery } from "./analyticsDb";

// Refined image thumbnail logic with strict relevance and Image Bank priority
const getRelevantImageThumbnails = (query: string) => {
  const q = query.toLowerCase().trim();
  if (q.length < 2) return [];

  const allImages = [
    { id: 'lion1', title: 'Lion', url: 'https://portal.myschoolct.com/assets/thumbnails/lion.jpg', keywords: ['lion', 'animal', 'cat'] },
    { id: 'monkey1', title: 'Monkey', url: 'https://portal.myschoolct.com/assets/thumbnails/monkey.jpg', keywords: ['monkey', 'animal', 'primate'] },
    { id: 'elephant1', title: 'Elephant', url: 'https://portal.myschoolct.com/assets/thumbnails/elephant.jpg', keywords: ['elephant', 'animal', 'mammal'] },
    { id: 'tiger1', title: 'Tiger', url: 'https://portal.myschoolct.com/assets/thumbnails/tiger.jpg', keywords: ['tiger', 'animal', 'cat'] },
    { id: 'maths1', title: 'Maths', url: 'https://portal.myschoolct.com/assets/thumbnails/maths.jpg', keywords: ['maths', 'mathematics', 'numbers'] },
    { id: 'science1', title: 'Science', url: 'https://portal.myschoolct.com/assets/thumbnails/science.jpg', keywords: ['science', 'experiment', 'lab'] }
  ];

  return allImages.filter(img => 
    img.title.toLowerCase().includes(q) || 
    img.keywords.some(k => k.includes(q))
  ).slice(0, 4);
};

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
        const images = getRelevantImageThumbnails(processedQuery);

        let filteredResources = rawSuggestions.filter(s => {
          const name = s.name.toLowerCase();
          if (images.length > 0 && name.includes('mcq')) return false;
          return true;
        });

        if (images.length > 0) {
          const imageBank = {
            name: "Image Bank - One Click Resource Centre",
            url: "https://portal.myschoolct.com/views/sections/image-bank",
            description: "Access 80,000+ educational images and visual resources."
          };
          filteredResources = filteredResources.filter(r => !r.name.toLowerCase().includes('image bank'));
          filteredResources.unshift(imageBank);
        }

        return {
          resources: filteredResources.map(s => ({
            name: s.name,
            url: s.url,
            description: s.description
          })).slice(0, 3),
          images: images
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
          let queryToSearch = message;
          let translatedQuery = null;
          
          if (language && language !== 'en') {
            const translationResult = await translateAndExtractKeyword(message);
            translatedQuery = translationResult.translatedText;
            queryToSearch = translationResult.keyword;
          }

          const searchResults = performPrioritySearch(queryToSearch);
          const topResult = searchResults[0];

          // Check if this is a low-confidence or no-match result
          const isNoMatch = topResult.confidence < 0.3 || topResult.category === 'none' || topResult.category === 'search';
          
          let responseText = "";
          let finalUrl = topResult.url;
          let finalName = topResult.name;
          let finalDescription = topResult.description;

          if (isNoMatch) {
            // Show fallback message with academic browse URL
            responseText = "Relevant results not found. Please find nearest matching results below.";
            finalUrl = "https://portal.myschoolct.com/views/academic";
            finalName = "Browse Academic Resources";
            finalDescription = "Explore all academic resources, classes, and subjects";
          } else if (topResult.confidence === 0) {
            responseText = topResult.description;
          } else {
            responseText = `**${topResult.name}**`;
          }

          saveChatMessage({
            sessionId,
            role: "user",
            message: message,
            language: language || "en",
          });

          saveChatMessage({
            sessionId,
            role: "assistant",
            message: responseText,
            language: language || "en",
          });

          logSearchQuery({
            query: message,
            translatedQuery: translatedQuery,
            language: language || "en",
            resultsFound: !isNoMatch ? 1 : 0,
            topResultUrl: finalUrl,
            topResultName: finalName,
            sessionId: sessionId,
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
