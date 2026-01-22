import knowledgeBase from './myschool_knowledge_base.json';

// Common image/visual search terms that should go to Image Bank
const IMAGE_SEARCH_TERMS = [
  "animals", "animal", "lion", "tiger", "elephant", "monkey", "cat", "dog", "bird", "fish",
  "flowers", "flower", "rose", "lotus", "sunflower", "plants", "trees", "tree",
  "fruits", "fruit", "apple", "mango", "banana", "vegetables", "vegetable",
  "body parts", "human body", "organs", "skeleton",
  "shapes", "circle", "square", "triangle", "rectangle",
  "colors", "colour", "red", "blue", "green", "yellow",
  "vehicles", "car", "bus", "train", "plane", "airplane", "ship", "boat",
  "buildings", "house", "school", "hospital", "temple", "church", "mosque",
  "food", "water", "nature", "sky", "sun", "moon", "stars", "earth", "planet",
  "insects", "butterfly", "ant", "bee", "spider",
  "seasons", "summer", "winter", "rain", "monsoon",
  "professions", "doctor", "teacher", "farmer", "police", "soldier",
  "sports", "cricket", "football", "hockey", "tennis",
  "musical instruments", "guitar", "piano", "drum", "flute",
  "festivals", "diwali", "holi", "christmas", "eid"
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
    if (currentCode !== '0' && currentCode !== prevCode) {
      code += currentCode;
    }
    if (currentCode !== '0') {
      prevCode = currentCode;
    }
  }
  
  return (code + '0000').substring(0, 4);
}

function phoneticMatch(word1: string, word2: string): boolean {
  return soundex(word1) === soundex(word2);
}

function fuzzyMatch(str1: string, str2: string): number {
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();
  
  if (s1 === s2) return 1;
  if (s1.includes(s2) || s2.includes(s1)) return 0.8;
  
  // Levenshtein-like similarity
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  
  if (longer.length === 0) return 1;
  
  let matches = 0;
  for (let i = 0; i < shorter.length; i++) {
    if (longer.includes(shorter[i])) matches++;
  }
  
  return matches / longer.length;
}

export interface SearchResult {
  name: string;
  description: string;
  url: string;
  category: "one_click" | "image_bank" | "class_subject" | "section" | "search" | "none";
  confidence: number;
}

const BASE_URL = "https://portal.myschoolct.com";

function isImageSearchTerm(query: string): boolean {
  const queryLower = query.toLowerCase().trim();
  const queryWords = queryLower.split(/\s+/);
  
  for (const term of IMAGE_SEARCH_TERMS) {
    if (queryLower === term || queryLower.includes(term)) return true;
    for (const word of queryWords) {
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
    const keywordLower = keyword.toLowerCase();
    
    if (queryLower === keywordLower) score += 10;
    else if (queryLower.includes(keywordLower) || keywordLower.includes(queryLower)) score += 5;
    
    for (const word of queryWords) {
      if (word.length > 2) {
        if (keywordLower.includes(word)) score += 2;
        else if (phoneticMatch(word, keywordLower)) score += 3;
        else if (fuzzyMatch(word, keywordLower) > 0.6) score += 2;
      }
    }
  }
  
  return score;
}

function extractClassAndSubject(query: string): { classNum: number | null; subject: string | null; lastWord: string | null } {
  const queryLower = query.toLowerCase().trim();
  const words = queryLower.split(/\s+/);
  
  const ageMatch = queryLower.match(/age\s*(\d+)/i);
  if (ageMatch) {
    const age = parseInt(ageMatch[1]);
    if (age >= 5 && age <= 15) return { classNum: age - 5, subject: null, lastWord: null };
  }

  const classPatterns = [
    /(\d+)(?:st|nd|rd|th)?\s*(?:class|grade|std)/i,
    /(?:class|grade|std)\s*(\d+)/i,
    /grade\s*-?\s*(\d+)/i
  ];
  
  let classNum: number | null = null;
  for (const pattern of classPatterns) {
    const match = queryLower.match(pattern);
    if (match) {
      const val = parseInt(match[1]);
      if (val >= 1 && val <= 10) { classNum = val; break; }
    }
  }
  
  const subjects: any = knowledgeBase.sections.academic.subsections.grades.subjects;
  let matchedSubject: string | null = null;
  let maxScore = 0;
  
  for (const [subjectName, subjectData] of Object.entries(subjects)) {
    const score = calculateSimilarity(queryLower, (subjectData as any).keywords);
    if (score > maxScore) { maxScore = score; matchedSubject = subjectName; }
  }
  
  const lastWord = words.length > 0 ? words[words.length - 1] : null;
  return { classNum, subject: maxScore > 3 ? matchedSubject : null, lastWord };
}

export function performPrioritySearch(query: string): SearchResult[] {
  const results: SearchResult[] = [];
  const queryLower = query.toLowerCase().trim();
  
  const isMeaningless = queryLower.length < 2 || !/^[a-zA-Z0-9\s]+$/.test(queryLower);

  // *** PRIORITY 1: Check if it's an image/visual search term - go to Image Bank ***
  if (isImageSearchTerm(query)) {
    return [{
      name: `Image Bank: ${query}`,
      description: `Search for "${query}" images in One Click Resource Centre - Image Bank (80,000+ educational images)`,
      url: `${BASE_URL}/views/sections/image-bank?search=${encodeURIComponent(query)}`,
      category: "image_bank",
      confidence: 0.95
    }];
  }

  // *** PRIORITY 2: One Click Resource Center exact matches ***
  const oneClickResources = knowledgeBase.sections.academic.subsections.one_click_resources.resources;
  for (const resource of oneClickResources) {
    const score = calculateSimilarity(queryLower, resource.keywords);
    if (score > 6) {
      results.push({
        name: resource.name,
        description: resource.keywords.join(", "),
        url: BASE_URL + resource.url,
        category: "one_click",
        confidence: Math.min(score / 10, 1.0)
      });
    }
  }
  
  if (results.length > 0) return results.sort((a, b) => b.confidence - a.confidence).slice(0, 1);

  // *** PRIORITY 3: Academic-Class searches ***
  const { classNum, subject, lastWord } = extractClassAndSubject(query);
  if (classNum) {
    if (subject) {
      const subjects: any = knowledgeBase.sections.academic.subsections.grades.subjects;
      const subjectData = subjects[subject];
      if (subjectData && subjectData.code !== "unknown") {
        const url = `${BASE_URL}/views/academic/class/class-${classNum}?main=1&mu=${subjectData.code}`;
        results.push({
          name: `Class ${classNum} ${subject.charAt(0).toUpperCase() + subject.slice(1)}`,
          description: `Access Class ${classNum} ${subject} curriculum`,
          url: url,
          category: "class_subject",
          confidence: 0.95
        });
      }
    } else if (lastWord && lastWord !== classNum.toString() && !['class', 'grade', 'std'].includes(lastWord)) {
      const url = `${BASE_URL}/views/academic/class/class-${classNum}?search=${encodeURIComponent(lastWord)}`;
      results.push({
        name: `Class ${classNum} Search: ${lastWord}`,
        description: `Searching for ${lastWord} in Class ${classNum}`,
        url: url,
        category: "class_subject",
        confidence: 0.9
      });
    } else {
      results.push({
        name: `Class ${classNum} Resources`,
        description: `Access all Class ${classNum} resources`,
        url: `${BASE_URL}/views/academic/class/class-${classNum}`,
        category: "class_subject",
        confidence: 0.85
      });
    }
  }
  
  if (results.length > 0) return results.slice(0, 1);

  // *** PRIORITY 4: Main Sections ***
  for (const [sectionName, sectionData] of Object.entries(knowledgeBase.sections)) {
    if (sectionName === 'academic') continue;
    const score = calculateSimilarity(queryLower, (sectionData as any).keywords);
    if (score > 4) {
      results.push({
        name: sectionName.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
        description: (sectionData as any).description,
        url: BASE_URL + (sectionData as any).url,
        category: "section",
        confidence: Math.min(score / 10, 0.8)
      });
    }
  }
  
  if (results.length > 0) return results.sort((a, b) => b.confidence - a.confidence).slice(0, 1);

  // *** PRIORITY 5: General search in Image Bank for any reasonable query ***
  if (!isMeaningless && queryLower.length >= 3) {
    return [{
      name: `Search: ${query}`,
      description: `Searching for "${query}" in Academic Resources`,
      url: `${BASE_URL}/views/sections/image-bank?search=${encodeURIComponent(query)}`,
      category: "search",
      confidence: 0.5
    }];
  }

  // *** PRIORITY 6: Final Fallback ***
  return [{
    name: "Browse Academic Resources",
    description: "Explore all academic resources, classes, and subjects",
    url: `${BASE_URL}/views/academic`,
    category: "none",
    confidence: 0
  }];
}

export function getSuggestions(query: string): SearchResult[] {
  const results: SearchResult[] = [];
  const queryLower = query.toLowerCase().trim();
  
  // Check image terms first
  if (isImageSearchTerm(query)) {
    results.push({
      name: "Image Bank",
      description: `Search for ${query} images`,
      url: `${BASE_URL}/views/sections/image-bank?search=${encodeURIComponent(query)}`,
      category: "image_bank",
      confidence: 0.95
    });
  }
  
  const oneClickResources = knowledgeBase.sections.academic.subsections.one_click_resources.resources;
  for (const resource of oneClickResources) {
    const score = calculateSimilarity(queryLower, resource.keywords);
    if (score > 2) {
      results.push({
        name: resource.name,
        description: resource.keywords.slice(0, 5).join(", "),
        url: BASE_URL + resource.url,
        category: "one_click",
        confidence: Math.min(score / 10, 1.0)
      });
    }
  }
  
  results.sort((a, b) => b.confidence - a.confidence);
  return results.slice(0, 4);
}
