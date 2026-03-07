import knowledgeBase from './myschool_knowledge_base.json';

// Enhanced Soundex for better phonetic matching
function soundex(str: string): string {
  const s = str.toUpperCase().replace(/[^A-Z]/g, '');
  if (s.length === 0) return '0000';
  const firstLetter = s[0];
  const codes: { [key: string]: string } = {
    'B': '1', 'F': '1', 'P': '1', 'V': '1',
    'C': '2', 'G': '2', 'J': '2', 'K': '2', 'Q': '2', 'S': '2', 'X': '2', 'Z': '2',
    'D': '3', 'T': '3', 'L': '4', 'M': '5', 'N': '5', 'R': '6'
  };
  let code = firstLetter, prevCode = codes[firstLetter] || '0';
  for (let i = 1; i < s.length && code.length < 4; i++) {
    const currentCode = codes[s[i]] || '0';
    if (currentCode !== '0' && currentCode !== prevCode) code += currentCode;
    if (currentCode !== '0') prevCode = currentCode;
  }
  return (code + '0000').substring(0, 4);
}

// Levenshtein distance for fuzzy matching
function levenshtein(a: string, b: string): number {
  a = a.toLowerCase();
  b = b.toLowerCase();
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = a[j - 1] === b[i - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[b.length][a.length];
}

// Spell correction using common word dictionary
const COMMON_WORDS: Record<string, string> = {
  // Puzzle variations
  'puzle': 'puzzle', 'puzel': 'puzzle', 'puzzles': 'puzzle',
  'puzles': 'puzzle', 'puzzl': 'puzzle', 'puzzel': 'puzzle',
  // Image variations
  'imges': 'images', 'imags': 'images', 'imagse': 'images', 'iamges': 'images',
  'pictres': 'pictures', 'picutres': 'pictures', 'picturs': 'pictures',
  // Chart variations
  'chrat': 'chart', 'chrts': 'charts', 'chrats': 'charts', 'cahrt': 'chart',
  // Animal variations
  'animls': 'animals', 'anmals': 'animals', 'animales': 'animals', 'animlas': 'animals',
  // Math variations
  'maths': 'maths', 'mathss': 'maths', 'mats': 'maths', 'mahs': 'maths',
  // Science variations
  'scince': 'science', 'sceince': 'science', 'sciense': 'science', 'sicence': 'science',
  // English variations
  'englsh': 'english', 'engish': 'english', 'enlgish': 'english',
  // Exam variations
  'exm': 'exam', 'exams': 'exam', 'exma': 'exam', 'examm': 'exam',
  // Tips variations
  'tps': 'tips', 'tipss': 'tips', 'tisp': 'tips',
  // Worksheet variations
  'workshet': 'worksheet', 'workseet': 'worksheet', 'worksheets': 'worksheets',
  'worksehet': 'worksheet', 'worsheet': 'worksheet',
  // Syllabus variations
  'sylabus': 'syllabus', 'sillabus': 'syllabus', 'syllbus': 'syllabus', 'syllabu': 'syllabus',
  // Fruit variations
  'fruts': 'fruits', 'fruist': 'fruits', 'frutis': 'fruits', 'fruite': 'fruits',
  'fruit': 'fruit', 'fruits': 'fruits', 'fruites': 'fruits',
  // Smart variations
  'smrat': 'smart', 'samrt': 'smart', 'smrt': 'smart',
  // Wall variations
  'wll': 'wall', 'wal': 'wall', 'walll': 'wall',
  // Telugu variations
  'telgu': 'telugu', 'telegu': 'telugu', 'telugue': 'telugu',
  // Poem variations
  'poam': 'poem', 'pome': 'poem', 'poams': 'poems', 'pomes': 'poems',
  // Class variations
  'clas': 'class', 'clss': 'class', 'classs': 'class',
  // Bank variations
  'bnk': 'bank', 'bnak': 'bank', 'bakn': 'bank',
  // MCQ variations
  'mcqs': 'mcq', 'mcq\'s': 'mcq', 'mcss': 'mcq',
  // Resource variations
  'resourse': 'resource', 'resorce': 'resource', 'resourc': 'resource',
  // Video variations
  'vido': 'video', 'vidoe': 'video', 'vidoes': 'videos', 'vidos': 'videos',
};

// Correct spelling using dictionary and fuzzy matching
function correctSpelling(query: string): string {
  const words = query.toLowerCase().split(/\s+/);
  const corrected = words.map(word => {
    // Direct match in dictionary
    if (COMMON_WORDS[word]) return COMMON_WORDS[word];
    
    // Fuzzy match - find best match from dictionary
    let bestMatch = word;
    let bestDistance = 3; // max distance threshold
    
    for (const [misspelled, correct] of Object.entries(COMMON_WORDS)) {
      const dist = levenshtein(word, misspelled);
      if (dist < bestDistance) {
        bestDistance = dist;
        bestMatch = correct;
      }
      // Also check against correct words
      const distToCorrect = levenshtein(word, correct);
      if (distToCorrect < bestDistance) {
        bestDistance = distToCorrect;
        bestMatch = correct;
      }
    }
    
    // Phonetic matching as fallback
    if (bestMatch === word && word.length > 3) {
      const wordSoundex = soundex(word);
      for (const [_, correct] of Object.entries(COMMON_WORDS)) {
        if (soundex(correct) === wordSoundex) {
          return correct;
        }
      }
    }
    
    return bestMatch;
  });
  
  return corrected.join(' ');
}

function phoneticMatch(w1: string, w2: string): boolean { return soundex(w1) === soundex(w2); }

function fuzzyMatch(s1: string, s2: string): number {
  s1 = s1.toLowerCase(); s2 = s2.toLowerCase();
  if (s1 === s2) return 1;
  if (s1.includes(s2) || s2.includes(s1)) return 0.8;
  // Add Levenshtein-based similarity
  const maxLen = Math.max(s1.length, s2.length);
  const dist = levenshtein(s1, s2);
  const similarity = 1 - (dist / maxLen);
  if (similarity > 0.7) return similarity;
  return 0;
}

export interface SearchResult { name: string; description: string; url: string; category: string; confidence: number; }

const BASE_URL = 'https://portal.myschoolct.com';

// Strict exact match for One Click Resources
function isExactOneClickMatch(query: string, keywords: string[]): boolean {
  const qLower = query.toLowerCase().trim();
  for (const kw of keywords) {
    const kwLower = kw.toLowerCase();
    if (qLower === kwLower) return true;
    if (qLower.split(' ').join('') === kwLower.split(' ').join('')) return true;
  }
  return false;
}

function extractClassNumber(query: string): number | null {
  const patterns = [/(\d+)(?:st|nd|rd|th)?\s*(?:class|grade|std)/i, /(?:class|grade|std)\s*(\d+)/i];
  for (const p of patterns) { const m = query.match(p); if (m) { const v = parseInt(m[1]); if (v >= 1 && v <= 10) return v; } }
  return null;
}

function extractSubject(query: string): string | null {
  const subjects: any = knowledgeBase.sections.academic.subsections.grades.subjects;
  const qLower = query.toLowerCase();
  for (const [name, data] of Object.entries(subjects)) {
    for (const kw of (data as any).keywords) {
      if (qLower.includes(kw.toLowerCase())) return name;
    }
  }
  return null;
}

function isMeaningless(q: string): boolean {
  q = q.trim().toLowerCase();
  if (q.length < 2) return true;
  if (!/[a-zA-Z]/.test(q)) return true;
  if (!/[aeiou]/i.test(q)) return true;
  // Only check gibberish patterns for short strings
  if (q.length < 6) {
    const gibberish = ['xyz', 'qwer', 'asdf', 'zxcv', 'hjkl', 'bnm'];
    for (const g of gibberish) if (q.includes(g)) return true;
  }
  return false;
}

export function performPrioritySearch(query: string): SearchResult[] {
  // Apply spell correction first
  const correctedQuery = correctSpelling(query);
  const qLower = correctedQuery.toLowerCase().trim();

  // PRIORITY 1: Exact One Click Resource match (smart wall, mcq bank, etc.)
  const oneClick = knowledgeBase.sections.academic.subsections.one_click_resources.resources;
  for (const r of oneClick) {
    if (isExactOneClickMatch(qLower, r.keywords)) {
      return [{ name: r.name, description: r.keywords.join(', '), url: BASE_URL + r.url, category: 'one_click', confidence: 0.99 }];
    }
  }

  // PRIORITY 2: Class queries (class 1 syllabus, class 5 maths)
  const classNum = extractClassNumber(correctedQuery);
  if (classNum) {
    const subject = extractSubject(correctedQuery);
    if (subject) {
      const subjects: any = knowledgeBase.sections.academic.subsections.grades.subjects;
      const subjectData = subjects[subject];
      if (subjectData && subjectData.code !== 'unknown') {
        return [{ name: 'Class ' + classNum + ' ' + subject.charAt(0).toUpperCase() + subject.slice(1),
          description: 'Access Class ' + classNum + ' ' + subject + ' curriculum',
          url: BASE_URL + '/views/academic/class/class-' + classNum + '?main=1&mu=' + subjectData.code,
          category: 'class_subject', confidence: 0.95 }];
      }
    }
    return [{ name: 'Class ' + classNum + ' Resources', description: 'All Class ' + classNum + ' resources',
      url: BASE_URL + '/views/academic/class/class-' + classNum, category: 'class_subject', confidence: 0.9 }];
  }

  // PRIORITY 3: Meaningless/gibberish -> academic page
  if (isMeaningless(correctedQuery)) {
    return [{ name: 'Browse Academic Resources', description: 'Explore all resources',
      url: BASE_URL + '/views/academic', category: 'none', confidence: 0 }];
  }

  // PRIORITY 4: Text search using /views/sections/result?text=
  // Use the corrected query for search
  return [{ name: 'Search: ' + correctedQuery, description: 'Searching for ' + correctedQuery + ' across all resources',
    url: BASE_URL + '/views/sections/result?text=' + encodeURIComponent(qLower),
    category: 'search', confidence: 0.5 }];
}

export function getSuggestions(query: string): SearchResult[] {
  const results: SearchResult[] = [];
  const correctedQuery = correctSpelling(query);
  const qLower = correctedQuery.toLowerCase().trim();
  const oneClick = knowledgeBase.sections.academic.subsections.one_click_resources.resources;
  for (const r of oneClick) {
    if (isExactOneClickMatch(qLower, r.keywords)) {
      results.push({ name: r.name, description: r.keywords.slice(0,5).join(', '), url: BASE_URL + r.url, category: 'one_click', confidence: 0.95 });
    }
  }
  return results.slice(0, 4);
}

// Export spell correction for use in router
export { correctSpelling };
