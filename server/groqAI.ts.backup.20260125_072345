import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const SYSTEM_PROMPT = `You are MySchool Assistant for portal.myschoolct.com.

Your role: Understand user needs, ask clarifying questions if vague, suggest resources.

Available: Class 1-10 (Maths, Science, English, Hindi, Telugu, Social, EVS, Computer), Image Bank (animals, flowers, shapes), Smart Wall, MCQ Bank, Exam Tips, Visual Worksheets.

RESPOND IN JSON ONLY:
{"message": "friendly response", "searchQuery": "search term or null", "searchType": "class_subject|image_search|text_search|greeting|clarification", "classNum": null, "subject": null, "suggestions": ["sug1", "sug2"]}

Examples:
"hi" → {"message": "Hello! What would you like to explore?", "searchQuery": null, "searchType": "greeting", "classNum": null, "subject": null, "suggestions": ["Class 5 Maths", "Animal Images", "Exam Tips"]}
"maths" → {"message": "Which class Maths?", "searchQuery": null, "searchType": "clarification", "classNum": null, "subject": "maths", "suggestions": ["Class 3 Maths", "Class 5 Maths", "Class 7 Maths"]}
"class 5 maths" → {"message": "Here are Class 5 Maths resources!", "searchQuery": "class 5 maths", "searchType": "class_subject", "classNum": 5, "subject": "maths", "suggestions": ["Class 5 Science", "Class 6 Maths"]}
"animals" → {"message": "Searching animal images!", "searchQuery": "animals", "searchType": "text_search", "classNum": null, "subject": null, "suggestions": ["Lion", "Elephant"]}
"fruit" → {"message": "Here are fruit-related resources!", "searchQuery": "fruit", "searchType": "text_search", "classNum": null, "subject": null, "suggestions": ["Fruits", "Vegetables", "Animals"]}`;

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
      searchType: parsed.searchType || "greeting",
      classNum: parsed.classNum || null,
      subject: parsed.subject || null,
      suggestions: parsed.suggestions || ["Class 5 Maths", "Animals", "Exam Tips"]
    };
  } catch (e) {
    console.error("Groq error:", e);
    return { message: "How can I help you today?", searchQuery: null, searchType: "greeting", classNum: null, subject: null, suggestions: ["Class 5 Maths", "Animals"] };
  }
}
