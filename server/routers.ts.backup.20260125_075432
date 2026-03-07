import { z } from "zod";
import { router, publicProcedure } from "./_core/trpc";
import { performPrioritySearch, correctSpelling } from "./enhancedSemanticSearch";
import { getAIResponse } from "./groqAI";
import { saveChatMessage } from "./chatbotDb";
import { logSearchQuery } from "./analyticsDb";
import { translateAndExtractKeyword } from "./translation_util";

const BASE_URL = "https://portal.myschoolct.com";
const PORTAL_API = "https://portal.myschoolct.com/api/rest/search/global";

interface PortalResult {
  path: string;
  title: string;
  category: string;
  thumbnail: string;
  type: string;
  tags: string[];
}

interface PortalSearchResponse {
  results: PortalResult[];
  total: number;
  query: string;
  expanded_terms?: string[];
}

async function fetchPortalResults(query: string, size: number = 6): Promise<PortalSearchResponse> {
  try {
    const response = await fetch(`${PORTAL_API}?query=${encodeURIComponent(query)}&size=${size}`);
    if (!response.ok) {
      console.error("Portal API error:", response.status);
      return { results: [], total: 0, query };
    }
    return await response.json();
  } catch (error) {
    console.error("Failed to fetch portal results:", error);
    return { results: [], total: 0, query };
  }
}

// Fallback search terms for common queries with no results
const FALLBACK_SEARCHES: Record<string, string[]> = {
  "default": ["animals", "flowers", "shapes", "numbers", "colors"],
  "science": ["animals", "plants", "nature", "experiments"],
  "maths": ["numbers", "shapes", "geometry", "addition"],
  "english": ["alphabet", "words", "reading", "writing"],
  "art": ["colors", "drawing", "painting", "shapes"],
  "food": ["fruits", "vegetables", "food items"],
  "nature": ["animals", "plants", "flowers", "trees"]
};

async function findNearestResults(originalQuery: string): Promise<PortalSearchResponse> {
  console.log(`No results for "${originalQuery}", trying fallback searches...`);
  
  // Try related fallback terms
  const lowerQuery = originalQuery.toLowerCase();
  let fallbackTerms = FALLBACK_SEARCHES["default"];
  
  // Find matching category
  for (const [category, terms] of Object.entries(FALLBACK_SEARCHES)) {
    if (lowerQuery.includes(category)) {
      fallbackTerms = terms;
      break;
    }
  }
  
  // Try each fallback term
  for (const term of fallbackTerms) {
    const results = await fetchPortalResults(term, 6);
    if (results.results.length > 0) {
      console.log(`Found ${results.results.length} results for fallback term "${term}"`);
      return results;
    }
  }
  
  // Last resort: try "educational resources"
  return await fetchPortalResults("educational resources", 6);
}

function buildSearchUrl(aiResponse: any): string {
  // For invalid/gibberish input, route to academic page
  if (aiResponse.searchType === "invalid") {
    return `${BASE_URL}/views/academic`;
  }
  // For class-based queries, use simple class URL without parameters
  if (aiResponse.searchType === "class_subject" && aiResponse.classNum) {
    return `${BASE_URL}/views/academic/class/class-${aiResponse.classNum}`;
  }
  // For all other queries, use search results
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
          // Step 1: Detect and translate non-English queries
          const translationResult = await translateAndExtractKeyword(message);
          const translatedMessage = translationResult.translatedText;
          
          // Step 2: Apply spell correction
          const correctedMessage = correctSpelling(translatedMessage);
          
          // Step 3: Get AI response
          const aiResponse = await getAIResponse(correctedMessage, history || []);
          
          // Step 4: Build URL and fetch thumbnails
          let resourceUrl = buildSearchUrl(aiResponse);
          let resourceName = "";
          let resourceDescription = "";
          let thumbnails: PortalResult[] = [];
          let usedFallback = false;

          // ===== CRITICAL FIX: For direct_search, ONLY use portal API =====
          if (aiResponse.searchType === "direct_search" && aiResponse.searchQuery) {
            console.log(`🔍 Direct search for: "${aiResponse.searchQuery}"`);
            const portalResults = await fetchPortalResults(aiResponse.searchQuery, 6);
            
            // CRITICAL: If no results, try fallback searches
            if (portalResults.results.length === 0) {
              console.log(`Zero results for "${aiResponse.searchQuery}", using fallback`);
              const fallbackResults = await findNearestResults(aiResponse.searchQuery);
              thumbnails = fallbackResults.results;
              usedFallback = true;
              
              // Update URL to show fallback search term if we have results
              if (thumbnails.length > 0) {
                resourceUrl = `${BASE_URL}/views/sections/result?text=${encodeURIComponent(fallbackResults.query)}`;
              }
            } else {
              thumbnails = portalResults.results;
              console.log(`✅ Found ${thumbnails.length} portal results for "${aiResponse.searchQuery}"`);
            }
            
            // Build resource info
            if (thumbnails.length > 0) {
              resourceName = usedFallback 
                ? `Showing related resources (${thumbnails.length} found)` 
                : `${thumbnails.length} resources found`;
              resourceDescription = thumbnails.map(r => r.title).slice(0, 3).join(", ");
            } else {
              // Absolute fallback: if still no results, show generic educational content
              resourceUrl = `${BASE_URL}/views/sections/result?text=educational+resources`;
              resourceName = "Explore educational resources";
              resourceDescription = "Browse our collection of learning materials";
            }
          } else if (aiResponse.searchQuery && aiResponse.searchType !== "greeting" && aiResponse.searchType !== "direct_search") {
            // ===== CRITICAL FIX: ONLY use performPrioritySearch for class_subject, NOT for direct_search =====
            console.log(`🔍 Using performPrioritySearch for class_subject query: "${aiResponse.searchQuery}"`);
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
              resultsFound: thumbnails.length || (resourceUrl ? 1 : 0),
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
            searchType: aiResponse.searchType,
            thumbnails: thumbnails.map(t => ({
              url: t.path,
              thumbnail: t.thumbnail,
              title: t.title,
              category: t.category
            }))
          };

        } catch (error) {
          console.error("Chat error:", error);
          return {
            response: "I am here to help! What educational resources are you looking for?",
            resourceUrl: "",
            resourceName: "",
            resourceDescription: "",
            suggestions: ["Animals", "Class 5 Maths", "Exam Tips"],
            searchType: "greeting",
            thumbnails: []
          };
        }
      }),
  }),
});

export type AppRouter = typeof appRouter;
