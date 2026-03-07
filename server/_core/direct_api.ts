import { Router } from 'express';

const router = Router();

// Mock Knowledge Base with Image URLs
const knowledgeBase = [
  {
    title: "Class 1 Dashboard",
    category: "Academic",
    priority: 10,
    description: "Class 1 academic resources and materials",
    url: "https://portal.myschoolct.com/views/academic/result?text=Class%201",
    keywords: ["class 1", "first grade", "class one", "maths", "english", "science"],
    thumbnailUrl: "/assets/class_1_thumb.png",
  },
  {
    title: "Image Bank - One Click Resource Centre",
    category: "One Click Resource Center",
    priority: 20,
    description: "A vast collection of high-quality images for projects and learning.",
    url: "https://portal.myschoolct.com/views/oneclick/imagebank",
    keywords: ["image bank", "images", "pictures", "photos", "visuals"],
    thumbnailUrl: "/assets/image_bank_thumb.png",
  },
  {
    title: "Smart Wall - One Click Resource Centre",
    category: "One Click Resource Center",
    priority: 20,
    description: "Interactive displays and smart learning modules.",
    url: "https://portal.myschoolct.com/views/oneclick/smartwall",
    keywords: ["smart wall", "interactive", "display", "module"],
    thumbnailUrl: "/assets/smart_wall_thumb.png",
  },
  {
    title: "General Search",
    category: "General Search",
    priority: 1,
    description: "General search across the MySchool portal.",
    url: "https://portal.myschoolct.com/views/result?text=",
    keywords: ["search", "find", "look for", "query"],
    thumbnailUrl: "/assets/general_search_thumb.png",
  },
];

// Mock Image Results for "lion" and "monkey"
const mockImageResults = (query: string) => {
  const lowerQuery = query.toLowerCase();
  if (lowerQuery.includes('lion') || lowerQuery.includes('monkey') || lowerQuery.includes('tiger') || lowerQuery.includes('animal')) {
    return [
      { title: "2. COLOUR TH...", thumbnailUrl: "https://via.placeholder.com/100x100?text=Image+1", resourceLink: "https://portal.myschoolct.com/resource/1" },
      { title: "14. THE LION'S...", thumbnailUrl: "https://via.placeholder.com/100x100?text=Image+2", resourceLink: "https://portal.myschoolct.com/resource/2" },
      { title: "18. LION'S STIL...", thumbnailUrl: "https://via.placeholder.com/100x100?text=Image+3", resourceLink: "https://portal.myschoolct.com/resource/3" },
      { title: "19. PACT WIT...", thumbnailUrl: "https://via.placeholder.com/100x100?text=Image+4", resourceLink: "https://portal.myschoolct.com/resource/4" },
      { title: "25. SAFARI AD...", thumbnailUrl: "https://via.placeholder.com/100x100?text=Image+5", resourceLink: "https://portal.myschoolct.com/resource/5" },
    ];
  }
  return [];
};

// Simple Soundex implementation for phonetic matching
const soundex = (s: string) => {
  s = s.toUpperCase().replace(/[^A-Z]/g, '');
  if (!s) return '';
  let code = s[0];
  const mappings: { [key: string]: string } = {
    'BFPV': '1', 'CGJKQSXZ': '2', 'DT': '3', 'L': '4', 'MN': '5', 'R': '6'
  };
  for (let i = 1; i < s.length; i++) {
    let char = s[i];
    let digit = '';
    for (const key in mappings) {
      if (key.includes(char)) {
        digit = mappings[key];
        break;
      }
    }
    if (digit && digit !== code.slice(-1)) {
      code += digit;
    }
  }
  return (code + '000').slice(0, 4);
};

// Simple Levenshtein distance for fuzzy matching
const levenshtein = (s1: string, s2: string) => {
  s1 = s1.toLowerCase();
  s2 = s2.toLowerCase();
  const costs = [];
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (s1[i - 1] !== s2[j - 1]) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }
  return costs[s2.length];
};

// Age to Class Mapping
const ageToClass = (query: string): string => {
  const ageMatch = query.match(/age\s*(\d+)/i);
  if (ageMatch) {
    const age = parseInt(ageMatch[1], 10);
    if (age >= 6 && age <= 18) {
      const classNumber = age - 5;
      return query.replace(ageMatch[0], `class ${classNumber}`);
    }
  }
  return query;
};

// Function to find the best matching resource
const findBestResource = (query: string) => {
  const queryLower = query.toLowerCase();
  let bestMatch: (typeof knowledgeBase[0] & { score: number, finalUrl: string }) | null = null;
  let maxScore = -1;

  for (const resource of knowledgeBase) {
    let score = 0;
    let finalUrl = resource.url;

    // 1. Exact/Semantic Match (Highest Priority)
    if (resource.title.toLowerCase().includes(queryLower)) {
      score += 100;
    }

    // 2. Keyword Match
    for (const keyword of resource.keywords) {
      if (queryLower.includes(keyword) || levenshtein(queryLower, keyword) < 2) {
        score += 50;
      }
    }

    // 3. Phonetic Match (Soundex)
    if (resource.keywords.some(k => soundex(k) === soundex(query))) {
      score += 20;
    }

    // 4. Academic Search URL Logic - Refined to search only for subject
    if (resource.category === "Academic" && (queryLower.includes('class') || queryLower.includes('grade'))) {
      // Look for the subject after 'class X' or 'grade X'
      const classMatch = queryLower.match(/(class|grade)\s*(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*(.*)/i);
      let subject = '';
      if (classMatch && classMatch[3].trim()) {
        subject = classMatch[3].trim();
      } else if (queryLower.includes('maths') || queryLower.includes('english') || queryLower.includes('science')) {
        // If no class is explicitly mentioned but a subject is, use the subject
        subject = queryLower.includes('maths') ? 'maths' : queryLower.includes('english') ? 'english' : 'science';
      }

      if (subject) {
        // Specific Academic Search URL Pattern: https://portal.myschoolct.com/views/academic/result?text=maths
        finalUrl = `https://portal.myschoolct.com/views/academic/result?text=${encodeURIComponent(subject.trim())}`;
        score += 100; // Boost score for matching academic pattern
      }
    } else if (resource.category === "General Search") {
      // General Search URL Pattern: https://portal.myschoolct.com/views/result?text=monkey
      finalUrl = `${resource.url}${encodeURIComponent(query.trim())}`;
      score += 10;
    }

    // 5. Priority Boost
    score += resource.priority;

    if (score > maxScore) {
      maxScore = score;
      bestMatch = { ...resource, score, finalUrl };
    }
  }

  // If no specific resource is a good match, default to General Search
  if (!bestMatch || maxScore < 100) {
    const generalSearch = knowledgeBase.find(r => r.category === "General Search")!;
    bestMatch = {
      ...generalSearch,
      score: 10,
      finalUrl: `${generalSearch.url}${encodeURIComponent(query.trim())}`,
    };
  }

  return bestMatch;
};

// Telugu to English Translation Mock
const translateToEnglish = async (text: string, lang: string) => {
  if (lang === 'te') {
    // Mock translation for "కోతి బొమ్మ" (Kōti bomma - Monkey image) -> "Monkey"
    if (text.includes('కోతి')) return 'Monkey';
    if (text.includes('జంతువులు')) return 'Animals';
    // In a real scenario, this would call the Gemini API for translation
    return text;
  }
  return text;
};

// New Autocomplete Endpoint
router.post('/autocomplete', async (req, res) => {
  const { query, language } = req.body;

  if (!query || query.length < 2) {
    return res.json({ resources: [], image_results: [] });
  }

  try {
    let processedQuery = ageToClass(query);
    const translatedQuery = await translateToEnglish(processedQuery, language);
    const bestResource = findBestResource(translatedQuery);
    const imageResults = mockImageResults(translatedQuery);

    // Only return the best resource if the score is high enough to be relevant
    const resources = bestResource.score >= 100 ? [{
      title: bestResource.title,
      url: bestResource.finalUrl,
      category: bestResource.category,
      description: bestResource.description,
      thumbnailUrl: bestResource.thumbnailUrl,
    }] : [];

    res.json({
      resources: resources,
      image_results: imageResults,
    });

  } catch (error) {
    console.error('Error in /autocomplete:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Existing Direct Chat Endpoint
router.post('/direct-chat', async (req, res) => {
  const { message, sessionId, language } = req.body;

  if (!sessionId || !message) {
    return res.status(400).json({ error: 'Missing sessionId or message' });
  }

  try {
    // 1. Process Age-to-Class mapping
    let processedMessage = ageToClass(message);

    // 2. Translate if necessary
    const translatedMessage = await translateToEnglish(processedMessage, language);

    // 3. Find the best resource
    const bestResource = findBestResource(translatedMessage);

    // 4. Mock Image Results
    const imageResults = mockImageResults(translatedMessage);

    // 5. Construct the humanized response
    let llmResponseText = `I found the most relevant resource for your query: "${message}".`;
    
    if (imageResults.length > 0) {
        llmResponseText = `I found ${imageResults.length} image results for "${translatedMessage}". You can scroll through the previews below.`;
    } else if (bestResource.category === "Academic" && translatedMessage.toLowerCase().includes('maths')) {
        llmResponseText = `I see you're looking for maths resources. I'll guide you to the relevant academic dashboard to access the materials.`;
    } else if (bestResource.category === "General Search") {
        llmResponseText = `I'm performing a general search on the portal for "${translatedMessage}". Click the link below to view the results.`;
    } else {
        llmResponseText = `Here is the best resource I found for your query: "${translatedMessage}".`;
    }

    const assistantResponse = {
      text: llmResponseText,
      resources: [{
        title: bestResource.title,
        url: bestResource.finalUrl,
        category: bestResource.category,
        priority: bestResource.priority,
        description: bestResource.description,
        thumbnailUrl: bestResource.thumbnailUrl,
      }],
      image_results: imageResults, // New field for image thumbnails
    };

    // 6. Send response
    res.json({
      response: assistantResponse.text,
      resources: assistantResponse.resources,
      image_results: assistantResponse.image_results,
    });

  } catch (error) {
    console.error('Error in /direct-chat:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Mock chat history endpoint
router.get('/chat-history', async (req, res) => {
  const { sessionId } = req.query;
  if (!sessionId) {
    return res.status(400).json({ error: 'Missing sessionId' });
  }
  
  try {
    // Mock history response
    res.json({ history: [] });
  } catch (error) {
    console.error('Error fetching chat history:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export const registerDirectChatRoute = (app: any) => {
  app.use('/api', router);
};

export default router;
