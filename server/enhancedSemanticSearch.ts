import knowledgeBase from './myschool_knowledge_base.json';

const IMAGE_SEARCH_TERMS = [
  "animals", "animal", "lion", "tiger", "elephant", "monkey", "cat", "dog", "bird", "fish",
  "flowers", "flower", "rose", "lotus", "sunflower", "plants", "trees", "tree",
  "fruits", "fruit", "apple", "mango", "banana", "vegetables", "vegetable",
  "body parts", "human body", "organs", "skeleton",
  "shapes", "circle", "square", "triangle", "rectangle",
  "colors", "colour", "vehicles", "car", "bus", "train", "plane",
  "insects", "butterfly", "ant", "bee", "spider",
  "festivals", "diwali", "holi", "christmas"
];

function soundex(str: string): string {
  const s = str.toUpperCase().replace(/[^A-Z]/g, '');
  if (s.length === 0) return '0000';
  const firstLetter = s[0];
  const codes: { [key: string]: string } = {
    'B': '1', 'F': '1', 'P': '1', 'V': '1',
    'C': '2', 'G': '2', 'J': '2', 'K': '2', 'Q': '2', 'S': '2', 'X': '2', 'Z': '2',
    'D': '3', 'T': '3', 'L': '4', 'M': '5', 'N': '5', 'R': '6'
  };
  let code = firstLetter;
  let prevCode = codes[firstLetter] || '0';
  for (let i = 1; i < s.length && code.length < 4; i++) {
    const currentCode = codes[s[i]] || '0';
    if (currentCode !== '0' && currentCode !== prevCode) code += currentCode;
    if (currentCode !== '0') prevCode = currentCode;
  }
  return (code + '0000').substring(0, 4);
}

function phoneticMatch(word1: string, word2: string): boolean {
  return soundex(word1) === soundex(word2);
}

function fuzzyMatch(str1: string, str2: string): number {
  const s1 = str1.toLowerCase(), s2 = str2.toLowerCase();
  if (s1 === s2) return 1;
  if (s1.includes(s2) || s2.includes(s1)) return 0.8;
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  if (longer.length === 0) return 1;
  let matches = 0;
  for (let i = 0; i < shorter.length; i++) if (longer.includes(shorter[i])) matches++;
  return matches / longer.length;
}

export interface SearchResult {
  name: string; description: string; url: string;
  category: "one_click" | "image_bank" | "class_subject" | "section" | "search" | "none";
  confidence: number;
}

const BASE_URL = "https://portal.myschoolct.com";

function isImageSearchTerm(query: string): boolean {
  const queryLower = query.toLowerCase().trim();
  for (const term of IMAGE_SEARCH_TERMS) {
    if (queryLower === term || queryLower.includes(term)) return true;
    for (const word of queryLower.split(/\s+/)) {
      if (word === term || fuzzyMatch(word, term) > 0.7 || phoneticMatch(word, term)) return true;
    }
  }
  return false;
}

function calculateSimilarity(query: string, keywords: string[]): number {
  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(/\s+/).filter(w => w.length > 1);
  if (queryWords.length === 0) return 0;
  let score = 0;
  for (const keyword of keywords) {
    const kw = keyword.toLowerCase();
    if (queryLower === kw) score += 10;
    else if (queryLower.includes(kw) || kw.includes(queryLower)) score += 5;
    for (const word of queryWords) {
      if (word.length > 2) {
        if (kw.includes(word)) score += 2;
        else if (phoneticMatch(word, kw)) score += 3;
        else if (fuzzyMatch(word, kw) > 0.6) score += 2;
      }
    }
  }
  return score;
}

function extractClassAndSubject(query: string): { classNum: number | null; subject: string | null } {
  const queryLower = query.toLowerCase().trim();
  const classPatterns = [/(\d+)(?:st|nd|rd|th)?\s*(?:class|grade|std)/i, /(?:class|grade|std)\s*(\d+)/i];
  let classNum: number | null = null;
  for (const pattern of classPatterns) {
    const match = queryLower.match(pattern);
    if (match) { const val = parseInt(match[1]); if (val >= 1 && val <= 10) { classNum = val; break; } }
  }
  const subjects: any = knowledgeBase.sections.academic.subsections.grades.subjects;
  let matchedSubject: string | null = null, maxScore = 0;
  for (const [subjectName, subjectData] of Object.entries(subjects)) {
    const score = calculateSimilarity(queryLower, (subjectData as any).keywords);
    if (score > maxScore) { maxScore = score; matchedSubject = subjectName; }
  }
  return { classNum, subject: maxScore > 3 ? matchedSubject : null };
}

export function performPrioritySearch(query: string): SearchResult[] {
  const queryLower = query.toLowerCase().trim();
  const isMeaningless = queryLower.length < 2 || !/^[a-zA-Z0-9\s]+$/.test(queryLower);

  // PRIORITY 1: Image Bank for visual terms
  if (isImageSearchTerm(query)) {
    return [{ name: `Image Bank: ${query}`, description: `Search for "${query}" in Image Bank (80,000+ images)`,
      url: `${BASE_URL}/views/sections/image-bank?search=${encodeURIComponent(query)}`, category: "image_bank", confidence: 0.95 }];
  }

  // PRIORITY 2: One Click Resource Center exact matches
  const oneClickResources = knowledgeBase.sections.academic.subsections.one_click_resources.resources;
  for (const resource of oneClickResources) {
    if (calculateSimilarity(queryLower, resource.keywords) > 8) {
      return [{ name: resource.name, description: resource.keywords.join(", "), url: BASE_URL + resource.url, category: "one_click", confidence: 0.95 }];
    }
  }

  // PRIORITY 3: Academic-Class searches
  const { classNum, subject } = extractClassAndSubject(query);
  if (classNum) {
    if (subject) {
      const subjects: any = knowledgeBase.sections.academic.subsections.grades.subjects;
      const subjectData = subjects[subject];
      if (subjectData && subjectData.code !== "unknown") {
        return [{ name: `Class ${classNum} ${subject.charAt(0).toUpperCase() + subject.slice(1)}`,
          description: `Access Class ${classNum} ${subject} curriculum`,
          url: `${BASE_URL}/views/academic/class/class-${classNum}?main=1&mu=${subjectData.code}`, category: "class_subject", confidence: 0.95 }];
      }
    }
    return [{ name: `Class ${classNum} Resources`, description: `All Class ${classNum} resources`,
      url: `${BASE_URL}/views/academic/class/class-${classNum}`, category: "class_subject", confidence: 0.85 }];
  }

  // PRIORITY 4: General search using portal search results page
  if (!isMeaningless && queryLower.length >= 2) {
    return [{ name: `Search: ${query}`, description: `Searching for "${query}" across all resources`,
      url: `${BASE_URL}/views/result?text=${encodeURIComponent(query)}`, category: "search", confidence: 0.5 }];
  }

  // Fallback
  return [{ name: "Browse Academic Resources", description: "Explore all resources",
    url: `${BASE_URL}/views/academic`, category: "none", confidence: 0 }];
}

export function getSuggestions(query: string): SearchResult[] {
  const results: SearchResult[] = [];
  const queryLower = query.toLowerCase().trim();
  if (isImageSearchTerm(query)) {
    results.push({ name: "Image Bank", description: `Search ${query} images`,
      url: `${BASE_URL}/views/sections/image-bank?search=${encodeURIComponent(query)}`, category: "image_bank", confidence: 0.95 });
  }
  const oneClickResources = knowledgeBase.sections.academic.subsections.one_click_resources.resources;
  for (const resource of oneClickResources) {
    if (calculateSimilarity(queryLower, resource.keywords) > 2) {
      results.push({ name: resource.name, description: resource.keywords.slice(0, 5).join(", "),
        url: BASE_URL + resource.url, category: "one_click", confidence: 0.8 });
    }
  }
  return results.sort((a, b) => b.confidence - a.confidence).slice(0, 4);
}
