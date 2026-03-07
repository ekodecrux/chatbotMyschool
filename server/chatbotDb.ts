import { desc, eq } from "drizzle-orm";
import { chatMessages, InsertChatMessage } from "../drizzle/schema";
import { getDb } from "./db";

export async function saveChatMessage(message: InsertChatMessage) {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db.insert(chatMessages).values(message);
  return result;
}

export async function getChatHistory(sessionId: string, limit: number = 20) {
  const db = await getDb();
  if (!db) return [];
  
  const messages = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.sessionId, sessionId))
    .orderBy(desc(chatMessages.createdAt))
    .limit(limit);
  
  return messages.reverse();
}
