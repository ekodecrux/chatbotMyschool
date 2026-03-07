// Levenshtein distance for fuzzy matching
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

// Fuzzy match with similarity score - STRICTER threshold
export function fuzzyMatch(query: string, target: string, threshold: number = 0.85): boolean {
  const distance = levenshteinDistance(query.toLowerCase(), target.toLowerCase());
  const maxLength = Math.max(query.length, target.length);
  const similarity = 1 - distance / maxLength;
  return similarity >= threshold;
}

// Soundex algorithm for phonetic matching
export function soundex(s: string): string {
  const a = s.toLowerCase().split('');
  const firstLetter = a[0];

  const codes: Record<string, string> = {
    a: '', e: '', i: '', o: '', u: '', h: '', w: '', y: '',
    b: '1', f: '1', p: '1', v: '1',
    c: '2', g: '2', j: '2', k: '2', q: '2', s: '2', x: '2', z: '2',
    d: '3', t: '3',
    l: '4',
    m: '5', n: '5',
    r: '6'
  };

  const coded = a
    .map((letter) => codes[letter] || '')
    .filter((code, index) => index === 0 || code !== a[index - 1])
    .join('')
    .replace(/0/g, '')
    .substring(0, 4);

  return (firstLetter + coded + '000').substring(0, 4).toUpperCase();
}

// Known educational words that we can expand synonyms for
const KNOWN_EDUCATIONAL_WORDS = new Set([
  // Animals
  'animal', 'animals', 'monkey', 'dog', 'cat', 'bird', 'fish', 'elephant', 'lion', 'tiger',
  'cow', 'horse', 'sheep', 'goat', 'pig', 'hen', 'duck', 'rabbit', 'deer', 'bear',
  // Plants & Nature  
  'fruit', 'fruits', 'flower', 'flowers', 'plant', 'plants', 'tree', 'trees', 'vegetable', 'vegetables',
  'apple', 'banana', 'mango', 'orange', 'grape', 'rose', 'lotus', 'sunflower',
  // Education
  'exam', 'test', 'study', 'book', 'lesson', 'homework', 'question', 'answer',
  'class', 'grade', 'school', 'teacher', 'student',
  // Subjects
  'maths', 'math', 'mathematics', 'science', 'english', 'hindi', 'telugu', 'evs',
  'computer', 'art', 'drawing', 'craft',
  // Art & Shapes
  'color', 'colour', 'shape', 'circle', 'square', 'triangle', 'rectangle',
  'number', 'numbers', 'alphabet', 'letter', 'letters',
  // Common categories
  'comics', 'rhymes', 'stories', 'puzzles', 'games', 'videos', 'images',
  'festivals', 'vehicles', 'professions', 'insects', 'birds',
  // Actions  
  'write', 'read', 'count', 'add', 'subtract', 'multiply', 'divide',
]);

// Educational synonyms dictionary - ONLY expand for known words
const SYNONYMS: Record<string, string[]> = {
  // Animals
  'animal': ['animals', 'creature', 'creatures'],
  'monkey': ['monkeys', 'ape'],
  'dog': ['dogs', 'puppy', 'puppies'],
  'cat': ['cats', 'kitten', 'kittens'],
  'bird': ['birds'],
  'fish': ['fishes'],
  'elephant': ['elephants'],
  'lion': ['lions'],
  'tiger': ['tigers'],

  // Plants & Nature
  'fruit': ['fruits'],
  'flower': ['flowers', 'blossom'],
  'plant': ['plants'],
  'tree': ['trees'],
  'vegetable': ['vegetables', 'veggies'],

  // Education
  'exam': ['exams', 'test', 'tests', 'examination'],
  'study': ['studies', 'learn', 'learning'],
  'book': ['books', 'textbook'],

  // Subjects
  'maths': ['math', 'mathematics'],
  'science': ['sciences'],
  'english': ['language', 'grammar'],

  // Art & Creativity
  'color': ['colors', 'colour', 'colours'],
  'shape': ['shapes'],
  'number': ['numbers'],
};

// Check if a query contains any known educational words
function containsKnownWord(query: string): boolean {
  const words = query.toLowerCase().split(/\s+/);
  return words.some(word => KNOWN_EDUCATIONAL_WORDS.has(word));
}

// Expand query with synonyms - ONLY for known words
export function expandWithSynonyms(query: string): string[] {
  const words = query.toLowerCase().split(/\s+/);
  const expanded = new Set<string>([query.toLowerCase()]);

  words.forEach(word => {
    // Only expand if the word is in our known educational words
    if (!KNOWN_EDUCATIONAL_WORDS.has(word)) {
      // Don't expand unknown words - just add the word itself
      expanded.add(word);
      return;
    }

    // Add the word itself
    expanded.add(word);

    // Check if word is a key in synonyms
    if (SYNONYMS[word]) {
      SYNONYMS[word].forEach(syn => expanded.add(syn));
    }

    // Check if word is a synonym of any key
    Object.entries(SYNONYMS).forEach(([key, syns]) => {
      if (syns.includes(word)) {
        expanded.add(key);
        syns.forEach(s => expanded.add(s));
      }
    });
  });

  return Array.from(expanded);
}

// Common typos and corrections - ONLY for known educational terms
const COMMON_TYPOS: Record<string, string> = {
  'monky': 'monkey',
  'monkee': 'monkey',
  'munkee': 'monkey',
  'fruut': 'fruit',
  'froot': 'fruit',
  'anamil': 'animal',
  'animl': 'animal',
  'collor': 'color',
  'colur': 'color',
  'shap': 'shape',
  'numbr': 'number',
  'numbere': 'number',
  'exm': 'exam',
  'tets': 'test',
  'scince': 'science',
  'sceince': 'science',
  'mtah': 'maths',
  'maht': 'maths',
  'englsh': 'english',
  'engilsh': 'english',
};

// Auto-correct query - ONLY for close matches to known typos
export function autoCorrect(query: string): string {
  const words = query.toLowerCase().split(/\s+/);
  const corrected = words.map(word => {
    // Direct typo match only
    if (COMMON_TYPOS[word]) {
      return COMMON_TYPOS[word];
    }
    
    // Only do fuzzy matching if word is very close to a known typo (95% similarity)
    for (const [typo, correct] of Object.entries(COMMON_TYPOS)) {
      if (fuzzyMatch(word, typo, 0.95)) {
        return correct;
      }
    }

    return word;
  });

  return corrected.join(' ');
}

// Enhanced search query processor
export function enhanceSearchQuery(query: string): {
  original: string;
  corrected: string;
  expanded: string[];
  hasKnownWords: boolean;
} {
  const corrected = autoCorrect(query);
  const hasKnownWords = containsKnownWord(corrected);
  
  // Only expand if we have known educational words
  const expanded = hasKnownWords ? expandWithSynonyms(corrected) : [corrected.toLowerCase()];

  return {
    original: query,
    corrected,
    expanded,
    hasKnownWords,
  };
}

// Main search function - returns empty if no real matches
export async function advancedSearch(
  query: string,
  portalAPI: string = 'https://portal.myschoolct.com/api/rest/search/global'
): Promise<any[]> {
  const enhanced = enhanceSearchQuery(query);

  console.log(`🔍 Advanced Search:`, {
    original: enhanced.original,
    corrected: enhanced.corrected,
    hasKnownWords: enhanced.hasKnownWords,
    expanded: enhanced.expanded.slice(0, 5),
  });

  // If query has no known educational words, only search for the exact query
  // Don't try to expand or guess - just return what the portal finds
  if (!enhanced.hasKnownWords) {
    try {
      const url = `${portalAPI}?query=${encodeURIComponent(query)}&size=6`;
      const response = await fetch(url);

      if (!response.ok) {
        console.log(`⚠️ Portal API error for unknown query`);
        return [];
      }

      const data = await response.json();
      
      if (data.results && data.results.length > 0) {
        console.log(`✅ Found ${data.results.length} results for exact query "${query}"`);
        return data.results;
      }
      
      console.log(`⚠️ No results for unknown query "${query}"`);
      return [];
    } catch (error) {
      console.error(`❌ Error searching for "${query}":`, error);
      return [];
    }
  }

  // For known educational words, try each expanded term until we get results
  for (const term of enhanced.expanded) {
    try {
      const url = `${portalAPI}?query=${encodeURIComponent(term)}&size=6`;
      const response = await fetch(url);

      if (!response.ok) continue;

      const data = await response.json();

      if (data.results && data.results.length > 0) {
        console.log(`✅ Found ${data.results.length} results for "${term}"`);
        return data.results;
      }
    } catch (error) {
      console.error(`❌ Error searching for "${term}":`, error);
    }
  }

  console.log(`⚠️ No results found for any expanded terms`);
  return [];
}
