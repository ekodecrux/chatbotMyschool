# MySchool Chatbot - API Documentation

## Overview
The MySchool Chatbot is built with Node.js, Express, and tRPC. It provides a conversational interface for users to search and discover educational resources from the MySchool Portal.

**Base URL:** `https://myschoolchatbot.in/api/trpc`

---

## Table of Contents
1. [Chat APIs](#chat-apis)
2. [Autocomplete APIs](#autocomplete-apis)
3. [Request/Response Formats](#requestresponse-formats)

---

## Chat APIs

### chatbot.chat
Main chat endpoint for conversational queries.

**Method:** POST (tRPC mutation)

**Endpoint:** `/api/trpc/chatbot.chat`

**Request Body:**
```json
{
  "json": {
    "message": "Class 3 Maths",
    "sessionId": "unique-session-id",
    "language": "en",
    "history": [
      {
        "role": "user",
        "content": "Previous message"
      },
      {
        "role": "assistant",
        "content": "Previous response"
      }
    ]
  }
}
```

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| message | string | Yes | User's query or message |
| sessionId | string | Yes | Unique session identifier for conversation tracking |
| language | string | No | Language code (en, te, hi, etc.) Default: "en" |
| history | array | No | Previous conversation messages for context |

**Response (Success with Results):**
```json
{
  "result": {
    "data": {
      "json": {
        "response": "Showing Class 3 Maths resources! Found 5 results. Click \"Open Resource\" to see more!",
        "resourceUrl": "https://portal.myschoolct.com/views/academic/class/class-3?main=0&mu=4",
        "resourceName": "Top 5 results",
        "resourceDescription": "Maths Worksheet 1, Addition Practice, Number Games",
        "suggestions": [],
        "searchType": "direct_search",
        "thumbnails": [
          {
            "url": "https://storage.url/image1.jpg",
            "thumbnail": "https://storage.url/thumb1.jpg",
            "title": "Maths Worksheet 1",
            "category": "Academic"
          }
        ]
      }
    }
  }
}
```

**Response (No Results):**
```json
{
  "result": {
    "data": {
      "json": {
        "response": "No images found for \"xyz\". Try searching for:\n• Common topics like \"animals\", \"fruits\", \"flowers\"\n• Class-based content like \"Class 5 Maths\"\n• Or browse our resource categories!",
        "resourceUrl": "",
        "resourceName": "",
        "resourceDescription": "",
        "suggestions": ["Animals", "Class 5 English", "Flowers", "Fruits"],
        "searchType": "no_results",
        "thumbnails": []
      }
    }
  }
}
```

**Response (Greeting):**
```json
{
  "result": {
    "data": {
      "json": {
        "response": "Hello! Welcome to MySchool. How can I help you find educational resources today?",
        "resourceUrl": "",
        "resourceName": "",
        "resourceDescription": "",
        "suggestions": ["Search animals", "Class 5 Maths", "Age 8 resources"],
        "searchType": "greeting",
        "thumbnails": []
      }
    }
  }
}
```

---

## Autocomplete APIs

### chatbot.autocomplete
Get search suggestions and preview results as user types.

**Method:** GET (tRPC query)

**Endpoint:** `/api/trpc/chatbot.autocomplete`

**Request:**
```
/api/trpc/chatbot.autocomplete?input={"json":{"query":"flowers","language":"en"}}
```

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| query | string | Yes | Search query (minimum 2 characters) |
| language | string | No | Language code for translation |

**Response:**
```json
{
  "result": {
    "data": {
      "json": {
        "resources": [
          {
            "name": "Browse: \"flowers\"",
            "description": "Showing top 5 results",
            "url": "https://portal.myschoolct.com/views/academic/imagebank/flowers?main=2&mu=2"
          }
        ],
        "images": [
          {
            "id": "IMG001",
            "url": "https://storage.url/flower1.jpg",
            "title": "Rose Flower",
            "category": "Image Bank"
          }
        ]
      }
    }
  }
}
```

---

## Request/Response Formats

### tRPC Batch Request
Multiple queries can be batched:
```
/api/trpc/chatbot.chat,chatbot.autocomplete?batch=1&input=...
```

### Error Response
```json
{
  "error": {
    "json": {
      "message": "Error description",
      "code": -32603,
      "data": {
        "code": "INTERNAL_SERVER_ERROR",
        "httpStatus": 500,
        "path": "chatbot.chat"
      }
    }
  }
}
```

---

## Search Types

The chatbot recognizes and handles different search types:

### 1. Greeting
- Patterns: "hi", "hello", "hey", "good morning", "namaste"
- Returns friendly greeting with suggestions

### 2. Class-based Search
- Patterns: "class 3", "3rd class", "grade 5"
- Returns class-specific resources

### 3. Class + Subject Search
- Patterns: "class 3 maths", "class 5 english"
- Returns subject-specific resources for that class

### 4. Age-based Search
- Patterns: "age 8", "8 year old", "resources for 6 years"
- Maps age to appropriate class level

### 5. Category Search
- Keywords: "animals", "birds", "flowers", "fruits", "vegetables"
- Returns category-specific images

### 6. General Search
- Any other query
- Searches across all resources

---

## Language Support

The chatbot supports regional language input with automatic translation:

### Supported Languages
| Code | Language | Example |
|------|----------|---------|
| en | English | flowers |
| te | Telugu | పూలు (flowers) |
| hi | Hindi | फूल (flowers) |
| ta | Tamil | பூக்கள் (flowers) |
| kn | Kannada | ಹೂವುಗಳು (flowers) |

### Translation Flow
1. User sends message in regional language
2. System detects non-English characters
3. Groq LLM translates to English keyword
4. Search performed with English keyword
5. Response shows original query with translation

**Example:**
- Input: `పండ్లు` (Telugu)
- Translation: `fruits`
- Response: `Found 5 results for "పండ్లు" (fruits)`

---

## Rate Limits

| Endpoint | Limit |
|----------|-------|
| chatbot.chat | 30 requests/minute |
| chatbot.autocomplete | 60 requests/minute |

---

## WebSocket Support (Future)

The chatbot is designed to support real-time communication:
```javascript
// Future implementation
const socket = io('wss://myschoolchatbot.in');
socket.emit('chat', { message: 'hello', sessionId: 'xxx' });
socket.on('response', (data) => console.log(data));
```

---

**Document Version:** 1.0
**Last Updated:** March 2026
**Developer:** info@expertaid.in
