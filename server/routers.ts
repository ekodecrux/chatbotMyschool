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

// One Click Resource Center (OCRC) categories - PRIORITY SEARCH
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
  'profession': { path: '/views/academic/imagebank/professions', mu: 7 },
  'great personalities': { path: '/views/academic/imagebank/great-personalities', mu: 8 },
  'personalities': { path: '/views/academic/imagebank/great-personalities', mu: 8 },
  'comics': { path: '/views/sections/comics', mu: 8 },
  'comic': { path: '/views/sections/comics', mu: 8 },
  'rhymes': { path: '/views/sections/rhymes', mu: 1 },
  'rhyme': { path: '/views/sections/rhymes', mu: 1 },
  'stories': { path: '/views/sections/pictorial-stories', mu: 2 },
  'festivals': { path: '/views/sections/imagebank/festivals', mu: 0 },
  'vehicles': { path: '/views/sections/imagebank/vehicles', mu: 0 },
  'opposites': { path: '/views/sections/imagebank/opposites', mu: 0 },
  'habits': { path: '/views/sections/imagebank/habits', mu: 0 },
  'safety': { path: '/views/sections/safety', mu: 0 },
  'puzzles': { path: '/views/sections/puzzles-riddles', mu: 0 },
  'riddles': { path: '/views/sections/puzzles-riddles', mu: 0 },
};

// Animal keywords that should go to Animals OCRC
const ANIMAL_KEYWORDS = [
  'monkey', 'dog', 'cat', 'elephant', 'lion', 'tiger', 'cow', 'horse', 'rabbit', 'bear',
  'deer', 'giraffe', 'zebra', 'snake', 'frog', 'camel', 'goat', 'sheep', 'pig', 'fox',
  'wolf', 'cheetah', 'leopard', 'panda', 'koala', 'kangaroo', 'crocodile', 'turtle'
];

// Bird keywords
const BIRD_KEYWORDS = ['parrot', 'peacock', 'sparrow', 'crow', 'eagle', 'owl', 'pigeon', 'duck', 'hen', 'penguin'];

// Insect keywords
const INSECT_KEYWORDS = ['butterfly', 'bee', 'ant', 'spider', 'grasshopper', 'dragonfly', 'ladybug', 'mosquito'];

// Fish/Sea animal keywords
const FISH_KEYWORDS = ['fish', 'fishes', 'shark', 'whale', 'dolphin', 'octopus', 'jellyfish', 'crab'];

interface PortalResult {
  path: string;
  title: string;
  category: string;
  thumbnail: string;
  type: string;
  tags: string[];
}

/**
 * CRITICAL: Portal Backend Search is ALWAYS PRIORITY
 */
async function fetchPortalResults(query: string, size: number = 6): Promise<PortalResult[]> {
  try {
    console.log(`🔍 [PORTAL PRIORITY] Fetching results: "${query}"`);
    const results = await advancedSearch(query, PORTAL_API);
    console.log(`✅ [PORTAL] Returned ${results.length} results`);
    return results || [];
  } catch (error) {
    console.error('❌ [PORTAL] Error:', error);
    return [];
  }
}

const FALLBACK_SEARCHES: Record<string, string[]> = {
  default: ["animals", "flowers", "shapes", "numbers", "colors"],
  science: ["animals", "plants", "nature"],
  maths: ["numbers", "shapes", "geometry"],
};

async function findNearestResults(originalQuery: string): Promise<{ query: string; results: PortalResult[] }> {
  const category = Object.keys(FALLBACK_SEARCHES).find(cat => 
    originalQuery.toLowerCase().includes(cat)
  ) || "default";
  
  for (const fallback of FALLBACK_SEARCHES[category]) {
    const results = await fetchPortalResults(fallback, 6);
    if (results.length > 0) return { query: fallback, results };
  }
  return { query: "educational resources", results: [] };
}

// Subject name mappings for clean URLs
const SUBJECT_NAMES: Record<string, string> = {
  'english': 'english', 'eng': 'english',
  'maths': 'maths', 'math': 'maths', 'mathematics': 'maths',
  'science': 'science', 'sci': 'science', 'evs': 'evs',
  'social': 'social', 'gk': 'gk', 'computer': 'computer',
  'telugu': 'telugu', 'hindi': 'hindi', 'art': 'art', 'craft': 'craft',
};

// Greeting patterns
const GREETING_PATTERNS = [
  /^(hi|hello|hey|hii+|helo|hai|hola)\b/i,
  /^good\s*(morning|afternoon|evening|night)/i,
  /^(what'?s?\s*up|sup|yo|howdy|greetings|namaste)/i,
  /^(how\s*are\s*you|how\s*r\s*u)/i,
];

function isGreeting(message: string): boolean {
  return GREETING_PATTERNS.some(p => p.test(message.trim().toLowerCase()));
}

function parseClassSubject(query: string): { classNum: number | null; subject: string | null } {
  const classMatch = query.toLowerCase().match(/(?:class|grade|standard)\s*(\d+)/i);
  const subjectMatch = query.toLowerCase().match(/(?:maths|math|english|science|hindi|evs|art|craft|gk|computer|telugu)/i);
  return {
    classNum: classMatch ? parseInt(classMatch[1]) : null,
    subject: subjectMatch ? SUBJECT_NAMES[subjectMatch[0].toLowerCase()] || subjectMatch[0].toLowerCase() : null
  };
}

/**
 * Build URL with OCRC PRIORITY
 * 1. Check OCRC categories first
 * 2. Then class/subject navigation
 * 3. Then text search
 */
function buildSmartUrl(query: string, classNum: number | null, subject: string | null): string {
  const lowerQuery = query.toLowerCase().trim();
  
  // PRIORITY 1: Check OCRC categories
  if (OCRC_CATEGORIES[lowerQuery]) {
    return `${BASE_URL}${OCRC_CATEGORIES[lowerQuery].path}?main=2&mu=${OCRC_CATEGORIES[lowerQuery].mu}`;
  }
  
  // Check if query contains OCRC category
  for (const [cat, config] of Object.entries(OCRC_CATEGORIES)) {
    if (lowerQuery.includes(cat) || cat.includes(lowerQuery)) {
      return `${BASE_URL}${config.path}?main=2&mu=${config.mu}`;
    }
  }
  
  // Check animal keywords → Animals OCRC
  if (ANIMAL_KEYWORDS.some(a => lowerQuery.includes(a))) {
    return `${BASE_URL}/views/academic/imagebank/animals?main=2&mu=0`;
  }
  
  // Check bird keywords → Birds OCRC
  if (BIRD_KEYWORDS.some(b => lowerQuery.includes(b))) {
    return `${BASE_URL}/views/academic/imagebank/birds?main=2&mu=1`;
  }
  
  // Check insect keywords → Insects OCRC
  if (INSECT_KEYWORDS.some(i => lowerQuery.includes(i))) {
    return `${BASE_URL}/views/academic/imagebank/insects?main=2&mu=6`;
  }
  
  // Check fish keywords → Sea Animals
  if (FISH_KEYWORDS.some(f => lowerQuery.includes(f))) {
    return `${BASE_URL}/views/academic/imagebank/animals/sea-animals?main=2&mu=0`;
  }
  
  // PRIORITY 2: Class + Subject navigation
  if (classNum && subject) {
    return `${BASE_URL}/views/academic/class/class-${classNum}/${subject}`;
  } else if (classNum) {
    return `${BASE_URL}/views/academic/class/class-${classNum}`;
  }
  
  // PRIORITY 3: Text search fallback
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
            id: r.code || r.title,
            url: r.thumbnail || r.path,
            title: r.title,
            category: r.category,
          }));
          
          // Build URL using OCRC priority
          const url = buildSmartUrl(input.query, null, null);
          
          const resources = portalResults.length > 0 ? [{
            name: `Browse: "${input.query}"`,
            description: `Found ${portalResults.length} results`,
            url: url,
          }] : [];
          
          return { resources, images };
        } catch (error) {
          console.error("Autocomplete error:", error);
          return { resources: [], images: [] };
        }
      }),

    chat: publicProcedure
      .input(
        z.object({
          message: z.string(),
          sessionId: z.string(),
          language: z.string().optional(),
          history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })).optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { message, sessionId, language = "en", history = [] } = input;

        console.log(`\n🎯 === OCRC-PRIORITY SEARCH START ===`);
        console.log(`📝 Message: "${message}"`);

        // Check if greeting
        if (isGreeting(message)) {
          console.log(`👋 Greeting detected`);
          let aiMessage = "Hello! I'm your MySchool Assistant. How can I help you find educational resources today?";
          try {
            const aiResponse = await getAIResponse(message, history);
            if (aiResponse.message) aiMessage = aiResponse.message;
          } catch (e) { /* AI unavailable */ }
          
          await saveChatMessage({ sessionId, role: "user", message, language });
          await saveChatMessage({ sessionId, role: "assistant", message: aiMessage, language: "en" });
          
          return {
            response: aiMessage,
            resourceUrl: "",
            resourceName: "",
            resourceDescription: "",
            suggestions: ["Search for animals", "Class 5 Maths", "Browse flowers"],
            searchType: "greeting",
            thumbnails: [],
          };
        }

        // Translation if needed
        let searchQuery = message;
        if (language && language !== "en") {
          try {
            const result = await translateAndExtractKeyword(message, language);
            searchQuery = result.translated || message;
          } catch (e) { /* use original */ }
        }

        // Spell correction
        try {
          const corrected = await correctSpelling(searchQuery);
          if (corrected) searchQuery = corrected;
        } catch (e) { /* use original */ }

        // Parse class/subject
        const { classNum, subject } = parseClassSubject(searchQuery);
        
        // Build OCRC-priority URL
        const resourceUrl = buildSmartUrl(searchQuery, classNum, subject);
        console.log(`🔗 Smart URL: ${resourceUrl}`);

        // Fetch portal results
        let portalResults = await fetchPortalResults(searchQuery, 6);
        if (portalResults.length === 0) {
          const fallback = await findNearestResults(searchQuery);
          portalResults = fallback.results;
        }

        const thumbnails = portalResults.map(r => ({
          url: r.path,
          thumbnail: r.thumbnail,
          title: r.title,
          category: r.category,
        }));

        let responseMessage = portalResults.length > 0
          ? `Found ${portalResults.length} results for "${searchQuery}"`
          : `No results for "${searchQuery}". Try browsing our resources!`;

        // Save messages
        await saveChatMessage({ sessionId, role: "user", message, language });
        await saveChatMessage({ sessionId, role: "assistant", message: responseMessage, language: "en" });

        await logSearchQuery({
          sessionId,
          query: searchQuery,
          translatedQuery: searchQuery !== message ? searchQuery : null,
          language,
          resultsCount: thumbnails.length,
          topResultUrl: resourceUrl,
          topResultName: portalResults[0]?.title || "",
        });

        console.log(`✅ === OCRC-PRIORITY SEARCH COMPLETE ===\n`);

        return {
          response: responseMessage,
          resourceUrl,
          resourceName: portalResults.length > 0 ? `${portalResults.length} resources found` : "",
          resourceDescription: portalResults.slice(0, 3).map(r => r.title).join("\n"),
          suggestions: [],
          searchType: portalResults.length > 0 ? "direct_search" : "no_results",
          thumbnails,
        };
      }),
  }),
});

export type AppRouter = typeof appRouter;
