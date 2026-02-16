# How This WhatsApp-Like Chat Backend Was Built

A complete, interview-ready deep-dive into every design decision, file, function, and pattern used to build this real-time chat application backend from scratch.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Tech Stack & Why Each Choice Was Made](#2-tech-stack--why-each-choice-was-made)
3. [Project Structure](#3-project-structure)
4. [Phase 1: Foundation & Project Setup](#4-phase-1-foundation--project-setup)
5. [Phase 2: Database, Authentication & User Profiles](#5-phase-2-database-authentication--user-profiles)
6. [Phase 3: Conversations & 1:1 Messaging](#6-phase-3-conversations--11-messaging)
7. [Phase 4: Group Chats](#7-phase-4-group-chats)
8. [Phase 5: Message Delivery & Read Receipts](#8-phase-5-message-delivery--read-receipts)
9. [Phase 6: Presence System & Typing Indicators](#9-phase-6-presence-system--typing-indicators)
10. [Phase 7-12: Contacts, Blocking, Message Operations, Search, Notifications](#10-phase-7-12-contacts-blocking-message-operations-search-notifications)
11. [WebSocket Protocol Design](#11-websocket-protocol-design)
12. [Database Schema Deep Dive](#12-database-schema-deep-dive)
13. [Authentication System Deep Dive](#13-authentication-system-deep-dive)
14. [Real-Time Messaging Pipeline](#14-real-time-messaging-pipeline)
15. [Connection Management & Multi-Device Support](#15-connection-management--multi-device-support)
16. [Error Handling Strategy](#16-error-handling-strategy)
17. [TypeScript Configuration & Strict Mode Challenges](#17-typescript-configuration--strict-mode-challenges)
18. [Prisma 7 Specifics & Driver Adapter Pattern](#18-prisma-7-specifics--driver-adapter-pattern)
19. [API Reference](#19-api-reference)
20. [Interview Q&A](#20-interview-qa)

---

## 1. Architecture Overview

The backend follows a **layered architecture** with clear separation of concerns:

```
Client (Browser/App)
    │
    ├─── HTTP (REST API) ──→ Express Routes → Controllers → Services → Prisma → PostgreSQL
    │
    └─── WebSocket ──→ WS Server → Dispatcher → Handlers → Services → Prisma → PostgreSQL
```

**Key architectural decisions:**

- **Single port** for both HTTP and WebSocket — the WebSocket server is attached to the HTTP server via the `upgrade` event, meaning both run on port 4000.
- **Layered separation**: Routes define HTTP endpoints, Controllers handle request/response, Services contain business logic, Prisma handles data access.
- **WebSocket handlers** mirror the service layer — they call the same services as REST controllers.
- **Singleton pattern** for database (Prisma client) and connection manager.

### Why Single Port?

In production, you typically put everything behind a reverse proxy (nginx, ALB). Having HTTP and WS on the same port simplifies deployment — the proxy only needs to route one origin. The `upgrade` event on the HTTP server is the standard Node.js mechanism for WebSocket protocol negotiation.

```
const server = createServer(app);        // HTTP server from Express
const wss = new WebSocketServer({ server }); // WS attached to same server
```

---

## 2. Tech Stack & Why Each Choice Was Made

| Technology | Version | Why |
|---|---|---|
| **Node.js + TypeScript** | TS 5.9 | Type safety across the entire stack. Catches bugs at compile time. |
| **Express 5** | 5.2 | Industry standard HTTP framework. v5 adds native async error handling. |
| **ws** | 8.19 | Minimal WebSocket library — no Socket.IO overhead, full control over protocol. |
| **PostgreSQL** | - | Relational data (users, messages, groups) maps well to SQL. ACID transactions for data integrity. |
| **Prisma 7** | 7.4 | Type-safe ORM — generates TypeScript types from schema. Migrations, query builder, relations. |
| **@prisma/adapter-pg** | 7.4 | Prisma 7 requires driver adapters — this bridges Prisma to `pg` (node-postgres). |
| **bcrypt** | 6.0 | Industry standard password hashing. Uses salt rounds (10) to resist brute force. |
| **jsonwebtoken** | 9.0 | JWT signing/verification for stateless authentication. |
| **Zod** | 4.3 | Runtime schema validation. Validates HTTP bodies and WebSocket payloads. |
| **uuid** | 13.0 | UUID generation (though we primarily use `crypto.randomUUID()`). |
| **cors** | 2.8 | Cross-Origin Resource Sharing middleware for browser clients. |
| **dotenv** | 17.3 | Loads `.env` file into `process.env` for configuration. |
| **express-rate-limit** | 8.2 | Rate limiting middleware (installed but not yet wired in). |

### Why `ws` over Socket.IO?

Socket.IO adds automatic reconnection, rooms, namespaces, and fallback polling — but it's opaque. Using raw `ws` gives us:
- Full control over the message protocol
- Smaller bundle size
- No vendor lock-in
- Better understanding of what's happening on the wire

### Why Prisma over raw SQL?

- Auto-generated TypeScript types from the schema
- Migrations that are version-controlled
- Query builder that prevents SQL injection
- Relations and includes that map to JOIN queries
- The trade-off: less control over complex queries (we use `as any` in one place for search)

---

## 3. Project Structure

```
backend/
├── prisma/
│   └── schema.prisma          # Database schema (9 models, 6 enums)
├── prisma.config.ts           # Prisma 7 config (datasource URL)
├── tsconfig.json              # TypeScript strict config
├── package.json               # Dependencies and scripts
├── .env                       # Environment variables (DATABASE_URL, JWT_SECRET, PORT)
└── src/
    ├── index.ts               # Entry point: server bootstrap + graceful shutdown
    ├── app.ts                 # Express app: middleware + route registration
    ├── config/
    │   ├── index.ts           # Environment config loader
    │   └── database.ts        # Prisma client singleton with pg adapter
    ├── middleware/
    │   ├── auth.ts            # HTTP JWT authentication
    │   ├── wsAuth.ts          # WebSocket JWT authentication (5s timeout)
    │   ├── errorHandler.ts    # Global Express error handler
    │   └── validate.ts        # Zod validation middleware (body + query)
    ├── types/
    │   └── ws-messages.ts     # WebSocket protocol type definitions
    ├── validators/
    │   ├── auth.validator.ts  # Zod schemas for auth endpoints
    │   └── user.validator.ts  # Zod schemas for user endpoints
    ├── routes/
    │   ├── health.routes.ts   # GET /health
    │   ├── auth.routes.ts     # POST /api/auth/*
    │   ├── user.routes.ts     # GET/PUT /api/users/*
    │   ├── conversation.routes.ts # GET/POST /api/conversations/*
    │   ├── group.routes.ts    # POST/GET/PUT/DELETE /api/groups/*
    │   ├── contact.routes.ts  # GET/POST/DELETE /api/contacts/*
    │   ├── message.routes.ts  # GET/PUT/DELETE/POST /api/messages/*
    │   └── notification.routes.ts # GET /api/notifications/*
    ├── controllers/
    │   ├── auth.controller.ts
    │   ├── user.controller.ts
    │   ├── conversation.controller.ts
    │   ├── group.controller.ts
    │   ├── contact.controller.ts
    │   └── message.controller.ts
    ├── services/
    │   ├── auth.service.ts        # Registration, login, token management
    │   ├── user.service.ts        # Profiles, search, presence
    │   ├── conversation.service.ts # Conversation CRUD, participant checks
    │   ├── message.service.ts     # Message CRUD, cursor pagination
    │   ├── group.service.ts       # Group management, admin logic
    │   └── contact.service.ts     # Contacts, blocking
    ├── ws/
    │   ├── index.ts               # WebSocket server setup + heartbeat
    │   ├── connectionManager.ts   # userId -> WebSocket mapping
    │   ├── dispatcher.ts          # Message routing + Zod validation
    │   └── handlers/
    │       ├── chat.handler.ts    # Message send + delivery
    │       ├── receipt.handler.ts # Read/delivery receipts
    │       ├── typing.handler.ts  # Typing indicators
    │       └── presence.handler.ts # Online/offline broadcasts
    └── utils/
        ├── errors.ts              # Custom error classes
        └── logger.ts              # Structured JSON logger
```

---

## 4. Phase 1: Foundation & Project Setup

### 4.1 Entry Point (`src/index.ts`)

The entry point follows the **async main pattern** — a top-level async function that bootstraps the application:

```typescript
async function main() {
  await connectDatabase();                    // 1. Connect to PostgreSQL
  const server = createServer(app);           // 2. Create HTTP server from Express app
  const wss = setupWebSocket(server);         // 3. Attach WebSocket to HTTP server
  server.listen(config.port, () => { ... });  // 4. Start listening

  // 5. Register shutdown handlers
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.error("Failed to start server", { error: String(err) });
  process.exit(1);
});
```

**Graceful shutdown** is critical for production:
1. Close all WebSocket connections with code `1001` ("Server shutting down")
2. Close the WebSocket server
3. Close the HTTP server (stops accepting new connections, waits for existing to finish)
4. Disconnect from the database
5. Force exit after 5 seconds if anything hangs

```typescript
function shutdown(signal: string) {
  wss.clients.forEach((client) => client.close(1001, "Server shutting down"));
  wss.close(() => {
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
  });
  setTimeout(() => { process.exit(1); }, 5000); // Force exit fallback
}
```

**Interview question:** "Why do you need a force-exit timeout?" — Because `server.close()` waits for active connections to finish. If a client holds a keep-alive connection, the server would hang forever without the timeout.

### 4.2 Express App (`src/app.ts`)

The Express app is separated from the server to allow testing without starting a listener:

```typescript
const app = express();
app.use(cors());           // Allow cross-origin requests
app.use(express.json());   // Parse JSON request bodies

// Routes registered in order
app.use(healthRoutes);
app.use(authRoutes);
app.use(userRoutes);
app.use(conversationRoutes);
app.use(groupRoutes);
app.use(contactRoutes);
app.use(messageRoutes);
app.use(notificationRoutes);

app.use(errorHandler);     // Must be LAST — catches errors from all routes
```

**Why is the error handler last?** Express error handlers are middleware with 4 parameters `(err, req, res, next)`. Express calls them when `next(err)` is invoked. They must be registered after all routes to catch errors from any route.

### 4.3 Configuration (`src/config/index.ts`)

Fail-fast on missing environment variables:

```typescript
function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const config = {
  port: parseInt(process.env["PORT"] ?? "3000", 10),
  jwtSecret: requireEnv("JWT_SECRET"),
  databaseUrl: requireEnv("DATABASE_URL"),
  nodeEnv: process.env["NODE_ENV"] ?? "development",
} as const;
```

**Why `as const`?** Makes the config object deeply readonly, preventing accidental mutation.

**Why `process.env["PORT"]` instead of `process.env.PORT`?** The tsconfig has `noUncheckedIndexedAccess: true`, which makes index signatures return `T | undefined`. Using bracket notation is consistent with this strict pattern.

### 4.4 Structured Logger (`src/utils/logger.ts`)

JSON-structured logging with log levels:

```typescript
type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0, info: 1, warn: 2, error: 3,
};

function log(level: LogLevel, message: string, context?: Record<string, unknown>) {
  if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[currentLevel]) return;
  const entry = { timestamp: new Date().toISOString(), level, message, ...context };
  // Route to appropriate console method
}
```

In development, all levels are shown (debug is the minimum). In production, debug messages are suppressed. Each log entry includes a timestamp, level, message, and optional structured context.

**Why JSON logging?** Production log aggregators (ELK, CloudWatch, Datadog) can parse JSON directly, enabling structured queries like "show me all errors with userId = X".

### 4.5 Custom Error Classes (`src/utils/errors.ts`)

A hierarchy of error classes that map to HTTP status codes:

```typescript
class AppError extends Error {
  constructor(public statusCode: number, public code: string, message: string) { ... }
}

class AuthenticationError extends AppError { /* 401, "AUTHENTICATION_ERROR" */ }
class ValidationError extends AppError     { /* 400, "VALIDATION_ERROR" */ }
class NotFoundError extends AppError       { /* 404, "NOT_FOUND" */ }
class ForbiddenError extends AppError      { /* 403, "FORBIDDEN" */ }
```

These errors are thrown anywhere in the code and caught by the global error handler middleware, which reads `statusCode` and `code` to construct the response.

### 4.6 Health Check (`src/routes/health.routes.ts`)

```typescript
router.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    wsConnections: connectionManager.totalConnections,
    onlineUsers: connectionManager.onlineUserCount,
  });
});
```

Used by load balancers and monitoring systems to verify the server is alive.

---

## 5. Phase 2: Database, Authentication & User Profiles

### 5.1 Prisma 7 Setup

#### Schema (`prisma/schema.prisma`)

Prisma 7 introduced breaking changes from earlier versions:

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
  // NOTE: No `url` field here — Prisma 7 requires this to be in prisma.config.ts
}
```

**Critical Prisma 7 difference:** In Prisma 5/6, you put `url = env("DATABASE_URL")` in the datasource block. In Prisma 7, the datasource URL is configured in `prisma.config.ts` instead. Having `url` in schema.prisma causes error P1012.

#### Prisma Config (`prisma.config.ts`)

```typescript
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env["DATABASE_URL"] },
});
```

This file lives at the project root (not inside `src/`) and is excluded from TypeScript compilation via `tsconfig.json`:
```json
"exclude": ["prisma.config.ts"]
```

**Why exclude?** The tsconfig's `rootDir` is `./src`, and `prisma.config.ts` is at the project root. Without excluding it, TypeScript would error: "file is not under rootDir" (TS6059).

#### Database Connection (`src/config/database.ts`)

Prisma 7 requires a **driver adapter** — it no longer manages its own database connections:

```typescript
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

const pool = new pg.Pool({ connectionString: config.databaseUrl });
const adapter = new PrismaPg(pool);
export const prisma = new PrismaClient({ adapter });
```

**The three layers:**
1. `pg.Pool` — The actual PostgreSQL connection pool from `node-postgres`
2. `PrismaPg` — Adapter that bridges Prisma's query engine to `pg`
3. `PrismaClient` — The type-safe query builder

**Why driver adapters?** Prisma 7 decoupled from specific database drivers, making it possible to use any Node.js PostgreSQL driver (pg, postgres.js, etc.) or even run in serverless environments.

The `connectDatabase()` function tests the connection on startup by acquiring and releasing a client from the pool. The `disconnectDatabase()` function disconnects Prisma and ends the pool.

### 5.2 Authentication System

#### Registration Flow (`auth.service.ts → register()`)

```
Client ──POST /api/auth/register──→ Express
  │
  ├─ Zod validation (username regex, email format, password 6-128 chars)
  ├─ Check username/email uniqueness
  ├─ bcrypt.hash(password, 10) → passwordHash
  ├─ prisma.user.create({ username, email, passwordHash, displayName })
  ├─ generateAccessToken() → JWT signed with config.jwtSecret
  ├─ generateRefreshTokenString() → UUID-UUID format
  ├─ Store refresh token in DB with 7-day expiry
  └─ Return { user: { id, username, displayName }, tokens: { accessToken, refreshToken } }
```

**Salt rounds = 10:** bcrypt hashes with `2^10 = 1024` iterations. This takes ~100ms on modern hardware — fast enough for good UX, slow enough to resist brute force.

**Username validation:** `^[a-zA-Z0-9_]+$` — only alphanumeric and underscores, 3-30 characters.

#### Login Flow (`auth.service.ts → login()`)

```
Client ──POST /api/auth/login──→ Express
  │
  ├─ Zod validation (email, password required)
  ├─ Find user by email
  ├─ bcrypt.compare(password, user.passwordHash)
  ├─ Generate new token pair
  └─ Return { user, tokens }
```

**Security detail:** The error message is always "Invalid email or password" — never "Email not found" or "Wrong password". This prevents attackers from enumerating valid emails.

#### Token Pair System

**Access Token (JWT):**
- Payload: `{ userId, username }`
- Signed with `config.jwtSecret` using HS256
- Expires in 15 minutes
- Stateless — server doesn't store it

**Refresh Token:**
- Format: `UUID-UUID` (two UUIDs joined with a hyphen) — 73 characters of randomness
- Stored in the `RefreshToken` database table
- Expires in 7 days
- Used to obtain new access tokens

#### Token Refresh with Rotation (`auth.service.ts → refresh()`)

```typescript
export async function refresh(refreshToken: string): Promise<TokenPair> {
  const stored = await prisma.refreshToken.findUnique({
    where: { token: refreshToken },
    include: { user: true },
  });

  if (!stored || stored.expiresAt < new Date()) {
    if (stored) await prisma.refreshToken.delete({ where: { id: stored.id } });
    throw new AuthenticationError("Invalid or expired refresh token");
  }

  // Rotate: delete old, create new
  await prisma.refreshToken.delete({ where: { id: stored.id } });
  return createTokenPair({ userId: stored.user.id, username: stored.user.username });
}
```

**Token rotation** means the old refresh token is deleted and a new one is created. This limits the window for a stolen token to be used — once rotated, the old token is invalid.

**Interview question:** "What happens if an attacker uses a stolen refresh token after the real user has already used it?" — The attacker's token is already deleted from the DB, so they get "Invalid or expired refresh token". This is the key benefit of rotation.

#### HTTP Auth Middleware (`middleware/auth.ts`)

```typescript
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: { code: "AUTHENTICATION_ERROR", message: "..." } });
    return;
  }

  const token = authHeader.slice(7); // Remove "Bearer " prefix
  try {
    const payload = verifyAccessToken(token);
    (req as AuthenticatedRequest).user = payload;
    next();
  } catch {
    res.status(401).json({ error: { code: "AUTHENTICATION_ERROR", message: "..." } });
  }
}
```

The `AuthenticatedRequest` interface extends Express's `Request`:
```typescript
export interface AuthenticatedRequest extends Request {
  user: { userId: string; username: string };
}
```

All protected routes use: `router.get("/path", requireAuth, handler)`.

### 5.3 User Profiles

**Select pattern** — a reusable object defining which user fields to return publicly:

```typescript
const publicUserSelect = {
  id: true, username: true, displayName: true,
  avatarUrl: true, about: true, isOnline: true,
  lastSeen: true, createdAt: true,
} as const;
```

This is used across services to ensure consistent field exposure. The `getProfile()` function adds `email` for the current user's own profile.

**User search** uses Prisma's `contains` with `mode: "insensitive"` for case-insensitive partial matching:

```typescript
where: {
  OR: [
    { username: { contains: query, mode: "insensitive" } },
    { displayName: { contains: query, mode: "insensitive" } },
  ],
}
```

This translates to PostgreSQL `ILIKE '%query%'` under the hood. Results are limited to 20 and exclude the current user.

---

## 6. Phase 3: Conversations & 1:1 Messaging

### 6.1 Conversation Model

The `Conversation` model is a generic container for both direct (1:1) and group chats:

```prisma
model Conversation {
  id        String           @id @default(uuid())
  type      ConversationType // DIRECT or GROUP
  createdAt DateTime         @default(now())
  updatedAt DateTime         @updatedAt

  participants ConversationParticipant[]
  messages     Message[]
  group        Group?  // Only exists for GROUP type
}
```

**Why a single Conversation model for both?** This allows messages, participants, and delivery receipts to use the same schema regardless of whether it's a 1:1 or group chat. The `type` field differentiates behavior where needed (e.g., direct conversations can't add more members).

### 6.2 Get-or-Create Pattern for Direct Conversations

```typescript
export async function getOrCreateDirectConversation(userId1: string, userId2: string) {
  // Self-chat prevention
  if (userId1 === userId2) throw new ValidationError("Cannot create conversation with yourself");

  // Check if direct conversation already exists
  const existing = await prisma.conversation.findFirst({
    where: {
      type: "DIRECT",
      AND: [
        { participants: { some: { userId: userId1 } } },
        { participants: { some: { userId: userId2 } } },
      ],
    },
    include: { participants: { include: { user: { select: publicUserSelect } } } },
  });

  if (existing) return existing;

  // Create new with both participants
  const conversation = await prisma.conversation.create({
    data: {
      type: "DIRECT",
      participants: {
        create: [{ userId: userId1 }, { userId: userId2 }],
      },
    },
    include: { participants: { include: { user: { select: publicUserSelect } } } },
  });

  return conversation;
}
```

**Interview question:** "Why `findFirst` with AND + some instead of a specialized query?"

The query finds a DIRECT conversation where BOTH users are participants. The `AND` + `some` pattern is Prisma's way of expressing "a conversation that has userId1 AS A participant AND ALSO has userId2 AS A participant." Without `AND`, using just `some: { userId: { in: [userId1, userId2] } }` would match a conversation with EITHER user.

### 6.3 Conversation Listing with Unread Counts

```typescript
export async function getConversationsForUser(userId: string) {
  const conversations = await prisma.conversation.findMany({
    where: { participants: { some: { userId } } },
    include: {
      participants: { include: { user: { select: publicUserSelect } } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { sender: { select: { id: true, displayName: true } } },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  // Calculate unread counts per conversation
  return Promise.all(
    conversations.map(async (conv) => {
      const participant = conv.participants.find((p) => p.userId === userId);
      const unreadCount = participant?.lastReadAt
        ? await prisma.message.count({
            where: {
              conversationId: conv.id,
              createdAt: { gt: participant.lastReadAt },
              senderId: { not: userId },
            },
          })
        : await prisma.message.count({
            where: { conversationId: conv.id, senderId: { not: userId } },
          });

      return { ...conv, lastMessage: conv.messages[0] ?? null, messages: undefined, unreadCount };
    }),
  );
}
```

**Key patterns:**
- Fetches last message via `take: 1` on a descending sort
- Unread count uses `lastReadAt` — counts messages after that timestamp, excluding the user's own messages
- If `lastReadAt` is null (never read), ALL messages from others are unread
- `messages: undefined` removes the raw messages array from the response (replaced by `lastMessage`)
- Conversations are sorted by `updatedAt: "desc"` — most recently active first (just like WhatsApp)

### 6.4 Cursor-Based Pagination for Messages

```typescript
export async function getMessages(conversationId, userId, cursor?, limit = 50) {
  if (!(await isParticipant(conversationId, userId))) {
    throw new ForbiddenError("Not a participant of this conversation");
  }

  const messages = await prisma.message.findMany({
    where: { conversationId, deletedAt: null },
    include: {
      sender: { select: { id: true, username: true, displayName: true } },
      replyTo: { select: { id: true, content: true, senderId: true, sender: { select: { displayName: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: limit + 1,                              // Fetch ONE EXTRA to detect hasMore
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = messages.length > limit;
  if (hasMore) messages.pop();                    // Remove the extra

  return {
    messages: messages.reverse(),                 // Return in chronological order
    hasMore,
    nextCursor: hasMore ? messages[0]?.id : null,
  };
}
```

**Why cursor-based over offset-based pagination?**

- **Offset**: `OFFSET 1000 LIMIT 50` — the DB must scan and discard 1000 rows. Slow on large datasets. Also, if new messages arrive while paginating, you get duplicates or skips.
- **Cursor**: `WHERE id < cursor ORDER BY createdAt DESC LIMIT 50` — uses an index, no scanning. Stable regardless of new data.

**The limit+1 trick:** We fetch `limit + 1` rows. If we get more than `limit`, there are more pages — we pop the extra row and set `hasMore = true`. The `nextCursor` is the ID of the oldest message in the current page.

**Why `skip: 1`?** When using cursor-based pagination, the cursor row itself would be included. `skip: 1` excludes it, so the next page starts AFTER the cursor.

**Why reverse?** Messages are fetched newest-first (for efficient cursor pagination) but returned oldest-first (for display in chat UI).

### 6.5 WebSocket Message Send Flow

The real-time messaging pipeline (detailed in section 14):

1. Client sends: `{ id: "abc", type: "chat:send", payload: { conversationId, content }, timestamp }`
2. Dispatcher validates with Zod, routes to `handleChatSend()`
3. Handler calls `messageService.sendMessage()` to persist in DB
4. Handler sends `chat:sent` ACK to sender (with server-generated messageId)
5. Handler sends `chat:receive` to all other online participants
6. Handler auto-creates delivery receipts for online recipients

---

## 7. Phase 4: Group Chats

### 7.1 Group Model

```prisma
model Group {
  id             String       @id @default(uuid())
  conversationId String       @unique
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  name           String
  description    String?
  iconUrl        String?
  createdBy      String
  creator        User         @relation("GroupCreator", fields: [createdBy], references: [id])
}
```

A Group is an **extension** of a Conversation, linked by `conversationId`. This means group messages use the same Message table and delivery pipeline as direct messages.

### 7.2 Group Creation (Two-Step Pattern)

```typescript
export async function createGroup(creatorId, name, memberIds, description?) {
  // 1. Create conversation FIRST
  const conversation = await prisma.conversation.create({
    data: {
      type: "GROUP",
      participants: {
        create: uniqueMembers.map((id) => ({
          user: { connect: { id } },
          role: (id === creatorId ? "ADMIN" : "MEMBER") as "ADMIN" | "MEMBER",
        })),
      },
    },
  });

  // 2. Create group SECOND, referencing the conversation
  const group = await prisma.group.create({
    data: {
      name,
      description: description ?? null,
      createdBy: creatorId,
      conversationId: conversation.id,
    },
    include: groupInclude,
  });

  // 3. System message announcing group creation
  await messageService.sendMessage(creatorId, group.conversationId, `created the group "${name}"`, "SYSTEM");

  return group;
}
```

**Why two steps instead of nested create?** Prisma with `exactOptionalPropertyTypes: true` causes type conflicts in deeply nested creates. Splitting into two operations avoids these issues while being equally atomic (both are in the same async function, and a failure in step 2 would leave an orphaned conversation — a trade-off for type safety).

**Why `description ?? null`?** With `exactOptionalPropertyTypes`, passing `undefined` to a `String?` field fails — Prisma expects `string | null`, not `string | undefined`. Using `?? null` converts `undefined` to `null`.

### 7.3 Admin System

The `ConversationParticipant` model has a `role` field:

```prisma
enum ParticipantRole {
  ADMIN
  MEMBER
}
```

Admin checks use a helper:

```typescript
async function requireAdmin(conversationId: string, userId: string) {
  const participant = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  });
  if (!participant) throw new ForbiddenError("Not a member of this group");
  if (participant.role !== "ADMIN") throw new ForbiddenError("Admin privileges required");
}
```

Admin-only operations: update group info, add members, remove members, change roles.

### 7.4 Auto-Promote on Admin Leave

When the last admin leaves, the oldest member is auto-promoted:

```typescript
if (participant.role === "ADMIN") {
  const nextAdmin = await prisma.conversationParticipant.findFirst({
    where: { conversationId: group.conversationId },
    orderBy: { joinedAt: "asc" },
  });
  if (nextAdmin) {
    await prisma.conversationParticipant.update({
      where: { id: nextAdmin.id },
      data: { role: "ADMIN" },
    });
  }
}
```

**Interview question:** "What happens if all members leave?" — The conversation and group persist in the DB but have no participants. This is by design — the data (messages, etc.) isn't lost. A cleanup job could be added later.

### 7.5 System Messages

Group events generate system messages with `contentType = "SYSTEM"`:

```typescript
await messageService.sendMessage(userId, conversationId, `added ${names}`, "SYSTEM");
```

Examples: "created the group 'Team Chat'", "added Alice, Bob", "removed Charlie", "Alice left the group", "changed the group name to 'New Name'".

These appear in the chat history alongside regular messages.

---

## 8. Phase 5: Message Delivery & Read Receipts

### 8.1 Receipt Model

```prisma
model MessageReceipt {
  id        String        @id @default(uuid())
  messageId String
  message   Message       @relation(...)
  userId    String
  user      User          @relation(...)
  status    ReceiptStatus // DELIVERED or READ
  timestamp DateTime      @default(now())

  @@unique([messageId, userId])  // One receipt per user per message
}
```

### 8.2 Message Status Lifecycle

```
SENT → DELIVERED → READ
```

1. **SENT** — Message is created in the database. Sender receives `chat:sent` ACK with the server-generated `messageId` and `timestamp`.

2. **DELIVERED** — When the message is sent to an online recipient's WebSocket, a delivery receipt is auto-created:

```typescript
// In chat.handler.ts
const sent = connectionManager.sendToUser(participantId, outgoingStr);
if (sent) {
  createDeliveryReceipt(message.id, conn.userId, participantId);
}
```

The `createDeliveryReceipt()` function uses `upsert` to avoid duplicates:

```typescript
await prisma.messageReceipt.upsert({
  where: { messageId_userId: { messageId, userId: recipientId } },
  update: {},                    // Don't downgrade READ to DELIVERED
  create: { messageId, userId: recipientId, status: "DELIVERED" },
});
```

3. **READ** — The recipient explicitly sends a `chat:read` WebSocket message:

```typescript
// Client sends: { type: "chat:read", payload: { conversationId, messageId } }
```

The handler marks ALL messages up to that point as READ (bulk read receipt):

```typescript
export async function handleChatRead(connectionId, payload) {
  // 1. Update lastReadAt for the participant
  await prisma.conversationParticipant.updateMany({
    where: { conversationId: payload.conversationId, userId: conn.userId },
    data: { lastReadAt: new Date() },
  });

  // 2. Find all unread messages up to the target message
  const unreadMessages = await prisma.message.findMany({
    where: {
      conversationId: payload.conversationId,
      createdAt: { lte: targetMessage.createdAt },
      senderId: { not: conn.userId },
      receipts: { none: { userId: conn.userId, status: "READ" } },
    },
  });

  // 3. Upsert READ receipts and notify senders
  for (const msg of unreadMessages) {
    await prisma.messageReceipt.upsert({
      where: { messageId_userId: { messageId: msg.id, userId: conn.userId } },
      update: { status: "READ", timestamp: new Date() },
      create: { messageId: msg.id, userId: conn.userId, status: "READ" },
    });

    // Notify the original sender
    connectionManager.sendToUser(msg.senderId, JSON.stringify({
      type: "chat:read",
      payload: { messageId: msg.id, conversationId, readBy: conn.userId },
    }));
  }
}
```

**Why bulk read receipts?** In WhatsApp, when you open a chat, all messages are marked as read at once — you don't read them one by one. Sending `chat:read` with the latest messageId marks everything up to that point as read.

**Why `upsert` instead of `create`?** If a DELIVERED receipt already exists, we upgrade it to READ. If the message was from an offline user (no delivery receipt), we create a new READ receipt directly.

---

## 9. Phase 6: Presence System & Typing Indicators

### 9.1 Presence

Presence is tracked at two levels:

1. **Database**: `User.isOnline` (boolean) and `User.lastSeen` (timestamp)
2. **In-memory**: `ConnectionManager.isUserOnline()` — checks if any WebSocket connections exist

**Online broadcast** happens when a user authenticates their WebSocket:

```typescript
// In wsAuth.ts → handleWsAuth()
updatePresence(payload.userId, true)
  .then(() => broadcastPresence(payload.userId, "online"))
```

**Offline broadcast** happens when the last WebSocket connection closes:

```typescript
// In ws/index.ts → socket.on("close")
if (userId && !connectionManager.isUserOnline(userId)) {
  updatePresence(userId, false)
    .then(() => broadcastPresence(userId, "offline"))
}
```

**Who receives presence updates?** Only users who share a conversation with the user:

```typescript
export async function broadcastPresence(userId, status) {
  // 1. Find all conversations the user is in
  const conversations = await prisma.conversationParticipant.findMany({
    where: { userId },
    select: { conversationId: true },
  });

  // 2. Find all OTHER participants in those conversations
  const relatedParticipants = await prisma.conversationParticipant.findMany({
    where: {
      conversationId: { in: conversationIds },
      userId: { not: userId },
    },
    select: { userId: true },
  });

  // 3. Deduplicate and broadcast
  const uniqueUserIds = [...new Set(relatedParticipants.map((p) => p.userId))];
  for (const uid of uniqueUserIds) {
    connectionManager.sendToUser(uid, data);
  }
}
```

This is privacy-aware — strangers can't see your presence.

### 9.2 Heartbeat

The WebSocket server pings every 30 seconds to detect dead connections:

```typescript
const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((socket) => {
    const ws = socket as WebSocket & { isAlive?: boolean };
    if (ws.isAlive === false) {
      ws.terminate();  // Dead — kill it
      return;
    }
    ws.isAlive = false;
    ws.ping();         // Mark as potentially dead, then ping
  });
}, 30000);

// On pong response:
ws.on("pong", () => { ws.isAlive = true; });
```

**How it works:**
1. Server sets `isAlive = false` and sends ping
2. If client responds with pong, `isAlive` is set back to `true`
3. On the next heartbeat tick, if `isAlive` is still `false`, the client is dead — terminate

This handles scenarios like network disconnects, laptop sleep, or browser crashes where the TCP connection stays open but the client is unreachable.

### 9.3 Typing Indicators

```typescript
const typingTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

export async function handleTyping(connectionId, payload) {
  const timeoutKey = `${conn.userId}:${payload.conversationId}`;

  // Clear any existing timeout
  const existing = typingTimeouts.get(timeoutKey);
  if (existing) {
    clearTimeout(existing);
    typingTimeouts.delete(timeoutKey);
  }

  // Auto-clear after 5 seconds if user started typing
  if (payload.isTyping) {
    const timeout = setTimeout(() => {
      broadcastTyping(conn.userId!, payload.conversationId, false);
      typingTimeouts.delete(timeoutKey);
    }, 5000);
    typingTimeouts.set(timeoutKey, timeout);
  }

  await broadcastTyping(conn.userId, payload.conversationId, payload.isTyping);
}
```

**Why the 5-second auto-clear?** If the client crashes or the user stops typing without sending `isTyping: false`, the "typing..." indicator would be stuck forever. The 5-second timeout guarantees cleanup.

**Key design choice:** Typing indicators are NEVER persisted to the database — they're purely ephemeral, in-memory, real-time events.

---

## 10. Phase 7-12: Contacts, Blocking, Message Operations, Search, Notifications

### 10.1 Contacts (`contact.service.ts`)

Simple CRUD with relationship management:

- `addContact(userId, contactId, nickname?)` — Creates a Contact record. Returns the contact with user profile data.
- `removeContact(userId, contactId)` — Uses `deleteMany` (idempotent — doesn't fail if already removed).
- `getContacts(userId)` — Lists contacts with profile data, ordered by `createdAt: "asc"`.
- `updateNickname(userId, contactId, nickname)` — Updates the optional nickname.

### 10.2 Blocking (`contact.service.ts`)

```typescript
export async function blockUser(userId: string, targetId: string) {
  if (userId === targetId) throw new ValidationError("Cannot block yourself");
  await prisma.block.create({ data: { blockerId: userId, blockedId: targetId } });
  await prisma.contact.deleteMany({ where: { userId, contactId: targetId } });
}
```

**Blocking also removes the contact** — just like WhatsApp.

**Bidirectional block check:**

```typescript
export async function isBlocked(userId: string, targetId: string): Promise<boolean> {
  const block = await prisma.block.findFirst({
    where: {
      OR: [
        { blockerId: userId, blockedId: targetId },
        { blockerId: targetId, blockedId: userId },
      ],
    },
  });
  return block !== null;
}
```

This checks in BOTH directions — if either user has blocked the other, `isBlocked` returns true. This is used to prevent blocked users from sending messages, seeing presence, etc.

### 10.3 Message Operations (`message.controller.ts`)

#### Edit Message

```typescript
export async function editMessage(req, res, next) {
  const message = await prisma.message.findUnique({ where: { id } });

  // Guards
  if (message.senderId !== req.user.userId) throw new ForbiddenError("...");
  if (message.contentType !== "TEXT") throw new ValidationError("Can only edit text messages");

  const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);
  if (message.createdAt < fifteenMinsAgo) throw new ValidationError("...");

  const updated = await prisma.message.update({
    where: { id },
    data: { content, editedAt: new Date() },
  });

  // Broadcast chat:edited to all participants
}
```

**Constraints:** Only the sender, only TEXT messages, only within 15 minutes.

#### Delete Message

Two modes:
- **Delete for everyone** (`forEveryone: true`): Sender only, within 1 hour. Sets `deletedAt` and replaces content with "This message was deleted". Broadcasts `chat:deleted` to all participants.
- **Delete for me** (`forEveryone: false`): Placeholder — would use a `DeletedMessage` junction table (future enhancement).

#### Forward Message

```typescript
for (const convId of targetConversationIds) {
  if (!(await conversationService.isParticipant(convId, req.user.userId))) continue;

  const forwarded = await prisma.message.create({
    data: {
      conversationId: convId,
      senderId: req.user.userId,
      content: original.content,
      contentType: original.contentType,
    },
  });

  // Notify participants of each target conversation
}
```

Forwards a message to multiple conversations at once. The sender must be a participant in each target conversation. Creates new messages (not references).

### 10.4 Message Search

```typescript
const where = {
  content: { contains: q, mode: "insensitive" },
  deletedAt: null,
  conversation: {
    participants: { some: { userId: req.user.userId } },
  },
};

if (conversationId) where["conversationId"] = conversationId;

const messages = await prisma.message.findMany({
  where: where as any,
  orderBy: { createdAt: "desc" },
  take: 50,
});
```

**Privacy constraint:** Only searches messages in conversations the user is a participant of. Can optionally filter by `conversationId` for within-conversation search.

The `as any` cast is used because the `where` object is built dynamically and Prisma's strict types don't accept `Record<string, unknown>`.

### 10.5 Notifications (`notification.routes.ts`)

```typescript
router.get("/api/notifications/unread", requireAuth, async (req, res, next) => {
  const participants = await prisma.conversationParticipant.findMany({
    where: { userId },
    select: { conversationId: true, lastReadAt: true },
  });

  let totalUnread = 0;
  const perConversation = [];

  for (const p of participants) {
    const count = await prisma.message.count({
      where: {
        conversationId: p.conversationId,
        senderId: { not: userId },
        ...(p.lastReadAt ? { createdAt: { gt: p.lastReadAt } } : {}),
      },
    });
    if (count > 0) {
      perConversation.push({ conversationId: p.conversationId, unreadCount: count });
      totalUnread += count;
    }
  }

  res.json({ totalUnread, conversations: perConversation });
});
```

Returns a breakdown of unread counts per conversation plus a total.

---

## 11. WebSocket Protocol Design

### 11.1 Message Format

**Client → Server:**
```json
{
  "id": "client-generated-uuid",
  "type": "chat:send",
  "payload": { "conversationId": "...", "content": "Hello!" },
  "timestamp": 1700000000000
}
```

**Server → Client:**
```json
{
  "id": "server-generated-uuid",
  "type": "chat:receive",
  "payload": { "messageId": "...", "senderId": "...", "content": "Hello!" },
  "timestamp": 1700000000000,
  "replyTo": "client-message-id-if-applicable"
}
```

### 11.2 Message Types

| Type | Direction | Purpose |
|---|---|---|
| `auth` | C→S | Authenticate with JWT token |
| `auth:success` | S→C | Authentication confirmed |
| `auth:error` | S→C | Authentication failed |
| `chat:send` | C→S | Send a message |
| `chat:sent` | S→C | Message persisted (ACK) |
| `chat:receive` | S→C | New message from another user |
| `chat:delivered` | S→C | Message delivered to recipient |
| `chat:read` | C→S | Mark messages as read |
| `chat:read` | S→C | Notify sender of read receipt |
| `chat:typing` | C→S | Typing indicator |
| `chat:typing` | S→C | Typing indicator broadcast |
| `chat:deleted` | S→C | Message deleted for everyone |
| `chat:edited` | S→C | Message edited |
| `presence:update` | S→C | User online/offline |
| `error` | S→C | Error response |

### 11.3 Authentication Flow

```
Client                             Server
  │                                  │
  ├─── WS Connect ──────────────────→│ connectionManager.add(connId, socket)
  │                                  │ setupWsAuth() → start 5s timeout
  │                                  │
  ├─── { type: "auth", token } ────→│ verifyAccessToken(token)
  │                                  │ connectionManager.authenticate(connId, userId)
  │                                  │ clearTimeout()
  │                                  │ updatePresence(userId, true)
  │←── { type: "auth:success" } ────│ broadcastPresence(userId, "online")
  │                                  │
  │    ... authenticated session ...  │
```

If the client doesn't send `auth` within 5 seconds:
```
  │←── { type: "auth:error" } ──────│ socket.close(4001, "Authentication timeout")
```

Close code `4001` is in the application-specific range (4000-4999).

### 11.4 Dispatcher (`ws/dispatcher.ts`)

The dispatcher is the WebSocket equivalent of a router:

```typescript
export function dispatch(connectionId: string, socket: WebSocket, raw: string): void {
  // 1. Parse JSON
  // 2. Validate against clientMessageSchema (Zod)
  // 3. Gate: require auth for all types except "auth"
  // 4. Switch on type → validate payload → call handler
}
```

Each message type has its own Zod schema:
```typescript
const chatSendPayloadSchema = z.object({
  conversationId: z.string(),
  content: z.string().min(1),
  contentType: z.string().optional(),
  replyToMessageId: z.string().optional(),
});
```

---

## 12. Database Schema Deep Dive

### 12.1 Entity Relationship Diagram

```
User ─────────────────────────────────────────────────────────┐
 │                                                            │
 ├── RefreshToken (1:N)                                       │
 │    └── token, expiresAt                                    │
 │                                                            │
 ├── ConversationParticipant (N:M with Conversation)          │
 │    └── role (ADMIN/MEMBER), joinedAt, lastReadAt           │
 │                                                            │
 ├── Message (1:N as sender)                                  │
 │    └── self-referencing: replyToId → Message               │
 │                                                            │
 ├── MessageReceipt (1:N)                                     │
 │    └── status (DELIVERED/READ), timestamp                  │
 │                                                            │
 ├── Contact (N:M with self)                                  │
 │    └── userId + contactId, nickname                        │
 │                                                            │
 ├── Block (N:M with self)                                    │
 │    └── blockerId + blockedId                               │
 │                                                            │
 └── Group (1:N as creator)                                   │
      └── name, description, iconUrl                          │
                                                              │
Conversation ─────────────────────────────────────────────────┘
 │
 ├── type (DIRECT/GROUP)
 ├── ConversationParticipant (1:N)
 ├── Message (1:N)
 └── Group (1:1, optional)
```

### 12.2 Indexes

```prisma
RefreshToken        → @@index([userId])
ConversationParticipant → @@unique([conversationId, userId]), @@index([userId])
Message             → @@index([conversationId, createdAt]), @@index([senderId])
MessageReceipt      → @@unique([messageId, userId]), @@index([messageId]), @@index([userId])
Contact             → @@unique([userId, contactId]), @@index([userId])
Block               → @@unique([blockerId, blockedId])
```

**Why these indexes?**
- `Message[conversationId, createdAt]` — The most common query: "get messages in conversation X, ordered by time." A composite index makes this a simple index scan.
- `ConversationParticipant[userId]` — "Find all conversations for user X." Used on every API call that lists conversations.
- `MessageReceipt[messageId, userId]` (unique) — One receipt per user per message. The unique constraint doubles as an index.

### 12.3 Self-Referencing Relation

The Message model has a self-referencing relation for replies:

```prisma
model Message {
  replyToId  String?
  replyTo    Message?  @relation("MessageReplies", fields: [replyToId], references: [id])
  replies    Message[] @relation("MessageReplies")
}
```

Both sides of the relation must be declared. `replyTo` is the parent message (optional). `replies` is the list of messages that reply to this one (the inverse side).

### 12.4 Cascade Deletes

```prisma
RefreshToken → onDelete: Cascade (from User)
ConversationParticipant → onDelete: Cascade (from Conversation)
Message → onDelete: Cascade (from Conversation)
MessageReceipt → onDelete: Cascade (from Message)
Contact → onDelete: Cascade (from User, both sides)
Block → onDelete: Cascade (from User, both sides)
Group → onDelete: Cascade (from Conversation)
```

If a conversation is deleted, all participants, messages, and receipts are automatically cleaned up by PostgreSQL.

### 12.5 Enums

```prisma
enum ConversationType { DIRECT, GROUP }
enum ParticipantRole  { ADMIN, MEMBER }
enum ContentType      { TEXT, IMAGE, FILE, AUDIO, VIDEO, SYSTEM }
enum MessageStatus    { SENT, DELIVERED, READ }
enum ReceiptStatus    { DELIVERED, READ }
```

PostgreSQL native enums — stored as strings, validated at the database level.

---

## 13. Authentication System Deep Dive

### 13.1 Password Security

```typescript
const SALT_ROUNDS = 10;
const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
```

bcrypt automatically generates a random salt per password. The hash output includes the salt, algorithm identifier, and cost factor:
```
$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy
 │  │   └── 22-char salt + 31-char hash
 │  └── cost factor (2^10 iterations)
 └── algorithm (2b = modern bcrypt)
```

### 13.2 JWT Structure

Access tokens contain:
```json
{
  "userId": "uuid-here",
  "username": "john_doe",
  "iat": 1700000000,
  "exp": 1700000900
}
```

Signed with HS256 (HMAC-SHA256) using `config.jwtSecret`. The `exp` claim is automatically validated by `jwt.verify()`.

### 13.3 WebSocket Authentication

WebSocket connections can't use standard HTTP auth headers (the WebSocket handshake is a GET request). Instead, authentication happens at the **application layer**:

1. Client connects (unauthenticated)
2. Server starts a 5-second timer
3. Client sends: `{ type: "auth", payload: { token: "jwt-here" } }`
4. Server verifies JWT, authenticates the connection
5. If timeout expires before auth, server closes with code 4001

The auth timeout reference is stored on the socket object using TypeScript intersection types:
```typescript
(socket as WebSocket & { __authTimeout?: ReturnType<typeof setTimeout> }).__authTimeout = timeout;
```

---

## 14. Real-Time Messaging Pipeline

### Complete send-receive flow:

```
User A (Sender)                 Server                        User B (Recipient)
     │                            │                                │
     ├── chat:send ──────────────→│                                │
     │   {conversationId,         │                                │
     │    content, id: "abc"}     │                                │
     │                            │── messageService.sendMessage() │
     │                            │   (persists to PostgreSQL)     │
     │                            │                                │
     │←── chat:sent ──────────────│                                │
     │   {messageId: "xyz",       │                                │
     │    replyTo: "abc"}         │                                │
     │                            │── chat:receive ───────────────→│
     │                            │   {messageId: "xyz",           │
     │                            │    senderId, senderName,       │
     │                            │    content, timestamp}         │
     │                            │                                │
     │                            │── createDeliveryReceipt()      │
     │                            │   (upsert DELIVERED in DB)     │
     │                            │                                │
     │←── chat:delivered ─────────│                                │
     │   {messageId: "xyz"}       │                                │
     │                            │                                │
     │                            │                User B reads ───│
     │                            │←── chat:read ──────────────────│
     │                            │   {conversationId, messageId}  │
     │                            │                                │
     │                            │── handleChatRead()             │
     │                            │   (bulk upsert READ receipts)  │
     │                            │   (update lastReadAt)          │
     │                            │                                │
     │←── chat:read ──────────────│                                │
     │   {messageId, readBy}      │                                │
```

### Why `replyTo` in the `chat:sent` ACK?

The `replyTo` field links the server's response to the client's original message ID. This allows the client to:
1. Match the ACK to the pending message in its UI
2. Replace the temporary local ID with the server-generated `messageId`
3. Update the message status from "sending" to "sent"

---

## 15. Connection Management & Multi-Device Support

### 15.1 Data Structures

```typescript
class ConnectionManager {
  // connectionId → Connection (socket + userId)
  private connections = new Map<string, Connection>();

  // userId → Set<connectionId> (multi-device)
  private userConnections = new Map<string, Set<string>>();
}
```

**Two maps** because:
- `connections` — keyed by connectionId (UUID generated on connect) — for individual socket operations
- `userConnections` — keyed by userId — for "send to user" operations across all their devices

### 15.2 Multi-Device Flow

When a user connects from two devices (phone + laptop):

```
Phone connects:   connectionManager.add("conn-1", socket1)
Phone authenticates: connectionManager.authenticate("conn-1", "user-123")
  → userConnections: { "user-123": Set["conn-1"] }

Laptop connects:  connectionManager.add("conn-2", socket2)
Laptop authenticates: connectionManager.authenticate("conn-2", "user-123")
  → userConnections: { "user-123": Set["conn-1", "conn-2"] }
```

When sending to this user, both sockets receive the message:

```typescript
sendToUser(userId: string, data: string): boolean {
  let sent = false;
  for (const socket of this.getSocketsForUser(userId)) {
    if (socket.readyState === socket.OPEN) {
      socket.send(data);
      sent = true;
    }
  }
  return sent;
}
```

### 15.3 Disconnect Handling

```typescript
socket.on("close", () => {
  const userId = connectionManager.remove(connectionId);

  // Only update presence if NO connections remain for this user
  if (userId && !connectionManager.isUserOnline(userId)) {
    updatePresence(userId, false)
      .then(() => broadcastPresence(userId, "offline"));
  }
});
```

**Critical detail:** Presence is only set to offline when the LAST connection for that user closes. If the phone disconnects but the laptop is still connected, the user stays online.

---

## 16. Error Handling Strategy

### 16.1 HTTP Error Handling

The global error handler in `middleware/errorHandler.ts`:

```typescript
export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message },
    });
    return;
  }

  logger.error("Unhandled error", { error: err.message, stack: err.stack });
  res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "Internal server error" },
  });
}
```

**Two paths:**
1. **Known errors** (`AppError` subclasses) — Return the specific status code and error code. These are safe to show to clients.
2. **Unknown errors** — Log the full stack trace, return a generic 500. Never expose internal details to clients.

### 16.2 Controller Pattern

Every controller follows the same pattern:

```typescript
export async function someAction(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const result = await someService.doSomething(req.body);
    res.json(result);
  } catch (err) {
    next(err);  // Passes to errorHandler
  }
}
```

Services throw `AppError` subclasses. Controllers catch and forward to the error handler via `next(err)`.

### 16.3 WebSocket Error Handling

WebSocket errors are handled differently — there's no Express middleware pipeline:

```typescript
// In handlers:
try {
  // ... business logic
} catch (err) {
  const errorMsg: ServerMessage = {
    id: crypto.randomUUID(),
    type: "error",
    payload: { code: "SEND_FAILED", message: err.message, replyTo: clientMessageId },
    timestamp: Date.now(),
    replyTo: clientMessageId,
  };
  conn.socket.send(JSON.stringify(errorMsg));
}
```

Errors are sent as typed messages back to the client, not HTTP responses.

### 16.4 Validation Middleware

Two separate validators for body and query parameters:

```typescript
// Body validation
export function validate(schema: ZodSchema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Validation failed",
          details: result.error.flatten().fieldErrors,
        },
      });
      return;
    }
    req.body = result.data;  // Replace with validated data
    next();
  };
}

// Query validation
export function validateQuery(schema: ZodSchema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) { ... }
    (req as Request & { validatedQuery: unknown }).validatedQuery = result.data;
    next();
  };
}
```

**Why `validatedQuery` instead of replacing `req.query`?** Express's `req.query` type is `ParsedQs` (from the `qs` library), not a generic object. Assigning Zod-parsed data to it causes a type error with strict TypeScript. Using a custom property avoids the type conflict.

---

## 17. TypeScript Configuration & Strict Mode Challenges

### 17.1 tsconfig.json

```json
{
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist",
    "module": "nodenext",
    "target": "esnext",
    "types": ["node"],
    "lib": ["esnext"],
    "strict": true,
    "exactOptionalPropertyTypes": true,
    "noUncheckedIndexedAccess": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "skipLibCheck": true
  },
  "include": ["src"],
  "exclude": ["prisma.config.ts"]
}
```

### 17.2 `exactOptionalPropertyTypes: true`

This is one of TypeScript's strictest flags. It means:

```typescript
// WITHOUT exactOptionalPropertyTypes:
interface Foo { bar?: string }  // bar can be string | undefined
const x: Foo = { bar: undefined }; // OK

// WITH exactOptionalPropertyTypes:
interface Foo { bar?: string }  // bar can ONLY be string or MISSING
const x: Foo = { bar: undefined }; // ERROR!

// Fix:
interface Foo { bar?: string | undefined }  // Explicitly allow undefined
const y: Foo = { bar: undefined }; // OK
```

**Impact on this project:**

1. **WebSocket message types** needed `| undefined`:
```typescript
export interface ServerMessage {
  replyTo?: string | undefined;  // NOT just `replyTo?: string`
  error?: { code: string; message: string } | undefined;
}
```

2. **Handler function parameters** needed `| undefined`:
```typescript
// ERROR: contentType?: string
// FIX:
payload: { contentType?: string | undefined; replyToMessageId?: string | undefined }
```

3. **Prisma operations** — optional fields in `create` data needed special handling:
```typescript
// ERROR: description: description (when description is string | undefined)
// FIX: description: description ?? null  (Prisma expects string | null, not undefined)
```

4. **Conditional spreads** to avoid passing `undefined`:
```typescript
// ERROR: replyToId: replyToId (when replyToId is string | undefined)
// FIX: ...(replyToId ? { replyToId } : {})
```

### 17.3 `noUncheckedIndexedAccess: true`

```typescript
const arr = ["a", "b", "c"];
arr[0]; // Type: string | undefined (not just string!)

process.env["PORT"]; // Type: string | undefined
```

This forces null checks when accessing arrays and record types by index.

### 17.4 `verbatimModuleSyntax: true`

Requires explicit `type` keyword for type-only imports:
```typescript
import type { WebSocket } from "ws";        // Type import (erased at runtime)
import { WebSocketServer } from "ws";       // Value import (kept at runtime)
```

### 17.5 Module System: `"module": "nodenext"`

Uses Node.js's native ESM module resolution. All imports require `.js` extensions:
```typescript
import { prisma } from "../config/database.js";  // .js, not .ts!
```

This is because TypeScript compiles `.ts` to `.js`, and the import paths must match the OUTPUT files, not the source files.

---

## 18. Prisma 7 Specifics & Driver Adapter Pattern

### 18.1 Why Driver Adapters?

Prisma 7 removed its built-in PostgreSQL driver. Instead, you bring your own driver:

```
Before (Prisma 5/6):
  PrismaClient ──(built-in driver)──→ PostgreSQL

After (Prisma 7):
  PrismaClient ──→ PrismaPg adapter ──→ pg.Pool ──→ PostgreSQL
```

**Benefits:**
- Use any PostgreSQL driver (pg, postgres.js, etc.)
- Control connection pool settings directly
- Works in edge/serverless environments with driver-specific adapters
- No more binary engine downloads for the database driver

### 18.2 Generated Client

Prisma generates TypeScript types in `src/generated/prisma/`:
```
src/generated/prisma/
  client.js     # PrismaClient class
  index.js      # Re-exports
  *.d.ts        # Type definitions for all models
```

Generated by running `npx prisma generate` (or `npm run db:generate`).

### 18.3 Composite Unique Keys

Prisma supports composite unique constraints as query keys:

```typescript
// @@unique([conversationId, userId])
await prisma.conversationParticipant.findUnique({
  where: { conversationId_userId: { conversationId, userId } },
});
```

The `conversationId_userId` key name is auto-generated from the field names in the `@@unique` constraint.

### 18.4 Relation Queries

```typescript
// Include related data (JOIN)
const message = await prisma.message.create({
  data: { ... },
  include: {
    sender: { select: { id: true, username: true, displayName: true } },
    replyTo: { select: { id: true, content: true } },
  },
});
```

`include` adds related data to the result. `select` within `include` picks specific fields (partial loading).

### 18.5 Upsert Pattern

Used for receipts where we want "create if not exists, update if exists":

```typescript
await prisma.messageReceipt.upsert({
  where: { messageId_userId: { messageId, userId } },
  update: { status: "READ", timestamp: new Date() },
  create: { messageId, userId, status: "READ" },
});
```

This is an atomic operation — no race condition between checking existence and creating.

---

## 19. API Reference

### Authentication

| Method | Endpoint | Auth | Body | Response |
|---|---|---|---|---|
| POST | `/api/auth/register` | No | `{ username, email, password, displayName }` | `{ user, tokens }` |
| POST | `/api/auth/login` | No | `{ email, password }` | `{ user, tokens }` |
| POST | `/api/auth/refresh` | No | `{ refreshToken }` | `{ accessToken, refreshToken }` |
| POST | `/api/auth/logout` | No | `{ refreshToken }` | `{ message }` |

### Users

| Method | Endpoint | Auth | Body/Query | Response |
|---|---|---|---|---|
| GET | `/api/users/me` | Yes | - | User profile (includes email) |
| PUT | `/api/users/me` | Yes | `{ displayName?, avatarUrl?, about? }` | Updated profile |
| GET | `/api/users/:id` | Yes | - | Public profile |
| GET | `/api/users/search?q=` | Yes | `q` query param | User[] (max 20) |

### Conversations

| Method | Endpoint | Auth | Body/Query | Response |
|---|---|---|---|---|
| GET | `/api/conversations` | Yes | - | Conversations with lastMessage + unreadCount |
| GET | `/api/conversations/:id` | Yes | - | Conversation details |
| GET | `/api/conversations/:id/messages?cursor=&limit=` | Yes | cursor, limit params | `{ messages, hasMore, nextCursor }` |
| POST | `/api/conversations/direct` | Yes | `{ userId }` | Get-or-create direct conversation |

### Groups

| Method | Endpoint | Auth | Body | Response |
|---|---|---|---|---|
| POST | `/api/groups` | Yes | `{ name, description?, memberIds[] }` | Group |
| GET | `/api/groups/:id` | Yes | - | Group with members |
| PUT | `/api/groups/:id` | Yes (admin) | `{ name?, description?, iconUrl? }` | Updated group |
| POST | `/api/groups/:id/members` | Yes (admin) | `{ userIds[] }` | Updated group |
| DELETE | `/api/groups/:id/members/:userId` | Yes (admin/self) | - | Updated group |
| PUT | `/api/groups/:id/members/:userId/role` | Yes (admin) | `{ role }` | Updated group |

### Messages

| Method | Endpoint | Auth | Body/Query | Response |
|---|---|---|---|---|
| PUT | `/api/messages/:id` | Yes | `{ content }` | Updated message |
| DELETE | `/api/messages/:id` | Yes | `{ forEveryone? }` | `{ message }` |
| POST | `/api/messages/forward` | Yes | `{ messageId, targetConversationIds[] }` | `{ forwarded: count }` |
| POST | `/api/messages/:id/star` | Yes | - | `{ message, messageId }` |
| GET | `/api/messages/search?q=&conversationId?=` | Yes | q, conversationId params | Message[] |

### Contacts

| Method | Endpoint | Auth | Body | Response |
|---|---|---|---|---|
| GET | `/api/contacts` | Yes | - | Contact[] |
| POST | `/api/contacts` | Yes | `{ userId, nickname? }` | Contact |
| DELETE | `/api/contacts/:userId` | Yes | - | `{ message }` |
| POST | `/api/contacts/block` | Yes | `{ userId }` | `{ message }` |
| DELETE | `/api/contacts/block/:userId` | Yes | - | `{ message }` |
| GET | `/api/contacts/blocked` | Yes | - | Block[] |

### Other

| Method | Endpoint | Auth | Response |
|---|---|---|---|
| GET | `/health` | No | `{ status, uptime, wsConnections, onlineUsers }` |
| GET | `/api/notifications/unread` | Yes | `{ totalUnread, conversations[] }` |

---

## 20. Interview Q&A

### Architecture & Design

**Q: Why did you choose WebSocket over Server-Sent Events (SSE) or long polling?**
A: Chat is inherently bidirectional — clients both send and receive messages in real-time. SSE is unidirectional (server→client only), so we'd still need HTTP POST for sending. Long polling adds latency and overhead. WebSocket provides a persistent, full-duplex connection — the natural fit for chat.

**Q: Why separate HTTP REST API and WebSocket? Why not do everything over WebSocket?**
A: REST is better for CRUD operations (profile updates, conversation listing, search) — it's cacheable, has standard tooling (Postman, curl), and follows request-response semantics. WebSocket is better for real-time push notifications and events where the server needs to initiate communication. The hybrid approach uses each protocol for what it does best.

**Q: How does the system handle multi-device scenarios?**
A: The `ConnectionManager` maps each userId to a `Set<connectionId>`. When user A sends a message, ALL connected devices of user B receive it. When one device disconnects, the user stays online until ALL devices disconnect.

**Q: What happens when a user is offline and someone sends them a message?**
A: The message is persisted in the database. When the user comes back online and opens the conversation, the client fetches history via `GET /api/conversations/:id/messages`. The unread count (visible in conversation list) tells them which conversations have new messages.

**Q: How do you prevent race conditions in the receipt system?**
A: We use Prisma's `upsert` with composite unique constraints (`messageId + userId`). The database guarantees atomicity — two concurrent upserts for the same receipt will never create duplicates. The unique constraint enforces "one receipt per user per message."

### Database

**Q: Why PostgreSQL over MongoDB?**
A: Chat data is inherently relational: users have conversations, conversations have participants and messages, messages have receipts. These relationships are natural in SQL with foreign keys and JOINs. MongoDB's document model would lead to denormalization and data inconsistency.

**Q: Explain your indexing strategy.**
A: The primary query pattern is "get recent messages in a conversation," so we have a composite index on `[conversationId, createdAt]`. For message delivery, we need to quickly find all participants of a conversation (`conversationId` index on participants). For user lookup, we index `userId` on participants. Receipts use a unique composite index on `[messageId, userId]` which serves double duty as both a uniqueness constraint and a lookup index.

**Q: Why cursor-based pagination instead of offset-based?**
A: Offset-based (`SKIP 1000 LIMIT 50`) requires the database to scan and discard 1000 rows — O(n) in the skip count. Cursor-based uses a WHERE clause on an indexed field — O(log n) lookup. Also, offset pagination breaks when new data is inserted during pagination (rows shift, causing duplicates or gaps). Cursors are stable.

**Q: What is the limit+1 trick in cursor pagination?**
A: We fetch `limit + 1` rows. If we get back `limit + 1` rows, we know there's another page — we pop the extra row and set `hasMore = true`. If we get `limit` or fewer, this is the last page. This avoids a separate COUNT query.

### Security

**Q: Why bcrypt with salt rounds of 10?**
A: Salt rounds of 10 means 2^10 = 1024 iterations of the key derivation function. This takes ~100ms on modern hardware — fast enough for acceptable UX on login, but slow enough that brute-forcing even a simple password would take thousands of years. Each password gets its own random salt, preventing rainbow table attacks.

**Q: Why token rotation on refresh?**
A: If an attacker steals a refresh token, they can use it once. But when the legitimate user uses it first (rotating it), the attacker's stolen token becomes invalid. Without rotation, a stolen refresh token grants access for 7 full days.

**Q: Why is the login error message the same for wrong email and wrong password?**
A: To prevent email enumeration attacks. If the error said "Email not found," an attacker could probe the system to discover valid email addresses.

**Q: How does WebSocket authentication differ from HTTP?**
A: WebSocket connections can't carry HTTP auth headers (the handshake is a single GET). Instead, authentication is done at the application level: after connecting, the client must send an `auth` message with a JWT within 5 seconds, or the connection is closed.

### Real-Time Features

**Q: How do typing indicators avoid getting stuck?**
A: A 5-second auto-clear timeout. When a user starts typing, we set a timer. If they don't send `isTyping: false` within 5 seconds (due to client crash, network drop, etc.), the server automatically broadcasts `isTyping: false` and cleans up the timer.

**Q: Why are typing indicators never persisted?**
A: They're ephemeral by nature — "User is typing" is only relevant to whoever is currently viewing the conversation. Persisting them would waste database writes for data that's stale within seconds.

**Q: Explain the delivery receipt lifecycle.**
A: SENT (message persisted in DB) → DELIVERED (message pushed to recipient's WebSocket) → READ (recipient explicitly marks as read). Delivery receipts are auto-created when we successfully `send()` to the recipient's socket. Read receipts require explicit action from the recipient.

### TypeScript

**Q: What is `exactOptionalPropertyTypes` and why use it?**
A: It makes `{ foo?: string }` mean "foo is either a string or ABSENT" — NOT "foo is string | undefined." This catches bugs where you accidentally pass `undefined` to a field that should either have a value or not exist at all. It's one of TypeScript's strictest flags and catches real bugs with Prisma operations.

**Q: Why `.js` extensions in import paths?**
A: TypeScript's `nodenext` module resolution matches Node.js ESM behavior. Since TypeScript compiles `.ts` files to `.js`, the import paths must reference the output files. Node.js resolves imports at runtime, where only `.js` files exist.

### Production Concerns

**Q: How would you scale this beyond a single server?**
A: The main challenge is WebSocket state. Options: (1) Use Redis Pub/Sub — when server A needs to send to a user on server B, publish to a Redis channel; server B subscribes and forwards. (2) Use a sticky session load balancer so a user's connections always hit the same server. (3) Use a managed WebSocket service (AWS API Gateway WebSocket, Ably, Pusher).

**Q: How would you handle message ordering in a distributed system?**
A: Messages are ordered by `createdAt` (server timestamp). In a multi-server setup, use a centralized timestamp source or logical clocks (Lamport timestamps). The database's `createdAt` index ensures consistent ordering for queries.

**Q: What about data consistency if the server crashes mid-operation?**
A: Database operations are atomic — if the server crashes mid-query, the database rolls back. The worst case is a WebSocket ACK not being sent after persistence — the client retries, and we handle idempotency via unique constraints.

**Q: How does graceful shutdown work?**
A: SIGINT/SIGTERM triggers: (1) close all WebSocket connections with code 1001, (2) close the WS server, (3) close the HTTP server (drain existing connections), (4) disconnect from DB. A 5-second force-exit timeout prevents hanging if any step blocks.
