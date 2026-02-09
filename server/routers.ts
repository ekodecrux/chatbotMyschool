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

// Subject ID mappings for URL parameters
// main=0 is CLASS, mu is the class index (0=KG, 1=Class1, etc.)
// For subject-specific pages, we need different mu values based on content type
const SUBJECT_MAPPINGS: Record<string, number> = {
  'english': 0,
  'maths': 1,
  'math': 1,
  'mathematics': 1,
  'science': 8,
  'social': 2,
  'social studies': 2,
  'telugu': 3,
  'hindi': 4,
  'evs': 5,
  'environmental': 5,
  'gk': 6,
  'general knowledge': 6,
  'art': 7,
};

// Class index mappings (mu parameter)
const CLASS_INDEX: Record<number, number> = {
  0: 0,  // KG
  1: 1,  // Class 1
  2: 2,  // Class 2
  3: 3,  // Class 3
  4: 4,  // Class 4
  5: 5,  // Class 5
  6: 6,  // Class 6
  7: 7,  // Class 7
  8: 8,  // Class 8
  9: 9,  // Class 9
  10: 10, // Class 10
};

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
 * Build search URL with proper parameters
 * Format: /views/academic/class/class-X?main=0&mu=Y
 * Where X is class number and Y is class index (or subject-specific)
 */
function buildSearchUrl(aiResponse: any): string {
  if (aiResponse.searchType === "invalid") {
    return `${BASE_URL}/views/academic`;
  }
  
  if (aiResponse.searchType === "class_subject" && aiResponse.classNum) {
    const classNum = aiResponse.classNum;
    const subject = (aiResponse.subject || '').toLowerCase();
    const classIndex = CLASS_INDEX[classNum] || classNum;
    
    // Build URL with subject filter if available
    let url = `${BASE_URL}/views/academic/class/class-${classNum}?main=0&mu=${classIndex}`;
    
    // If subject is specified, try to add subject-specific parameter
    if (subject && SUBJECT_MAPPINGS[subject] !== undefined) {
      // For subject-specific content, update mu to subject mapping
      url = `${BASE_URL}/views/academic/class/class-${classNum}?main=0&mu=${SUBJECT_MAPPINGS[subject]}`;
    }
    
    return url;
  }
  
  // For direct searches, use /views/result?text=...
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
          
          // Determine the search query to use
          let effectiveSearchQuery = aiResponse.searchQuery;
          
          // For class_subject, construct a more specific search query
          if (aiResponse.searchType === "class_subject" && aiResponse.classNum) {
            const subject = aiResponse.subject || '';
            // Make search more specific by including class and subject
            effectiveSearchQuery = `class ${aiResponse.classNum} ${subject} charts`.trim();
          }

          // ===== CRITICAL: PORTAL BACKEND SEARCH IS ALWAYS PRIORITY =====
          if (effectiveSearchQuery) {
            console.log(`\n🔍 [PORTAL PRIORITY] Searching for: "${effectiveSearchQuery}"`);
            
            let portalResults = await fetchPortalResults(effectiveSearchQuery, 6);
            
            // If no results for specific query, try broader search
            if (portalResults.length === 0 && aiResponse.searchType === "class_subject") {
              const broaderQuery = aiResponse.subject || `class ${aiResponse.classNum}`;
              console.log(`⚠️ Zero results, trying broader: "${broaderQuery}"`);
              portalResults = await fetchPortalResults(broaderQuery, 6);
            }
            
            // If still no results, try fallback
            if (portalResults.length === 0) {
              console.log(`⚠️ Zero portal results, trying fallback...`);
              const fallback = await findNearestResults(effectiveSearchQuery);
              portalResults = fallback.results;
              
              if (portalResults.length > 0) {
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

          // Prepare final message
          let finalMessage = aiResponse.message;
          if (thumbnails.length > 0 && aiResponse.searchType !== "class_subject") {
            finalMessage = `Found ${thumbnails.length} results for "${aiResponse.searchQuery || effectiveSearchQuery}"`;
          }

          // Save chat messages
          await saveChatMessage({
            sessionId,
            role: "user",
            message,
            language: language || "en",
          });
          await saveChatMessage({
            sessionId,
            role: "assistant",
            message: finalMessage,
            language: "en",
          });

          // Log search
          if (effectiveSearchQuery) {
            await logSearchQuery({
              sessionId,
              query: effectiveSearchQuery,
              translatedQuery: translatedText !== message ? translatedText : null,
              language: language || "en",
              resultsCount: thumbnails.length,
              topResultUrl: resourceUrl || null,
              topResultName: resourceName || null,
            });
          }

          console.log(`✅ === PORTAL PRIORITY SEARCH COMPLETE ===\n`);

          return {
            response: finalMessage,
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
