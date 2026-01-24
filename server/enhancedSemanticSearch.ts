import knowledgeBase from './myschool_knowledge_base.json';

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

function phoneticMatch(w1: string, w2: string): boolean { return soundex(w1) === soundex(w2); }

function fuzzyMatch(s1: string, s2: string): number {
  s1 = s1.toLowerCase(); s2 = s2.toLowerCase();
  if (s1 === s2) return 1;
  if (s1.includes(s2) || s2.includes(s1)) return 0.8;
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
  if (/[bcdfghjklmnpqrstvwxyz]{4,}/i.test(q)) return true;
  if (!/[aeiou]/i.test(q)) return true;
  const gibberish = ['xyz', 'qwer', 'asdf', 'zxcv', 'hjkl', 'bnm'];
  for (const g of gibberish) if (q.includes(g)) return true;
  return false;
}

export function performPrioritySearch(query: string): SearchResult[] {
  const qLower = query.toLowerCase().trim();

  // PRIORITY 1: Exact One Click Resource match (smart wall, mcq bank, etc.)
  const oneClick = knowledgeBase.sections.academic.subsections.one_click_resources.resources;
  for (const r of oneClick) {
    if (isExactOneClickMatch(qLower, r.keywords)) {
      return [{ name: r.name, description: r.keywords.join(', '), url: BASE_URL + r.url, category: 'one_click', confidence: 0.99 }];
    }
  }

  // PRIORITY 2: Class queries (class 1 syllabus, class 5 maths)
  const classNum = extractClassNumber(query);
  if (classNum) {
    const subject = extractSubject(query);
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
  if (isMeaningless(query)) {
    return [{ name: 'Browse Academic Resources', description: 'Explore all resources',
      url: BASE_URL + '/views/academic', category: 'none', confidence: 0 }];
  }

  // PRIORITY 4: Text search using /views/sections/result?text=
  return [{ name: 'Search: ' + query, description: 'Searching for  + query +  across all resources',
    url: BASE_URL + '/views/sections/result?text=' + encodeURIComponent(qLower),
    category: 'search', confidence: 0.5 }];
}

export function getSuggestions(query: string): SearchResult[] {
  const results: SearchResult[] = [];
  const qLower = query.toLowerCase().trim();
  const oneClick = knowledgeBase.sections.academic.subsections.one_click_resources.resources;
  for (const r of oneClick) {
    if (isExactOneClickMatch(qLower, r.keywords)) {
      results.push({ name: r.name, description: r.keywords.slice(0,5).join(', '), url: BASE_URL + r.url, category: 'one_click', confidence: 0.95 });
    }
  }
  return results.slice(0, 4);
}
