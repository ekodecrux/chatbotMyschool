# MySchool Chatbot - Architecture Documentation

## System Overview

The MySchool Chatbot is a conversational AI interface built with Node.js and TypeScript. It enables users to discover educational resources through natural language queries, supporting multiple languages with automatic translation.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              INTERNET                                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         NGINX REVERSE PROXY                                  │
│                      (myschoolchatbot.in:443)                               │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │                               │
                    ▼                               ▼
┌─────────────────────────────┐   ┌─────────────────────────────┐
│      REACT FRONTEND         │   │      EXPRESS BACKEND        │
│      (Static Build)         │   │      (Port 3006)            │
│                             │   │                             │
│   • React 18                │   │   • Node.js 18              │
│   • TypeScript              │   │   • tRPC                    │
│   • Tailwind CSS            │   │   • Express                 │
│   • ShadCN UI               │   │   • TypeScript              │
└─────────────────────────────┘   └──────────────┬──────────────┘
                                                  │
                    ┌─────────────────────────────┼─────────────────────────┐
                    │                             │                         │
                    ▼                             ▼                         ▼
        ┌───────────────────┐       ┌───────────────────┐     ┌───────────────────┐
        │    GROQ LLM       │       │   PORTAL API      │     │   MYSQL DATABASE  │
        │  (Translation)    │       │  (Search)         │     │   (Analytics)     │
        │                   │       │                   │     │                   │
        │  • llama-3.3-70b  │       │  • /search/global │     │  • Chat logs      │
        │  • JSON mode      │       │  • Image results  │     │  • Search queries │
        └───────────────────┘       └───────────────────┘     └───────────────────┘
```

---

## Component Architecture

### Backend Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        EXPRESS + tRPC APPLICATION                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         tRPC ROUTER                                  │   │
│  │                                                                      │   │
│  │  appRouter                                                          │   │
│  │  └── chatbot                                                        │   │
│  │      ├── chat (mutation)     - Process chat messages                │   │
│  │      └── autocomplete (query) - Get search suggestions              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                │                                            │
│                                ▼                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        SERVICES                                      │   │
│  │                                                                      │   │
│  │  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │   │
│  │  │ Translation      │  │ Search           │  │ Analytics        │  │   │
│  │  │ Service          │  │ Service          │  │ Service          │  │   │
│  │  │                  │  │                  │  │                  │  │   │
│  │  │ • Groq API       │  │ • Portal API     │  │ • Chat logging   │  │   │
│  │  │ • Language detect│  │ • Result filter  │  │ • Query logging  │  │   │
│  │  │ • JSON parsing   │  │ • URL building   │  │ • MySQL storage  │  │   │
│  │  └──────────────────┘  └──────────────────┘  └──────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Frontend Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          REACT APPLICATION                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         COMPONENTS                                   │   │
│  │                                                                      │   │
│  │  App.tsx                                                            │   │
│  │  ├── Header                                                         │   │
│  │  │   ├── Logo                                                       │   │
│  │  │   ├── LanguageSelector                                           │   │
│  │  │   └── SettingsButton                                             │   │
│  │  │                                                                  │   │
│  │  ├── ChatArea                                                       │   │
│  │  │   ├── MessageList                                                │   │
│  │  │   │   ├── UserMessage                                            │   │
│  │  │   │   └── BotMessage                                             │   │
│  │  │   │       ├── TextResponse                                       │   │
│  │  │   │       ├── ThumbnailGrid                                      │   │
│  │  │   │       └── ActionButtons                                      │   │
│  │  │   └── LoadingIndicator                                           │   │
│  │  │                                                                  │   │
│  │  ├── InputArea                                                      │   │
│  │  │   ├── TextInput                                                  │   │
│  │  │   ├── VoiceButton                                                │   │
│  │  │   └── SendButton                                                 │   │
│  │  │                                                                  │   │
│  │  └── QuickActions                                                   │   │
│  │      └── SuggestionButtons                                          │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                │                                            │
│                                ▼                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        tRPC CLIENT                                   │   │
│  │                    (@trpc/react-query)                               │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow

### Chat Request Flow

```
┌──────────┐      ┌──────────┐      ┌──────────┐      ┌──────────┐
│  Client  │      │  Server  │      │ Groq API │      │ Portal   │
└────┬─────┘      └────┬─────┘      └────┬─────┘      └────┬─────┘
     │                 │                 │                 │
     │ POST /chat      │                 │                 │
     │ {message,lang}  │                 │                 │
     │────────────────>│                 │                 │
     │                 │                 │                 │
     │                 │ Is non-English? │                 │
     │                 │───────┐         │                 │
     │                 │       │ Yes     │                 │
     │                 │<──────┘         │                 │
     │                 │                 │                 │
     │                 │ Translate       │                 │
     │                 │────────────────>│                 │
     │                 │                 │                 │
     │                 │ {keyword}       │                 │
     │                 │<────────────────│                 │
     │                 │                 │                 │
     │                 │ Search          │                 │
     │                 │─────────────────┼────────────────>│
     │                 │                 │                 │
     │                 │ Results         │                 │
     │                 │<────────────────┼─────────────────│
     │                 │                 │                 │
     │                 │ Build Response  │                 │
     │                 │───────┐         │                 │
     │                 │       │         │                 │
     │                 │<──────┘         │                 │
     │                 │                 │                 │
     │ {response,      │                 │                 │
     │  thumbnails}    │                 │                 │
     │<────────────────│                 │                 │
     │                 │                 │                 │
```

### Translation Flow

```
┌────────────────────────────────────────────────────────────────────────────┐
│                         TRANSLATION PROCESS                                 │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  Input: "పండ్లు" (Telugu)                                                   │
│           │                                                                │
│           ▼                                                                │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │  Step 1: Language Detection                                          │  │
│  │  - Check for non-ASCII characters                                    │  │
│  │  - Identify script (Telugu/Hindi/Tamil/etc.)                        │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│           │                                                                │
│           ▼                                                                │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │  Step 2: Groq LLM Translation                                        │  │
│  │  - Send to llama-3.3-70b-versatile                                  │  │
│  │  - Request JSON response                                             │  │
│  │  - Extract translatedText and keyword                               │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│           │                                                                │
│           ▼                                                                │
│  Output: { translatedText: "fruits", keyword: "fruits" }                   │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## Database Schema

### MySQL Tables

```sql
-- Chat Messages Table
CREATE TABLE chat_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id VARCHAR(255) NOT NULL,
    role ENUM('user', 'assistant') NOT NULL,
    message TEXT NOT NULL,
    language VARCHAR(10) DEFAULT 'en',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_session (session_id),
    INDEX idx_created (created_at)
);

-- Search Analytics Table
CREATE TABLE search_queries (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id VARCHAR(255) NOT NULL,
    query VARCHAR(500) NOT NULL,
    translated_query VARCHAR(500),
    language VARCHAR(10) DEFAULT 'en',
    results_count INT DEFAULT 0,
    top_result_url VARCHAR(1000),
    top_result_name VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_query (query),
    INDEX idx_language (language),
    INDEX idx_created (created_at)
);
```

---

## Key Algorithms

### Query Normalization

```typescript
// Normalize class queries for consistent matching
function normalizeClassQuery(query: string): string {
  let normalized = query.toLowerCase().trim();
  
  // "3rd class" → "class 3"
  normalized = normalized.replace(
    /(\d+)\s*(?:st|nd|rd|th)?\s*[-]?\s*class/gi, 
    'class $1'
  );
  
  // "class-3" → "class 3"
  normalized = normalized.replace(
    /class\s*-\s*(\d+)/gi, 
    'class $1'
  );
  
  return normalized.replace(/\s+/g, ' ').trim();
}
```

### Subject Detection

```typescript
const SUBJECT_MAP = {
  'maths': 4, 'math': 4, 'mathematics': 4,
  'english': 0, 'hindi': 1, 'telugu': 2,
  'science': 3, 'evs': 3,
  // ... more subjects
};

function findSubject(query: string): { name: string; mu: number } | null {
  const lower = query.toLowerCase();
  for (const [subject, mu] of Object.entries(SUBJECT_MAP)) {
    if (lower.includes(subject)) {
      return { name: subject, mu };
    }
  }
  return null;
}
```

### Result Filtering

```typescript
// Filter valid image results from portal API
function isValidImageResult(result: PortalResult): boolean {
  if (!result.thumbnail) return false;
  
  const isImageUrl = 
    result.thumbnail.includes('.jpg') ||
    result.thumbnail.includes('.png') ||
    result.thumbnail.includes('.webp') ||
    result.thumbnail.includes('r2.dev');
  
  const isNotCategory = !['Academic', 'Section'].includes(result.title);
  
  return isImageUrl && isNotCategory;
}
```

---

## Technology Stack

### Backend
| Technology | Version | Purpose |
|------------|---------|---------|
| Node.js | 18+ | Runtime |
| TypeScript | 5.x | Type safety |
| Express | 4.x | HTTP server |
| tRPC | 10.x | Type-safe API |
| Drizzle ORM | 0.28+ | Database ORM |
| Groq SDK | Latest | LLM integration |

### Frontend
| Technology | Version | Purpose |
|------------|---------|---------|
| React | 18.x | UI Framework |
| TypeScript | 5.x | Type safety |
| Tailwind CSS | 3.x | Styling |
| ShadCN UI | Latest | Components |
| @trpc/react-query | 10.x | API client |

### Infrastructure
| Technology | Purpose |
|------------|---------|
| Nginx | Reverse proxy |
| PM2 | Process manager |
| MySQL | Analytics database |
| Let's Encrypt | SSL certificates |

---

## Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        HOSTINGER VPS SERVER                                  │
│                         (Ubuntu 22.04 LTS)                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         NGINX                                        │   │
│  │                                                                      │   │
│  │  myschoolchatbot.in:443 ──────────────────────> localhost:3006      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     PM2 PROCESS MANAGER                              │   │
│  │                                                                      │   │
│  │  myschool-chatbot                                                   │   │
│  │  ├── dist/index.js                                                  │   │
│  │  ├── Port: 3006                                                     │   │
│  │  └── Instances: 1                                                   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                       MYSQL DATABASE                                 │   │
│  │                      (localhost:3306)                                │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## External Integrations

### Groq LLM API
- **Purpose:** Translation of regional languages to English
- **Model:** llama-3.3-70b-versatile
- **Features:** JSON mode for structured responses
- **Rate Limit:** Based on API key tier

### MySchool Portal API
- **Endpoint:** https://portal.myschoolct.com/api/rest/search/global
- **Purpose:** Fetch educational resources
- **Response:** Images, thumbnails, categories

---

## Performance Considerations

### Caching Strategy
- Search results cached for repeated queries
- Translation results cached by input text
- Static assets served with long cache headers

### Optimization
- Code splitting for frontend
- Lazy loading of images
- Debounced search suggestions
- Connection pooling for database

---

## Security

### Authentication
- No user authentication required
- Session-based tracking for analytics
- Rate limiting on API endpoints

### Data Protection
- HTTPS enforced
- Input sanitization
- SQL injection prevention via ORM

---

**Document Version:** 1.0
**Last Updated:** March 2026
**Developer:** info@expertaid.in
