# Backend Testing Guide (Postman)

A step-by-step guide to test every feature of the chat backend using Postman.

---

## Table of Contents

1. [Setup Before Testing](#1-setup-before-testing)
2. [Postman Environment Setup](#2-postman-environment-setup)
3. [Health Check](#3-health-check)
4. [Authentication](#4-authentication)
5. [User Profiles](#5-user-profiles)
6. [Conversations (1:1)](#6-conversations-11)
7. [Messaging (REST)](#7-messaging-rest)
8. [Group Chats](#8-group-chats)
9. [Contacts](#9-contacts)
10. [Blocking](#10-blocking)
11. [Message Operations (Edit, Delete, Forward, Star)](#11-message-operations)
12. [Message Search](#12-message-search)
13. [Notifications](#13-notifications)
14. [WebSocket Testing](#14-websocket-testing)
15. [Edge Cases & Error Testing](#15-edge-cases--error-testing)

---

## 1. Setup Before Testing

### 1.1 Start PostgreSQL

Make sure PostgreSQL is running on your machine.

### 1.2 Create the database

```bash
psql -U postgres
CREATE DATABASE chatapp;
\q
```

### 1.3 Setup environment

Make sure `backend/.env` has:

```
DATABASE_URL="postgresql://postgres:yourpassword@localhost:5432/chatapp"
JWT_SECRET="any-random-string-here-make-it-long"
PORT=4000
```

### 1.4 Setup and start the server

```bash
cd backend

# Install dependencies
npm install

# Push schema to database (creates all tables)
npm run db:push

# Generate Prisma client
npm run db:generate

# Build TypeScript
npm run build

# Start server
npm run start
```

You should see:
```
Server listening on port 4000
HTTP:  http://localhost:4000
WS:    ws://localhost:4000
```

Keep this terminal open — the server needs to stay running while you test.

---

## 2. Postman Environment Setup

Setting up variables in Postman saves you from copying tokens and IDs repeatedly.

### 2.1 Create a new Environment

1. Click the **Environments** tab (gear icon) in Postman
2. Click **+** to create a new environment
3. Name it `Chat App Local`
4. Add these variables:

| Variable | Initial Value | Description |
|---|---|---|
| `base_url` | `http://localhost:4000` | Server URL |
| `alice_token` | *(leave empty)* | Alice's access token |
| `alice_id` | *(leave empty)* | Alice's user ID |
| `alice_refresh` | *(leave empty)* | Alice's refresh token |
| `bob_token` | *(leave empty)* | Bob's access token |
| `bob_id` | *(leave empty)* | Bob's user ID |
| `bob_refresh` | *(leave empty)* | Bob's refresh token |
| `conv_id` | *(leave empty)* | Direct conversation ID |
| `group_id` | *(leave empty)* | Group ID |
| `group_conv_id` | *(leave empty)* | Group conversation ID |
| `message_id` | *(leave empty)* | A message ID for testing |

5. Click **Save**
6. Select `Chat App Local` from the environment dropdown (top right)

### 2.2 How to use variables

- In URLs: `{{base_url}}/api/auth/register`
- In headers: `Bearer {{alice_token}}`
- After a response, you can right-click a value and "Set as variable" to save it

### 2.3 Auto-save tokens (optional but handy)

In the **Tests** tab of your register/login requests, you can add this script to auto-save tokens:

```javascript
const res = pm.response.json();
pm.environment.set("alice_token", res.tokens.accessToken);
pm.environment.set("alice_id", res.user.id);
pm.environment.set("alice_refresh", res.tokens.refreshToken);
```

---

## 3. Health Check

> This is the simplest test — checks if the server is alive and connected to the database.

### Request

```
GET {{base_url}}/health
```

No headers, no body, no auth needed.

### Expected Response (200 OK)

```json
{
  "status": "ok",
  "uptime": 12.345,
  "timestamp": "2026-02-16T10:00:00.000Z",
  "wsConnections": 0,
  "onlineUsers": 0
}
```

### What to verify

- `status` is `"ok"` — server is running
- `wsConnections` is `0` — no WebSocket clients connected yet
- Response is fast (< 100ms) — database connection is healthy

---

## 4. Authentication

### 4.1 Register Alice

```
POST {{base_url}}/api/auth/register
```

**Headers:**
```
Content-Type: application/json
```

**Body (raw JSON):**
```json
{
  "username": "alice",
  "email": "alice@test.com",
  "password": "password123",
  "displayName": "Alice"
}
```

**Expected Response (201 Created):**
```json
{
  "user": {
    "id": "uuid-here",
    "username": "alice",
    "displayName": "Alice"
  },
  "tokens": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "550e8400-e29b-41d4-a716-446655440000-..."
  }
}
```

**Save these values to your environment:**
- `alice_id` = the `user.id`
- `alice_token` = the `tokens.accessToken`
- `alice_refresh` = the `tokens.refreshToken`

### 4.2 Register Bob

```
POST {{base_url}}/api/auth/register
```

**Body:**
```json
{
  "username": "bob",
  "email": "bob@test.com",
  "password": "password123",
  "displayName": "Bob"
}
```

**Save to environment:**
- `bob_id` = `user.id`
- `bob_token` = `tokens.accessToken`
- `bob_refresh` = `tokens.refreshToken`

### 4.3 Register Charlie (for group testing later)

```
POST {{base_url}}/api/auth/register
```

**Body:**
```json
{
  "username": "charlie",
  "email": "charlie@test.com",
  "password": "password123",
  "displayName": "Charlie"
}
```

Save `charlie_id` and `charlie_token` if you want — you'll need them for group tests.

### 4.4 Login

```
POST {{base_url}}/api/auth/login
```

**Body:**
```json
{
  "email": "alice@test.com",
  "password": "password123"
}
```

**Expected:** Same shape as register — fresh tokens returned.

### 4.5 Refresh Token

```
POST {{base_url}}/api/auth/refresh
```

**Body:**
```json
{
  "refreshToken": "{{alice_refresh}}"
}
```

**Expected (200):**
```json
{
  "accessToken": "new-jwt-here...",
  "refreshToken": "new-refresh-token-here..."
}
```

**Important:** After refreshing, the OLD refresh token is deleted. Update `alice_token` and `alice_refresh` in your environment with the new values.

### 4.6 Logout

```
POST {{base_url}}/api/auth/logout
```

**Body:**
```json
{
  "refreshToken": "{{alice_refresh}}"
}
```

**Expected (200):**
```json
{
  "message": "Logged out"
}
```

**After this:** The refresh token is deleted from the database. You'll need to login again to get fresh tokens.

**Do a fresh login for Alice now** to get working tokens for the remaining tests.

### 4.7 Test validation errors

Try registering with bad data:

**Body:**
```json
{
  "username": "ab",
  "email": "not-an-email",
  "password": "123",
  "displayName": ""
}
```

**Expected (400):**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": {
      "username": ["String must contain at least 3 character(s)"],
      "email": ["Invalid email"],
      "password": ["String must contain at least 6 character(s)"],
      "displayName": ["String must contain at least 1 character(s)"]
    }
  }
}
```

### 4.8 Test duplicate registration

Try registering with `alice@test.com` again:

**Expected (400):**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Email already registered"
  }
}
```

---

## 5. User Profiles

### 5.1 Get own profile

```
GET {{base_url}}/api/users/me
```

**Headers:**
```
Authorization: Bearer {{alice_token}}
```

**Expected (200):**
```json
{
  "id": "...",
  "username": "alice",
  "displayName": "Alice",
  "email": "alice@test.com",
  "avatarUrl": null,
  "about": "Hey there! I am using ChatApp",
  "isOnline": false,
  "lastSeen": "...",
  "createdAt": "..."
}
```

Note: `email` is included because this is your OWN profile.

### 5.2 Update profile

```
PUT {{base_url}}/api/users/me
```

**Headers:**
```
Authorization: Bearer {{alice_token}}
Content-Type: application/json
```

**Body:**
```json
{
  "displayName": "Alice Wonderland",
  "about": "Down the rabbit hole"
}
```

**Expected (200):** Updated profile with new values.

### 5.3 Get another user's profile

```
GET {{base_url}}/api/users/{{bob_id}}
```

**Headers:**
```
Authorization: Bearer {{alice_token}}
```

**Expected (200):** Bob's public profile (no email field).

### 5.4 Search users

```
GET {{base_url}}/api/users/search?q=bob
```

**Headers:**
```
Authorization: Bearer {{alice_token}}
```

**Expected (200):** Array containing Bob's profile. Alice is excluded from results (you can't search for yourself).

### 5.5 Test without auth

```
GET {{base_url}}/api/users/me
```

No Authorization header.

**Expected (401):**
```json
{
  "error": {
    "code": "AUTHENTICATION_ERROR",
    "message": "Missing or invalid Authorization header"
  }
}
```

---

## 6. Conversations (1:1)

### 6.1 Create a direct conversation

Alice starts a conversation with Bob:

```
POST {{base_url}}/api/conversations/direct
```

**Headers:**
```
Authorization: Bearer {{alice_token}}
Content-Type: application/json
```

**Body:**
```json
{
  "userId": "{{bob_id}}"
}
```

**Expected (201):**
```json
{
  "id": "conversation-uuid",
  "type": "DIRECT",
  "participants": [
    {
      "userId": "alice-id",
      "user": { "username": "alice", "displayName": "Alice Wonderland", ... }
    },
    {
      "userId": "bob-id",
      "user": { "username": "bob", "displayName": "Bob", ... }
    }
  ]
}
```

**Save:** Set `conv_id` = the response `id`.

### 6.2 Test idempotency — create same conversation again

Send the exact same request again.

**Expected:** Same conversation returned (not a duplicate). The `id` should be the same as before. This is the "get-or-create" pattern.

### 6.3 Test self-conversation

```
POST {{base_url}}/api/conversations/direct
```

**Body:**
```json
{
  "userId": "{{alice_id}}"
}
```

**Expected (400):**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Cannot create conversation with yourself"
  }
}
```

### 6.4 List conversations

```
GET {{base_url}}/api/conversations
```

**Headers:**
```
Authorization: Bearer {{alice_token}}
```

**Expected (200):** Array of conversations, each with:
- `lastMessage` — the most recent message (null if none yet)
- `unreadCount` — number of unread messages
- `participants` — who's in the conversation

### 6.5 Get conversation by ID

```
GET {{base_url}}/api/conversations/{{conv_id}}
```

**Headers:**
```
Authorization: Bearer {{alice_token}}
```

**Expected (200):** The conversation with participant details.

### 6.6 Get messages (empty at first)

```
GET {{base_url}}/api/conversations/{{conv_id}}/messages
```

**Headers:**
```
Authorization: Bearer {{alice_token}}
```

**Expected (200):**
```json
{
  "messages": [],
  "hasMore": false,
  "nextCursor": null
}
```

---

## 7. Messaging (REST)

> Messages are normally sent via WebSocket (real-time). But we can verify message history and pagination via REST after sending messages through WebSocket. For now, we'll set up the data through WebSocket (see section 14), then come back here to verify.

> **Skip to Section 8 (Groups) first, then Section 14 (WebSocket) to send actual messages, then come back here to test history and pagination.**

### 7.1 Get message history

After sending some messages via WebSocket:

```
GET {{base_url}}/api/conversations/{{conv_id}}/messages
```

**Headers:**
```
Authorization: Bearer {{alice_token}}
```

**Expected (200):**
```json
{
  "messages": [
    {
      "id": "msg-uuid",
      "content": "Hey Bob!",
      "contentType": "TEXT",
      "senderId": "alice-id",
      "sender": { "id": "...", "username": "alice", "displayName": "Alice" },
      "replyTo": null,
      "createdAt": "...",
      "editedAt": null,
      "deletedAt": null
    }
  ],
  "hasMore": false,
  "nextCursor": null
}
```

### 7.2 Test pagination

```
GET {{base_url}}/api/conversations/{{conv_id}}/messages?limit=2
```

If you have more than 2 messages, the response will have:
```json
{
  "messages": [ ... ],
  "hasMore": true,
  "nextCursor": "some-message-id"
}
```

Then fetch the next page:
```
GET {{base_url}}/api/conversations/{{conv_id}}/messages?limit=2&cursor={{nextCursor}}
```

---

## 8. Group Chats

### 8.1 Create a group

Alice creates a group with Bob and Charlie:

```
POST {{base_url}}/api/groups
```

**Headers:**
```
Authorization: Bearer {{alice_token}}
Content-Type: application/json
```

**Body:**
```json
{
  "name": "Team Chat",
  "description": "Our project team",
  "memberIds": ["{{bob_id}}", "CHARLIE_ID_HERE"]
}
```

**Expected (201):**
```json
{
  "id": "group-uuid",
  "name": "Team Chat",
  "description": "Our project team",
  "conversationId": "conv-uuid",
  "createdBy": "alice-id",
  "conversation": {
    "participants": [
      { "role": "ADMIN", "user": { "username": "alice" } },
      { "role": "MEMBER", "user": { "username": "bob" } },
      { "role": "MEMBER", "user": { "username": "charlie" } }
    ]
  }
}
```

**Save:**
- `group_id` = response `id`
- `group_conv_id` = response `conversationId`

Note: Alice is automatically `ADMIN`, others are `MEMBER`.

### 8.2 Get group info

```
GET {{base_url}}/api/groups/{{group_id}}
```

**Headers:**
```
Authorization: Bearer {{alice_token}}
```

**Expected:** Group with all member details.

### 8.3 Update group info (admin only)

```
PUT {{base_url}}/api/groups/{{group_id}}
```

**Headers:**
```
Authorization: Bearer {{alice_token}}
Content-Type: application/json
```

**Body:**
```json
{
  "name": "Project Alpha",
  "description": "Updated description"
}
```

**Expected (200):** Updated group. A system message "changed the group name to 'Project Alpha'" is created in the conversation.

### 8.4 Test non-admin update (should fail)

Same request but use Bob's token:

**Headers:**
```
Authorization: Bearer {{bob_token}}
```

**Expected (403):**
```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Admin privileges required"
  }
}
```

### 8.5 Add members

```
POST {{base_url}}/api/groups/{{group_id}}/members
```

**Headers:**
```
Authorization: Bearer {{alice_token}}
Content-Type: application/json
```

**Body:**
```json
{
  "userIds": ["SOME_NEW_USER_ID"]
}
```

Register a 4th user first if you want to test this. If all users are already members, you'll get:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "All users are already members"
  }
}
```

### 8.6 Remove a member

Alice (admin) removes Charlie:

```
DELETE {{base_url}}/api/groups/{{group_id}}/members/CHARLIE_ID
```

**Headers:**
```
Authorization: Bearer {{alice_token}}
```

**Expected (200):** Updated group without Charlie. A system message "removed Charlie" appears.

### 8.7 Leave group (self-remove)

Bob leaves the group himself:

```
DELETE {{base_url}}/api/groups/{{group_id}}/members/{{bob_id}}
```

**Headers:**
```
Authorization: Bearer {{bob_token}}
```

**Expected (200):** Updated group without Bob. A system message "Bob left the group" appears.

### 8.8 Update member role

Promote Bob to admin (add Bob back first if you removed him):

```
PUT {{base_url}}/api/groups/{{group_id}}/members/{{bob_id}}/role
```

**Headers:**
```
Authorization: Bearer {{alice_token}}
Content-Type: application/json
```

**Body:**
```json
{
  "role": "ADMIN"
}
```

### 8.9 View group messages

Group messages use the same endpoint as direct messages:

```
GET {{base_url}}/api/conversations/{{group_conv_id}}/messages
```

You'll see system messages like:
- `created the group "Team Chat"`
- `changed the group name to "Project Alpha"`
- `removed Charlie`

---

## 9. Contacts

### 9.1 Add contact

Alice adds Bob as a contact:

```
POST {{base_url}}/api/contacts
```

**Headers:**
```
Authorization: Bearer {{alice_token}}
Content-Type: application/json
```

**Body:**
```json
{
  "userId": "{{bob_id}}",
  "nickname": "Bobby"
}
```

**Expected (201):**
```json
{
  "id": "contact-uuid",
  "userId": "alice-id",
  "contactId": "bob-id",
  "nickname": "Bobby",
  "contact": {
    "id": "bob-id",
    "username": "bob",
    "displayName": "Bob",
    "isOnline": false,
    ...
  }
}
```

### 9.2 List contacts

```
GET {{base_url}}/api/contacts
```

**Headers:**
```
Authorization: Bearer {{alice_token}}
```

**Expected (200):** Array of contacts with user details.

### 9.3 Remove contact

```
DELETE {{base_url}}/api/contacts/{{bob_id}}
```

**Headers:**
```
Authorization: Bearer {{alice_token}}
```

**Expected (200):**
```json
{
  "message": "Contact removed"
}
```

### 9.4 Test self-add

```
POST {{base_url}}/api/contacts
```

**Body:**
```json
{
  "userId": "{{alice_id}}"
}
```

**Expected (400):**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Cannot add yourself as a contact"
  }
}
```

---

## 10. Blocking

### 10.1 Block a user

Alice blocks Bob:

```
POST {{base_url}}/api/contacts/block
```

**Headers:**
```
Authorization: Bearer {{alice_token}}
Content-Type: application/json
```

**Body:**
```json
{
  "userId": "{{bob_id}}"
}
```

**Expected (200):**
```json
{
  "message": "User blocked"
}
```

**Side effect:** If Bob was Alice's contact, he's automatically removed from contacts.

### 10.2 List blocked users

```
GET {{base_url}}/api/contacts/blocked
```

**Headers:**
```
Authorization: Bearer {{alice_token}}
```

**Expected (200):** Array of blocked users with their profile data.

### 10.3 Unblock a user

```
DELETE {{base_url}}/api/contacts/block/{{bob_id}}
```

**Headers:**
```
Authorization: Bearer {{alice_token}}
```

**Expected (200):**
```json
{
  "message": "User unblocked"
}
```

### 10.4 Test self-block

```
POST {{base_url}}/api/contacts/block
```

**Body:**
```json
{
  "userId": "{{alice_id}}"
}
```

**Expected (400):**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Cannot block yourself"
  }
}
```

---

## 11. Message Operations

> You need at least one message in a conversation first. Send messages via WebSocket (section 14) or use the forward endpoint to create test data.

### 11.1 Edit a message

```
PUT {{base_url}}/api/messages/{{message_id}}
```

**Headers:**
```
Authorization: Bearer {{alice_token}}
Content-Type: application/json
```

**Body:**
```json
{
  "content": "This is the edited message"
}
```

**Expected (200):** Updated message with `editedAt` set to current time.

**Rules to test:**
- Only your own messages — use Bob's token, expect 403
- Only TEXT messages — if you had an IMAGE message, expect 400
- Only within 15 minutes — wait 15 min, expect 400 "Can only edit messages within 15 minutes"

### 11.2 Delete message (for everyone)

```
DELETE {{base_url}}/api/messages/{{message_id}}
```

**Headers:**
```
Authorization: Bearer {{alice_token}}
Content-Type: application/json
```

**Body:**
```json
{
  "forEveryone": true
}
```

**Expected (200):**
```json
{
  "message": "Message deleted"
}
```

The message now has `deletedAt` set and content replaced with "This message was deleted". It won't appear in future message queries (filtered by `deletedAt: null`).

**Rules to test:**
- Only your own messages — use Bob's token, expect 403
- Only within 1 hour — after 1 hour, expect 400

### 11.3 Forward a message

First, create a second conversation (Alice with Charlie, or use the group). Then:

```
POST {{base_url}}/api/messages/forward
```

**Headers:**
```
Authorization: Bearer {{alice_token}}
Content-Type: application/json
```

**Body:**
```json
{
  "messageId": "{{message_id}}",
  "targetConversationIds": ["{{group_conv_id}}"]
}
```

**Expected (200):**
```json
{
  "forwarded": 1
}
```

The message content is copied to the target conversation as a new message from Alice.

### 11.4 Star a message

```
POST {{base_url}}/api/messages/{{message_id}}/star
```

**Headers:**
```
Authorization: Bearer {{alice_token}}
```

**Expected (200):**
```json
{
  "message": "Message starred",
  "messageId": "..."
}
```

Note: This is currently a stub — it returns success but doesn't persist. The full implementation would use a StarredMessage table.

---

## 12. Message Search

### 12.1 Search across all conversations

```
GET {{base_url}}/api/messages/search?q=hello
```

**Headers:**
```
Authorization: Bearer {{alice_token}}
```

**Expected (200):** Array of messages containing "hello" (case-insensitive), only from conversations Alice is part of. Max 50 results.

### 12.2 Search within a specific conversation

```
GET {{base_url}}/api/messages/search?q=hello&conversationId={{conv_id}}
```

**Expected (200):** Same as above but filtered to one conversation.

### 12.3 Test empty query

```
GET {{base_url}}/api/messages/search?q=
```

**Expected (400):**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Query required"
  }
}
```

---

## 13. Notifications

### 13.1 Get unread counts

```
GET {{base_url}}/api/notifications/unread
```

**Headers:**
```
Authorization: Bearer {{bob_token}}
```

**Expected (200):**
```json
{
  "totalUnread": 3,
  "conversations": [
    {
      "conversationId": "conv-uuid",
      "unreadCount": 3
    }
  ]
}
```

To generate unread messages: send a few messages as Alice via WebSocket, then check Bob's unread count WITHOUT Bob sending a `chat:read`.

---

## 14. WebSocket Testing

Postman supports WebSocket testing. Here's how:

### 14.1 Create a WebSocket request

1. In Postman, click **New** → **WebSocket**
2. Enter the URL: `ws://localhost:4000`
3. Click **Connect**
4. The status should show "Connected"

### 14.2 Authenticate

In the message box at the bottom, paste this and click **Send**:

```json
{"id":"1","type":"auth","payload":{"token":"PASTE_ALICE_TOKEN_HERE"},"timestamp":1700000000}
```

**Expected response in the Messages panel:**
```json
{
  "id": "...",
  "type": "auth:success",
  "payload": { "userId": "alice-id" },
  "timestamp": ...
}
```

### 14.3 Open a second WebSocket tab for Bob

1. Create another WebSocket request tab
2. Connect to `ws://localhost:4000`
3. Authenticate with Bob's token:
```json
{"id":"1","type":"auth","payload":{"token":"PASTE_BOB_TOKEN_HERE"},"timestamp":1700000000}
```

Now both Alice and Bob are connected.

### 14.4 Send a message

In **Alice's WebSocket tab**, send:

```json
{"id":"msg1","type":"chat:send","payload":{"conversationId":"PASTE_CONV_ID","content":"Hey Bob! How are you?"},"timestamp":1700000000}
```

**What to observe:**

In **Alice's tab** — two messages arrive:
1. `chat:sent` — acknowledgment that the message was saved
   ```json
   {
     "type": "chat:sent",
     "payload": { "clientMessageId": "msg1", "messageId": "server-uuid", "timestamp": ... },
     "replyTo": "msg1"
   }
   ```
2. `chat:delivered` — Bob received it (because Bob is online)
   ```json
   {
     "type": "chat:delivered",
     "payload": { "messageId": "server-uuid", "conversationId": "" }
   }
   ```

In **Bob's tab** — one message arrives:
```json
{
  "type": "chat:receive",
  "payload": {
    "messageId": "server-uuid",
    "senderId": "alice-id",
    "senderName": "Alice",
    "conversationId": "conv-id",
    "content": "Hey Bob! How are you?",
    "contentType": "TEXT",
    "timestamp": ...
  }
}
```

**Save the `messageId` from the `chat:sent` response** — set `message_id` in your environment for later tests.

### 14.5 Send a reply

Bob replies to Alice. In **Bob's tab**:

```json
{"id":"msg2","type":"chat:send","payload":{"conversationId":"PASTE_CONV_ID","content":"I'm great!","replyToMessageId":"PASTE_MESSAGE_ID"},"timestamp":1700000000}
```

Alice receives `chat:receive` with a `replyTo` field showing the original message preview.

### 14.6 Typing indicator

In **Bob's tab**, send:

```json
{"id":"t1","type":"chat:typing","payload":{"conversationId":"PASTE_CONV_ID","isTyping":true},"timestamp":1700000000}
```

**Alice's tab** receives:
```json
{
  "type": "chat:typing",
  "payload": { "conversationId": "...", "userId": "bob-id", "isTyping": true }
}
```

Wait 5 seconds — Alice receives another `chat:typing` with `isTyping: false` (auto-clear).

Or Bob can manually stop:
```json
{"id":"t2","type":"chat:typing","payload":{"conversationId":"PASTE_CONV_ID","isTyping":false},"timestamp":1700000000}
```

### 14.7 Read receipt

In **Bob's tab**, mark Alice's message as read:

```json
{"id":"r1","type":"chat:read","payload":{"conversationId":"PASTE_CONV_ID","messageId":"PASTE_MESSAGE_ID"},"timestamp":1700000000}
```

**Alice's tab** receives:
```json
{
  "type": "chat:read",
  "payload": {
    "messageId": "...",
    "conversationId": "...",
    "readBy": "bob-id"
  }
}
```

### 14.8 Presence

**Observe:** When you disconnected/connected WebSocket tabs, you should see `presence:update` messages in the other user's tab:

```json
{
  "type": "presence:update",
  "payload": { "userId": "bob-id", "status": "online" }
}
```

```json
{
  "type": "presence:update",
  "payload": { "userId": "bob-id", "status": "offline", "lastSeen": 1700000000 }
}
```

### 14.9 Group messaging via WebSocket

Send a message to the group conversation:

```json
{"id":"gmsg1","type":"chat:send","payload":{"conversationId":"PASTE_GROUP_CONV_ID","content":"Hello team!"},"timestamp":1700000000}
```

All online group members (except the sender) receive `chat:receive`.

### 14.10 Send multiple messages (for pagination testing)

Send 5+ messages quickly to test pagination later:

```json
{"id":"m1","type":"chat:send","payload":{"conversationId":"PASTE_CONV_ID","content":"Message 1"},"timestamp":1700000001}
{"id":"m2","type":"chat:send","payload":{"conversationId":"PASTE_CONV_ID","content":"Message 2"},"timestamp":1700000002}
{"id":"m3","type":"chat:send","payload":{"conversationId":"PASTE_CONV_ID","content":"Message 3"},"timestamp":1700000003}
{"id":"m4","type":"chat:send","payload":{"conversationId":"PASTE_CONV_ID","content":"Message 4"},"timestamp":1700000004}
{"id":"m5","type":"chat:send","payload":{"conversationId":"PASTE_CONV_ID","content":"Message 5"},"timestamp":1700000005}
```

(Send each one individually — Postman sends one at a time.)

Now go back to **Section 7** to test message history and pagination via REST.

---

## 15. Edge Cases & Error Testing

These are the tricky scenarios worth testing to understand how the system handles failures.

### 15.1 Expired access token

Wait 15 minutes (or generate a token with a past timestamp manually). Then:

```
GET {{base_url}}/api/users/me
Authorization: Bearer EXPIRED_TOKEN
```

**Expected (401):**
```json
{
  "error": {
    "code": "AUTHENTICATION_ERROR",
    "message": "Invalid or expired token"
  }
}
```

### 15.2 Invalid token

```
GET {{base_url}}/api/users/me
Authorization: Bearer this-is-not-a-real-token
```

**Expected (401):** Same error as above.

### 15.3 Missing Authorization header

```
GET {{base_url}}/api/users/me
```

No auth header at all.

**Expected (401):**
```json
{
  "error": {
    "code": "AUTHENTICATION_ERROR",
    "message": "Missing or invalid Authorization header"
  }
}
```

### 15.4 WebSocket auth timeout

1. Connect to `ws://localhost:4000`
2. Do NOT send any message
3. Wait 5 seconds

**Expected:** Connection closes automatically. Server logs "WebSocket auth timeout". Close code is `4001`.

### 15.5 WebSocket message without auth

1. Connect to `ws://localhost:4000`
2. Immediately send a chat message (without authenticating first):
```json
{"id":"1","type":"chat:send","payload":{"conversationId":"test","content":"hello"},"timestamp":1700000000}
```

**Expected:**
```json
{
  "type": "error",
  "payload": { "code": "NOT_AUTHENTICATED", "message": "Must authenticate first" }
}
```

### 15.6 Unknown WebSocket message type

After authenticating:
```json
{"id":"1","type":"unknown:type","payload":{},"timestamp":1700000000}
```

**Expected:**
```json
{
  "type": "error",
  "payload": { "code": "UNKNOWN_TYPE", "message": "Unknown message type: unknown:type" }
}
```

### 15.7 Access conversation you're not part of

Create a conversation between Bob and Charlie. Then try to access it as Alice:

```
GET {{base_url}}/api/conversations/BOB_CHARLIE_CONV_ID
Authorization: Bearer {{alice_token}}
```

**Expected (403):**
```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Not a participant of this conversation"
  }
}
```

### 15.8 Edit someone else's message

Alice tries to edit Bob's message:

```
PUT {{base_url}}/api/messages/BOBS_MESSAGE_ID
Authorization: Bearer {{alice_token}}
Content-Type: application/json
Body: {"content":"hacked!"}
```

**Expected (403):**
```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Can only edit your own messages"
  }
}
```

### 15.9 Non-existent resource

```
GET {{base_url}}/api/users/00000000-0000-0000-0000-000000000000
Authorization: Bearer {{alice_token}}
```

**Expected (404):**
```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "User not found"
  }
}
```

### 15.10 Multi-device presence test

1. Open **two** WebSocket tabs for Alice (both authenticated with Alice's token)
2. Alice should appear online
3. Close **one** tab
4. Alice should STILL appear online (one connection remains)
5. Close the **second** tab
6. NOW Bob should receive `presence:update` with `"status": "offline"`

### 15.11 Used refresh token (token rotation)

1. Call `POST /api/auth/refresh` with Alice's refresh token — get new tokens
2. Try to use the OLD refresh token again

**Expected (401):**
```json
{
  "error": {
    "code": "AUTHENTICATION_ERROR",
    "message": "Invalid or expired refresh token"
  }
}
```

---

## Testing Checklist

Use this checklist to track what you've tested:

### Auth
- [ ] Register new user
- [ ] Register with validation errors (short username, bad email, etc.)
- [ ] Register duplicate username
- [ ] Register duplicate email
- [ ] Login with correct credentials
- [ ] Login with wrong password
- [ ] Login with non-existent email
- [ ] Refresh token
- [ ] Use old refresh token after rotation (should fail)
- [ ] Logout
- [ ] Access protected route without token (401)
- [ ] Access protected route with expired token (401)

### Users
- [ ] Get own profile (includes email)
- [ ] Update own profile
- [ ] Get another user's profile (no email)
- [ ] Search users by username
- [ ] Search users by display name
- [ ] Search excludes self

### Conversations
- [ ] Create direct conversation
- [ ] Create same conversation again (returns existing)
- [ ] Cannot create self-conversation
- [ ] List conversations (with unread counts)
- [ ] Get conversation by ID
- [ ] Cannot access conversation you're not in (403)
- [ ] Get messages (empty)
- [ ] Get messages (with data)
- [ ] Pagination with limit and cursor

### Groups
- [ ] Create group
- [ ] Get group info
- [ ] Update group info (admin)
- [ ] Update group info (non-admin fails, 403)
- [ ] Add members (admin)
- [ ] Remove member (admin)
- [ ] Leave group (self-remove)
- [ ] Auto-promote when admin leaves
- [ ] Update member role
- [ ] System messages appear in group conversation

### WebSocket
- [ ] Connect and authenticate
- [ ] Auth timeout (5 seconds)
- [ ] Send message without auth (error)
- [ ] Send message — sender gets `chat:sent` ACK
- [ ] Send message — recipient gets `chat:receive`
- [ ] Send message — sender gets `chat:delivered`
- [ ] Reply to a message (with `replyToMessageId`)
- [ ] Typing indicator (broadcast to others)
- [ ] Typing auto-clear after 5 seconds
- [ ] Read receipt — sender notified
- [ ] Presence online on connect
- [ ] Presence offline on disconnect
- [ ] Multi-device: both devices receive messages
- [ ] Multi-device: offline only when ALL devices disconnect
- [ ] Unknown message type (error)

### Message Operations
- [ ] Edit own message (within 15 min)
- [ ] Edit others' message (403)
- [ ] Edit after 15 min (400)
- [ ] Delete for everyone (within 1 hour)
- [ ] Delete others' message for everyone (403)
- [ ] Forward message to another conversation
- [ ] Star message
- [ ] Search messages across all conversations
- [ ] Search messages within one conversation
- [ ] Search with empty query (400)

### Contacts
- [ ] Add contact
- [ ] Add contact with nickname
- [ ] Cannot add self as contact
- [ ] List contacts
- [ ] Remove contact

### Blocking
- [ ] Block user (also removes from contacts)
- [ ] Cannot block self
- [ ] List blocked users
- [ ] Unblock user

### Notifications
- [ ] Get unread counts (total + per conversation)
- [ ] Unread count decreases after read receipt

### Error Handling
- [ ] 400 — Validation errors return field-level details
- [ ] 401 — Auth errors
- [ ] 403 — Forbidden (wrong user, not admin, not participant)
- [ ] 404 — Resource not found
- [ ] WebSocket errors have code + message + replyTo

---

## Tips

1. **Save your tokens.** Every time you register/login/refresh, update your environment variables.
2. **Tokens expire in 15 minutes.** If requests start failing with 401, login again.
3. **Keep the server terminal visible.** The JSON logs show exactly what's happening on the server side.
4. **Use Prisma Studio** to inspect database directly: `npm run db:studio` (opens a browser UI on port 5555).
5. **To reset everything**, drop and recreate the database:
   ```bash
   psql -U postgres -c "DROP DATABASE chatapp;"
   psql -U postgres -c "CREATE DATABASE chatapp;"
   npm run db:push
   ```
