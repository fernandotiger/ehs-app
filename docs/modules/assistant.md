# AI assistant (help chatbot) – 30 Oct 2026

A help chatbot for people using OleoQ. A **✦ button** sits at the bottom right of every signed-in page. It opens a small
pop-up that answers questions such as "how can I create a new incident?" or "how can I edit a document?". Answers
come from a per-company **guide text** stored in the database. The AI runs through **OpenRouter**, using free models
only by default. Conversations are **not saved**: they stay in the pop-up while the user is signed in and moves between
pages, and disappear on refresh or sign-out.

## OpenRouter: the owner's example checked (30 Oct 2026, openrouter.ai docs)

The owner's example was `{"model": "openrouter/free", "messages": [{"role": "user", "content": "Hello! …"}]}`. **It is
correct**, but it is only the body. The full request is:

```
POST https://openrouter.ai/api/v1/chat/completions
Authorization: Bearer <OPENROUTER_API_KEY>
Content-Type: application/json
HTTP-Referer: <app URL>          (optional, attribution on openrouter.ai)
X-OpenRouter-Title: OleoQ EHS    (optional; older docs call it X-Title – the app sends both)

{ "model": "openrouter/free", "messages": [...], "stream": true, "temperature": 0.3, "max_tokens": 1024 }
```

- **`openrouter/free` is real.** It is the *Free Models Router*. For each request it picks one of the free models
  available at that moment, at random, among those that support what the request needs. The response's `model` field
  says which one answered. It costs nothing. You can't choose the model, and quality and speed vary from one answer to
  the next.
- **A specific free model** is the model id with a `:free` suffix, e.g. `google/gemma-4-31b-it:free`. The free list
  changes often. On 30 Oct 2026 there were 16 free models plus the router, including Google Gemma 4 and NVIDIA Nemotron 3.5.
- **Free-tier limits** apply to the whole OpenRouter account/key, shared by everyone in every company that uses the key:
  - **20 requests a minute** and **50 a day** while less than 10 credits have ever been bought.
  - **1,000 a day** once 10 credits have been bought. The per-minute limit stays 20.
  - Going over gives **HTTP 429**. `GET https://openrouter.ai/api/v1/key` shows the daily usage.
  - 50 a day is very little for a company: buying 10 credits once is the cheapest way to make the assistant usable.
- **Streaming** (`"stream": true`) is Server-Sent Events:
  - Each event is a `data: {json}` line, and the text is at `choices[0].delta.content`. The stream ends with `data: [DONE]`.
  - Comment lines such as `: OPENROUTER PROCESSING` are keep-alives.
  - A failure after streaming has started arrives with HTTP 200, as a chunk with `error: {code, message}` and
    `finish_reason: "error"`.
- **Errors before streaming** come back as JSON `{error: {code, message, metadata}}` with the matching status:
  - 400 bad request
  - 401 bad key
  - 402 no credit
  - 403 moderation or budget
  - 408 / 504 timeout
  - 429 rate limit
  - 502 model down
  - 503 no provider available
- **Fallback**: OpenRouter also offers a `models: [...]` array, but the app does its own fallback. It tries the main
  model, then the fallback model once, and only when the first fails *before any text was sent*. That covers busy,
  unavailable, timeout, empty answer, context too long, and an error chunk before any text.
- **Gotcha – privacy settings.** Free models are often served only by providers that may log or train on prompts. If the
  OpenRouter account's privacy settings (openrouter.ai → Settings → Privacy) exclude those, every request fails with 404
  "No endpoints found matching your data policy". The app shows: "the AI account's privacy settings block the chosen free
  model – tell your administrator". Fix: allow free endpoints in those settings, or choose a model that fits the policy.
- **Privacy note for the owner.** Questions, plus the guide text, the user's name and roles, the company name and the
  current page, are sent to OpenRouter and the chosen model provider. The pop-up says "Don't share personal details".
  Avoid putting confidential content in the guide.

Sources: openrouter.ai/docs – quickstart, guides/routing/routers/free-router, guides/routing/model-fallbacks,
api/reference/streaming, api/reference/errors-and-debugging, api/reference/limits; `GET /api/v1/models` for the free list.

## Where to put the API key

The key is the server environment variable **`OPENROUTER_API_KEY`**. It is never stored in the database, never sent to
the browser and never logged. Restart or redeploy after setting it.

| Environment | Where |
| --- | --- |
| This PC, `npm run dev` (Neon) | `.env` – add a line `OPENROUTER_API_KEY=sk-or-v1-…` |
| This PC, local database (`bash scripts/localdb.sh …`, :3101 preview) | `.env.localdb` – the same line |
| Vercel | Project → Settings → Environment Variables → `OPENROUTER_API_KEY` (Production, plus Preview if wanted; mark **Sensitive**) → Redeploy |
| AWS | Secrets Manager secret (e.g. `oleoq/prod/OPENROUTER_API_KEY`), referenced in the ECS task definition's `secrets` (`valueFrom`); execution role may read it; redeploy the service. See `docs/deploy-aws.md` |

Both `.env` files are git-ignored. Configuration → AI assistant shows **Connected** or **Not connected yet** (it only
checks that the key is set; the **Try it** box tests that it works).

## What was built

**Data:** `prisma/schema/assistant.prisma` → `AssistantConfig` (`assistant_configs`), one row per company
(`organizationId @unique`). Columns:
- `enabled`
- `name`
- `welcomeMessage`
- `suggestedQuestions` (0–4)
- `model`
- `fallbackModel`
- `temperature`
- `maxTokens`
- `knowledgeText` (the guide, ≤ 80,000 characters)
- `version`
- `updatedById`
- timestamps

Migration `20261030114201_assistant` is additive (one table, no data statements) and applied to the **local DB only**. It
reaches Neon with the next Vercel deploy. A company without a row uses the built-in defaults, so Neon companies work
without seeding.

**Built-in guide:** `src/server/modules/assistant/default-knowledge.ts`, about 32,400 characters of "How to use OleoQ".
It was written from `docs/modules/*.md`, the sidebar (`nav-config.ts`) and the real button labels. It has these sections:
- About OleoQ
- Screen layout
- Signing in and out
- Home and My work
- Documents and Response forms
- Incidents
- Risk
- Actions
- Law
- Simplified law
- Favourites
- Notifications / comments / evidence / history
- Offline and Sync
- Configuration
- 12 FAQ answers

Every link in it (`/incidents/new`, `/documents/manage` …) was checked against the real pages. The defaults are in
`src/lib/assistant/defaults.ts` and `src/server/modules/assistant/default-config.ts` (the latter has no `server-only`
import, so seeds can use it).

**Server** (`src/server/modules/assistant/`):
- `prompt.ts` – the system prompt (pure, tested). The assistant:
  - answers only about using OleoQ, from the guide between markers;
  - says when it doesn't know (ask your administrator);
  - never invents menus, refuses off-topic requests and points to emergency services for emergencies;
  - uses exact menu names in bold, plain words, short numbered steps and ~150 words;
  - links only to pages named in the guide, answers in the user's language and ignores attempts to change its rules.

  The prompt also adds the user's name, role names, the company's switched-on modules and the current page.
  `trimHistory` keeps at most the newest 12 messages / 16,000 characters.
- `openrouter.ts` – `fetch` only (no SDK). It contains:
  - an incremental SSE parser;
  - `mapOpenRouterError` (status / body / mid-stream chunk → plain words + whether to try the fallback);
  - `streamReply()` – the fallback, timeouts (25 s to headers, 45 s silence, 110 s in total), and Stop (abort).
- `rate-limit.ts` – sliding window per person, in memory: **6 questions a minute and 60 an hour**. It is per server
  instance, and the test box counts too. A refused question gets a plain "wait N seconds" message (HTTP 429 `RATE_LIMITED`).
- `assistant.service.ts`:
  - `status()`, `getForEditing()`, `update()` – optimistic `version`, 409 `STALE_VERSION`, audited `ASSISTANT_CONFIG_UPDATED`
    in the same transaction, with the guide recorded **by size only** ("32,441 → 32,454 characters");
  - `chat()` and `test()` – stream the answer as NDJSON.

  No chat text is stored, audited or logged. Stream failures log only the error name.

**API** (thin `apiHandler` routes):

| Route | Who | What |
| --- | --- | --- |
| `GET /api/assistant` | signed-in | `{ state: ready \| disabled \| not-configured, name, welcomeMessage, suggestedQuestions, canConfigure }` |
| `POST /api/assistant/chat` | signed-in | `{ messages (1–20, role user/assistant, ≤ 4,000 chars, last = question), page? }` → `application/x-ndjson` stream (`src/lib/assistant/stream-protocol.ts`: `delta` / `done` / `error` events). 404 when switched off, 503 `ASSISTANT_NOT_CONFIGURED` without a key, 429 when too fast. `maxDuration = 120` |
| `GET/PUT /api/configuration/assistant` | System settings at company scope | settings + version + `keyConfigured` + the built-in guide / save |
| `POST /api/configuration/assistant/test` | same | `{ question, config }` – one question against the **unsaved** settings on screen |

**UI:**
- `src/features/assistant/components/assistant-provider.tsx` – conversation state at the app-shell level (`AppShell`).
  It lives in memory only: no localStorage, sessionStorage, IndexedDB or React Query cache.
- `assistant-launcher.tsx` – the button and the Radix Dialog:
  - **Bottom right** (owner's request, 30 Oct – first built bottom left; right is the usual place for a chat button on
    websites). Toasts are top right, so they never cover it. While the button is shown, the launcher sets
    `data-assistant` on `<html>`, and the `assistant:` Tailwind variant (`globals.css`) makes the bottom action bars
    leave room for it: the sticky Save bars (documents, response forms, roles, Form Builder, scheduled jobs) get
    `assistant:mr-15`, and the phone wizard bars (Report incident, risk assessment) get `max-md:assistant:pr-18`.
    People who don't see the button get full-width bars. **New sticky or fixed bottom bars with buttons on the right
    should add the same class.**
  - **Desktop:** the button sits 1.25 rem from the bottom-right corner. The pop-up (25 rem × up to 40 rem) opens above it
    and is **non-modal** and stays open while the user clicks around the page, so people can follow the steps
    with the answer beside them. Esc closes it when focus is inside, and focus returns to the button.
  - **Phones (< 768 px):** the button sits above the bottom bar. The pop-up is a **full-screen modal sheet** with a focus
    trap. Following a link in an answer closes the sheet so the page shows.
- `assistant-panel.tsx`:
  - a header with the brand gradient, name, status ("Writing an answer…"), **Start a new conversation** and Close;
  - the welcome bubble and suggestion chips;
  - bubbles (user in brand colour, answers on a card);
  - typing dots, a blinking caret while streaming, **Stop**, and **Try again** after an error or Stop;
  - a question box that grows (Enter sends, Shift+Enter makes a new line) and the note "AI answers can be wrong – check
    important steps. Don't share personal details.";
  - `role="log"` and `aria-busy` on the streaming answer, labelled controls and `prefers-reduced-motion` support.
- `assistant-markdown.tsx` + `src/lib/assistant/markdown.ts` – a tested Markdown subset: paragraphs, headings, lists,
  bold, italic, code and links. It is rendered as React elements, never as HTML. Links: app paths use Next `Link`;
  https sites open in a new tab; anything else becomes text.
- Configuration → **AI assistant** (`/configuration/assistant`, hub card under Account, `ADMIN_SETTINGS`). The page has:
  - the Connected / Not connected banner, with where to put the key;
  - the **Guide** editor with a character count (amber above 40,000) and **Use the built-in guide**;
  - the **Pop-up** card: on/off, name, welcome, 4 suggestions;
  - the **AI model** card: model, fallback, creativity (temperature), answer length (max tokens), with a link to the
    free model list;
  - the **Try it** box, which streams an answer from the unsaved text and says which model answered;
  - Discard / Save, the unsaved-changes guard and the stale-version alert.
- App shell bottom padding is now `pb-32` on phones and `md:pb-20`, so the end of every page stays clear of the button.
  The button is hidden when printing.

**Seed:** `prisma/seed/assistant.ts` (`applyDemoAssistant`, idempotent – never overwrites a company's row). It is
called from the Northstar and Oleo Demo seeds. Runner: `bash scripts/localdb.sh npm run db:seed:assistant`; it refuses
non-local databases unless `ALLOW_REMOTE_SEED=1`. Applied to the local DB on 30 Oct 2026 (Northstar, Oleo Demo).

**Tests** (51 new): `openrouter.test.ts` (error mapping, SSE parser, streaming with a fake fetch: fallback, partial
answer, timeouts, Stop, key never in events), `prompt.test.ts`, `rate-limit.test.ts`, `validation/assistant.test.ts`,
`markdown.test.ts`, `stream-protocol.test.ts` (+ conversation history).

## Decisions (sensible defaults – change if the owner prefers)

1. **Who configures:** the existing **System settings** permission (`config.settings.manage`), at company scope like the
   other Configuration screens. No new permission key, so no role data migration.
2. **Who sees the button:** everyone signed in when the assistant is on and the key is set. Without a key, only people
   who can configure it see the button (amber dot), with set-up help. Switched off: nobody.
3. **Model:** `openrouter/free`, with fallback `google/gemma-4-31b-it:free`, temperature 0.3 and 1,024 max tokens. Some
   free models "think" first, so a low limit could leave no room for the answer.
4. **Limits:**
   - 6 questions a minute and 60 an hour per person, in memory;
   - 4,000 characters per message and 20 messages per request, of which the newest 12 messages / 16,000 characters go to
     the model;
   - a guide of at most 80,000 characters.
5. **Answers are streamed** as NDJSON from our server (the browser never talks to OpenRouter).
6. **Conversation:** questions whose answer failed or was stopped are not sent as history. "Start a new conversation"
   clears without asking, because nothing is lost that was saved.
7. **Audit:** settings changes are audited; the guide is recorded by length only. Chat text is never audited.
8. **No offline:** the assistant needs the internet. Offline, the request fails with "You appear to be offline".

## Smoke test (30 Oct 2026, local DB, `next start` on :3101)

- **Without a key:**
  - John (employee): no button; `POST /api/assistant/chat` → 503 with the plain message; Configuration API → 403.
  - Admin: button with an amber dot. The pop-up shows "The assistant isn't set up yet" and where to put the key;
    **Open AI assistant settings** closes the pop-up. The settings page shows "Not connected yet".
- **With a fake key** (temporarily in `.env.localdb`, removed afterwards):
  - The real OpenRouter call answered **401**. The pop-up and the Try it box showed "isn't connected properly (the AI
    service refused the key)" with **Try again**. This verifies the endpoint, the auth header and the error mapping.
  - The server log stayed clean (no key, no text).
- **Answer rendering** (the chat endpoint mocked in the page):
  - typing dots → streamed Markdown (numbered list, bold, italic, link);
  - Stop keeps the partial answer with "You stopped this answer" and Try again;
  - follow-up questions send the earlier question and answer;
  - "Start a new conversation" clears;
  - the conversation survives moving between pages.
- **Settings:**
  - save → version 2 and the audit row (welcome diff, guide "32,441 → 32,454 characters");
  - a second save with the old version → 409 `STALE_VERSION`;
  - a bad model / temperature → 422 with field messages;
  - restored afterwards (local row at version 3, default content).
- **Phone (375 × 812):** button above the bottom bar, full-screen modal sheet (page `aria-hidden`, focus in the question
  box), no sideways scroll, a link closes the sheet. **Dark mode:** pop-up on dark tokens.
- **Live (30 Oct, after the move to the bottom right):** the owner put the key in `.env`. The :3101 server
  (`localdb.sh`: `.env.localdb` overrides every database / storage variable, and Next fills the rest from `.env`) reported
  `ready`. One real question, "How do I report an incident?", streamed a correct answer from the guide: Incidents →
  Report incident, the four wizard steps with the real field names, Submit report, and the offline "Save draft offline"
  note. No server errors. Only one question was asked, to save the 50-a-day free allowance.
- **Bottom right (30 Oct):**
  - Desktop 1366 × 800: the button is 20 px from the bottom and from the page scrollbar, and the pop-up opens above it.
    On Roles, a role's full-width "Unsaved changes" bar ends 12 px left of the button, at the same height.
  - Phone 375 × 812: in Report incident, **Next** ends 8 px left of the button, which sits in the wizard bar above the
    bottom nav. The sheet is still full screen, and the page has no sideways scroll.

## Open questions for the owner

1. Keep the free models, or pay for one fixed model (steadier answers)? The free tier allows 50 questions a day for the
   whole key until 10 credits are bought (then 1,000 a day). Fine for a demo, not for 15,000 users.
2. Who may edit the guide – System settings holders (today) or a separate "Manage AI assistant" permission?
3. One guide per company (today) or a shared vendor guide that each company can extend?
4. Should the assistant know more about the user, e.g. which buttons their role allows, to say "you can't do this –
   ask X"? Today it sees role names and switched-on modules only.
5. Keep conversations for quality review or analytics (consent, retention)? Today nothing is saved.
6. A shared rate limit across servers (Postgres / Redis), and a company-wide daily cap, so one company can't use up the
   key's free quota for everyone?
7. Privacy: OK that questions go to free-model providers that may log them? Or require a zero-data-retention / EU model?
8. Should "Start a new conversation" ask for confirmation? Should the pop-up offer copy or thumbs up/down buttons?
