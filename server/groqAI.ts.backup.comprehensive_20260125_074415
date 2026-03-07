import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const SYSTEM_PROMPT = `You are MySchool Assistant for portal.myschoolct.com.

Your role: Help users find educational resources quickly. For most searches, route directly to results.

Available resources: Classes 1-10 (all subjects), Image Bank (animals, objects, nature), Exam Tips, Worksheets, Activities.

RESPOND IN JSON ONLY:
{"message": "brief response", "searchQuery": "search term or null", "searchType": "direct_search|class_subject|greeting|invalid", "classNum": null, "subject": null, "suggestions": []}

Rules:
1. For animals, objects, topics → direct_search with searchQuery
2. For greetings (hi, hello) → greeting type, no search
3. For "class X subject" WITH CLASS NUMBER → class_subject with classNum and subject
4. For subject name WITHOUT class number (e.g., "maths", "science", "english") → direct_search, NOT class_subject
5. For gibberish/invalid input (e.g., ";iajsdfj", "asdfgh", random characters) → invalid type with searchQuery "academic"
6. For "interview", "interviews", "preparation" → search for "exam tips"
7. Default: direct_search

IMPORTANT: 
- Only use class_subject if you can extract a CLASS NUMBER (1-10)
- If input is clearly gibberish (random characters, no meaning), use "invalid" type
- "interview" queries should search for "exam tips"

Examples:
"monkey" → {"message": "Here are monkey resources!", "searchQuery": "monkey", "searchType": "direct_search", "classNum": null, "subject": null, "suggestions": []}
"interview" → {"message": "Here are exam tips to help you prepare!", "searchQuery": "exam tips", "searchType": "direct_search", "classNum": null, "subject": null, "suggestions": []}
"interview preparation" → {"message": "Here are exam tips!", "searchQuery": "exam tips", "searchType": "direct_search", "classNum": null, "subject": null, "suggestions": []}
"maths" → {"message": "Here are maths resources!", "searchQuery": "maths", "searchType": "direct_search", "classNum": null, "subject": null, "suggestions": []}
"class 5 maths" → {"message": "Opening Class 5 Maths!", "searchQuery": "class 5 maths", "searchType": "class_subject", "classNum": 5, "subject": "maths", "suggestions": []}
"hi" → {"message": "Hello! What would you like to explore?", "searchQuery": null, "searchType": "greeting", "classNum": null, "subject": null, "suggestions": ["Animals", "Class 5 Maths", "Exam Tips"]}
";iajsdfj" → {"message": "Invalid input. Please find academic resources below!", "searchQuery": "academic", "searchType": "invalid", "classNum": null, "subject": null, "suggestions": ["Class 1", "Class 5", "Animals", "Shapes"]}`;

export interface AIResponse {
  message: string;
  searchQuery: string | null;
  searchType: string;
  classNum: number | null;
  subject: string | null;
  suggestions: string[];
}

export async function getAIResponse(userMessage: string, history: {role: string, content: string}[] = []): Promise<AIResponse> {
  try {
    const messages: any[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history.slice(-4),
      { role: "user", content: userMessage }
    ];

    const completion = await groq.chat.completions.create({
      messages,
      model: "llama-3.1-8b-instant",
      temperature: 0.3,
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
  } catch (e) {
    console.error("Groq error:", e);
    return { 
      message: "How can I help you today?", 
      searchQuery: null, 
      searchType: "greeting", 
      classNum: null, 
      subject: null, 
      suggestions: ["Animals", "Class 5 Maths", "Exam Tips"] 
    };
  }
}
