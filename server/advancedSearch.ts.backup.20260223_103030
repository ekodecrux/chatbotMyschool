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

// Fuzzy match with similarity score
export function fuzzyMatch(query: string, target: string, threshold: number = 0.7): boolean {
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

// Educational synonyms dictionary
const SYNONYMS: Record<string, string[]> = {
  // Animals
  'animal': ['animals', 'creature', 'creatures', 'beast', 'wildlife'],
  'monkey': ['monkeys', 'ape', 'primate', 'chimp'],
  'dog': ['dogs', 'puppy', 'puppies', 'canine'],
  'cat': ['cats', 'kitten', 'kittens', 'feline'],
  'bird': ['birds', 'avian', 'fowl'],
  'fish': ['fishes', 'aquatic'],
  'elephant': ['elephants', 'pachyderm'],
  'lion': ['lions', 'leo'],
  'tiger': ['tigers'],

  // Plants & Nature
  'fruit': ['fruits', 'fruut', 'froot'],
  'flower': ['flowers', 'blossom', 'bloom'],
  'plant': ['plants', 'vegetation', 'flora'],
  'tree': ['trees', 'woods', 'forest'],
  'vegetable': ['vegetables', 'veggies'],

  // Education
  'exam': ['exams', 'test', 'tests', 'examination', 'quiz', 'assessment'],
  'study': ['studies', 'learn', 'learning', 'education'],
  'book': ['books', 'textbook', 'reading'],
  'lesson': ['lessons', 'class', 'lecture'],
  'homework': ['assignment', 'work', 'task'],
  'question': ['questions', 'query', 'queries'],
  'answer': ['answers', 'solution', 'solutions'],

  // Subjects
  'maths': ['math', 'mathematics', 'arithmetic', 'calculation'],
  'science': ['sciences', 'scientific', 'biology', 'physics', 'chemistry'],
  'english': ['language', 'grammar', 'vocabulary'],
  'hindi': ['हिंदी'],
  'telugu': ['తెలుగు'],

  // Art & Creativity
  'color': ['colors', 'colour', 'colours', 'shade', 'hue'],
  'draw': ['drawing', 'sketch', 'art'],
  'paint': ['painting', 'artwork'],
  'picture': ['pictures', 'image', 'images', 'photo', 'photos'],

  // Shapes & Numbers
  'shape': ['shapes', 'geometry', 'geometric'],
  'number': ['numbers', 'numeral', 'digit', 'digits'],
  'circle': ['circles', 'round'],
  'square': ['squares'],
  'triangle': ['triangles'],

  // Actions
  'write': ['writing', 'written', 'compose'],
  'read': ['reading', 'comprehension'],
  'count': ['counting', 'enumerate'],
  'add': ['addition', 'plus', 'sum'],
  'subtract': ['subtraction', 'minus', 'difference'],

  // Interview/Career
  'interview': ['interviews', 'exam tips', 'preparation', 'tips'],
};

// Expand query with synonyms
export function expandWithSynonyms(query: string): string[] {
  const words = query.toLowerCase().split(/\s+/);
  const expanded = new Set<string>([query.toLowerCase()]);

  words.forEach(word => {
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

    // Fuzzy match against synonym keys
    Object.entries(SYNONYMS).forEach(([key, syns]) => {
      if (fuzzyMatch(word, key, 0.8)) {
        expanded.add(key);
        syns.forEach(s => expanded.add(s));
      }
    });
  });

  return Array.from(expanded);
}

// Common typos and corrections
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
  'studie': 'study',
  'scince': 'science',
  'sceince': 'science',
  'mtah': 'maths',
  'maht': 'maths',
  'englsh': 'english',
  'engilsh': 'english',
};

// Auto-correct query
export function autoCorrect(query: string): string {
  const words = query.toLowerCase().split(/\s+/);
  const corrected = words.map(word => {
    // Direct typo match
    if (COMMON_TYPOS[word]) {
      return COMMON_TYPOS[word];
    }

    // Fuzzy match against dictionary
    for (const [typo, correct] of Object.entries(COMMON_TYPOS)) {
      if (fuzzyMatch(word, typo, 0.9)) {
        return correct;
      }
    }

    // Fuzzy match against synonym keys
    for (const key of Object.keys(SYNONYMS)) {
      if (fuzzyMatch(word, key, 0.85)) {
        return key;
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
  soundexCodes: string[];
} {
  const corrected = autoCorrect(query);
  const expanded = expandWithSynonyms(corrected);
  const soundexCodes = expanded.map(term => soundex(term));

  return {
    original: query,
    corrected,
    expanded,
    soundexCodes: Array.from(new Set(soundexCodes)),
  };
}

// Main search function
export async function advancedSearch(
  query: string,
  portalAPI: string = 'https://portal.myschoolct.com/api/rest/search/global'
): Promise<any[]> {
  const enhanced = enhanceSearchQuery(query);

  console.log(`🔍 Advanced Search:`, {
    original: enhanced.original,
    corrected: enhanced.corrected,
    expanded: enhanced.expanded.slice(0, 5),
  });

  // Try each expanded term until we get results
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
