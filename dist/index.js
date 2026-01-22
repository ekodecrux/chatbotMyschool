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
  base_url: "https://demo.myschool.in",
  sections: {
    academic: {
      url: "/views/academic",
      description: "Academic resources organized by grade and subject",
      keywords: ["academic", "study", "learn", "education", "school", "class", "grade", "subject"],
      subsections: {
        grades: {
          url_pattern: "/views/academic/grade/grade-{N}?main=1&mu={subject_code}",
          grades: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
          subjects: {
            computer: {
              code: "unknown",
              keywords: ["computer", "computers", "computing", "it", "technology", "coding"]
            },
            english: {
              code: "1",
              keywords: ["english", "language", "grammar", "reading", "writing"]
            },
            evs: {
              code: "unknown",
              keywords: ["evs", "environment", "environmental studies", "nature", "science"]
            },
            hindi: {
              code: "2",
              keywords: ["hindi", "\u0939\u093F\u0902\u0926\u0940", "language"]
            },
            maths: {
              code: "3",
              keywords: ["maths", "mathematics", "math", "numbers", "calculation", "arithmetic", "algebra", "geometry"]
            },
            science: {
              code: "4",
              keywords: ["science", "physics", "chemistry", "biology", "experiment"]
            },
            social: {
              code: "unknown",
              keywords: ["social", "social studies", "history", "geography", "civics"]
            },
            telugu: {
              code: "unknown",
              keywords: ["telugu", "\u0C24\u0C46\u0C32\u0C41\u0C17\u0C41", "language"]
            }
          },
          examples: [
            {
              query: "5th class science",
              url: "/views/academic/grade/grade-5?main=1&mu=4",
              description: "Grade 5 Science with all units"
            },
            {
              query: "grade 3 maths",
              url: "/views/academic/grade/grade-3?main=1&mu=3",
              description: "Grade 3 Mathematics"
            }
          ]
        },
        one_click_resources: {
          description: "Quick access resources from One Click Resource Centre",
          url_suffix: "?ocrc",
          resources: [
            {
              name: "Smart Wall",
              url: "/views/academic/smart-wall?ocrc",
              keywords: ["smart wall", "smartwall", "wall", "classroom decoration", "display", "visual", "posters", "charts", "classroom decor", "decoration"]
            },
            {
              name: "Image Bank",
              url: "/views/academic/image-bank?ocrc",
              keywords: ["image bank", "imagebank", "images", "pictures", "photos", "visuals", "graphics"]
            },
            {
              name: "Exam Tips",
              url: "/views/academic/result?text=exam tips",
              keywords: ["exam tips", "exam", "test", "preparation", "tips"]
            },
            {
              name: "MCQ Bank",
              url: "/views/academic/result?text=mcq",
              keywords: ["mcq", "multiple choice", "questions", "quiz", "test"]
            },
            {
              name: "Visual Worksheets",
              url: "/views/academic/result?text=visual worksheets",
              keywords: ["visual worksheets", "worksheets", "activities", "practice"]
            },
            {
              name: "Pictorial Stories",
              url: "/views/academic/result?text=pictorial stories",
              keywords: ["pictorial stories", "stories", "picture stories", "reading"]
            }
          ]
        }
      }
    },
    early_career: {
      url: "/views/early-career",
      description: "4200+ read aloud stories for teaching & learning to impart value education",
      keywords: ["early career", "career", "stories", "read aloud", "value education", "moral stories"],
      subsections: {
        budding_career: {
          name: "Budding Career"
        },
        makers: {
          name: "Makers"
        }
      }
    },
    edutainment: {
      url: "/views/edutainment",
      description: "Educational entertainment resources",
      keywords: ["edutainment", "entertainment", "fun", "games", "activities", "learning games"],
      subsections: {
        fun_station: {
          name: "Fun Station"
        },
        makers: {
          name: "Makers"
        }
      }
    },
    print_rich: {
      url: "/views/print-rich",
      description: "Print-rich environment resources",
      keywords: ["print rich", "printing", "publishing", "materials", "resources"],
      subsections: {
        publishing: {
          name: "Publishing"
        },
        makers: {
          name: "Makers"
        }
      }
    },
    maker: {
      url: "/views/maker",
      description: "Maker education resources",
      keywords: ["maker", "diy", "create", "build", "hands-on", "projects"]
    },
    info_hub: {
      url: "/views/info-hub",
      description: "Information hub with various resources",
      keywords: ["info hub", "information", "resources", "help"]
    }
  },
  search: {
    academic_search: {
      url_pattern: "/views/academic/result?text={keyword}",
      description: "Search within academic section"
    },
    sections_search: {
      url_pattern: "/views/sections/result?text={keyword}",
      description: "Search across all sections"
    }
  },
  navigation_rules: {
    priority_order: [
      "one_click_resources",
      "grades_and_subjects",
      "main_sections",
      "search_fallback"
    ],
    translation_required: ["hindi", "telugu", "gujarati"],
    keyword_extraction: "Extract main topic keywords from user query, not full sentences",
    examples: [
      {
        user_query: "\u092E\u0941\u091D\u0947 \u0915\u0941\u0924\u094D\u0924\u093E \u0915\u093E \u0907\u092E\u0947\u091C \u091A\u093E\u0939\u093F\u090F",
        translation: "I need dog image",
        extracted_keyword: "dog",
        recommended_url: "/views/sections/result?text=dog",
        reasoning: "Image request \u2192 Image Bank or search"
      },
      {
        user_query: "\u0C28\u0C3E\u0C15\u0C41 \u0C2A\u0C41\u0C32\u0C3F \u0C2C\u0C4A\u0C2E\u0C4D\u0C2E \u0C15\u0C3E\u0C35\u0C3E\u0C32\u0C3F",
        translation: "I need tiger image",
        extracted_keyword: "tiger",
        recommended_url: "/views/sections/result?text=tiger",
        reasoning: "Image request \u2192 Image Bank or search"
      },
      {
        user_query: "5th class science",
        extracted_keyword: "grade 5 science",
        recommended_url: "/views/academic/grade/grade-5?main=1&mu=4",
        reasoning: "Direct grade-subject match"
      },
      {
        user_query: "classroom decoration",
        extracted_keyword: "decoration",
        recommended_url: "/views/academic/smart-wall?ocrc",
        reasoning: "Decoration \u2192 Smart Wall (One Click Resource)"
      }
    ]
  }
};

// server/enhancedSemanticSearch.ts
function soundex(str) {
  const s = str.toUpperCase().replace(/[^A-Z]/g, "");
  if (s.length === 0) return "0000";
  const firstLetter = s[0];
  const codes = {
    "B": "1",
    "F": "1",
    "P": "1",
    "V": "1",
    "C": "2",
    "G": "2",
    "J": "2",
    "K": "2",
    "Q": "2",
    "S": "2",
    "X": "2",
    "Z": "2",
    "D": "3",
    "T": "3",
    "L": "4",
    "M": "5",
    "N": "5",
    "R": "6"
  };
  let code = firstLetter;
  let prevCode = codes[firstLetter] || "0";
  for (let i = 1; i < s.length && code.length < 4; i++) {
    const currentCode = codes[s[i]] || "0";
    if (currentCode !== "0" && currentCode !== prevCode) {
      code += currentCode;
    }
    if (currentCode !== "0") {
      prevCode = currentCode;
    }
  }
  return (code + "0000").substring(0, 4);
}
function phoneticMatch(word1, word2) {
  return soundex(word1) === soundex(word2);
}
var BASE_URL = "https://portal.myschoolct.com";
function calculateSimilarity(query, keywords) {
  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(/\s+/).filter((w) => w.length > 1);
  if (queryWords.length === 0) return 0;
  let score = 0;
  for (const keyword of keywords) {
    const keywordLower = keyword.toLowerCase();
    if (queryLower === keywordLower) {
      score += 10;
    } else if (queryLower.includes(keywordLower) || keywordLower.includes(queryLower)) {
      score += 5;
    }
    for (const word of queryWords) {
      if (word.length > 2) {
        if (keywordLower.includes(word)) {
          score += 2;
        } else if (phoneticMatch(word, keywordLower)) {
          score += 3;
        }
      }
    }
  }
  return score;
}
function extractClassAndSubject(query) {
  const queryLower = query.toLowerCase().trim();
  const words = queryLower.split(/\s+/);
  const ageMatch = queryLower.match(/age\s*(\d+)/i);
  if (ageMatch) {
    const age = parseInt(ageMatch[1]);
    if (age >= 5 && age <= 15) {
      return { classNum: age - 5, subject: null, lastWord: null };
    }
  }
  const classPatterns = [
    /(\d+)(?:st|nd|rd|th)?\s*(?:class|grade|std)/i,
    /(?:class|grade|std)\s*(\d+)/i,
    /grade\s*-?\s*(\d+)/i,
    /\b(\d+)\b/
  ];
  let classNum = null;
  for (const pattern of classPatterns) {
    const match = queryLower.match(pattern);
    if (match) {
      const val = parseInt(match[1]);
      if (val >= 1 && val <= 10) {
        classNum = val;
        break;
      }
    }
  }
  const subjects = myschool_knowledge_base_default.sections.academic.subsections.grades.subjects;
  let matchedSubject = null;
  let maxScore = 0;
  for (const [subjectName, subjectData] of Object.entries(subjects)) {
    const score = calculateSimilarity(queryLower, subjectData.keywords);
    if (score > maxScore) {
      maxScore = score;
      matchedSubject = subjectName;
    }
  }
  const lastWord = words.length > 0 ? words[words.length - 1] : null;
  return { classNum, subject: maxScore > 3 ? matchedSubject : null, lastWord };
}
function performPrioritySearch(query) {
  const results = [];
  const queryLower = query.toLowerCase().trim();
  const isMeaningless = queryLower.length < 3 || !/^[a-zA-Z0-9\s]+$/.test(queryLower);
  const oneClickResources = myschool_knowledge_base_default.sections.academic.subsections.one_click_resources.resources;
  for (const resource of oneClickResources) {
    const score = calculateSimilarity(queryLower, resource.keywords);
    if (score > 5) {
      results.push({
        name: resource.name,
        description: resource.keywords.join(", "),
        url: BASE_URL + resource.url,
        category: "one_click",
        confidence: Math.min(score / 10, 1)
      });
    }
  }
  if (results.length > 0) return results.sort((a, b) => b.confidence - a.confidence).slice(0, 1);
  const { classNum, subject, lastWord } = extractClassAndSubject(query);
  if (classNum) {
    if (subject) {
      const subjects = myschool_knowledge_base_default.sections.academic.subsections.grades.subjects;
      const subjectData = subjects[subject];
      if (subjectData && subjectData.code !== "unknown") {
        const url = `${BASE_URL}/views/academic/class/class-${classNum}?main=1&mu=${subjectData.code}`;
        results.push({
          name: `Class ${classNum} ${subject.charAt(0).toUpperCase() + subject.slice(1)}`,
          description: `Access Class ${classNum} ${subject} curriculum`,
          url,
          category: "class_subject",
          confidence: 0.95
        });
      }
    } else if (lastWord && lastWord !== classNum.toString() && !["class", "grade", "std"].includes(lastWord)) {
      const url = `${BASE_URL}/views/academic/class/class-${classNum}?search=${encodeURIComponent(lastWord)}`;
      results.push({
        name: `Class ${classNum} Search: ${lastWord}`,
        description: `Searching for ${lastWord} in Class ${classNum}`,
        url,
        category: "class_subject",
        confidence: 0.9
      });
    } else {
      results.push({
        name: `Class ${classNum} Resources`,
        description: `Access Class ${classNum} resources`,
        url: `${BASE_URL}/views/academic/class/class-${classNum}`,
        category: "class_subject",
        confidence: 0.85
      });
    }
  }
  if (results.length > 0) return results.slice(0, 1);
  for (const [sectionName, sectionData] of Object.entries(myschool_knowledge_base_default.sections)) {
    if (sectionName === "academic") continue;
    const score = calculateSimilarity(queryLower, sectionData.keywords);
    if (score > 4) {
      results.push({
        name: sectionName.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" "),
        description: sectionData.description,
        url: BASE_URL + sectionData.url,
        category: "section",
        confidence: Math.min(score / 10, 0.8)
      });
    }
  }
  if (results.length > 0) return results.sort((a, b) => b.confidence - a.confidence).slice(0, 1);
  if (!isMeaningless) {
    results.push({
      name: `Search Images: ${query}`,
      description: `Searching for "${query}" in Academic Images`,
      url: `${BASE_URL}/views/academic/result?text=${encodeURIComponent(query)}`,
      category: "search",
      confidence: 0.5
    });
    return results.slice(0, 1);
  }
  return [{
    name: "No exact search found",
    description: "I couldn't find a match for your query. Please try searching for a class, subject, or resource.",
    url: `${BASE_URL}/views/academic`,
    category: "none",
    confidence: 0
  }];
}
function getSuggestions(query) {
  const results = [];
  const queryLower = query.toLowerCase().trim();
  const oneClickResources = myschool_knowledge_base_default.sections.academic.subsections.one_click_resources.resources;
  for (const resource of oneClickResources) {
    const score = calculateSimilarity(queryLower, resource.keywords);
    if (score > 2) {
      results.push({
        name: resource.name,
        description: resource.keywords.slice(0, 5).join(", "),
        url: BASE_URL + resource.url,
        category: "one_click",
        confidence: Math.min(score / 10, 1)
      });
    }
  }
  results.sort((a, b) => b.confidence - a.confidence);
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
var getRelevantImageThumbnails = (query) => {
  const q = query.toLowerCase().trim();
  if (q.length < 2) return [];
  const allImages = [
    { id: "lion1", title: "Lion", url: "https://portal.myschoolct.com/assets/thumbnails/lion.jpg", keywords: ["lion", "animal", "cat"] },
    { id: "monkey1", title: "Monkey", url: "https://portal.myschoolct.com/assets/thumbnails/monkey.jpg", keywords: ["monkey", "animal", "primate"] },
    { id: "elephant1", title: "Elephant", url: "https://portal.myschoolct.com/assets/thumbnails/elephant.jpg", keywords: ["elephant", "animal", "mammal"] },
    { id: "tiger1", title: "Tiger", url: "https://portal.myschoolct.com/assets/thumbnails/tiger.jpg", keywords: ["tiger", "animal", "cat"] },
    { id: "maths1", title: "Maths", url: "https://portal.myschoolct.com/assets/thumbnails/maths.jpg", keywords: ["maths", "mathematics", "numbers"] },
    { id: "science1", title: "Science", url: "https://portal.myschoolct.com/assets/thumbnails/science.jpg", keywords: ["science", "experiment", "lab"] }
  ];
  return allImages.filter(
    (img) => img.title.toLowerCase().includes(q) || img.keywords.some((k) => k.includes(q))
  ).slice(0, 4);
};
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
      const images = getRelevantImageThumbnails(processedQuery);
      let filteredResources = rawSuggestions.filter((s) => {
        const name = s.name.toLowerCase();
        if (images.length > 0 && name.includes("mcq")) return false;
        return true;
      });
      if (images.length > 0) {
        const imageBank = {
          name: "Image Bank - One Click Resource Centre",
          url: "https://portal.myschoolct.com/views/sections/image-bank",
          description: "Access 80,000+ educational images and visual resources."
        };
        filteredResources = filteredResources.filter((r) => !r.name.toLowerCase().includes("image bank"));
        filteredResources.unshift(imageBank);
      }
      return {
        resources: filteredResources.map((s) => ({
          name: s.name,
          url: s.url,
          description: s.description
        })).slice(0, 3),
        images
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
        let queryToSearch = message;
        let translatedQuery = null;
        if (language && language !== "en") {
          const translationResult = await translateAndExtractKeyword(message);
          translatedQuery = translationResult.translatedText;
          queryToSearch = translationResult.keyword;
        }
        const searchResults = performPrioritySearch(queryToSearch);
        const topResult = searchResults[0];
        const isNoMatch = topResult.confidence < 0.3 || topResult.category === "none" || topResult.category === "search";
        let responseText = "";
        let finalUrl = topResult.url;
        let finalName = topResult.name;
        let finalDescription = topResult.description;
        if (isNoMatch) {
          responseText = "Relevant results not found. Please find nearest matching results below.";
          finalUrl = "https://portal.myschoolct.com/views/academic";
          finalName = "Browse Academic Resources";
          finalDescription = "Explore all academic resources, classes, and subjects";
        } else if (topResult.confidence === 0) {
          responseText = topResult.description;
        } else {
          responseText = `**${topResult.name}**`;
        }
        saveChatMessage({
          sessionId,
          role: "user",
          message,
          language: language || "en"
        });
        saveChatMessage({
          sessionId,
          role: "assistant",
          message: responseText,
          language: language || "en"
        });
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
