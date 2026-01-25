import { z } from "zod";
import { router, publicProcedure } from "./_core/trpc";
import { performPrioritySearch, correctSpelling } from "./enhancedSemanticSearch";
import { getAIResponse } from "./groqAI";
import { saveChatMessage } from "./chatbotDb";
import { logSearchQuery } from "./analyticsDb";
import { translateAndExtractKeyword } from "./translation_util";
import { advancedSearch, enhanceSearchQuery } from "./advancedSearch";

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
  expanded_terms: string[];
}

/**
 * CRITICAL: Portal Backend Search is ALWAYS PRIORITY
 * Uses advanced search (fuzzy + soundex + synonyms) on portal API
 */
async function fetchPortalResults(query: string, size: number = 6): Promise<PortalResult[]> {
  try {
    console.log(`🔍 [PORTAL PRIORITY] Fetching results with advanced search: "${query}"`);
    
    // Use advanced search with fuzzy matching, soundex, and synonyms
    const results = await advancedSearch(query, PORTAL_API);
    
    console.log(`✅ [PORTAL] Advanced search returned ${results.length} results`);
    return results || [];
  } catch (error) {
    console.error('❌ [PORTAL] Error in fetchPortalResults:', error);
    return [];
  }
}

const FALLBACK_SEARCHES: Record<string, string[]> = {
  default: ["animals", "flowers", "shapes", "numbers", "colors"],
  science: ["animals", "plants", "nature", "experiments"],
  maths: ["numbers", "shapes", "geometry", "addition"],
  english: ["alphabet", "words", "reading", "writing"],
  art: ["colors", "drawing", "painting", "shapes"],
  food: ["fruits", "vegetables", "food items"],
  nature: ["animals", "plants", "flowers", "trees"],
};

async function findNearestResults(originalQuery: string): Promise<{ query: string; results: PortalResult[] }> {
  const category = Object.keys(FALLBACK_SEARCHES).find(cat => 
    originalQuery.toLowerCase().includes(cat)
  ) || "default";
  
  const fallbacks = FALLBACK_SEARCHES[category];
  
  for (const fallback of fallbacks) {
    const results = await fetchPortalResults(fallback, 6);
    if (results.length > 0) {
      console.log(`✅ [FALLBACK] Found ${results.length} results for "${fallback}"`);
      return { query: fallback, results };
    }
  }
  
  const lastResort = await fetchPortalResults("educational resources", 6);
  return { query: "educational resources", results: lastResort };
}

/**
 * Build search URL - always use /views/result?text=... for direct searches
 */
function buildSearchUrl(aiResponse: any): string {
  if (aiResponse.searchType === "invalid") {
    return `${BASE_URL}/views/academic`;
  }
  
  if (aiResponse.searchType === "class_subject" && aiResponse.classNum) {
    return `${BASE_URL}/views/academic/class/class-${aiResponse.classNum}`;
  }
  
  // FIXED: Use /views/result?text=... (NOT /views/sections/result)
  if (aiResponse.searchQuery) {
    return `${BASE_URL}/views/result?text=${encodeURIComponent(aiResponse.searchQuery)}`;
  }
  
  return "";
}

export const appRouter = router({
  chatbot: router({
    autocomplete: publicProcedure
      .input(z.object({ query: z.string() }))
      .query(async ({ input }) => {
        if (input.query.length < 2) {
          return { resources: [], images: [] };
        }
        return { resources: [], images: [] };
      }),

    chat: publicProcedure
      .input(
        z.object({
          message: z.string(),
          sessionId: z.string(),
          language: z.string().optional(),
          history: z
            .array(
              z.object({
                role: z.enum(["user", "assistant"]),
                content: z.string(),
              })
            )
            .optional(),
        })
      )
      .mutation(async ({ input }) => {
        try {
          const { message, sessionId, language = "en", history = [] } = input;

          console.log(`\n🎯 === PORTAL PRIORITY SEARCH START ===`);
          console.log(`📝 User message: "${message}"`);
          console.log(`🌐 Language: ${language}`);

          // Step 1: Translation
          let translatedText = message;
          if (language && language !== "en") {
            const translationResult = await translateAndExtractKeyword(message, language);
            translatedText = translationResult.translated || message;
            console.log(`🌍 Translated "${message}" → "${translatedText}"`);
          }

          // Step 2: Spelling correction
          const correctedText = await correctSpelling(translatedText);
          console.log(`✏️ Spell-checked "${translatedText}" → "${correctedText}"`);

          // Step 3: AI response
          const aiResponse = await getAIResponse(correctedText, history);
          console.log(`🤖 AI Response:`, aiResponse);

          let resourceUrl = buildSearchUrl(aiResponse);
          let resourceName = "";
          let resourceDescription = "";
          let thumbnails: any[] = [];

          // ===== CRITICAL: PORTAL BACKEND SEARCH IS ALWAYS PRIORITY =====
          // For ANY searchQuery, fetch from portal first with advanced search
          if (aiResponse.searchQuery) {
            console.log(`\n🔍 [PORTAL PRIORITY] Searching for: "${aiResponse.searchQuery}"`);
            
            // ALWAYS fetch portal results with advanced search (fuzzy + soundex + synonyms)
            let portalResults = await fetchPortalResults(aiResponse.searchQuery, 6);
            
            // If no results, try fallback
            if (portalResults.length === 0) {
              console.log(`⚠️ Zero portal results for "${aiResponse.searchQuery}", trying fallback...`);
              const fallback = await findNearestResults(aiResponse.searchQuery);
              portalResults = fallback.results;
              
              if (portalResults.length > 0) {
                // Update URL to show fallback query
                resourceUrl = `${BASE_URL}/views/result?text=${encodeURIComponent(fallback.query)}`;
              }
            }

            // Build thumbnails array from portal results
            thumbnails = portalResults.map(r => ({
              url: r.path,
              thumbnail: r.thumbnail,
              title: r.title,
              category: r.category,
            }));

            // Build resource name and description
            if (portalResults.length > 0) {
              resourceName = `${portalResults.length} resources found`;
              resourceDescription = portalResults
                .slice(0, 3)
                .map(r => r.title)
                .join("\n");
              
              console.log(`✅ [PORTAL] Returning ${portalResults.length} results with thumbnails`);
            } else {
              resourceName = "Explore educational resources";
              resourceDescription = "Browse our collection of learning materials";
              resourceUrl = `${BASE_URL}/views/academic`;
            }
          }

          // Save chat messages
          await saveChatMessage(sessionId, "user", message, language || "en");
          await saveChatMessage(sessionId, "assistant", aiResponse.message, "en");

          // Log search
          if (aiResponse.searchQuery) {
            await logSearchQuery({
              sessionId,
              query: aiResponse.searchQuery,
              translatedQuery: translatedText !== message ? translatedText : null,
              language: language || "en",
              resultsCount: thumbnails.length,
              topResultUrl: resourceUrl || null,
              topResultName: resourceName || null,
            });
          }

          console.log(`✅ === PORTAL PRIORITY SEARCH COMPLETE ===\n`);

          return {
            response: aiResponse.message,
            resourceUrl,
            resourceName,
            resourceDescription,
            suggestions: aiResponse.suggestions || [],
            searchType: aiResponse.searchType,
            thumbnails,
          };
        } catch (error) {
          console.error("❌ Chat error:", error);
          return {
            response: "Hello! I'm your MySchool Assistant. How can I help you today?",
            resourceUrl: "",
            resourceName: "",
            resourceDescription: "",
            suggestions: ["Class 5 Maths", "Exam Tips", "Animals"],
            searchType: "greeting",
            thumbnails: [],
          };
        }
      }),
  }),
});

export type AppRouter = typeof appRouter;
