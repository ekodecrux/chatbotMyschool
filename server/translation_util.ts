import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
});

export async function translateAndExtractKeyword(text: string): Promise<{ translatedText: string; keyword: string }> {
  // If text is already primarily English, just return it
  if (/^[a-zA-Z0-9\s.,!?'-]+$/.test(text)) {
    console.log(`[Translation] Text is already English: "${text}"`);
    return { translatedText: text, keyword: text };
  }

  try {
    console.log(`[Translation] Translating: "${text}"`);
    
    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: `You are a translation assistant for MySchool educational portal.

Your task:
1. Detect the language (Telugu, Hindi, Gujarati, Tamil, Kannada, Malayalam, or other Indian languages)
2. Translate the input to English accurately
3. Extract the most important English keyword for educational resource search

Return ONLY valid JSON format: {"translatedText": "english translation", "keyword": "search_keyword"}

IMPORTANT EXAMPLES:
- Telugu "పండ్లు" or "పండు" → {"translatedText": "fruits", "keyword": "fruits"}
- Telugu "పూలు" or "పూల మొక్కలు" → {"translatedText": "flowers", "keyword": "flowers"}
- Telugu "జంతువులు" → {"translatedText": "animals", "keyword": "animals"}
- Telugu "పక్షులు" → {"translatedText": "birds", "keyword": "birds"}
- Telugu "కూరగాయలు" → {"translatedText": "vegetables", "keyword": "vegetables"}
- Hindi "फल" → {"translatedText": "fruits", "keyword": "fruits"}
- Hindi "फूल" → {"translatedText": "flowers", "keyword": "flowers"}
- Hindi "जानवर" → {"translatedText": "animals", "keyword": "animals"}
- Hindi "कक्षा 5 गणित" → {"translatedText": "class 5 maths", "keyword": "class 5 maths"}
- Tamil "பழங்கள்" → {"translatedText": "fruits", "keyword": "fruits"}
- Kannada "ಹಣ್ಣುಗಳು" → {"translatedText": "fruits", "keyword": "fruits"}

RULES:
- keyword should be a simple English word suitable for image search
- For class/grade queries, include class number in keyword
- Always return valid JSON, never return empty strings`
        },
        {
          role: 'user',
          content: text
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 150
    });

    const content = response.choices[0].message.content || '{}';
    console.log(`[Translation] Raw response: ${content}`);
    
    const result = JSON.parse(content);
    
    // Validate the result
    const translatedText = result.translatedText?.trim() || text;
    const keyword = result.keyword?.trim() || translatedText;
    
    console.log(`[Translation] SUCCESS: "${text}" → Translated: "${translatedText}" (Keyword: "${keyword}")`);
    
    return {
      translatedText,
      keyword
    };
  } catch (error) {
    console.error('[Translation] Error:', error);
    // Fallback: return original text
    return { translatedText: text, keyword: text };
  }
}
