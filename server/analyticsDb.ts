import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "./db";
import { searchAnalytics, resourceClicks, InsertSearchAnalytics, InsertResourceClick } from "../drizzle/schema";

export async function logSearchQuery(data: InsertSearchAnalytics) {
  const db = await getDb();
  if (!db) return;
  
  try {
    await db.insert(searchAnalytics).values(data);
  } catch (error) {
    // Silent fail for analytics
  }
}

export async function logResourceClick(data: InsertResourceClick) {
  const db = await getDb();
  if (!db) return;
  
  try {
    await db.insert(resourceClicks).values(data);
  } catch (error) {
    // Silent fail for analytics
  }
}

export async function getSearchTrends(days: number = 7) {
  const db = await getDb();
  if (!db) return [];
  
  const since = new Date();
  since.setDate(since.getDate() - days);
  
  const results = await db
    .select({
      query: searchAnalytics.query,
      count: sql<number>`COUNT(*)`.as("count"),
    })
    .from(searchAnalytics)
    .where(sql`${searchAnalytics.createdAt} >= ${since}`)
    .groupBy(searchAnalytics.query)
    .orderBy(desc(sql`count`))
    .limit(20);
  
  return results;
}

export async function getFailedQueries(days: number = 7) {
  const db = await getDb();
  if (!db) return [];
  
  const since = new Date();
  since.setDate(since.getDate() - days);
  
  const results = await db
    .select()
    .from(searchAnalytics)
    .where(sql`${searchAnalytics.resultsFound} = 0 AND ${searchAnalytics.createdAt} >= ${since}`)
    .orderBy(desc(searchAnalytics.createdAt))
    .limit(50);
  
  return results;
}

export async function getPopularResources(days: number = 7) {
  const db = await getDb();
  if (!db) return [];
  
  const since = new Date();
  since.setDate(since.getDate() - days);
  
  const results = await db
    .select({
      resourceName: resourceClicks.resourceName,
      resourceUrl: resourceClicks.resourceUrl,
      category: resourceClicks.category,
      clickCount: sql<number>`COUNT(*)`.as("clickCount"),
    })
    .from(resourceClicks)
    .where(sql`${resourceClicks.createdAt} >= ${since}`)
    .groupBy(resourceClicks.resourceUrl, resourceClicks.resourceName, resourceClicks.category)
    .orderBy(desc(sql`clickCount`))
    .limit(20);
  
  return results;
}

export async function getAnalyticsSummary(days: number = 7) {
  const db = await getDb();
  if (!db) return {
    totalSearches: 0,
    failedSearches: 0,
    totalClicks: 0,
    uniqueQueries: 0,
  };
  
  const since = new Date();
  since.setDate(since.getDate() - days);
  
  const [totalSearches] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(searchAnalytics)
    .where(sql`${searchAnalytics.createdAt} >= ${since}`);
  
  const [failedSearches] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(searchAnalytics)
    .where(sql`${searchAnalytics.resultsFound} = 0 AND ${searchAnalytics.createdAt} >= ${since}`);
  
  const [totalClicks] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(resourceClicks)
    .where(sql`${resourceClicks.createdAt} >= ${since}`);
  
  const [uniqueQueries] = await db
    .select({ count: sql<number>`COUNT(DISTINCT ${searchAnalytics.query})` })
    .from(searchAnalytics)
    .where(sql`${searchAnalytics.createdAt} >= ${since}`);
  
  return {
    totalSearches: totalSearches?.count || 0,
    failedSearches: failedSearches?.count || 0,
    totalClicks: totalClicks?.count || 0,
    uniqueQueries: uniqueQueries?.count || 0,
  };
}
