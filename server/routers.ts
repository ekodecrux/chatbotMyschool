import { z } from "zod";
import { router, publicProcedure } from "./_core/trpc";
import { getAIResponse } from "./groqAI";
import { saveChatMessage } from "./chatbotDb";
import { logSearchQuery } from "./analyticsDb";
import { translateAndExtractKeyword } from "./translation_util";

const BASE_URL = "https://portal.myschoolct.com";
const PORTAL_API = "https://portal.myschoolct.com/api/rest/search/global";

// Number of results to show in chatbot (top 5)
const CHATBOT_RESULTS_LIMIT = 5;

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
  'maths': 4, 'math': 4, 'mathematics': 4, 'mathes': 4,
  'gk': 5, 'general knowledge': 5,
  'computer': 6, 'computers': 6, 'it': 6,
  'art': 7, 'drawing': 7,
  'craft': 8, 'crafts': 8,
  'stories': 9, 'story': 9,
  'charts': 10, 'chart': 10,
};

// Subject name mappings for search queries
const SUBJECT_NAMES: Record<string, string> = {
  'english': 'english', 'eng': 'english',
  'hindi': 'hindi',
  'telugu': 'telugu',
  'evs': 'evs', 'science': 'science', 'sci': 'science',
  'maths': 'maths', 'math': 'maths', 'mathematics': 'maths', 'mathes': 'maths',
  'gk': 'general knowledge', 'general knowledge': 'general knowledge',
  'computer': 'computer', 'computers': 'computer', 'it': 'computer',
  'art': 'art', 'drawing': 'art',
  'craft': 'craft', 'crafts': 'craft',
  'stories': 'stories', 'story': 'stories',
  'charts': 'charts', 'chart': 'charts',
};

const AGE_TO_CLASS: Record<number, string> = {
  3: 'nursery', 4: 'lkg', 5: 'ukg',
  6: 'class-1', 7: 'class-2', 8: 'class-3', 9: 'class-4', 10: 'class-5',
  11: 'class-6', 12: 'class-7', 13: 'class-8', 14: 'class-9', 15: 'class-10',
};

interface PortalResult {
  path: string; 
  title: string; 
  category: string; 
  thumbnail: string; 
  type: string; 
  tags: string[];
  code?: string;
}

// Check if a result is an actual image (has valid thumbnail URL)
function isValidImageResult(result: PortalResult): boolean {
  if (!result.thumbnail) return false;
  
  const isImageUrl = result.thumbnail.includes('.jpg') || 
                     result.thumbnail.includes('.jpeg') || 
                     result.thumbnail.includes('.png') || 
                     result.thumbnail.includes('.gif') ||
                     result.thumbnail.includes('.webp') ||
                     result.thumbnail.includes('r2.dev');
  
  const isNotCategory = !['Academic', 'Edutainment', 'Section', 'Category'].includes(result.title);
  
  return isImageUrl && isNotCategory;
}

// Normalize class queries: "3rd class", "3 rd class", "class 3" all become "class 3"
function normalizeClassQuery(query: string): string {
  let normalized = query.toLowerCase().trim();
  
  // Pattern 1: "3rd class", "3 rd class", "3rd-class" -> "class 3"
  normalized = normalized.replace(/(\d+)\s*(?:st|nd|rd|th)?\s*[-]?\s*class/gi, 'class $1');
  
  // Pattern 2: "class-3" -> "class 3"
  normalized = normalized.replace(/class\s*-\s*(\d+)/gi, 'class $1');
  
  // Clean up extra spaces
  normalized = normalized.replace(/\s+/g, ' ').trim();
  
  return normalized;
}

// Find subject name from query
function findSubjectName(query: string): string | null {
  const lowerQuery = query.toLowerCase();
  for (const [subj, name] of Object.entries(SUBJECT_NAMES)) {
    if (lowerQuery.includes(subj)) return name;
  }
  return null;
}

// Direct portal API call - returns only valid image results (limited to requested size)
async function fetchPortalResultsDirect(query: string, size: number = CHATBOT_RESULTS_LIMIT): Promise<PortalResult[]> {
  try {
    console.log(`🔍 [PORTAL] Fetching: "${query}" (size: ${size})`);
    
    const url = `${PORTAL_API}?query=${encodeURIComponent(query)}&size=${size + 5}`; // Fetch extra to filter
    const response = await fetch(url);
    
    if (!response.ok) {
      console.log(`⚠️ [PORTAL] API error: ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    
    if (!data.results || data.results.length === 0) {
      console.log(`⚠️ [PORTAL] No results for "${query}"`);
      return [];
    }
    
    // Filter to only include valid image results and limit to requested size
    const validResults = data.results
      .filter((r: PortalResult) => isValidImageResult(r))
      .slice(0, size);
    
    console.log(`✅ [PORTAL] Found ${validResults.length} valid images for "${query}"`);
    return validResults;
  } catch (error) {
    console.error('❌ [PORTAL] Error:', error);
    return [];
  }
}

// Greeting patterns
const GREETING_PATTERNS = [/^(hi|hello|hey|hii+|helo|hai|hola)\b/i, /^good\s*(morning|afternoon|evening)/i, /^(what'?s?\s*up|howdy|greetings|namaste)/i];

function isGreeting(message: string): boolean {
  return GREETING_PATTERNS.some(p => p.test(message.trim().toLowerCase()));
}

function findSubjectMu(query: string): number | null {
  const lowerQuery = query.toLowerCase();
  for (const [subj, mu] of Object.entries(SUBJECT_MU)) {
    if (lowerQuery.includes(subj)) return mu;
  }
  return null;
}

function parseClassSubject(query: string): { classNum: number | null; subjectMu: number | null; subjectName: string | null } {
  // Normalize the query first
  const normalizedQuery = normalizeClassQuery(query);
  
  // Match "class X" pattern (after normalization)
  const classMatch = normalizedQuery.match(/class\s*(\d+)/i);
  const subjectMu = findSubjectMu(normalizedQuery);
  const subjectName = findSubjectName(normalizedQuery);
  
  return {
    classNum: classMatch ? parseInt(classMatch[1]) : null,
    subjectMu,
    subjectName
  };
}

function parseAge(query: string): number | null {
  const ageMatch = query.toLowerCase().match(/(?:age|year|years?\s*old)\s*(\d+)/i) || query.match(/(\d+)\s*(?:year|years?\s*old)/i);
  return ageMatch ? parseInt(ageMatch[1]) : null;
}

function buildSmartUrl(query: string, classNum: number | null, subjectMu: number | null): string {
  const lowerQuery = query.toLowerCase().trim();

  if (OCRC_CATEGORIES[lowerQuery]) {
    return `${BASE_URL}${OCRC_CATEGORIES[lowerQuery].path}?main=2&mu=${OCRC_CATEGORIES[lowerQuery].mu}`;
  }

  const age = parseAge(lowerQuery);
  if (age && AGE_TO_CLASS[age]) {
    const className = AGE_TO_CLASS[age];
    if (subjectMu !== null) {
      return `${BASE_URL}/views/academic/class/${className}?main=0&mu=${subjectMu}`;
    }
    return `${BASE_URL}/views/academic/class/${className}`;
  }

  if (classNum && classNum >= 1 && classNum <= 10) {
    const className = `class-${classNum}`;
    if (subjectMu !== null) {
      return `${BASE_URL}/views/academic/class/${className}?main=0&mu=${subjectMu}`;
    }
    return `${BASE_URL}/views/academic/class/${className}`;
  }

  const kinderMatch = lowerQuery.match(/\b(nursery|lkg|ukg)\b/i);
  if (kinderMatch) {
    const kinderClass = kinderMatch[1].toLowerCase();
    if (subjectMu !== null) {
      return `${BASE_URL}/views/academic/class/${kinderClass}?main=0&mu=${subjectMu}`;
    }
    return `${BASE_URL}/views/academic/class/${kinderClass}`;
  }

  // Use normalized query for the search URL
  const normalizedQuery = normalizeClassQuery(query);
  return `${BASE_URL}/views/result?text=${encodeURIComponent(normalizedQuery)}`;
}

// Build optimized search query for class + subject searches
function buildSearchQuery(query: string, classNum: number | null, subjectName: string | null): string {
  // If we have both class and subject, construct a specific search query
  if (classNum && subjectName) {
    return `class ${classNum} ${subjectName}`;
  }
  // Otherwise use normalized query
  return normalizeClassQuery(query);
}

// Check if text contains non-English characters (Telugu, Hindi, etc.)
function isNonEnglish(text: string): boolean {
  // Check for non-ASCII characters (Telugu, Hindi, Tamil, etc.)
  return !/^[a-zA-Z0-9\s.,!?'-]+$/.test(text);
}

export const appRouter = router({
  chatbot: router({
    autocomplete: publicProcedure
      .input(z.object({ query: z.string(), language: z.string().optional() }))
      .query(async ({ input }) => {
        if (input.query.length < 2) return { resources: [], images: [] };
        try {
          // Translate if non-English
          let searchQuery = input.query;
          if (isNonEnglish(input.query)) {
            try {
              const translationResult = await translateAndExtractKeyword(input.query);
              searchQuery = translationResult.keyword || translationResult.translatedText || input.query;
              console.log(`🌐 [AUTOCOMPLETE] Translated "${input.query}" -> "${searchQuery}"`);
            } catch (e) {
              console.error('Translation error in autocomplete:', e);
            }
          }
          
          const portalResults = await fetchPortalResultsDirect(searchQuery, CHATBOT_RESULTS_LIMIT);
          
          const images = portalResults.map((r: PortalResult) => ({
            id: r.code || r.title, 
            url: r.thumbnail || r.path, 
            title: r.title, 
            category: r.category,
          }));
          
          const { classNum, subjectMu } = parseClassSubject(searchQuery);
          const url = buildSmartUrl(searchQuery, classNum, subjectMu);
          
          const resources = portalResults.length > 0 ? [{
            name: `Browse: "${searchQuery}"`, 
            description: `Showing top ${portalResults.length} results`, 
            url: url,
          }] : [];
          
          return { resources, images };
        } catch (error) {
          console.error("Autocomplete error:", error);
          return { resources: [], images: [] };
        }
      }),

    chat: publicProcedure
      .input(z.object({
        message: z.string(), 
        sessionId: z.string(), 
        language: z.string().optional(),
        history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })).optional(),
      }))
      .mutation(async ({ input }) => {
        const { message, sessionId, language = "en", history = [] } = input;
        console.log(`\n🎯 === SEARCH START: "${message}" (language: ${language}) ===`);

        // Greeting check
        if (isGreeting(message)) {
          console.log(`👋 Greeting detected`);
          let aiMessage = "Hello! Welcome to MySchool. How can I help you find educational resources today?";
          try { const r = await getAIResponse(message, history); if (r.message) aiMessage = r.message; } catch (e) {}
          await saveChatMessage({ sessionId, role: "user", message, language });
          await saveChatMessage({ sessionId, role: "assistant", message: aiMessage, language: "en" });
          return { 
            response: aiMessage, 
            resourceUrl: "", 
            resourceName: "", 
            resourceDescription: "",
            suggestions: ["Search animals", "Class 5 Maths", "Age 8 resources"], 
            searchType: "greeting", 
            thumbnails: [] 
          };
        }

        // Translation for non-English text (Telugu, Hindi, etc.)
        let searchQuery = message;
        let translatedKeyword = message;
        let wasTranslated = false;
        
        // Check if message contains non-English characters OR language is explicitly non-English
        if (isNonEnglish(message) || (language && language !== "en")) {
          try {
            console.log(`🌐 [TRANSLATION] Detected non-English text: "${message}"`);
            const translationResult = await translateAndExtractKeyword(message);
            
            // Use keyword for search (more specific), translatedText for display
            translatedKeyword = translationResult.keyword || translationResult.translatedText || message;
            
            // Only use translation if it's different from original
            if (translatedKeyword.toLowerCase() !== message.toLowerCase()) {
              searchQuery = translatedKeyword;
              wasTranslated = true;
              console.log(`🌐 [TRANSLATION] SUCCESS: "${message}" -> keyword: "${translatedKeyword}", full: "${translationResult.translatedText}"`);
            } else {
              console.log(`🌐 [TRANSLATION] No translation needed or same result`);
            }
          } catch (e) {
            console.error(`🌐 [TRANSLATION] Error:`, e);
          }
        }

        // Parse class/subject from the (possibly translated) query
        const { classNum, subjectMu, subjectName } = parseClassSubject(searchQuery);
        
        // Build optimized search query - includes subject name for class+subject searches
        const optimizedSearchQuery = buildSearchQuery(searchQuery, classNum, subjectName);
        console.log(`📝 Search query: "${searchQuery}" -> Optimized: "${optimizedSearchQuery}"`);
        console.log(`📚 Parsed: classNum=${classNum}, subjectName=${subjectName}, subjectMu=${subjectMu}`);

        // Build URL that will show ALL results when clicked
        const resourceUrl = buildSmartUrl(searchQuery, classNum, subjectMu);
        console.log(`🔗 Resource URL: ${resourceUrl}`);

        // Fetch top 5 results using optimized query
        let portalResults = await fetchPortalResultsDirect(optimizedSearchQuery, CHATBOT_RESULTS_LIMIT);
        
        // Check if we have valid image results
        const hasRealResults = portalResults.length > 0;
        
        // Build response
        let responseMessage: string;
        let thumbnails: Array<{url: string; thumbnail: string; title: string; category: string}> = [];
        let resourceName: string = "";
        let resourceDescription: string = "";
        let searchType: string;
        
        // Create display text showing original and translated query if applicable
        const displayQuery = wasTranslated 
          ? `"${message}" (${translatedKeyword})` 
          : `"${searchQuery}"`;
        
        if (hasRealResults) {
          thumbnails = portalResults.map(r => ({ 
            url: r.path, 
            thumbnail: r.thumbnail, 
            title: r.title, 
            category: r.category 
          }));
          
          // Customize message based on search type
          if (classNum && subjectName) {
            const subjectDisplay = subjectName.charAt(0).toUpperCase() + subjectName.slice(1);
            responseMessage = `Showing Class ${classNum} ${subjectDisplay} resources! Found ${portalResults.length} results. Click "Open Resource" to see more!`;
          } else if (wasTranslated) {
            responseMessage = `Found ${portalResults.length} results for ${displayQuery}. Click "Open Resource" to see all!`;
          } else {
            responseMessage = `Showing top ${portalResults.length} results for ${displayQuery}. Click "Open Resource" to see all matching images!`;
          }
          
          resourceName = `Top ${portalResults.length} results`;
          resourceDescription = portalResults.slice(0, 3).map(r => r.title).join(", ");
          searchType = "direct_search";
        } else {
          // No valid image results found
          if (wasTranslated) {
            responseMessage = `No images found for ${displayQuery}. Try searching for:\n• Common topics like "animals", "fruits", "flowers"\n• Class-based content like "Class 5 Maths"\n• Or browse our resource categories!`;
          } else {
            responseMessage = `No images found for "${searchQuery}". Try searching for:\n• Common topics like "animals", "fruits", "flowers"\n• Class-based content like "Class 5 Maths"\n• Or browse our resource categories!`;
          }
          resourceName = "";
          resourceDescription = "";
          searchType = "no_results";
          thumbnails = [];
        }

        await saveChatMessage({ sessionId, role: "user", message, language });
        await saveChatMessage({ sessionId, role: "assistant", message: responseMessage, language: "en" });
        await logSearchQuery({ 
          sessionId, 
          query: optimizedSearchQuery, 
          translatedQuery: wasTranslated ? searchQuery : null, 
          language, 
          resultsCount: thumbnails.length, 
          topResultUrl: resourceUrl, 
          topResultName: portalResults[0]?.title || "" 
        });

        console.log(`✅ === SEARCH COMPLETE (${hasRealResults ? `showing ${portalResults.length}` : 'no results'}) ===\n`);
        
        return { 
          response: responseMessage, 
          resourceUrl: hasRealResults ? resourceUrl : "", 
          resourceName,
          resourceDescription, 
          suggestions: hasRealResults ? [] : ["Animals", "Class 5 English", "Flowers", "Fruits"], 
          searchType, 
          thumbnails 
        };
      }),
  }),
});

export type AppRouter = typeof appRouter;
