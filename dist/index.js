// server/_core/index.ts
import "dotenv/config";
import express2 from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

// shared/const.ts
var UNAUTHED_ERR_MSG = "Unauthorized";
var NOT_ADMIN_ERR_MSG = "Not an admin";
var COOKIE_NAME = "auth_token";
var ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1e3;
var AXIOS_TIMEOUT_MS = 3e4;

// server/db.ts
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";

// drizzle/schema.ts
import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";
var users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull()
});
var searchAnalytics = mysqlTable("search_analytics", {
  id: int("id").autoincrement().primaryKey(),
  query: text("query").notNull(),
  translatedQuery: text("translatedQuery"),
  language: varchar("language", { length: 10 }).default("en").notNull(),
  resultsFound: int("resultsFound").default(0).notNull(),
  topResultUrl: text("topResultUrl"),
  topResultName: text("topResultName"),
  sessionId: varchar("sessionId", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var resourceClicks = mysqlTable("resource_clicks", {
  id: int("id").autoincrement().primaryKey(),
  resourceUrl: text("resourceUrl").notNull(),
  resourceName: text("resourceName").notNull(),
  category: varchar("category", { length: 50 }),
  query: text("query"),
  sessionId: varchar("sessionId", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var chatMessages = mysqlTable("chat_messages", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: varchar("sessionId", { length: 255 }).notNull(),
  role: mysqlEnum("role", ["user", "assistant"]).notNull(),
  message: text("message").notNull(),
  language: varchar("language", { length: 10 }).default("en"),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});

// server/_core/env.ts
var ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? ""
};

// server/db.ts
var _db = null;
async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}
async function upsertUser(user) {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }
  try {
    const values = {
      openId: user.openId
    };
    const updateSet = {};
    const textFields = ["name", "email", "loginMethod"];
    const assignNullable = (field) => {
      const value = user[field];
      if (value === void 0) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== void 0) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== void 0) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }
    if (!values.lastSignedIn) {
      values.lastSignedIn = /* @__PURE__ */ new Date();
    }
    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = /* @__PURE__ */ new Date();
    }
    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}
async function getUserByOpenId(openId) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return void 0;
  }
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}

// server/_core/cookies.ts
function isSecureRequest(req) {
  if (req.protocol === "https") return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;
  const protoList = Array.isArray(forwardedProto) ? forwardedProto : forwardedProto.split(",");
  return protoList.some((proto) => proto.trim().toLowerCase() === "https");
}
function getSessionCookieOptions(req) {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "none",
    secure: isSecureRequest(req)
  };
}

// shared/_core/errors.ts
var HttpError = class extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.name = "HttpError";
  }
};
var ForbiddenError = (msg) => new HttpError(403, msg);

// server/_core/sdk.ts
import axios from "axios";
import { parse as parseCookieHeader } from "cookie";
import { SignJWT, jwtVerify } from "jose";
var isNonEmptyString = (value) => typeof value === "string" && value.length > 0;
var EXCHANGE_TOKEN_PATH = `/webdev.v1.WebDevAuthPublicService/ExchangeToken`;
var GET_USER_INFO_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfo`;
var GET_USER_INFO_WITH_JWT_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`;
var OAuthService = class {
  constructor(client) {
    this.client = client;
    console.log("[OAuth] Initialized with baseURL:", ENV.oAuthServerUrl);
    if (!ENV.oAuthServerUrl) {
      console.error(
        "[OAuth] ERROR: OAUTH_SERVER_URL is not configured! Set OAUTH_SERVER_URL environment variable."
      );
    }
  }
  decodeState(state) {
    const redirectUri = atob(state);
    return redirectUri;
  }
  async getTokenByCode(code, state) {
    const payload = {
      clientId: ENV.appId,
      grantType: "authorization_code",
      code,
      redirectUri: this.decodeState(state)
    };
    const { data } = await this.client.post(
      EXCHANGE_TOKEN_PATH,
      payload
    );
    return data;
  }
  async getUserInfoByToken(token) {
    const { data } = await this.client.post(
      GET_USER_INFO_PATH,
      {
        accessToken: token.accessToken
      }
    );
    return data;
  }
};
var createOAuthHttpClient = () => axios.create({
  baseURL: ENV.oAuthServerUrl,
  timeout: AXIOS_TIMEOUT_MS
});
var SDKServer = class {
  client;
  oauthService;
  constructor(client = createOAuthHttpClient()) {
    this.client = client;
    this.oauthService = new OAuthService(this.client);
  }
  deriveLoginMethod(platforms, fallback) {
    if (fallback && fallback.length > 0) return fallback;
    if (!Array.isArray(platforms) || platforms.length === 0) return null;
    const set = new Set(
      platforms.filter((p) => typeof p === "string")
    );
    if (set.has("REGISTERED_PLATFORM_EMAIL")) return "email";
    if (set.has("REGISTERED_PLATFORM_GOOGLE")) return "google";
    if (set.has("REGISTERED_PLATFORM_APPLE")) return "apple";
    if (set.has("REGISTERED_PLATFORM_MICROSOFT") || set.has("REGISTERED_PLATFORM_AZURE"))
      return "microsoft";
    if (set.has("REGISTERED_PLATFORM_GITHUB")) return "github";
    const first = Array.from(set)[0];
    return first ? first.toLowerCase() : null;
  }
  /**
   * Exchange OAuth authorization code for access token
   * @example
   * const tokenResponse = await sdk.exchangeCodeForToken(code, state);
   */
  async exchangeCodeForToken(code, state) {
    return this.oauthService.getTokenByCode(code, state);
  }
  /**
   * Get user information using access token
   * @example
   * const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
   */
  async getUserInfo(accessToken) {
    const data = await this.oauthService.getUserInfoByToken({
      accessToken
    });
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  parseCookies(cookieHeader) {
    if (!cookieHeader) {
      return /* @__PURE__ */ new Map();
    }
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }
  getSessionSecret() {
    const secret = ENV.cookieSecret;
    return new TextEncoder().encode(secret);
  }
  /**
   * Create a session token for a Manus user openId
   * @example
   * const sessionToken = await sdk.createSessionToken(userInfo.openId);
   */
  async createSessionToken(openId, options = {}) {
    return this.signSession(
      {
        openId,
        appId: ENV.appId,
        name: options.name || ""
      },
      options
    );
  }
  async signSession(payload, options = {}) {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1e3);
    const secretKey = this.getSessionSecret();
    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name
    }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime(expirationSeconds).sign(secretKey);
  }
  async verifySession(cookieValue) {
    if (!cookieValue) {
      console.warn("[Auth] Missing session cookie");
      return null;
    }
    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"]
      });
      const { openId, appId, name } = payload;
      if (!isNonEmptyString(openId) || !isNonEmptyString(appId) || !isNonEmptyString(name)) {
        console.warn("[Auth] Session payload missing required fields");
        return null;
      }
      return {
        openId,
        appId,
        name
      };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }
  async getUserInfoWithJwt(jwtToken) {
    const payload = {
      jwtToken,
      projectId: ENV.appId
    };
    const { data } = await this.client.post(
      GET_USER_INFO_WITH_JWT_PATH,
      payload
    );
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  async authenticateRequest(req) {
    const cookies = this.parseCookies(req.headers.cookie);
    const sessionCookie = cookies.get(COOKIE_NAME);
    const session = await this.verifySession(sessionCookie);
    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }
    const sessionUserId = session.openId;
    const signedInAt = /* @__PURE__ */ new Date();
    let user = await getUserByOpenId(sessionUserId);
    if (!user) {
      try {
        const userInfo = await this.getUserInfoWithJwt(sessionCookie ?? "");
        await upsertUser({
          openId: userInfo.openId,
          name: userInfo.name || null,
          email: userInfo.email ?? null,
          loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
          lastSignedIn: signedInAt
        });
        user = await getUserByOpenId(userInfo.openId);
      } catch (error) {
        console.error("[Auth] Failed to sync user from OAuth:", error);
        throw ForbiddenError("Failed to sync user info");
      }
    }
    if (!user) {
      throw ForbiddenError("User not found");
    }
    await upsertUser({
      openId: user.openId,
      lastSignedIn: signedInAt
    });
    return user;
  }
};
var sdk = new SDKServer();

// server/_core/oauth.ts
function getQueryParam(req, key) {
  const value = req.query[key];
  return typeof value === "string" ? value : void 0;
}
function registerOAuthRoutes(app) {
  app.get("/api/oauth/callback", async (req, res) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }
    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }
      await upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: /* @__PURE__ */ new Date()
      });
      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS
      });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}

// server/routers.ts
import { z } from "zod";

// server/_core/trpc.ts
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
var t = initTRPC.context().create({
  transformer: superjson
});
var router = t.router;
var publicProcedure = t.procedure;
var requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user
    }
  });
});
var protectedProcedure = t.procedure.use(requireUser);
var adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.user
      }
    });
  })
);

// server/myschool_knowledge_base.json
var myschool_knowledge_base_default = {
  base_url: "https://portal.myschoolct.com",
  sections: {
    academic: {
      name: "Academic",
      url: "/views/academic",
      description: "Access academic resources by class and subject",
      keywords: ["academic"],
      subsections: {
        grades: {
          description: "Classes 1-10 curriculum",
          subjects: {
            computer: { code: "com", keywords: ["computer", "computers", "computing", "coding", "programming"] },
            english: { code: "eng", keywords: ["english", "grammar"] },
            evs: { code: "evs", keywords: ["evs", "environmental studies", "environment"] },
            hindi: { code: "hin", keywords: ["hindi"] },
            maths: { code: "mat", keywords: ["maths", "mathematics", "math"] },
            science: { code: "sci", keywords: ["science", "physics", "chemistry", "biology"] },
            social: { code: "soc", keywords: ["social", "social studies", "history", "geography", "civics"] },
            telugu: { code: "tel", keywords: ["telugu"] }
          }
        },
        one_click_resources: {
          description: "One Click Resource Centre",
          resources: [
            {
              name: "Smart Wall",
              url: "/views/academic/smart-wall?ocrc",
              keywords: ["smart wall", "smartwall", "class decoration", "classroom decoration"]
            },
            {
              name: "Image Bank",
              url: "/views/sections/image-bank",
              keywords: ["image bank", "imagebank"]
            },
            {
              name: "Exam Tips",
              url: "/views/academic/result?text=exam tips",
              keywords: ["exam tips", "examtips"]
            },
            {
              name: "MCQ Bank",
              url: "/views/academic/result?text=mcq",
              keywords: ["mcq bank", "mcqbank", "mcq"]
            },
            {
              name: "Visual Worksheets",
              url: "/views/academic/result?text=visual worksheets",
              keywords: ["visual worksheets", "visual worksheet"]
            },
            {
              name: "Pictorial Stories",
              url: "/views/academic/result?text=pictorial stories",
              keywords: ["pictorial stories", "pictorial story"]
            }
          ]
        }
      }
    }
  }
};

// server/enhancedSemanticSearch.ts
var BASE_URL = "https://portal.myschoolct.com";
function isExactOneClickMatch(query, keywords) {
  const qLower = query.toLowerCase().trim();
  for (const kw of keywords) {
    const kwLower = kw.toLowerCase();
    if (qLower === kwLower) return true;
    if (qLower.split(" ").join("") === kwLower.split(" ").join("")) return true;
  }
  return false;
}
function extractClassNumber(query) {
  const patterns = [/(\d+)(?:st|nd|rd|th)?\s*(?:class|grade|std)/i, /(?:class|grade|std)\s*(\d+)/i];
  for (const p of patterns) {
    const m = query.match(p);
    if (m) {
      const v = parseInt(m[1]);
      if (v >= 1 && v <= 10) return v;
    }
  }
  return null;
}
function extractSubject(query) {
  const subjects = myschool_knowledge_base_default.sections.academic.subsections.grades.subjects;
  const qLower = query.toLowerCase();
  for (const [name, data] of Object.entries(subjects)) {
    for (const kw of data.keywords) {
      if (qLower.includes(kw.toLowerCase())) return name;
    }
  }
  return null;
}
function isMeaningless(q) {
  q = q.trim().toLowerCase();
  if (q.length < 2) return true;
  if (!/[a-zA-Z]/.test(q)) return true;
  if (!/[aeiou]/i.test(q)) return true;
  if (q.length < 6) {
    const gibberish = ["xyz", "qwer", "asdf", "zxcv", "hjkl", "bnm"];
    for (const g of gibberish) if (q.includes(g)) return true;
  }
  return false;
}
function performPrioritySearch(query) {
  const qLower = query.toLowerCase().trim();
  const oneClick = myschool_knowledge_base_default.sections.academic.subsections.one_click_resources.resources;
  for (const r of oneClick) {
    if (isExactOneClickMatch(qLower, r.keywords)) {
      return [{ name: r.name, description: r.keywords.join(", "), url: BASE_URL + r.url, category: "one_click", confidence: 0.99 }];
    }
  }
  const classNum = extractClassNumber(query);
  if (classNum) {
    const subject = extractSubject(query);
    if (subject) {
      const subjects = myschool_knowledge_base_default.sections.academic.subsections.grades.subjects;
      const subjectData = subjects[subject];
      if (subjectData && subjectData.code !== "unknown") {
        return [{
          name: "Class " + classNum + " " + subject.charAt(0).toUpperCase() + subject.slice(1),
          description: "Access Class " + classNum + " " + subject + " curriculum",
          url: BASE_URL + "/views/academic/class/class-" + classNum + "?main=1&mu=" + subjectData.code,
          category: "class_subject",
          confidence: 0.95
        }];
      }
    }
    return [{
      name: "Class " + classNum + " Resources",
      description: "All Class " + classNum + " resources",
      url: BASE_URL + "/views/academic/class/class-" + classNum,
      category: "class_subject",
      confidence: 0.9
    }];
  }
  if (isMeaningless(query)) {
    return [{
      name: "Browse Academic Resources",
      description: "Explore all resources",
      url: BASE_URL + "/views/academic",
      category: "none",
      confidence: 0
    }];
  }
  return [{
    name: "Search: " + query,
    description: "Searching for  + query +  across all resources",
    url: BASE_URL + "/views/sections/result?text=" + encodeURIComponent(qLower),
    category: "search",
    confidence: 0.5
  }];
}
function getSuggestions(query) {
  const results = [];
  const qLower = query.toLowerCase().trim();
  const oneClick = myschool_knowledge_base_default.sections.academic.subsections.one_click_resources.resources;
  for (const r of oneClick) {
    if (isExactOneClickMatch(qLower, r.keywords)) {
      results.push({ name: r.name, description: r.keywords.slice(0, 5).join(", "), url: BASE_URL + r.url, category: "one_click", confidence: 0.95 });
    }
  }
  return results.slice(0, 4);
}

// server/translation_util.ts
import OpenAI from "openai";
import dotenv from "dotenv";
dotenv.config();
var groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1"
});
async function translateAndExtractKeyword(text2) {
  if (/^[a-zA-Z0-9\s.,!?-]+$/.test(text2)) {
    return { translatedText: text2, keyword: text2 };
  }
  try {
    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: 'You are a translation assistant. Translate the user input to English and extract the most important single keyword for image search. Return JSON format: {"translatedText": "...", "keyword": "..."}'
        },
        {
          role: "user",
          content: text2
        }
      ],
      response_format: { type: "json_object" }
    });
    const result = JSON.parse(response.choices[0].message.content || '{"translatedText": "", "keyword": ""}');
    return {
      translatedText: result.translatedText || text2,
      keyword: result.keyword || text2
    };
  } catch (error) {
    console.error("Translation error:", error);
    return { translatedText: text2, keyword: text2 };
  }
}

// server/chatbotDb.ts
import { desc, eq as eq2 } from "drizzle-orm";
async function saveChatMessage(message) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(chatMessages).values(message);
  return result;
}

// server/analyticsDb.ts
import { desc as desc2, sql } from "drizzle-orm";
async function logSearchQuery(data) {
  const db = await getDb();
  if (!db) return;
  try {
    await db.insert(searchAnalytics).values(data);
  } catch (error) {
  }
}

// server/routers.ts
var GREETINGS = ["hi", "hello", "hey", "hii", "hiii", "good morning", "good afternoon", "good evening", "namaste", "howdy", "sup", "yo"];
var CASUAL_PHRASES = ["how are you", "what's up", "whatsup", "wassup", "thank you", "thanks", "bye", "goodbye", "ok", "okay", "hmm", "what", "who are you", "help"];
function isGreetingOrCasual(text2) {
  const lower = text2.toLowerCase().trim();
  return GREETINGS.some((g) => lower === g || lower.startsWith(g + " ")) || CASUAL_PHRASES.some((p) => lower.includes(p));
}
function getInteractiveResponse(text2) {
  const lower = text2.toLowerCase().trim();
  if (GREETINGS.some((g) => lower === g || lower.startsWith(g + " "))) {
    return {
      response: "Hello! \u{1F44B} I'm your MySchool Assistant. I can help you find educational resources. What are you looking for today?",
      suggestions: ["Class 5 Maths", "Animals Images", "Telugu Poems", "Science Experiments"]
    };
  }
  if (lower.includes("thank")) {
    return {
      response: "You're welcome! \u{1F60A} Is there anything else I can help you find?",
      suggestions: ["Image Bank", "Smart Wall", "MCQ Bank"]
    };
  }
  if (lower.includes("help") || lower.includes("what can you do")) {
    return {
      response: `I can help you find:
\u2022 **Class Resources** - Try "Class 5 Science"
\u2022 **Images** - Try "Animals" or "Flowers"
\u2022 **Study Materials** - Try "MCQ Bank" or "Exam Tips"

Just type what you're looking for!`,
      suggestions: ["Class 3 English", "Lion Images", "Telugu Stories"]
    };
  }
  if (lower.includes("who are you")) {
    return {
      response: "I'm MySchool Assistant - your intelligent guide to portal.myschoolct.com! I help students and teachers find educational resources quickly. Try searching for a topic!",
      suggestions: ["Animals", "Class 4 Maths", "Smart Wall"]
    };
  }
  return {
    response: `I'm not sure what you're looking for. Could you try searching for something specific like:
\u2022 A class and subject (e.g., "Class 5 Science")
\u2022 An image topic (e.g., "Animals", "Flowers")
\u2022 A resource (e.g., "MCQ Bank", "Smart Wall")`,
    suggestions: ["Class 6 Maths", "Tiger Images", "Exam Tips"]
  };
}
var appRouter = router({
  chatbot: router({
    autocomplete: publicProcedure.input(z.object({
      query: z.string(),
      language: z.string().optional()
    })).query(async ({ input }) => {
      const { query, language } = input;
      if (query.length < 2) return { resources: [], images: [] };
      let processedQuery = query;
      if (language && language !== "en") {
        const translation = await translateAndExtractKeyword(query);
        processedQuery = translation.keyword;
      }
      const rawSuggestions = getSuggestions(processedQuery);
      return {
        resources: rawSuggestions.map((s) => ({
          name: s.name,
          url: s.url,
          description: s.description
        })).slice(0, 4),
        images: []
      };
    }),
    chat: publicProcedure.input(
      z.object({
        message: z.string(),
        sessionId: z.string(),
        language: z.string().optional()
      })
    ).mutation(async ({ input }) => {
      const { message, sessionId, language } = input;
      try {
        if (isGreetingOrCasual(message)) {
          const interactive = getInteractiveResponse(message);
          saveChatMessage({ sessionId, role: "user", message, language: language || "en" });
          saveChatMessage({ sessionId, role: "assistant", message: interactive.response, language: language || "en" });
          return {
            response: interactive.response,
            resourceUrl: "",
            resourceName: "",
            resourceDescription: "",
            suggestions: interactive.suggestions
          };
        }
        let queryToSearch = message;
        let translatedQuery = null;
        if (language && language !== "en") {
          const translationResult = await translateAndExtractKeyword(message);
          translatedQuery = translationResult.translatedText;
          queryToSearch = translationResult.keyword;
        }
        const searchResults = performPrioritySearch(queryToSearch);
        const topResult = searchResults[0];
        const isNoMatch = topResult.confidence < 0.3 || topResult.category === "none";
        let responseText = "";
        let finalUrl = topResult.url;
        let finalName = topResult.name;
        let finalDescription = topResult.description;
        if (isNoMatch) {
          responseText = "Relevant results not found. Please find nearest matching results below.";
          finalUrl = "https://portal.myschoolct.com/views/academic";
          finalName = "Browse Academic Resources";
          finalDescription = "Explore all academic resources, classes, and subjects";
        } else {
          responseText = `**${topResult.name}**`;
        }
        saveChatMessage({ sessionId, role: "user", message, language: language || "en" });
        saveChatMessage({ sessionId, role: "assistant", message: responseText, language: language || "en" });
        logSearchQuery({
          query: message,
          translatedQuery,
          language: language || "en",
          resultsFound: !isNoMatch ? 1 : 0,
          topResultUrl: finalUrl,
          topResultName: finalName,
          sessionId
        });
        return {
          response: responseText,
          resourceUrl: finalUrl,
          resourceName: finalName,
          resourceDescription: finalDescription
        };
      } catch (error) {
        console.error("Chat error:", error);
        throw new Error("Internal server error");
      }
    })
  })
});

// server/_core/context.ts
async function createContext(opts) {
  let user = null;
  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    user = null;
  }
  return {
    req: opts.req,
    res: opts.res,
    user
  };
}

// server/_core/vite.ts
import express from "express";
import fs from "fs";
import { nanoid } from "nanoid";
import path2 from "path";
import { createServer as createViteServer } from "vite";

// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";
var __dirname = path.dirname(fileURLToPath(import.meta.url));
var vite_config_default = defineConfig({
  plugins: [react()],
  root: "./client",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./client/src"),
      "@shared": path.resolve(__dirname, "./shared")
    }
  },
  build: {
    outDir: "../dist/public",
    emptyOutDir: true,
    minify: "terser",
    sourcemap: false
  },
  server: {
    port: 5173,
    host: true
  },
  preview: {
    port: 4173,
    host: true
  }
});

// server/_core/vite.ts
async function setupVite(app, server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true
  };
  const vite = await createViteServer({
    ...vite_config_default,
    configFile: false,
    server: serverOptions,
    appType: "custom"
  });
  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path2.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}
function serveStatic(app) {
  const distPath = process.env.NODE_ENV === "development" ? path2.resolve(import.meta.dirname, "../..", "dist", "public") : path2.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app.use(express.static(distPath));
  app.use("*", (_req, res) => {
    res.sendFile(path2.resolve(distPath, "index.html"));
  });
}

// server/_core/index.ts
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}
async function findAvailablePort(startPort = 3e3) {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}
async function startServer() {
  const app = express2();
  const server = createServer(app);
  app.use(express2.json({ limit: "50mb" }));
  app.use(express2.urlencoded({ limit: "50mb", extended: true }));
  registerOAuthRoutes(app);
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext
    })
  );
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }
  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);
  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }
  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}
startServer().catch(console.error);
