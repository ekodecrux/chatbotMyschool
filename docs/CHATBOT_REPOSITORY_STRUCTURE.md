# MySchool Chatbot - Code Repository Structure

## Overview
This document describes the complete directory structure and file organization of the MySchool Chatbot codebase.

---

## Root Directory Structure

```
myschool-chatbot/
├── client/                    # React Frontend Application
├── server/                    # Express + tRPC Backend
├── dist/                      # Compiled production build
├── .env                       # Environment variables
├── package.json               # NPM configuration
├── pnpm-lock.yaml            # PNPM lock file
├── tsconfig.json             # TypeScript configuration
├── vite.config.ts            # Vite build configuration
├── drizzle.config.ts         # Database ORM configuration
└── README.md                  # Project documentation
```

---

## Client (Frontend) Structure

```
client/
├── src/
│   ├── App.tsx                # Main application component
│   ├── const.ts               # Constants and configuration
│   ├── main.tsx               # Application entry point
│   ├── index.css              # Global styles (Tailwind)
│   │
│   ├── lib/
│   │   ├── trpc.ts            # tRPC client configuration
│   │   └── utils.ts           # Utility functions
│   │
│   ├── components/
│   │   ├── ManusDialog.tsx    # Main chat dialog component
│   │   │
│   │   └── ui/                # ShadCN UI components
│   │       ├── button.tsx
│   │       ├── card.tsx
│   │       ├── input.tsx
│   │       ├── avatar.tsx
│   │       ├── tooltip.tsx
│   │       ├── popover.tsx
│   │       ├── sheet.tsx
│   │       ├── tabs.tsx
│   │       ├── skeleton.tsx
│   │       ├── sonner.tsx     # Toast notifications
│   │       └── ...
│   │
│   └── pages/
│       └── Home.tsx           # Home page component
│
├── public/
│   └── favicon.ico
│
├── index.html                 # HTML template
└── tailwind.config.js         # Tailwind CSS configuration
```

---

## Server (Backend) Structure

```
server/
├── index.ts                   # Server entry point
├── routers.ts                 # tRPC router definitions
├── groqAI.ts                  # Groq LLM integration
├── translation_util.ts        # Translation service
├── chatbotDb.ts              # Chat message database operations
├── analyticsDb.ts            # Search analytics operations
│
├── _core/
│   ├── trpc.ts               # tRPC initialization
│   └── index.ts              # Core exports
│
└── db/
    └── schema.ts             # Drizzle ORM schema
```

---

## Key Files Description

### Server Files

| File | Description |
|------|-------------|
| `index.ts` | Express server setup, middleware configuration, port binding |
| `routers.ts` | Main tRPC router with chat and autocomplete endpoints |
| `groqAI.ts` | Groq LLM integration for AI responses |
| `translation_util.ts` | Regional language to English translation |
| `chatbotDb.ts` | Save/retrieve chat messages from MySQL |
| `analyticsDb.ts` | Log search queries for analytics |

### Client Files

| File | Description |
|------|-------------|
| `App.tsx` | Root React component with routing |
| `const.ts` | Application constants (URLs, categories) |
| `lib/trpc.ts` | tRPC client setup with React Query |
| `components/ManusDialog.tsx` | Main chat interface component |
| `pages/Home.tsx` | Home page with chat integration |

---

## Configuration Files

### package.json
```json
{
  "name": "myschool-chatbot",
  "version": "1.0.0",
  "scripts": {
    "dev": "vite",
    "build": "vite build && esbuild server/index.ts --bundle --platform=node --outfile=dist/index.js",
    "start": "node dist/index.js",
    "preview": "vite preview"
  },
  "dependencies": {
    "@trpc/client": "^10.x",
    "@trpc/react-query": "^10.x",
    "@trpc/server": "^10.x",
    "express": "^4.x",
    "groq-sdk": "latest",
    "drizzle-orm": "^0.28.x",
    "mysql2": "^3.x",
    "react": "^18.x",
    "zod": "^3.x"
  }
}
```

### Environment Variables (.env)
```
# Server Configuration
NODE_ENV=production
PORT=3006

# Database
DATABASE_URL=mysql://user:password@localhost:3306/myschool_chatbot

# API Keys
GROQ_API_KEY=gsk_xxxxxxxxxxxxx
OPENAI_API_KEY=sk_xxxxxxxxxxxxx

# Portal API
PORTAL_API_URL=https://portal.myschoolct.com/api/rest

# Authentication
SKIP_AUTH=true
```

### TypeScript Configuration (tsconfig.json)
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "jsx": "react-jsx",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "paths": {
      "@/*": ["./src/*"],
      "@server/*": ["./server/*"]
    }
  },
  "include": ["client/src", "server"]
}
```

---

## Router Structure (routers.ts)

```typescript
// Simplified structure of routers.ts

export const appRouter = router({
  chatbot: router({
    
    // Autocomplete endpoint
    autocomplete: publicProcedure
      .input(z.object({
        query: z.string(),
        language: z.string().optional()
      }))
      .query(async ({ input }) => {
        // Returns: { resources: [], images: [] }
      }),

    // Chat endpoint
    chat: publicProcedure
      .input(z.object({
        message: z.string(),
        sessionId: z.string(),
        language: z.string().optional(),
        history: z.array(z.object({
          role: z.enum(["user", "assistant"]),
          content: z.string()
        })).optional()
      }))
      .mutation(async ({ input }) => {
        // Returns: { response, resourceUrl, thumbnails, suggestions }
      }),
      
  }),
});

export type AppRouter = typeof appRouter;
```

---

## Helper Functions

### Category Mappings (routers.ts)
```typescript
const OCRC_CATEGORIES = {
  'animals': { path: '/views/academic/imagebank/animals', mu: 0 },
  'birds': { path: '/views/academic/imagebank/birds', mu: 1 },
  'flowers': { path: '/views/academic/imagebank/flowers', mu: 2 },
  // ... more categories
};

const SUBJECT_MU = {
  'english': 0, 'hindi': 1, 'telugu': 2,
  'science': 3, 'maths': 4, 'gk': 5,
  // ... more subjects
};

const AGE_TO_CLASS = {
  3: 'nursery', 4: 'lkg', 5: 'ukg',
  6: 'class-1', 7: 'class-2',
  // ... more mappings
};
```

### Translation Service (translation_util.ts)
```typescript
export async function translateAndExtractKeyword(
  text: string
): Promise<{ translatedText: string; keyword: string }> {
  // 1. Detect if text is non-English
  // 2. Call Groq LLM for translation
  // 3. Parse JSON response
  // 4. Return translated text and keyword
}
```

---

## Build Output

### Production Build Structure
```
dist/
├── index.js              # Bundled server code (esbuild output)
├── assets/
│   ├── index-[hash].js   # Frontend bundle
│   └── index-[hash].css  # Compiled styles
└── index.html            # Frontend entry point
```

---

## Database Schema (db/schema.ts)

```typescript
import { mysqlTable, varchar, text, int, timestamp } from 'drizzle-orm/mysql-core';

export const chatMessages = mysqlTable('chat_messages', {
  id: int('id').primaryKey().autoincrement(),
  sessionId: varchar('session_id', { length: 255 }).notNull(),
  role: varchar('role', { length: 20 }).notNull(),
  message: text('message').notNull(),
  language: varchar('language', { length: 10 }).default('en'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const searchQueries = mysqlTable('search_queries', {
  id: int('id').primaryKey().autoincrement(),
  sessionId: varchar('session_id', { length: 255 }).notNull(),
  query: varchar('query', { length: 500 }).notNull(),
  translatedQuery: varchar('translated_query', { length: 500 }),
  language: varchar('language', { length: 10 }).default('en'),
  resultsCount: int('results_count').default(0),
  topResultUrl: varchar('top_result_url', { length: 1000 }),
  topResultName: varchar('top_result_name', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow(),
});
```

---

## Component Hierarchy

```
App.tsx
├── QueryClientProvider (React Query)
│   └── trpc.Provider (tRPC)
│       └── Router
│           └── Home.tsx
│               └── ManusDialog.tsx
│                   ├── Header
│                   │   ├── Logo
│                   │   └── LanguageSelect
│                   │
│                   ├── ChatArea
│                   │   ├── MessageList
│                   │   │   ├── UserMessage
│                   │   │   └── BotMessage
│                   │   │       ├── ResponseText
│                   │   │       ├── ThumbnailGrid
│                   │   │       └── OpenResourceButton
│                   │   └── TypingIndicator
│                   │
│                   ├── InputArea
│                   │   ├── TextInput
│                   │   ├── VoiceButton
│                   │   └── SendButton
│                   │
│                   └── QuickActions
│                       └── SuggestionChips
```

---

## Scripts and Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start development server with hot reload |
| `pnpm build` | Build production bundle (frontend + backend) |
| `pnpm start` | Start production server |
| `pnpm preview` | Preview production build locally |

---

## PM2 Process Management

```javascript
// ecosystem.config.js (if using PM2 config file)
module.exports = {
  apps: [{
    name: 'myschool-chatbot',
    script: 'dist/index.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      PORT: 3006
    }
  }]
};
```

---

**Document Version:** 1.0
**Last Updated:** March 2026
**Developer:** info@expertaid.in
