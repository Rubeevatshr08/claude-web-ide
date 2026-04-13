# Claude Web IDE

A high-performance, AI-powered web IDE that allows users to generate, preview, and deploy Next.js applications in secure, ephemeral E2B sandboxes.

## 🏗 Architecture Overview

The project is structured as a Turborepo monorepo with three main components:

### 1. **Frontend (`apps/web`)**
Built with Next.js 15 (App Router).
- **Home Page**: Dashboard that lists active sessions pulled from the SQLite database.
- **Project Page**: Split-screen interface for real-time code generation and preview.
  - **Chat Panel (`ChatPanel.tsx`)**: WebSocket-based client that pipes terminal outputs from the sandbox. Features automatic reconnection logic to handle server restarts.
  - **Preview Panel (`PreviewPanel.tsx`)**: Renders the application running on port 3000 inside the sandbox.

### 2. **Backend Server (`apps/server`)**
A Node.js service managing the sandbox lifecycle and deployment orchestration.
- **HTTP API (`index.ts`)**: Management endpoints for session lifecycle, builds, and persistence.
- **Session Manager (`session.ts`)**: Orchestrates sandbox creation, Claude CLI turns, and the complex dual-build deployment pipeline.
- **Database Persistence (`session-store.ts`)**: Uses SQLite and Drizzle ORM to keep track of every sandbox (`sandboxId`) and its deployment state (`deployedUrl`), ensuring the IDE survives server restarts.

### 3. **Router Worker (`apps/router-worker`)**
A specialized Cloudflare Worker serving as the entry point for all deployed applications.
- **Dynamic Routing**: Extracts the session ID from the subdomain (e.g., `abc123.weboreels.com`) and dispatches the request to the corresponding worker in the Cloudflare Dispatch Namespace.
- **Custom Domain Support**: Configured to handle wildcard subdomains for the `weboreels.com` zone.

---

## 🛠 Deep Dive: Core Pipelines

### **1. Session Restoration**
The IDE is designed for high availability:
- If the server restarts, the **in-memory Map** is cleared. 
- However, the **SQLite database** retains the session metadata.
- When a user reconnects, the server automatically uses `Sandbox.connect(sandboxId)` to re-establish the link to the existing E2B environment without losing any files or history.

### **2. The Dual-Build Deployment Pipeline**
To ensure both a fast local preview and a valid edge deployment, the system performs two builds:
1. **Standard Build**: Runs `npx next build` + `npx next start` inside the sandbox for the IDE's port 3000 preview.
2. **Cloudflare Build**: Runs `opennextjs-cloudflare build` to generate edge-compatible artifacts.
3. **Dispatch Deployment**: Uses `wrangler deploy` to push the code to a Cloudflare Dispatch Namespace (`weboreel`).

### **3. Routing & Custom Domains**
We use a **Wildcard Router** pattern on `weboreels.com`:
- **Router Worker**: Listens on `*.weboreels.com`.
- **Worker Names**: Every user project is deployed as `claude-ide-{sessionId}`.
- **Resolution**: The Router extracts `{sessionId}`, appends the prefix, and handles the request via `env.DISPATCHER.get()`.

---

## 🚀 Key Technologies

- **E2B**: Secure, ephemeral code interpreters for running the development environment.
- **Claude Code**: The underlying AI engine providing low-latency code generation.
- **Cloudflare for Platforms**: Uses Dispatch Namespaces to host thousands of individual Next.js workers.
- **Wrangler v4**: Synchronized across the project for modern Cloudflare Workers deployment.

---

## 📂 Project Structure

```bash
claude-web-ide/
├── apps/
│   ├── server/           # Backend (Session logic, API, E2B management)
│   ├── web/              # Frontend (Next.js Dashboard & IDE)
│   ├── router-worker/    # Cloudflare Router for custom domains
│   └── e2b-template/     # Dockerfile for the sandbox environment
├── drizzle/              # Database schema and migrations
├── package.json          # Workspace configuration
└── README.md             # This documentation
```

## 🔧 Environment Setup

### **Server (`apps/server/.env`)**
- `ANTHROPIC_API_KEY`: Required for Claude inside the sandbox.
- `E2B_API_KEY`: Required for sandbox orchestration.
- `CLOUDFLARE_API_TOKEN`: Required for automated namespace deployments.
- `CLOUDFLARE_DISPATCH_NAMESPACE`: The namespace where projects are stored (e.g., `weboreel`).

### **Router (`apps/router-worker/.env`)**
- `CLOUDFLARE_ACCOUNT_ID`: Your Cloudflare account ID.
- `CLOUDFLARE_API_TOKEN`: Token with Worker deployment permissions.

---

## 🛠 Local Development & Build Commands

- **Start IDE**: `npm run dev` in the root (starts web and server).
- **Update E2B Template**: `npm run e2b:template:create` (inside `apps/server`). 
- **Deploy Router**: `npm run deploy` (inside `apps/router-worker`).
- **Database Migrations**: `npm run db:generate` followed by `npm run db:migrate` (inside `apps/server`).
