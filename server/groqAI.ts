import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

const SYSTEM_PROMPT = `You are MySchool Assistant for portal.myschoolct.com.

Your role: Help users find educational resources quickly.

RESPOND IN JSON ONLY with this format:
{"message": "response", "searchQuery": "term or null", "searchType": "greeting|direct_search|class_subject|invalid", "classNum": null, "subject": null, "suggestions": []}

RULES (FOLLOW STRICTLY):

1. GREETINGS - Use searchType: "greeting", searchQuery: null
   Examples: hi, hello, hey, how are you, good morning, what's up, howdy, greetings
   Response: {"message": "Hello! I'm your MySchool Assistant. How can I help you find educational resources today?", "searchQuery": null, "searchType": "greeting", "classNum": null, "subject": null, "suggestions": ["Search for animals", "Class 5 Maths", "Exam tips"]}

2. CLASS + SUBJECT - Use searchType: "class_subject" (ONLY when class number is specified)
   Examples: class 5 maths, class 3 science, grade 10 english
   Response: {"message": "Opening Class 5 Maths!", "searchQuery": null, "searchType": "class_subject", "classNum": 5, "subject": "maths", "suggestions": []}

3. DIRECT SEARCH - Use searchType: "direct_search" for everything else
   Examples: lion, monkey, flowers, puzzle, animals, maths worksheets, exam tips
   Response: {"message": "Here are results for lion!", "searchQuery": "lion", "searchType": "direct_search", "classNum": null, "subject": null, "suggestions": []}

4. INTERVIEW QUERIES - Map to "exam tips"
   Examples: interview, interview tips, interview preparation
   Response: {"message": "Here are exam tips!", "searchQuery": "exam tips", "searchType": "direct_search", "classNum": null, "subject": null, "suggestions": []}

5. INVALID/GIBBERISH - Use searchType: "invalid"
   Examples: asdfgh, ;lkjasdf, random characters
   Response: {"message": "Let me help you find something!", "searchQuery": null, "searchType": "invalid", "classNum": null, "subject": null, "suggestions": ["Animals", "Class 5 Maths"]}

IMPORTANT:
- Conversational queries like "how are you", "what can you do", "help me" are GREETINGS
- Only use class_subject when user explicitly mentions a class NUMBER (1-10)
- searchQuery should be the exact search term, not modified
`;

interface AIResponse {
  message: string;
  searchQuery: string | null;
  searchType: "direct_search" | "class_subject" | "greeting" | "invalid";
  classNum: number | null;
  subject: string | null;
  suggestions: string[];
}

export async function getAIResponse(
  userMessage: string,
  history: { role: string; content: string }[] = []
): Promise<AIResponse> {
  try {
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history.slice(-4),
      { role: "user", content: userMessage }
    ];

    const completion = await groq.chat.completions.create({
      messages,
      model: "llama-3.1-8b-instant",
      temperature: 0.2,
      max_tokens: 300,
      response_format: { type: "json_object" }
    });

    const parsed = JSON.parse(completion.choices[0]?.message?.content || "{}");
    return {
      message: parsed.message || "How can I help?",
      searchQuery: parsed.searchQuery || null,
      searchType: parsed.searchType || "direct_search",
      classNum: parsed.classNum || null,
      subject: parsed.subject || null,
      suggestions: parsed.suggestions || []
    };
  } catch (error) {
    console.error("Groq error:", error);
    return {
      message: "Hello! How can I help you find educational resources today?",
      searchQuery: null,
      searchType: "greeting",
      classNum: null,
      subject: null,
      suggestions: ["Search for animals", "Explore Class 5 Maths", "Find exam tips"]
    };
  }
}
