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

const OCRC_CATEGORIES: Record<string, { path: string; mu: number }> = {
  'animals': { path: '/views/academic/imagebank/animals', mu: 0 },
  'animal': { path: '/views/academic/imagebank/animals', mu: 0 },
  'birds': { path: '/views/academic/imagebank/birds', mu: 1 },
  'bird': { path: '/views/academic/imagebank/birds', mu: 1 },
  'flowers': { path: '/views/academic/imagebank/flowers', mu: 2 },
  'flower': { path: '/views/academic/imagebank/flowers', mu: 2 },
  'fruits': { path: '/views/academic/imagebank/fruits', mu: 3 },
  'fruit': { path: '/views/academic/imagebank/fruits', mu: 3 },
  'vegetables': { path: '/views/academic/imagebank/vegetables', mu: 4 },
  'vegetable': { path: '/views/academic/imagebank/vegetables', mu: 4 },
  'plants': { path: '/views/academic/imagebank/plants', mu: 5 },
  'plant': { path: '/views/academic/imagebank/plants', mu: 5 },
  'insects': { path: '/views/academic/imagebank/insects', mu: 6 },
  'insect': { path: '/views/academic/imagebank/insects', mu: 6 },
  'professions': { path: '/views/academic/imagebank/professions', mu: 7 },
  'comics': { path: '/views/sections/comics', mu: 8 },
  'rhymes': { path: '/views/sections/rhymes', mu: 1 },
  'stories': { path: '/views/sections/pictorial-stories', mu: 2 },
  'festivals': { path: '/views/sections/imagebank/festivals', mu: 0 },
  'vehicles': { path: '/views/sections/imagebank/vehicles', mu: 0 },
  'puzzles': { path: '/views/sections/puzzles-riddles', mu: 0 },
};

const SUBJECT_MU: Record<string, number> = {
  'english': 0, 'eng': 0,
  'hindi': 1,
  'telugu': 2,
  'evs': 3, 'science': 3, 'sci': 3,
  'maths': 4, 'math': 4, 'mathematics': 4,
  'gk': 5, 'general knowledge': 5,
  'computer': 6, 'computers': 6, 'it': 6,
  'art': 7, 'drawing': 7,
  'craft': 8, 'crafts': 8,
  'stories': 9, 'story': 9,
  'charts': 10, 'chart': 10,
};

const AGE_TO_CLASS: Record<number, string> = {
  3: 'nursery', 4: 'lkg', 5: 'ukg',
  6: 'class-1', 7: 'class-2', 8: 'class-3', 9: 'class-4', 10: 'class-5',
  11: 'class-6', 12: 'class-7', 13: 'class-8', 14: 'class-9', 15: 'class-10',
};

interface PortalResult {
  path: string; title: string; category: string; thumbnail: string; type: string; tags: string[];
}

async function fetchPortalResults(query: string, size: number = 6): Promise<PortalResult[]> {
  try {
    console.log(`🔍 [PORTAL] Fetching: "${query}"`);
    const results = await advancedSearch(query, PORTAL_API);
    console.log(`✅ [PORTAL] Found ${results.length} results`);
    return results || [];
  } catch (error) {
    console.error('❌ [PORTAL] Error:', error);
    return [];
  }
}

const FALLBACK_SEARCHES: Record<string, string[]> = {
  default: ["animals", "flowers", "shapes", "numbers"],
};

async function findNearestResults(originalQuery: string): Promise<{ query: string; results: PortalResult[] }> {
  for (const fallback of FALLBACK_SEARCHES.default) {
    const results = await fetchPortalResults(fallback, 6);
    if (results.length > 0) return { query: fallback, results };
  }
  return { query: "educational resources", results: [] };
}

// Greeting patterns
const GREETING_PATTERNS = [/^(hi|hello|hey|hii+|helo|hai|hola)\b/i, /^good\s*(morning|afternoon|evening)/i, /^(what'?s?\s*up|howdy|greetings|namaste)/i];

function isGreeting(message: string): boolean {
  return GREETING_PATTERNS.some(p => p.test(message.trim().toLowerCase()));
}

// Find subject mu from query
function findSubjectMu(query: string): number | null {
  const lowerQuery = query.toLowerCase();
  for (const [subj, mu] of Object.entries(SUBJECT_MU)) {
    if (lowerQuery.includes(subj)) return mu;
  }
  return null;
}

// Parse class and subject from query
function parseClassSubject(query: string): { classNum: number | null; subjectMu: number | null } {
  const classMatch = query.toLowerCase().match(/(?:class|grade|standard)\s*(\d+)/i);
  const subjectMu = findSubjectMu(query);
  return {
    classNum: classMatch ? parseInt(classMatch[1]) : null,
    subjectMu
  };
}

// Parse age from query
function parseAge(query: string): number | null {
  const ageMatch = query.toLowerCase().match(/(?:age|year|years?\s*old)\s*(\d+)/i) || query.match(/(\d+)\s*(?:year|years?\s*old)/i);
  return ageMatch ? parseInt(ageMatch[1]) : null;
}

function buildSmartUrl(query: string, classNum: number | null, subjectMu: number | null): string {
  const lowerQuery = query.toLowerCase().trim();

  // Only redirect to OCRC for exact category matches (e.g., "animals", "birds")
  // Specific items like "monkey", "lion" should go to search results
  if (OCRC_CATEGORIES[lowerQuery]) {
    return `${BASE_URL}${OCRC_CATEGORIES[lowerQuery].path}?main=2&mu=${OCRC_CATEGORIES[lowerQuery].mu}`;
  }

  // Age-based navigation (Age 6 = Class 1, Age 8 = Class 3)
  const age = parseAge(lowerQuery);
  if (age && AGE_TO_CLASS[age]) {
    const className = AGE_TO_CLASS[age];
    if (subjectMu !== null) {
      return `${BASE_URL}/views/academic/class/${className}?main=0&mu=${subjectMu}`;
    }
    return `${BASE_URL}/views/academic/class/${className}`;
  }

  // Class + Subject navigation
  if (classNum && classNum >= 1 && classNum <= 10) {
    const className = `class-${classNum}`;
    if (subjectMu !== null) {
      return `${BASE_URL}/views/academic/class/${className}?main=0&mu=${subjectMu}`;
    }
    return `${BASE_URL}/views/academic/class/${className}`;
  }

  // Kindergarten
  const kinderMatch = lowerQuery.match(/\b(nursery|lkg|ukg)\b/i);
  if (kinderMatch) {
    const kinderClass = kinderMatch[1].toLowerCase();
    if (subjectMu !== null) {
      return `${BASE_URL}/views/academic/class/${kinderClass}?main=0&mu=${subjectMu}`;
    }
    return `${BASE_URL}/views/academic/class/${kinderClass}`;
  }

  // Default to text search for specific items (monkey, lion, etc.)
  return `${BASE_URL}/views/result?text=${encodeURIComponent(query)}`;
}

export const appRouter = router({
  chatbot: router({
    autocomplete: publicProcedure
      .input(z.object({ query: z.string(), language: z.string().optional() }))
      .query(async ({ input }) => {
        if (input.query.length < 2) return { resources: [], images: [] };
        try {
          const portalResults = await fetchPortalResults(input.query, 6);
          const images = portalResults.map((r: any) => ({
            id: r.code || r.title, url: r.thumbnail || r.path, title: r.title, category: r.category,
          }));
          const { classNum, subjectMu } = parseClassSubject(input.query);
          const url = buildSmartUrl(input.query, classNum, subjectMu);
          const resources = portalResults.length > 0 ? [{
            name: `Browse: "${input.query}"`, description: `Found ${portalResults.length} results`, url: url,
          }] : [];
          return { resources, images };
        } catch (error) {
          console.error("Autocomplete error:", error);
          return { resources: [], images: [] };
        }
      }),

    chat: publicProcedure
      .input(z.object({
        message: z.string(), sessionId: z.string(), language: z.string().optional(),
        history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })).optional(),
      }))
      .mutation(async ({ input }) => {
        const { message, sessionId, language = "en", history = [] } = input;
        console.log(`\n🎯 === SEARCH START: "${message}" ===`);

        // Greeting check
        if (isGreeting(message)) {
          console.log(`👋 Greeting detected`);
          let aiMessage = "Hello! I'm your MySchool Assistant. How can I help you find educational resources today?";
          try { const r = await getAIResponse(message, history); if (r.message) aiMessage = r.message; } catch (e) {}
          await saveChatMessage({ sessionId, role: "user", message, language });
          await saveChatMessage({ sessionId, role: "assistant", message: aiMessage, language: "en" });
          return { response: aiMessage, resourceUrl: "", resourceName: "", resourceDescription: "",
            suggestions: ["Search animals", "Class 5 Maths", "Age 8 resources"], searchType: "greeting", thumbnails: [] };
        }

        // Translation if needed
        let searchQuery = message;
        if (language && language !== "en") {
          try { const r = await translateAndExtractKeyword(message, language); searchQuery = r.translated || message; } catch (e) {}
        }

        // Spell correction
        try { const c = await correctSpelling(searchQuery); if (c) searchQuery = c; } catch (e) {}

        // Parse class/subject
        const { classNum, subjectMu } = parseClassSubject(searchQuery);

        // Build URL with correct format
        const resourceUrl = buildSmartUrl(searchQuery, classNum, subjectMu);
        console.log(`🔗 Smart URL: ${resourceUrl}`);

        // Fetch portal results
        let portalResults = await fetchPortalResults(searchQuery, 6);
        if (portalResults.length === 0) {
          const fallback = await findNearestResults(searchQuery);
          portalResults = fallback.results;
        }

        const thumbnails = portalResults.map(r => ({ url: r.path, thumbnail: r.thumbnail, title: r.title, category: r.category }));
        let responseMessage = portalResults.length > 0 ? `Found ${portalResults.length} results for "${searchQuery}"` : `No results for "${searchQuery}". Try browsing our resources!`;

        await saveChatMessage({ sessionId, role: "user", message, language });
        await saveChatMessage({ sessionId, role: "assistant", message: responseMessage, language: "en" });
        await logSearchQuery({ sessionId, query: searchQuery, translatedQuery: searchQuery !== message ? searchQuery : null, language, resultsCount: thumbnails.length, topResultUrl: resourceUrl, topResultName: portalResults[0]?.title || "" });

        console.log(`✅ === SEARCH COMPLETE ===\n`);
        return { response: responseMessage, resourceUrl, resourceName: portalResults.length > 0 ? `${portalResults.length} resources found` : "",
          resourceDescription: portalResults.slice(0, 3).map(r => r.title).join("\n"), suggestions: [], searchType: portalResults.length > 0 ? "direct_search" : "no_results", thumbnails };
      }),
  }),
});

export type AppRouter = typeof appRouter;
