import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const SYSTEM_PROMPT = `You are MySchool Assistant for portal.myschoolct.com.

Your role: Help users find educational resources quickly. For most searches, route directly to results.

Available resources: Classes 1-10 (all subjects), Image Bank (animals, objects, nature), Exam Tips, Worksheets, Activities.

RESPOND IN JSON ONLY:
{"message": "brief response", "searchQuery": "search term or null", "searchType": "direct_search|class_subject|greeting", "classNum": null, "subject": null, "suggestions": []}

Rules:
1. For animals, objects, topics → direct_search with searchQuery
2. For greetings (hi, hello) → greeting type, no search
3. For "class X subject" → class_subject with classNum and subject
4. Default: direct_search

Examples:
"monkey" → {"message": "Here are monkey resources!", "searchQuery": "monkey", "searchType": "direct_search", "classNum": null, "subject": null, "suggestions": []}
"fruit" → {"message": "Here are fruit resources!", "searchQuery": "fruit", "searchType": "direct_search", "classNum": null, "subject": null, "suggestions": []}
"animals" → {"message": "Showing animal resources!", "searchQuery": "animals", "searchType": "direct_search", "classNum": null, "subject": null, "suggestions": []}
"class 5 maths" → {"message": "Opening Class 5 Maths!", "searchQuery": "class 5 maths", "searchType": "class_subject", "classNum": 5, "subject": "maths", "suggestions": []}
"hi" → {"message": "Hello! What would you like to explore?", "searchQuery": null, "searchType": "greeting", "classNum": null, "subject": null, "suggestions": ["Animals", "Class 5 Maths", "Exam Tips"]}`;

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
