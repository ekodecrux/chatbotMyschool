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
  let code = firstLetter, prevCode = codes[firstLetter] || "0";
  for (let i = 1; i < s.length && code.length < 4; i++) {
    const currentCode = codes[s[i]] || "0";
    if (currentCode !== "0" && currentCode !== prevCode) code += currentCode;
    if (currentCode !== "0") prevCode = currentCode;
  }
  return (code + "0000").substring(0, 4);
}
function levenshtein(a, b) {
  a = a.toLowerCase();
  b = b.toLowerCase();
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = a[j - 1] === b[i - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[b.length][a.length];
}
var COMMON_WORDS = {
  // Puzzle variations
  "puzle": "puzzle",
  "puzel": "puzzle",
  "puzzles": "puzzle",
  "puzles": "puzzle",
  "puzzl": "puzzle",
  "puzzel": "puzzle",
  // Image variations
  "imges": "images",
  "imags": "images",
  "imagse": "images",
  "iamges": "images",
  "pictres": "pictures",
  "picutres": "pictures",
  "picturs": "pictures",
  // Chart variations
  "chrat": "chart",
  "chrts": "charts",
  "chrats": "charts",
  "cahrt": "chart",
  // Animal variations
  "animls": "animals",
  "anmals": "animals",
  "animales": "animals",
  "animlas": "animals",
  // Math variations
  "maths": "maths",
  "mathss": "maths",
  "mats": "maths",
  "mahs": "maths",
  // Science variations
  "scince": "science",
  "sceince": "science",
  "sciense": "science",
  "sicence": "science",
  // English variations
  "englsh": "english",
  "engish": "english",
  "enlgish": "english",
  // Exam variations
  "exm": "exam",
  "exams": "exam",
  "exma": "exam",
  "examm": "exam",
  // Tips variations
  "tps": "tips",
  "tipss": "tips",
  "tisp": "tips",
  // Worksheet variations
  "workshet": "worksheet",
  "workseet": "worksheet",
  "worksheets": "worksheets",
  "worksehet": "worksheet",
  "worsheet": "worksheet",
  // Syllabus variations
  "sylabus": "syllabus",
  "sillabus": "syllabus",
  "syllbus": "syllabus",
  "syllabu": "syllabus",
  // Fruit variations
  "fruts": "fruits",
  "fruist": "fruits",
  "frutis": "fruits",
  "fruite": "fruits",
  "fruit": "fruit",
  "fruits": "fruits",
  "fruites": "fruits",
  // Smart variations
  "smrat": "smart",
  "samrt": "smart",
  "smrt": "smart",
  // Wall variations
  "wll": "wall",
  "wal": "wall",
  "walll": "wall",
  // Telugu variations
  "telgu": "telugu",
  "telegu": "telugu",
  "telugue": "telugu",
  // Poem variations
  "poam": "poem",
  "pome": "poem",
  "poams": "poems",
  "pomes": "poems",
  // Class variations
  "clas": "class",
  "clss": "class",
  "classs": "class",
  // Bank variations
  "bnk": "bank",
  "bnak": "bank",
  "bakn": "bank",
  // MCQ variations
  "mcqs": "mcq",
  "mcq's": "mcq",
  "mcss": "mcq",
  // Resource variations
  "resourse": "resource",
  "resorce": "resource",
  "resourc": "resource",
  // Video variations
  "vido": "video",
  "vidoe": "video",
  "vidoes": "videos",
  "vidos": "videos"
};
function correctSpelling(query) {
  const words = query.toLowerCase().split(/\s+/);
  const corrected = words.map((word) => {
    if (COMMON_WORDS[word]) return COMMON_WORDS[word];
    let bestMatch = word;
    let bestDistance = 3;
    for (const [misspelled, correct] of Object.entries(COMMON_WORDS)) {
      const dist = levenshtein(word, misspelled);
      if (dist < bestDistance) {
        bestDistance = dist;
        bestMatch = correct;
      }
      const distToCorrect = levenshtein(word, correct);
      if (distToCorrect < bestDistance) {
        bestDistance = distToCorrect;
        bestMatch = correct;
      }
    }
    if (bestMatch === word && word.length > 3) {
      const wordSoundex = soundex(word);
      for (const [_, correct] of Object.entries(COMMON_WORDS)) {
        if (soundex(correct) === wordSoundex) {
          return correct;
        }
      }
    }
    return bestMatch;
  });
  return corrected.join(" ");
}
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
  const correctedQuery = correctSpelling(query);
  const qLower = correctedQuery.toLowerCase().trim();
  const oneClick = myschool_knowledge_base_default.sections.academic.subsections.one_click_resources.resources;
  for (const r of oneClick) {
    if (isExactOneClickMatch(qLower, r.keywords)) {
      return [{ name: r.name, description: r.keywords.join(", "), url: BASE_URL + r.url, category: "one_click", confidence: 0.99 }];
    }
  }
  const classNum = extractClassNumber(correctedQuery);
  if (classNum) {
    const subject = extractSubject(correctedQuery);
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
  if (isMeaningless(correctedQuery)) {
    return [{
      name: "Browse Academic Resources",
      description: "Explore all resources",
      url: BASE_URL + "/views/academic",
      category: "none",
      confidence: 0
    }];
  }
  return [{
    name: "Search: " + correctedQuery,
    description: "Searching for " + correctedQuery + " across all resources",
    url: BASE_URL + "/views/sections/result?text=" + encodeURIComponent(qLower),
    category: "search",
    confidence: 0.5
  }];
}

// server/groqAI.ts
import Groq from "groq-sdk";
var groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
var SYSTEM_PROMPT = `You are MySchool Assistant for portal.myschoolct.com.

Your role: Help users find educational resources quickly. For most searches, route directly to results.

Available resources: Classes 1-10 (all subjects), Image Bank (animals, objects, nature), Exam Tips, Worksheets, Activities.

RESPOND IN JSON ONLY:
{"message": "brief response", "searchQuery": "search term or null", "searchType": "direct_search|class_subject|greeting", "classNum": null, "subject": null, "suggestions": []}

Rules:
1. For animals, objects, topics \u2192 direct_search with searchQuery
2. For greetings (hi, hello) \u2192 greeting type, no search
3. For "class X subject" WITH CLASS NUMBER \u2192 class_subject with classNum and subject
4. For subject name WITHOUT class number (e.g., "maths", "science", "english") \u2192 direct_search, NOT class_subject
5. Default: direct_search

IMPORTANT: Only use class_subject if you can extract a CLASS NUMBER (1-10)

Examples:
"monkey" \u2192 {"message": "Here are monkey resources!", "searchQuery": "monkey", "searchType": "direct_search", "classNum": null, "subject": null, "suggestions": []}
"maths" \u2192 {"message": "Here are maths resources!", "searchQuery": "maths", "searchType": "direct_search", "classNum": null, "subject": null, "suggestions": []}
"science" \u2192 {"message": "Here are science resources!", "searchQuery": "science", "searchType": "direct_search", "classNum": null, "subject": null, "suggestions": []}
"class 5 maths" \u2192 {"message": "Opening Class 5 Maths!", "searchQuery": "class 5 maths", "searchType": "class_subject", "classNum": 5, "subject": "maths", "suggestions": []}
"class 8 science" \u2192 {"message": "Opening Class 8 Science!", "searchQuery": "class 8 science", "searchType": "class_subject", "classNum": 8, "subject": "science", "suggestions": []}
"hi" \u2192 {"message": "Hello! What would you like to explore?", "searchQuery": null, "searchType": "greeting", "classNum": null, "subject": null, "suggestions": ["Animals", "Class 5 Maths", "Exam Tips"]}`;
async function getAIResponse(userMessage, history = []) {
  try {
    const messages = [
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

// server/translation_util.ts
import OpenAI from "openai";
import dotenv from "dotenv";
dotenv.config();
var groq2 = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1"
});
async function translateAndExtractKeyword(text2) {
  if (/^[a-zA-Z0-9\s.,!?-]+$/.test(text2)) {
    return { translatedText: text2, keyword: text2 };
  }
  try {
    const response = await groq2.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: `You are a translation assistant for MySchool educational portal. 
Your task:
1. Detect the language (Telugu, Hindi, Gujarati, Tamil, or other Indian languages)
2. Translate the input to English accurately
3. Extract the most important keyword for educational resource search

Return JSON format: {"translatedText": "...", "keyword": "..."}

Examples:
Telugu "\u0C1C\u0C02\u0C24\u0C41\u0C35\u0C41\u0C32 \u0C1A\u0C3F\u0C24\u0C4D\u0C30\u0C3E\u0C32\u0C41" \u2192 {"translatedText": "animal images", "keyword": "animals"}
Telugu "\u0C2A\u0C02\u0C21\u0C41" \u2192 {"translatedText": "fruit", "keyword": "fruit"}
Hindi "\u0915\u0915\u094D\u0937\u093E 5 \u0917\u0923\u093F\u0924" \u2192 {"translatedText": "class 5 maths", "keyword": "maths"}
Gujarati "\u0AB5\u0ABF\u0A9C\u0ACD\u0A9E\u0ABE\u0AA8 \u0AAA\u0AB0\u0AC0\u0A95\u0ACD\u0AB7\u0ABE" \u2192 {"translatedText": "science exam", "keyword": "science"}

IMPORTANT: Translate single words directly. "\u0C2A\u0C02\u0C21\u0C41" means "fruit" in English.`
        },
        {
          role: "user",
          content: text2
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 150
    });
    const result = JSON.parse(response.choices[0].message.content || '{"translatedText": "", "keyword": ""}');
    const translatedText = result.translatedText?.trim() || text2;
    const keyword = result.keyword?.trim() || translatedText;
    console.log(`[Translation] Original: "${text2}" \u2192 Translated: "${translatedText}" (Keyword: "${keyword}")`);
    return {
      translatedText,
      keyword
    };
  } catch (error) {
    console.error("Translation error:", error);
    return { translatedText: text2, keyword: text2 };
  }
}

// server/routers.ts
var BASE_URL2 = "https://portal.myschoolct.com";
var PORTAL_API = "https://portal.myschoolct.com/api/rest/search/global";
async function fetchPortalResults(query, size = 6) {
  try {
    const response = await fetch(`${PORTAL_API}?query=${encodeURIComponent(query)}&size=${size}`);
    if (!response.ok) {
      console.error("Portal API error:", response.status);
      return { results: [], total: 0, query };
    }
    return await response.json();
  } catch (error) {
    console.error("Failed to fetch portal results:", error);
    return { results: [], total: 0, query };
  }
}
function buildSearchUrl(aiResponse) {
  if (aiResponse.searchType === "class_subject" && aiResponse.classNum) {
    return `${BASE_URL2}/views/academic/class/class-${aiResponse.classNum}`;
  }
  if (aiResponse.searchQuery) {
    return `${BASE_URL2}/views/sections/result?text=${encodeURIComponent(aiResponse.searchQuery)}`;
  }
  return "";
}
var appRouter = router({
  chatbot: router({
    autocomplete: publicProcedure.input(z.object({ query: z.string(), language: z.string().optional() })).query(async ({ input }) => {
      if (input.query.length < 2) return { resources: [], images: [] };
      return { resources: [], images: [] };
    }),
    chat: publicProcedure.input(z.object({
      message: z.string(),
      sessionId: z.string(),
      language: z.string().optional(),
      history: z.array(z.object({ role: z.string(), content: z.string() })).optional()
    })).mutation(async ({ input }) => {
      const { message, sessionId, language, history } = input;
      try {
        const translationResult = await translateAndExtractKeyword(message);
        const translatedMessage = translationResult.translatedText;
        const correctedMessage = correctSpelling(translatedMessage);
        const aiResponse = await getAIResponse(correctedMessage, history || []);
        let resourceUrl = buildSearchUrl(aiResponse);
        let resourceName = "";
        let resourceDescription = "";
        let thumbnails = [];
        if (aiResponse.searchType === "direct_search" && aiResponse.searchQuery) {
          const portalResults = await fetchPortalResults(aiResponse.searchQuery, 6);
          thumbnails = portalResults.results;
          resourceUrl = `${BASE_URL2}/views/sections/result?text=${encodeURIComponent(aiResponse.searchQuery)}`;
          if (thumbnails.length > 0) {
            resourceName = `${thumbnails.length} resources found`;
            resourceDescription = thumbnails.map((r) => r.title).slice(0, 3).join(", ");
          }
        } else if (aiResponse.searchQuery && aiResponse.searchType !== "greeting") {
          const searchResults = performPrioritySearch(aiResponse.searchQuery);
          if (searchResults.length > 0) {
            resourceUrl = searchResults[0].url;
            resourceName = searchResults[0].name;
            resourceDescription = searchResults[0].description;
          }
        }
        saveChatMessage({ sessionId, role: "user", message, language: language || "en" });
        saveChatMessage({ sessionId, role: "assistant", message: aiResponse.message, language: language || "en" });
        if (aiResponse.searchQuery) {
          logSearchQuery({
            query: message,
            translatedQuery: translatedMessage !== message ? translatedMessage : null,
            language: language || "en",
            resultsFound: thumbnails.length || (resourceUrl ? 1 : 0),
            topResultUrl: resourceUrl,
            topResultName: resourceName,
            sessionId
          });
        }
        return {
          response: aiResponse.message,
          resourceUrl,
          resourceName,
          resourceDescription,
          suggestions: aiResponse.suggestions,
          searchType: aiResponse.searchType,
          thumbnails: thumbnails.map((t2) => ({
            url: t2.path,
            thumbnail: t2.thumbnail,
            title: t2.title,
            category: t2.category
          }))
        };
      } catch (error) {
        console.error("Chat error:", error);
        return {
          response: "I am here to help! What educational resources are you looking for?",
          resourceUrl: "",
          resourceName: "",
          resourceDescription: "",
          suggestions: ["Animals", "Class 5 Maths", "Exam Tips"],
          searchType: "greeting",
          thumbnails: []
        };
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
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { fileURLToPath } from "url";
var __dirname = path.dirname(fileURLToPath(import.meta.url));
var vite_config_default = defineConfig({
  plugins: [react(), tailwindcss()],
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
