# MySchool Chatbot

An intelligent chatbot for the MySchool Portal with Telugu language support and academic resource search.

## Features

- Natural language query processing
- Telugu to English translation
- Class and subject-based search
- Integration with MySchool Portal API
- Real-time chat interface

## Project Structure

```
├── server/           # Node.js/TypeScript backend
│   └── src/
│       ├── index.ts
│       └── routers.ts
├── client/           # React frontend
│   └── src/
├── drizzle/          # Database migrations
├── docs/             # Documentation
├── package.json
└── drizzle.config.ts
```

## Quick Start

### Installation

```bash
pnpm install
```

### Development

```bash
pnpm dev
```

### Production Build

```bash
pnpm build
pnpm start
```

## Environment Variables

Create a `.env` file in the server directory:

```env
GROQ_API_KEY=your_groq_api_key
PORTAL_API_URL=https://your-portal-url.com
DATABASE_URL=your_database_url
```

## Documentation

See the `docs/` folder for detailed documentation:
- API Documentation
- Architecture Overview
- Deployment Guide
- Repository Structure
- UI Documentation

## License

Private - All Rights Reserved
