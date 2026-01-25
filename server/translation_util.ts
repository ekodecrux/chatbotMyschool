import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
});

export async function translateAndExtractKeyword(text: string): Promise<{ translatedText: string; keyword: string }> {
  // If text is already primarily English, just return it
  if (/^[a-zA-Z0-9\s.,!?-]+$/.test(text)) {
    return { translatedText: text, keyword: text };
  }

  try {
    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: `You are a translation assistant for MySchool educational portal. 
Your task:
1. Detect the language (Telugu, Hindi, Gujarati, Tamil, or other Indian languages)
2. Translate the input to English accurately
3. Extract the most important keyword for educational resource search

Return JSON format: {"translatedText": "...", "keyword": "..."}

Examples:
Telugu "జంతువుల చిత్రాలు" → {"translatedText": "animal images", "keyword": "animals"}
Hindi "कक्षा 5 गणित" → {"translatedText": "class 5 maths", "keyword": "maths"}
Gujarati "વિજ્ઞાન પરીક્ષા" → {"translatedText": "science exam", "keyword": "science"}`
        },
        {
          role: 'user',
          content: text
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 150
    });

    const result = JSON.parse(response.choices[0].message.content || '{"translatedText": "", "keyword": ""}');
    
    // Validate the result
    const translatedText = result.translatedText?.trim() || text;
    const keyword = result.keyword?.trim() || translatedText;
    
    console.log(`[Translation] Original: "${text}" → Translated: "${translatedText}" (Keyword: "${keyword}")`);
    
    return {
      translatedText,
      keyword
    };
  } catch (error) {
    console.error('Translation error:', error);
    // Fallback: return original text
    return { translatedText: text, keyword: text };
  }
}
