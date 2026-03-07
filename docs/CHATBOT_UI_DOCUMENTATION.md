# MySchool Chatbot - UI Functionality Documentation

## Overview
The MySchool Chatbot provides a conversational interface for users to discover and access educational resources from the MySchool Portal. It features voice input, multi-language support, and visual search results.

---

## User Interface Components

### Main Chat Interface

```
┌─────────────────────────────────────────────────────────────────┐
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    HEADER                                │   │
│  │  [Logo] MySchool Help        [Language ▼] [Settings ⚙]  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                                                          │   │
│  │                    CHAT AREA                             │   │
│  │                                                          │   │
│  │  ┌─────────────────────────────────────────────────┐    │   │
│  │  │ 🤖 Hello! Welcome to MySchool. How can I help  │    │   │
│  │  │    you find educational resources today?        │    │   │
│  │  └─────────────────────────────────────────────────┘    │   │
│  │                                                          │   │
│  │                    ┌─────────────────────────────────┐  │   │
│  │                    │ 👤 Class 3 Maths               │  │   │
│  │                    └─────────────────────────────────┘  │   │
│  │                                                          │   │
│  │  ┌─────────────────────────────────────────────────┐    │   │
│  │  │ 🤖 Showing Class 3 Maths resources!             │    │   │
│  │  │    Found 5 results.                              │    │   │
│  │  │                                                  │    │   │
│  │  │    [Thumbnail Grid - 5 images]                   │    │   │
│  │  │                                                  │    │   │
│  │  │    [Open Resource →]                             │    │   │
│  │  └─────────────────────────────────────────────────┘    │   │
│  │                                                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  [🎤]  Type your message...                    [Send ➤] │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Quick Actions: [Animals] [Flowers] [Class 5] [Fruits]  │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Features

### 1. Text Input
- Type queries in the input field
- Press Enter or click Send button
- Supports English and regional languages

### 2. Voice Input
- Click microphone button to activate
- Speak your query
- Automatic speech-to-text conversion
- Works with multiple languages

**Voice Commands Examples:**
- "Show me class 5 English resources"
- "Find pictures of animals"
- "పూలు చూపించు" (Telugu: Show flowers)

### 3. Language Selection
- Dropdown menu in header
- Supported languages:
  - English (en)
  - Telugu (te)
  - Hindi (hi)
  - Tamil (ta)
  - Kannada (kn)

### 4. Search Results Display
Results are displayed in a visual grid format:

```
┌─────────────────────────────────────────────────────────────┐
│  Search Results for "flowers"                                │
│                                                              │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐       │
│  │  [img]  │  │  [img]  │  │  [img]  │  │  [img]  │       │
│  │  Rose   │  │  Lily   │  │ Jasmine │  │  Lotus  │       │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘       │
│                                                              │
│  [Open Resource →]  Opens full view in portal                │
└─────────────────────────────────────────────────────────────┘
```

### 5. Quick Action Buttons
Pre-defined search buttons for common queries:
- Animals
- Birds
- Flowers
- Fruits
- Class 1-10
- Nursery/LKG/UKG

### 6. Conversation History
- Messages persist within session
- Scroll through previous exchanges
- Context-aware responses

---

## User Flows

### Flow 1: Basic Search

```
User Journey:
1. User opens chatbot
2. Types "flowers" in input
3. Presses Enter
4. Chatbot shows 5 flower images
5. User clicks "Open Resource"
6. Redirects to portal with full results
```

### Flow 2: Voice Search

```
User Journey:
1. User clicks microphone icon
2. Browser requests microphone permission
3. User speaks "Class 5 Maths"
4. Speech converted to text
5. Query sent automatically
6. Results displayed with thumbnails
```

### Flow 3: Regional Language Search

```
User Journey:
1. User selects "Telugu" from language dropdown
2. Types "పండ్లు" (fruits in Telugu)
3. System translates to "fruits"
4. Search performed for "fruits"
5. Results shown with translation note:
   "Found 5 results for 'పండ్లు' (fruits)"
```

### Flow 4: Class + Subject Search

```
User Journey:
1. User types "Class 3 Maths"
2. System parses: class=3, subject=maths
3. Searches for class 3 maths content
4. Results show maths worksheets for class 3
5. "Open Resource" links to filtered portal view
```

---

## Response Types

### Greeting Response
When user says hello, hi, etc.
```
🤖 Hello! Welcome to MySchool. How can I help you
   find educational resources today?

   Suggested: [Animals] [Class 5 Maths] [Flowers]
```

### Search Results Response
When search finds matches
```
🤖 Showing top 5 results for "animals"

   [🖼️] [🖼️] [🖼️] [🖼️] [🖼️]
   Lion   Tiger  Bear  Deer  Fox

   [Open Resource →]
```

### No Results Response
When no matches found
```
🤖 No images found for "xyz"

   Try searching for:
   • Common topics like "animals", "fruits"
   • Class content like "Class 5 Maths"
   
   Suggested: [Animals] [Flowers] [Fruits]
```

### Translation Response
When regional language is used
```
👤 పండ్లు

🤖 Found 5 results for "పండ్లు" (fruits)

   [🖼️] [🖼️] [🖼️] [🖼️] [🖼️]

   [Open Resource →]
```

---

## Mobile Responsiveness

### Mobile View
```
┌─────────────────────────┐
│ [≡] MySchool Help  [🌐] │
├─────────────────────────┤
│                         │
│  Chat messages          │
│  displayed here         │
│                         │
│  ┌─────┐ ┌─────┐       │
│  │ img │ │ img │       │
│  └─────┘ └─────┘       │
│                         │
├─────────────────────────┤
│ [🎤] Message...   [➤]  │
├─────────────────────────┤
│ [Animals] [Flowers]     │
└─────────────────────────┘
```

### Touch Interactions
- Tap to send message
- Long press microphone for voice
- Swipe to scroll chat history
- Tap thumbnails to preview

---

## Accessibility Features

- Keyboard navigation support
- Screen reader compatible
- High contrast mode option
- Voice input for hands-free use
- Alt text for all images
- Focus indicators

---

## Settings Panel

```
┌─────────────────────────────────────┐
│ Settings                        [X] │
├─────────────────────────────────────┤
│                                     │
│ Language: [English        ▼]        │
│                                     │
│ Voice Input: [ON / off]             │
│                                     │
│ Theme: [Light / Dark]               │
│                                     │
│ Clear History: [Clear]              │
│                                     │
└─────────────────────────────────────┘
```

---

## Error States

### Network Error
```
┌─────────────────────────────────────┐
│ ⚠️ Connection Error                 │
│                                     │
│ Unable to connect to server.        │
│ Please check your internet.         │
│                                     │
│ [Retry]                             │
└─────────────────────────────────────┘
```

### Voice Permission Denied
```
┌─────────────────────────────────────┐
│ 🎤 Microphone Access Required       │
│                                     │
│ Please allow microphone access      │
│ to use voice input.                 │
│                                     │
│ [Enable in Settings]                │
└─────────────────────────────────────┘
```

---

## Integration with Portal

The chatbot integrates with MySchool Portal:

1. **"Open Resource" Button**
   - Opens portal.myschoolct.com
   - Pre-filtered to search results
   - User can browse full catalog

2. **Thumbnail Links**
   - Click thumbnail → Preview in portal
   - Download/Print requires portal login

3. **Session Continuity**
   - Same session ID for analytics
   - Track user journey from chat to download

---

**Document Version:** 1.0
**Last Updated:** March 2026
**Developer:** info@expertaid.in
