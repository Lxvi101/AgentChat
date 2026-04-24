# AgentChat

One of the world's fastest open-source AI chat apps. Talk to your favorite open-weight LLMs with an interface that actually feels good.

## Why another AI chat wrapper?

Lately, with the release of Kimi K2.6 and DeepSeek v4, I've been finding myself using more of the open-weight Chinese models. And while there are open-source chat hubs out there, none of them feel as fast as a really polished app like [T3 Chat](https://t3.chat). Most open-source options right now lack stream resumability and just the hardened architecture to match my workflow. So I built AgentChat.

> **Note:** AgentChat is a very rough prototype and not yet a fully fledged chat solution. Consider it pre-alpha.

## Features

- **Multi-provider AI**, OpenAI, Anthropic, Google, xAI, DeepSeek, Meta Llama, Fireworks, DeepInfra, and OpenRouter, all from one unified interface.
- **Zero-jank streaming**, Custom `requestAnimationFrame` architecture. Tokens paint directly to the DOM without triggering React re-renders.
- **Image Studio**, Generate images with Fal.ai models (Flux, Seedream, GPT Image 2). Reference image support for style-guided generation.
- **Web Search**, Agentic multi-source web search powered by Firecrawl with real-time progress visualization.
- **Voice Input**, Push-to-talk transcription via Fireworks Whisper.
- **Real-time sync**, Convex provides instant, WebSocket-based data synchronization across tabs and devices.
- **Folder organization**, Group conversations with custom system prompts and attached context files.
- **Thread branching**, Fork any conversation at any message to explore alternative directions.
- **Syntax highlighting**, Offloaded to a Web Worker so code blocks never block the main thread.
- **Mobile-first**, Responsive design with virtual keyboard compensation and touch-optimized interactions.
- **Dark mode**, Full dark theme with carefully tuned CSS variables.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 19 + TanStack Start (SSR, file-based routing) |
| Backend | Convex (real-time database + serverless functions) |
| Auth | Better Auth (email/password, admin panel) |
| Streaming | Redis (ioredis) for pub/sub + SSE token delivery |
| AI SDK | Vercel AI SDK (unified multi-provider interface) |
| Styling | Tailwind CSS v4 + Radix UI (shadcn/ui) |
| Animations | Framer Motion (spring physics) |
| Build | Vite 7 + Nitro (Node.js serverless) |
| Package Manager | pnpm |

## Quick Start

### Prerequisites

- **Node.js** 20+
- **pnpm** 10+ (`corepack enable && corepack prepare pnpm@latest`)
- A **Convex** account ([convex.dev](https://convex.dev))
- A **Redis** instance ([Upstash](https://upstash.com) recommended for serverless)
- At least one AI provider API key

### 1. Clone and install

```bash
git clone https://github.com/your-username/agentchat.git
cd agentchat
pnpm install
```

### 2. Set up Convex

```bash
npx convex dev
```

This will prompt you to create a new Convex project. It will generate your `CONVEX_DEPLOYMENT`, `VITE_CONVEX_URL`, and `VITE_CONVEX_SITE_URL` values.

### 3. Configure environment

```bash
cp .env.example .env.local
```

Open `.env.local` and fill in the required values:

```env
# Convex (auto-filled by `npx convex dev`)
CONVEX_DEPLOYMENT=dev:your-deployment-id
VITE_CONVEX_URL=https://your-deployment-id.convex.cloud
VITE_CONVEX_SITE_URL=https://your-deployment-id.convex.site

# Site URLs
VITE_SITE_URL=http://localhost:3000
VITE_AUTH_URL=http://localhost:3000
SITE_URL=http://localhost:3000

# Auth secret (generate a random string)
BETTER_AUTH_SECRET=your-random-secret-here

# Redis
REDIS_URL=rediss://default:your-password@your-host:6379

# AI providers (add the ones you want to use)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_GENERATIVE_AI_API_KEY=AIza...
DEEPSEEK_API_KEY=sk-...
```

You only need API keys for the providers you want to enable. Models without a configured key simply won't appear.

#### Recommended keys

For the fastest "just works" setup, I recommend configuring these four providers, they cover every capability tier (flagship reasoning, fast/cheap, vision, long context) with first-party routing:

| Key | Why you want it | Get it from |
|---|---|---|
| `OPENAI_API_KEY` | GPT-5.4 family (frontier + mini + nano), vision, tool calling | [platform.openai.com](https://platform.openai.com/api-keys) |
| `ANTHROPIC_API_KEY` | Claude Opus 4.7 (1M context), Sonnet 4.6, Haiku 4.5, prompt caching | [console.anthropic.com](https://console.anthropic.com/settings/keys) |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Gemini 3 Pro / Flash / Flash-Lite, multimodal + audio, 1M context | [aistudio.google.com](https://aistudio.google.com/app/apikey) |
| **`DEEPSEEK_API_KEY`** | **DeepSeek V4 Pro & V4 Flash — 1M context, hybrid thinking mode, served directly by DeepSeek's own inference API. Cheapest flagship-tier reasoning on the platform.** | [platform.deepseek.com](https://platform.deepseek.com/api_keys) |

The remaining keys (`FIREWORK_API_KEY`, `GROQ_API_KEY`, `DEEPINFRA_API_KEY`, `XAI_API_KEY`, `OPENROUTER_API_KEY`) are optional and unlock additional open-weight models (Kimi K2.6, GLM-5, MiniMax, Grok, Llama 4, Qwen, GPT OSS, etc.).

> **Note on DeepSeek V4:** DeepSeek V4 is served directly by the `deepseek` host, which is wired to [api.deepseek.com](https://api.deepseek.com). It will **not** fall back to Fireworks or OpenRouter. If you want V4 Pro or V4 Flash to show up in the model picker, you must set `DEEPSEEK_API_KEY`. Older DeepSeek V3.2 still routes through Fireworks (`FIREWORK_API_KEY`), so the two keys are independent.

### 4. Start the dev server

Run both Convex and the Vite dev server:

```bash
# Terminal 1: Convex backend
npx convex dev

# Terminal 2: Frontend
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). The first user to visit `/admin` is automatically granted admin privileges.

## Deploy

### Vercel (recommended)

AgentChat is designed for Vercel's serverless Node.js runtime (not Edge, because ioredis requires TCP sockets).

#### 1. Push to GitHub

```bash
git remote add origin https://github.com/your-username/agentchat.git
git push -u origin main
```

#### 2. Deploy Convex to production

```bash
npx convex deploy
```

This gives you a production `CONVEX_DEPLOYMENT` and URLs.

#### 3. Create a Vercel project

```bash
npx vercel
```

Or connect the GitHub repo from the [Vercel dashboard](https://vercel.com/new).

#### 4. Set environment variables

In the Vercel project settings, add all variables from `.env.example` with your production values:

| Variable | Production Value |
|---|---|
| `CONVEX_DEPLOYMENT` | Your production deployment ID (from `npx convex deploy`) |
| `VITE_CONVEX_URL` | `https://your-prod-id.convex.cloud` |
| `VITE_CONVEX_SITE_URL` | `https://your-prod-id.convex.site` |
| `VITE_SITE_URL` | `https://your-domain.com` |
| `VITE_AUTH_URL` | `https://your-domain.com` |
| `SITE_URL` | `https://your-domain.com` |
| `BETTER_AUTH_SECRET` | A strong random secret |
| `REDIS_URL` | Your production Redis URL |
| `TRUSTED_ORIGINS` | `https://your-domain.com` |
| AI keys | Your production API keys |

#### 5. Deploy

```bash
npx vercel --prod
```

Or push to `main`, Vercel will auto-deploy.

#### Performance tip

For minimum time-to-first-token, deploy all three services to the **same region**:
- Vercel functions → `iad1` (US East)
- Upstash Redis → `us-east-1`
- Convex → US East (default)

### Self-Hosted (Docker)

You can also run AgentChat on your own infrastructure:

```bash
# Build the production bundle
pnpm build

# Start the server
pnpm start
```

For containerized deployments, create a `Dockerfile`:

```dockerfile
FROM node:20-slim AS base
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

EXPOSE 3000
CMD ["pnpm", "start"]
```

```bash
docker build -t agentchat .
docker run -p 3000:3000 --env-file .env.local agentchat
```

### Other Platforms

AgentChat runs on any Node.js 20+ platform that supports serverless or long-running processes:

- **Railway**, Connect repo, set env vars, deploy.
- **Fly.io**, Use the Dockerfile above with `fly launch`.
- **AWS Lambda**, Nitro supports AWS Lambda output. Set `preset: 'aws_lambda'` in the Nitro config.
- **Cloudflare Workers**, Requires replacing `ioredis` with `@upstash/redis` (HTTP-based) since Workers don't support TCP sockets.

## Project Structure

```
agentchat/
├── convex/               # Backend: schema, auth, API functions
│   ├── schema.ts         # Database schema (source of truth)
│   ├── auth.ts           # Better Auth integration + triggers
│   ├── messages.ts       # Chat message persistence
│   ├── threads.ts        # Conversation thread management
│   └── ...
├── src/
│   ├── components/       # React components
│   │   ├── MarkdownMessage.tsx    # AI output renderer
│   │   ├── ModelSelector.tsx      # Model picker
│   │   ├── ImageStudio.tsx        # Image generation UI
│   │   └── ...
│   ├── hooks/            # Custom React hooks
│   │   ├── useHybridChat.ts       # Merges optimistic + DB state
│   │   ├── useSmartScroll.ts      # Scroll management
│   │   └── ...
│   ├── lib/              # Pure business logic (no React)
│   │   ├── stream-manager.ts      # SSE + RAF token painting
│   │   ├── models.ts              # AI model registry
│   │   └── ...
│   ├── routes/           # Pages + API endpoints
│   │   ├── chat.tsx               # Main chat layout
│   │   ├── studio.tsx             # Image Studio
│   │   ├── api/chat/index.ts      # Message sending endpoint
│   │   └── ...
│   ├── workers/          # Web Workers
│   │   └── shiki.worker.ts        # Off-thread syntax highlighting
│   └── styles/
│       └── app.css                # Tailwind + custom CSS
├── .env.example          # Environment variable template
├── vite.config.ts        # Vite + Nitro build config
└── package.json
```

## Contributing

We welcome contributions! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on code style, the streaming architecture, and how to submit pull requests.

## License

[MIT](LICENSE)
