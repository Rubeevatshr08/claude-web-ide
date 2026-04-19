# Session Creation Flow (Simplified)

This document describes the process that occurs when a user creates a new session in the OpenCode Web IDE after the refactor to move setup into the container image.

## Sequence Diagram

```mermaid
sequenceDiagram
    participant User
    participant Web as Web Frontend (Next.js)
    participant Server as Server (Node.js)
    participant E2B as E2B Sandbox
    participant DB as SQLite Database (Drizzle)

    User->>Web: Click "New Session"
    Web->>Server: POST /sessions
    Server->>Server: createSession()
    
    rect rgb(240, 240, 240)
        Note over Server, E2B: Sandbox Initialization
        Server->>E2B: Sandbox.create(template)
        E2B-->>Server: sandboxId (with baked-in files)
    end

    rect rgb(230, 240, 255)
        Note over Server, E2B: Service Startup
        Server->>E2B: Run bash /home/user/setup.sh
        Note right of E2B: setup.sh starts Next.js dev server (3000)
        E2B-->>Server: All services ready
    end

    Server->>E2B: sandbox.getHost(3000)
    E2B-->>Server: previewUrl

    Server->>DB: upsertSessionRecord(status: 'active')
    Server->>Server: Store session in memory Map
    
    Server-->>Web: { sessionId, previewUrl, sandboxId }
    Web->>User: Redirect to /projects/[sessionId]
```

## Detailed Steps

1.  **Initiation**: The user clicks the "New Session" button.
2.  **API Request**: The frontend sends a `POST` request to the `/sessions` endpoint.
3.  **Sandbox Provisioning**: The server uses the E2B SDK to create a new sandbox from a prebuilt template/image (`e2bTemplate`). This image already contains:
    *   The Next.js project template and its `node_modules`.
    *   A pre-configured `setup.sh` startup script.
4.  **Service Startup**: The server executes `bash /home/user/setup.sh` within the sandbox. This script:
    *   Launches the Next.js dev server on port 3000 in the background.
    *   Waits until the port is responsive using `netcat`.
5.  **URL Mapping**: Once services are ready, the server retrieves the public preview URL via `sandbox.getHost(3000)`.
6.  **Persistence**: The session is recorded in the SQLite database and the active instance is tracked in-memory.
7.  **Redirection**: The user is redirected to the project workspace.
