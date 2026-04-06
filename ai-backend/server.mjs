import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";

import { clerkMiddleware, getAuth } from "@clerk/express";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import OpenAI from "openai";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(repoRoot, ".env.development.local") });
dotenv.config({ path: path.join(repoRoot, ".env.development") });
dotenv.config({ path: path.join(repoRoot, ".env.local") });
dotenv.config({ path: path.join(repoRoot, ".env") });

const isProduction = process.env.NODE_ENV === "production";
const trustProxy = process.env.TRUST_PROXY === "1";

const PORT = parseInt(process.env.AI_BACKEND_PORT || "3016", 10);
const LISTEN_HOST =
  process.env.AI_BACKEND_HOST ||
  (isProduction ? "0.0.0.0" : "127.0.0.1");
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const VISION_MODEL = process.env.OPENAI_VISION_MODEL || "gpt-4o-mini";

const MERMAID_SYSTEM = `You are a diagram assistant for a whiteboard app. Your reply must be ONLY valid Mermaid diagram source code — no markdown fences, no explanations, no backticks.
Choose an appropriate diagram type (flowchart, sequenceDiagram, classDiagram, stateDiagram-v2, erDiagram, gantt, pie, etc.).
Keep syntax compatible with Mermaid 10+.`;

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.NEON_DATABASE_URL,
  ssl:
    process.env.NEON_DATABASE_URL?.includes("sslmode=require") === true
      ? { rejectUnauthorized: false }
      : undefined,
});

function resolveCorsConfig() {
  const raw = (process.env.CORS_ORIGINS || "").trim();
  if (raw) {
    const allowed = new Set(
      raw.split(",").map((s) => s.trim()).filter(Boolean),
    );
    return {
      origin: (origin, cb) => {
        if (!origin || allowed.has(origin)) {
          cb(null, true);
        } else {
          cb(new Error("Not allowed by CORS"));
        }
      },
    };
  }
  if (isProduction) {
    console.error(
      "[aimtutor-ai] CORS_ORIGINS must be set in production (comma-separated origins)",
    );
    return { origin: false };
  }
  return { origin: true };
}

function asyncRoute(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function publicErrorMessage(err) {
  if (!isProduction) {
    return err?.message || "Request failed";
  }
  return "Request failed";
}

const app = express();
if (trustProxy) {
  app.set("trust proxy", 1);
}

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false,
  }),
);
app.use(
  cors({
    ...resolveCorsConfig(),
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Accept", "Authorization"],
    credentials: false,
    maxAge: 86_400,
  }),
);
app.use(express.json({ limit: "32mb" }));

const v1Limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 120 : 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests" },
});
const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: isProduction ? 40 : 250,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "AI rate limit exceeded. Try again later." },
});
app.use("/v1", v1Limiter);
app.use("/v1/ai", aiLimiter);

const boardPutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 4000 : 25000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many board saves" },
});

app.use(clerkMiddleware());
app.use(auditV1Requests);

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "aimtutor-ai-backend" });
});

function requireApiKey(res) {
  if (!process.env.OPENAI_API_KEY) {
    res.locals.auditError = "OPENAI_API_KEY is not set";
    res.status(500).json({
      message: isProduction
        ? "Server configuration error"
        : "OPENAI_API_KEY is not set. Add it to .env.development.local in the repo root.",
    });
    return false;
  }
  return true;
}

function requireDatabase(res) {
  if (!process.env.NEON_DATABASE_URL) {
    res.locals.auditError = "NEON_DATABASE_URL is not set";
    res.status(500).json({
      message: isProduction
        ? "Server configuration error"
        : "NEON_DATABASE_URL is not set. Add it to .env.development.local in the repo root.",
    });
    return false;
  }
  return true;
}

async function ensureSchema() {
  if (!process.env.NEON_DATABASE_URL) {
    return;
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      clerk_user_id TEXT UNIQUE NOT NULL,
      email TEXT,
      name TEXT,
      avatar_url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_usage_events (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      endpoint TEXT NOT NULL,
      model TEXT,
      prompt_tokens INTEGER,
      completion_tokens INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS api_process_logs (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      clerk_user_id TEXT,
      route TEXT NOT NULL,
      http_method TEXT NOT NULL,
      status_code INTEGER,
      duration_ms INTEGER,
      client_ip TEXT,
      user_agent TEXT,
      error_message TEXT,
      details JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_api_process_logs_user_id ON api_process_logs (user_id);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_api_process_logs_clerk_user_id ON api_process_logs (clerk_user_id);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_api_process_logs_created_at ON api_process_logs (created_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_api_process_logs_route ON api_process_logs (route);
  `);
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS last_api_at TIMESTAMPTZ;
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_activity_events (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      clerk_user_id TEXT NOT NULL,
      action TEXT NOT NULL,
      category TEXT,
      metadata JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_user_activity_user_id ON user_activity_events (user_id);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_user_activity_clerk_user_id ON user_activity_events (clerk_user_id);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_user_activity_created_at ON user_activity_events (created_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_user_activity_action ON user_activity_events (action);
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id BIGSERIAL PRIMARY KEY,
      owner_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL DEFAULT 'My workspace',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(owner_user_id)
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_workspaces_owner ON workspaces(owner_user_id);
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS folders (
      id BIGSERIAL PRIMARY KEY,
      workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_folders_workspace ON folders(workspace_id);
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS boards (
      id BIGSERIAL PRIMARY KEY,
      folder_id BIGINT NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
      title TEXT NOT NULL DEFAULT 'Untitled board',
      scene_gzip BYTEA NOT NULL,
      created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_boards_folder_updated ON boards(folder_id, updated_at DESC);
  `);
}

const DEFAULT_SCENE_SOURCE = "https://aimtutor.ai";

function defaultEmptyScene() {
  return {
    type: "excalidraw",
    version: 2,
    source: DEFAULT_SCENE_SOURCE,
    elements: [],
    appState: {},
    files: {},
  };
}

function sceneToGzipBuffer(sceneObj) {
  return gzipSync(Buffer.from(JSON.stringify(sceneObj), "utf8"));
}

function gzipBufferToScene(buf) {
  const raw = gunzipSync(buf).toString("utf8");
  return JSON.parse(raw);
}

async function ensureDefaultWorkspace(localUserId) {
  const { rows } = await pool.query(
    `SELECT id, name, created_at, updated_at FROM workspaces WHERE owner_user_id = $1`,
    [localUserId],
  );
  if (rows.length) {
    return rows[0];
  }
  const ins = await pool.query(
    `INSERT INTO workspaces (owner_user_id, name) VALUES ($1, 'My workspace')
     RETURNING id, name, created_at, updated_at`,
    [localUserId],
  );
  return ins.rows[0];
}

async function assertWorkspaceOwned(workspaceId, localUserId) {
  const { rows } = await pool.query(
    `SELECT id, name, created_at, updated_at FROM workspaces WHERE id = $1 AND owner_user_id = $2`,
    [workspaceId, localUserId],
  );
  return rows[0] ?? null;
}

async function assertFolderOwned(folderId, localUserId) {
  const { rows } = await pool.query(
    `
    SELECT f.id, f.workspace_id, f.name, f.sort_order, f.created_at, f.updated_at
    FROM folders f
    JOIN workspaces w ON w.id = f.workspace_id
    WHERE f.id = $1 AND w.owner_user_id = $2
    `,
    [folderId, localUserId],
  );
  return rows[0] ?? null;
}

async function assertBoardOwned(boardId, localUserId) {
  const { rows } = await pool.query(
    `
    SELECT b.id, b.folder_id, b.title, b.scene_gzip, b.created_by_user_id, b.created_at, b.updated_at
    FROM boards b
    JOIN folders f ON f.id = b.folder_id
    JOIN workspaces w ON w.id = f.workspace_id
    WHERE b.id = $1 AND w.owner_user_id = $2
    `,
    [boardId, localUserId],
  );
  return rows[0] ?? null;
}

function parseActivityEvents(body) {
  const raw = body?.events;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 50) {
    return null;
  }
  const out = [];
  for (const e of raw) {
    if (!e || typeof e !== "object" || Array.isArray(e)) {
      return null;
    }
    const action =
      typeof e.action === "string" ? e.action.trim().slice(0, 200) : "";
    if (!action) {
      return null;
    }
    const category =
      typeof e.category === "string" ? e.category.trim().slice(0, 100) : null;
    let metadataJson = null;
    if (e.metadata != null) {
      if (typeof e.metadata !== "object" || Array.isArray(e.metadata)) {
        return null;
      }
      try {
        const s = JSON.stringify(e.metadata);
        metadataJson = s.length > 12_000 ? JSON.stringify({ _truncated: true }) : s;
      } catch {
        return null;
      }
    }
    out.push({ action, category, metadataJson });
  }
  return out.length ? out : null;
}

/** One row per completed /v1/* response: user, route, timing, status, optional AI metadata. */
async function logProcessEntry({
  userId,
  clerkUserId,
  route,
  method,
  statusCode,
  durationMs,
  clientIp,
  userAgent,
  errorMessage,
  details,
}) {
  if (!process.env.NEON_DATABASE_URL) {
    return;
  }
  try {
    await pool.query(
      `
      INSERT INTO api_process_logs (
        user_id, clerk_user_id, route, http_method, status_code, duration_ms,
        client_ip, user_agent, error_message, details
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb);
    `,
      [
        userId,
        clerkUserId,
        route,
        method,
        statusCode,
        durationMs,
        clientIp,
        userAgent?.slice(0, 2000) ?? null,
        errorMessage?.slice(0, 2000) ?? null,
        details == null ? null : JSON.stringify(details),
      ],
    );
  } catch (err) {
    console.error("[audit] logProcessEntry failed", err);
  }
}

async function touchUserLastApi(userId) {
  if (!userId || !process.env.NEON_DATABASE_URL) {
    return;
  }
  try {
    await pool.query(`UPDATE users SET last_api_at = NOW() WHERE id = $1`, [
      userId,
    ]);
  } catch (err) {
    console.error("[audit] touchUserLastApi failed", err);
  }
}

/** Attach after clerkMiddleware: records every /v1/* request when the response ends. */
function auditV1Requests(req, res, next) {
  const pathOnly = (req.originalUrl || req.url || "").split("?")[0];
  if (!pathOnly.startsWith("/v1")) {
    next();
    return;
  }

  const started = Date.now();
  let flushed = false;

  const flush = () => {
    if (flushed) {
      return;
    }
    flushed = true;

    const durationMs = Date.now() - started;
    const auth = getAuth(req);
    const clerkUserId = auth?.userId ?? null;

    void (async () => {
      let localUserId = null;
      if (clerkUserId) {
        try {
          const r = await pool.query(
            `SELECT id FROM users WHERE clerk_user_id = $1 LIMIT 1`,
            [clerkUserId],
          );
          localUserId = r.rows[0]?.id ?? null;
        } catch (e) {
          console.error("[audit] user lookup failed", e);
        }
      }

      const xf = req.headers["x-forwarded-for"];
      const clientIp =
        (typeof xf === "string" ? xf.split(",")[0]?.trim() : null) ||
        req.socket?.remoteAddress ||
        null;
      const ua =
        typeof req.headers["user-agent"] === "string"
          ? req.headers["user-agent"]
          : null;

      let errorMessage = res.locals.auditError ?? null;
      const details = res.locals.auditDetails ?? null;
      const statusCode = res.statusCode;
      if (statusCode >= 400 && !errorMessage) {
        errorMessage = `HTTP ${statusCode}`;
      }

      await logProcessEntry({
        userId: localUserId,
        clerkUserId,
        route: pathOnly,
        method: req.method,
        statusCode,
        durationMs,
        clientIp,
        userAgent: ua,
        errorMessage,
        details,
      });

      if (localUserId && statusCode < 500) {
        await touchUserLastApi(localUserId);
      }
    })();
  };

  res.on("finish", flush);
  res.on("close", flush);
  next();
}

function requireAuthApi(req, res) {
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.locals.auditError = "Unauthorized (no Clerk session)";
    res.status(401).json({ message: "Unauthorized" });
    return null;
  }
  return auth;
}

async function upsertUserFromAuth(auth) {
  const email =
    auth.sessionClaims?.email ||
    auth.sessionClaims?.email_address ||
    auth.sessionClaims?.["email"];
  const name =
    auth.sessionClaims?.full_name ||
    [auth.sessionClaims?.first_name, auth.sessionClaims?.last_name]
      .filter(Boolean)
      .join(" ") ||
    null;
  const avatarUrl = auth.sessionClaims?.image_url || null;
  const { rows } = await pool.query(
    `
      INSERT INTO users (clerk_user_id, email, name, avatar_url, updated_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (clerk_user_id)
      DO UPDATE SET
        email = EXCLUDED.email,
        name = EXCLUDED.name,
        avatar_url = EXCLUDED.avatar_url,
        updated_at = NOW()
      RETURNING id;
    `,
    [auth.userId, email || null, name, avatarUrl],
  );
  return rows[0].id;
}

async function logUsage({
  userId,
  endpoint,
  model,
  promptTokens = null,
  completionTokens = null,
}) {
  await pool.query(
    `
      INSERT INTO ai_usage_events (user_id, endpoint, model, prompt_tokens, completion_tokens)
      VALUES ($1, $2, $3, $4, $5);
    `,
    [userId, endpoint, model, promptTokens, completionTokens],
  );
}

app.get(
  "/v1/auth/me",
  asyncRoute(async (req, res) => {
    if (!requireDatabase(res)) {
      return;
    }
    const auth = requireAuthApi(req, res);
    if (!auth) {
      return;
    }
    const userId = await upsertUserFromAuth(auth);
    const { rows } = await pool.query(
      `SELECT id, clerk_user_id, email, name, avatar_url, created_at, updated_at, last_api_at FROM users WHERE id = $1`,
      [userId],
    );
    res.locals.auditDetails = { kind: "auth_me" };
    res.json({ user: rows[0] });
  }),
);

app.post(
  "/v1/activity",
  asyncRoute(async (req, res) => {
    if (!requireDatabase(res)) {
      return;
    }
    const auth = requireAuthApi(req, res);
    if (!auth) {
      return;
    }
    const events = parseActivityEvents(req.body);
    if (!events) {
      res.locals.auditError = "body.events must be a non-empty array (max 50)";
      res.status(400).json({
        message:
          "body.events must be a non-empty array of { action, category?, metadata? }",
      });
      return;
    }
    const localUserId = await upsertUserFromAuth(auth);
    const placeholders = [];
    const params = [];
    let n = 1;
    for (const ev of events) {
      placeholders.push(
        `($${n++}, $${n++}, $${n++}, $${n++}, $${n++}::jsonb)`,
      );
      params.push(
        localUserId,
        auth.userId,
        ev.action,
        ev.category,
        ev.metadataJson,
      );
    }
    await pool.query(
      `INSERT INTO user_activity_events (user_id, clerk_user_id, action, category, metadata) VALUES ${placeholders.join(", ")}`,
      params,
    );
    res.locals.auditDetails = {
      kind: "user_activity",
      count: events.length,
    };
    res.status(204).end();
  }),
);

// --- Workspaces, folders, boards (personal workspace MVP) ---

app.get(
  "/v1/workspaces",
  asyncRoute(async (req, res) => {
    if (!requireDatabase(res)) {
      return;
    }
    const auth = requireAuthApi(req, res);
    if (!auth) {
      return;
    }
    const localUserId = await upsertUserFromAuth(auth);
    const row = await ensureDefaultWorkspace(localUserId);
    res.locals.auditDetails = { kind: "workspaces_list" };
    res.json({
      workspaces: [
        {
          id: String(row.id),
          name: row.name,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        },
      ],
    });
  }),
);

app.post(
  "/v1/workspaces/:workspaceId/folders",
  asyncRoute(async (req, res) => {
    if (!requireDatabase(res)) {
      return;
    }
    const auth = requireAuthApi(req, res);
    if (!auth) {
      return;
    }
    const localUserId = await upsertUserFromAuth(auth);
    const workspaceId = req.params.workspaceId;
    const ws = await assertWorkspaceOwned(workspaceId, localUserId);
    if (!ws) {
      res.locals.auditError = "workspace not found";
      res.status(404).json({ message: "Workspace not found" });
      return;
    }
    const name =
      typeof req.body?.name === "string" ? req.body.name.trim().slice(0, 200) : "";
    if (!name) {
      res.locals.auditError = "folder name required";
      res.status(400).json({ message: "name is required" });
      return;
    }
    const { rows } = await pool.query(
      `INSERT INTO folders (workspace_id, name) VALUES ($1, $2)
       RETURNING id, workspace_id, name, sort_order, created_at, updated_at`,
      [workspaceId, name],
    );
    res.locals.auditDetails = { kind: "folder_create", folderId: rows[0].id };
    res.status(201).json({ folder: serializeFolderRow(rows[0]) });
  }),
);

app.get(
  "/v1/workspaces/:workspaceId/folders",
  asyncRoute(async (req, res) => {
    if (!requireDatabase(res)) {
      return;
    }
    const auth = requireAuthApi(req, res);
    if (!auth) {
      return;
    }
    const localUserId = await upsertUserFromAuth(auth);
    const workspaceId = req.params.workspaceId;
    const ws = await assertWorkspaceOwned(workspaceId, localUserId);
    if (!ws) {
      res.locals.auditError = "workspace not found";
      res.status(404).json({ message: "Workspace not found" });
      return;
    }
    const { rows } = await pool.query(
      `
      SELECT f.id, f.workspace_id, f.name, f.sort_order, f.created_at, f.updated_at,
        (SELECT COUNT(*)::int FROM boards b WHERE b.folder_id = f.id) AS board_count
      FROM folders f
      WHERE f.workspace_id = $1
      ORDER BY f.sort_order ASC, f.created_at ASC
      `,
      [workspaceId],
    );
    res.locals.auditDetails = { kind: "folders_list" };
    res.json({
      folders: rows.map((r) => ({
        ...serializeFolderRow(r),
        boardCount: r.board_count,
      })),
    });
  }),
);

app.patch(
  "/v1/folders/:folderId",
  asyncRoute(async (req, res) => {
    if (!requireDatabase(res)) {
      return;
    }
    const auth = requireAuthApi(req, res);
    if (!auth) {
      return;
    }
    const localUserId = await upsertUserFromAuth(auth);
    const folderId = req.params.folderId;
    const folder = await assertFolderOwned(folderId, localUserId);
    if (!folder) {
      res.locals.auditError = "folder not found";
      res.status(404).json({ message: "Folder not found" });
      return;
    }
    const name =
      typeof req.body?.name === "string" ? req.body.name.trim().slice(0, 200) : null;
    const sortOrder =
      typeof req.body?.sortOrder === "number" && Number.isFinite(req.body.sortOrder)
        ? Math.trunc(req.body.sortOrder)
        : null;
    if (!name && sortOrder === null) {
      res.status(400).json({ message: "Provide name and/or sortOrder" });
      return;
    }
    const { rows } = await pool.query(
      `
      UPDATE folders SET
        name = COALESCE($2, name),
        sort_order = COALESCE($3, sort_order),
        updated_at = NOW()
      WHERE id = $1
      RETURNING id, workspace_id, name, sort_order, created_at, updated_at
      `,
      [folderId, name, sortOrder],
    );
    res.locals.auditDetails = { kind: "folder_patch" };
    res.json({ folder: serializeFolderRow(rows[0]) });
  }),
);

app.delete(
  "/v1/folders/:folderId",
  asyncRoute(async (req, res) => {
    if (!requireDatabase(res)) {
      return;
    }
    const auth = requireAuthApi(req, res);
    if (!auth) {
      return;
    }
    const localUserId = await upsertUserFromAuth(auth);
    const folderId = req.params.folderId;
    const folder = await assertFolderOwned(folderId, localUserId);
    if (!folder) {
      res.locals.auditError = "folder not found";
      res.status(404).json({ message: "Folder not found" });
      return;
    }
    await pool.query(`DELETE FROM folders WHERE id = $1`, [folderId]);
    res.locals.auditDetails = { kind: "folder_delete" };
    res.status(204).end();
  }),
);

app.post(
  "/v1/folders/:folderId/boards",
  asyncRoute(async (req, res) => {
    if (!requireDatabase(res)) {
      return;
    }
    const auth = requireAuthApi(req, res);
    if (!auth) {
      return;
    }
    const localUserId = await upsertUserFromAuth(auth);
    const folderId = req.params.folderId;
    const folder = await assertFolderOwned(folderId, localUserId);
    if (!folder) {
      res.locals.auditError = "folder not found";
      res.status(404).json({ message: "Folder not found" });
      return;
    }
    const titleRaw =
      typeof req.body?.title === "string" ? req.body.title.trim().slice(0, 200) : "";
    const title = titleRaw || "Untitled board";
    const gzip = sceneToGzipBuffer(defaultEmptyScene());
    const { rows } = await pool.query(
      `INSERT INTO boards (folder_id, title, scene_gzip, created_by_user_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id, folder_id, title, created_at, updated_at`,
      [folderId, title, gzip, localUserId],
    );
    res.locals.auditDetails = { kind: "board_create", boardId: rows[0].id };
    res.status(201).json({ board: serializeBoardListRow(rows[0], null) });
  }),
);

app.get(
  "/v1/folders/:folderId/boards",
  asyncRoute(async (req, res) => {
    if (!requireDatabase(res)) {
      return;
    }
    const auth = requireAuthApi(req, res);
    if (!auth) {
      return;
    }
    const localUserId = await upsertUserFromAuth(auth);
    const folderId = req.params.folderId;
    const folder = await assertFolderOwned(folderId, localUserId);
    if (!folder) {
      res.locals.auditError = "folder not found";
      res.status(404).json({ message: "Folder not found" });
      return;
    }
    const { rows } = await pool.query(
      `
      SELECT b.id, b.folder_id, b.title, b.created_at, b.updated_at,
        u.name AS author_name, u.email AS author_email
      FROM boards b
      LEFT JOIN users u ON u.id = b.created_by_user_id
      WHERE b.folder_id = $1
      ORDER BY b.updated_at DESC
      `,
      [folderId],
    );
    res.locals.auditDetails = { kind: "boards_list" };
    res.json({
      boards: rows.map((r) => serializeBoardListRow(r, r.author_name || r.author_email)),
    });
  }),
);

app.get(
  "/v1/boards/:boardId",
  asyncRoute(async (req, res) => {
    if (!requireDatabase(res)) {
      return;
    }
    const auth = requireAuthApi(req, res);
    if (!auth) {
      return;
    }
    const localUserId = await upsertUserFromAuth(auth);
    const boardId = req.params.boardId;
    const board = await assertBoardOwned(boardId, localUserId);
    if (!board) {
      res.locals.auditError = "board not found";
      res.status(404).json({ message: "Board not found" });
      return;
    }
    let scene;
    try {
      scene = gzipBufferToScene(board.scene_gzip);
    } catch (e) {
      res.locals.auditError = "corrupt scene";
      res.status(500).json({ message: "Board data could not be read" });
      return;
    }
    res.locals.auditDetails = { kind: "board_get" };
    res.json({
      board: {
        id: String(board.id),
        folderId: String(board.folder_id),
        title: board.title,
        createdAt: board.created_at,
        updatedAt: board.updated_at,
      },
      scene,
    });
  }),
);

app.put(
  "/v1/boards/:boardId",
  boardPutLimiter,
  asyncRoute(async (req, res) => {
    if (!requireDatabase(res)) {
      return;
    }
    const auth = requireAuthApi(req, res);
    if (!auth) {
      return;
    }
    const localUserId = await upsertUserFromAuth(auth);
    const boardId = req.params.boardId;
    const board = await assertBoardOwned(boardId, localUserId);
    if (!board) {
      res.locals.auditError = "board not found";
      res.status(404).json({ message: "Board not found" });
      return;
    }
    const scene = req.body?.scene;
    if (!scene || typeof scene !== "object" || Array.isArray(scene)) {
      res.locals.auditError = "invalid scene";
      res.status(400).json({ message: "body.scene must be an object" });
      return;
    }
    const expected =
      typeof req.body?.expectedUpdatedAt === "string"
        ? req.body.expectedUpdatedAt
        : null;
    if (expected) {
      const prevIso = new Date(board.updated_at).toISOString();
      if (prevIso !== expected) {
        res.locals.auditError = "version conflict";
        res.status(409).json({
          message: "Board was modified elsewhere. Reload and try again.",
          currentUpdatedAt: prevIso,
        });
        return;
      }
    }
    let gzip;
    try {
      gzip = sceneToGzipBuffer(scene);
    } catch (e) {
      res.locals.auditError = "scene serialize failed";
      res.status(400).json({ message: "Could not store scene" });
      return;
    }
    const maxBytes = parseInt(process.env.BOARD_SCENE_MAX_GZIP_BYTES || "12582912", 10);
    if (gzip.length > maxBytes) {
      res.locals.auditError = "scene too large";
      res.status(413).json({ message: "Board is too large to save" });
      return;
    }
    const titleUpd =
      typeof req.body?.title === "string" ? req.body.title.trim().slice(0, 200) : null;
    const { rows } = await pool.query(
      `
      UPDATE boards SET
        scene_gzip = $2,
        title = COALESCE($3, title),
        updated_at = NOW()
      WHERE id = $1
      RETURNING id, folder_id, title, created_at, updated_at
      `,
      [boardId, gzip, titleUpd],
    );
    res.locals.auditDetails = { kind: "board_put" };
    res.json({
      board: {
        id: String(rows[0].id),
        folderId: String(rows[0].folder_id),
        title: rows[0].title,
        createdAt: rows[0].created_at,
        updatedAt: rows[0].updated_at,
      },
    });
  }),
);

function serializeFolderRow(r) {
  return {
    id: String(r.id),
    workspaceId: String(r.workspace_id),
    name: r.name,
    sortOrder: r.sort_order,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function serializeBoardListRow(r, authorLabel) {
  return {
    id: String(r.id),
    folderId: String(r.folder_id),
    title: r.title,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    author: authorLabel || null,
  };
}

app.patch(
  "/v1/workspaces/:workspaceId",
  asyncRoute(async (req, res) => {
    if (!requireDatabase(res)) return;
    const auth = requireAuthApi(req, res);
    if (!auth) return;
    const localUserId = await upsertUserFromAuth(auth);
    const workspaceId = req.params.workspaceId;
    const ws = await assertWorkspaceOwned(workspaceId, localUserId);
    if (!ws) {
      res.locals.auditError = "workspace not found";
      res.status(404).json({ message: "Workspace not found" });
      return;
    }
    const name =
      typeof req.body?.name === "string" ? req.body.name.trim().slice(0, 200) : null;
    if (!name) {
      res.status(400).json({ message: "name is required" });
      return;
    }
    const { rows } = await pool.query(
      `UPDATE workspaces SET name = $2, updated_at = NOW()
       WHERE id = $1
       RETURNING id, name, created_at, updated_at`,
      [workspaceId, name],
    );
    res.locals.auditDetails = { kind: "workspace_patch" };
    res.json({
      workspace: {
        id: String(rows[0].id),
        name: rows[0].name,
        createdAt: rows[0].created_at,
        updatedAt: rows[0].updated_at,
      },
    });
  }),
);

app.patch(
  "/v1/boards/:boardId",
  asyncRoute(async (req, res) => {
    if (!requireDatabase(res)) return;
    const auth = requireAuthApi(req, res);
    if (!auth) return;
    const localUserId = await upsertUserFromAuth(auth);
    const boardId = req.params.boardId;
    const board = await assertBoardOwned(boardId, localUserId);
    if (!board) {
      res.locals.auditError = "board not found";
      res.status(404).json({ message: "Board not found" });
      return;
    }
    const title =
      typeof req.body?.title === "string" ? req.body.title.trim().slice(0, 200) : null;
    if (!title) {
      res.status(400).json({ message: "title is required" });
      return;
    }
    const { rows } = await pool.query(
      `UPDATE boards SET title = $2, updated_at = NOW()
       WHERE id = $1
       RETURNING id, folder_id, title, created_at, updated_at`,
      [boardId, title],
    );
    res.locals.auditDetails = { kind: "board_patch" };
    res.json({ board: serializeBoardListRow(rows[0], null) });
  }),
);

app.delete(
  "/v1/boards/:boardId",
  asyncRoute(async (req, res) => {
    if (!requireDatabase(res)) return;
    const auth = requireAuthApi(req, res);
    if (!auth) return;
    const localUserId = await upsertUserFromAuth(auth);
    const boardId = req.params.boardId;
    const board = await assertBoardOwned(boardId, localUserId);
    if (!board) {
      res.locals.auditError = "board not found";
      res.status(404).json({ message: "Board not found" });
      return;
    }
    await pool.query(`DELETE FROM boards WHERE id = $1`, [boardId]);
    res.locals.auditDetails = { kind: "board_delete", boardId };
    res.status(204).end();
  }),
);

app.post(
  "/v1/ai/text-to-diagram/chat-streaming",
  asyncRoute(async (req, res) => {
    if (!requireApiKey(res)) {
      return;
    }
    if (!requireDatabase(res)) {
      return;
    }
    const auth = requireAuthApi(req, res);
    if (!auth) {
      return;
    }

    const { messages } = req.body ?? {};
    if (!Array.isArray(messages)) {
      res.locals.auditError = "body.messages must be an array";
      res.status(400).json({ message: "body.messages must be an array" });
      return;
    }
    const localUserId = await upsertUserFromAuth(auth);

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    if (typeof res.flushHeaders === "function") {
      res.flushHeaders();
    }

    const sendSse = (obj) => {
      res.write(`data: ${JSON.stringify(obj)}\n\n`);
    };

    try {
      const stream = await openai.chat.completions.create({
        model: MODEL,
        stream: true,
        messages: [
          { role: "system", content: MERMAID_SYSTEM },
          ...messages.map((m) => ({
            role: m.role === "assistant" ? "assistant" : "user",
            content: String(m.content ?? ""),
          })),
        ],
      });

      let promptTokens = null;
      let completionTokens = null;
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content ?? "";
        promptTokens = chunk?.usage?.prompt_tokens ?? promptTokens;
        completionTokens = chunk?.usage?.completion_tokens ?? completionTokens;
        if (delta) {
          sendSse({ type: "content", delta });
        }
      }
      await logUsage({
        userId: localUserId,
        endpoint: "/v1/ai/text-to-diagram/chat-streaming",
        model: MODEL,
        promptTokens,
        completionTokens,
      });

      res.locals.auditDetails = {
        kind: "ai_text_to_diagram_stream",
        model: MODEL,
        promptTokens,
        completionTokens,
        messageCount: messages.length,
      };

      sendSse({ type: "done", finishReason: "stop" });
      res.write("data: [DONE]\n\n");
      res.end();
    } catch (err) {
      const internal = err?.message || "OpenAI request failed";
      res.locals.auditError = internal;
      res.locals.auditDetails = {
        kind: "ai_text_to_diagram_stream",
        model: MODEL,
        failed: true,
      };
      sendSse({
        type: "error",
        error: {
          message: publicErrorMessage(err),
          status: err?.status ?? 500,
        },
      });
      res.end();
    }
  }),
);

app.post(
  "/v1/ai/diagram-to-code/generate",
  asyncRoute(async (req, res) => {
    if (!requireApiKey(res)) {
      return;
    }
    if (!requireDatabase(res)) {
      return;
    }
    const auth = requireAuthApi(req, res);
    if (!auth) {
      return;
    }
    const localUserId = await upsertUserFromAuth(auth);

    const { texts, image, theme, canvasContext } = req.body ?? {};
    const textBlock = Array.isArray(texts)
      ? texts.filter(Boolean).join("\n")
      : "";
    const imageUrl = typeof image === "string" ? image : "";

    let canvasContextBlock = "";
    if (canvasContext != null && typeof canvasContext === "object") {
      try {
        canvasContextBlock =
          "Structured canvas context (use with the image; approximate frame size and shape mix):\n" +
          JSON.stringify(canvasContext, null, 2) +
          "\n\n";
      } catch {
        canvasContextBlock = "";
      }
    }

    if (!imageUrl) {
      res.locals.auditError = "missing image in body";
      res.status(400).json({ message: "image (data URL or URL) is required" });
      return;
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const system =
      "You generate a single self-contained HTML document (only HTML, no markdown) that implements the UI or diagram described. Use inline CSS. Theme hint: " +
      String(theme ?? "light");

    try {
      const completion = await openai.chat.completions.create({
        model: VISION_MODEL,
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  canvasContextBlock +
                  (textBlock
                    ? `Text extracted from shapes inside the frame:\n${textBlock}`
                    : "No separate text was extracted from shapes; rely on the image and canvas context.") +
                  "\n\nTurn this into a single self-contained HTML preview that matches the wireframe.",
              },
              { type: "image_url", image_url: { url: imageUrl } },
            ],
          },
        ],
        max_tokens: 4096,
      });

      let html = completion.choices[0]?.message?.content?.trim() ?? "";
      html = html.replace(/^```html\s*/i, "").replace(/\s*```$/i, "");
      if (!html) {
        res.locals.auditError = "Empty model response";
        res.status(500).json({ message: "Empty model response" });
        return;
      }
      await logUsage({
        userId: localUserId,
        endpoint: "/v1/ai/diagram-to-code/generate",
        model: VISION_MODEL,
        promptTokens: completion.usage?.prompt_tokens ?? null,
        completionTokens: completion.usage?.completion_tokens ?? null,
      });
      res.locals.auditDetails = {
        kind: "ai_diagram_to_code",
        model: VISION_MODEL,
        promptTokens: completion.usage?.prompt_tokens ?? null,
        completionTokens: completion.usage?.completion_tokens ?? null,
        theme: theme ?? null,
        textLength: textBlock.length,
        canvasContext: canvasContext != null ? true : false,
      };
      res.json({ html });
    } catch (err) {
      res.locals.auditError = err?.message || "diagram-to-code failed";
      res.locals.auditDetails = {
        kind: "ai_diagram_to_code",
        model: VISION_MODEL,
        failed: true,
      };
      res.status(500).json({
        message: publicErrorMessage(err),
      });
    }
  }),
);

app.use((_req, res) => {
  res.status(404).json({ message: "Not found" });
});

app.use((err, _req, res, _next) => {
  console.error("[aimtutor-ai] unhandled error", err);
  if (res.headersSent) {
    return;
  }
  const status = Number(err?.statusCode || err?.status) || 500;
  res.status(status >= 400 && status < 600 ? status : 500).json({
    message: publicErrorMessage(err),
  });
});

ensureSchema()
  .then(() => {
    const server = app.listen(PORT, LISTEN_HOST, () => {
      console.log(
        `[aimtutor-ai] ${isProduction ? "production" : "development"} http://${LISTEN_HOST}:${PORT}`,
      );
      console.log(`  GET    /v1/auth/me`);
      console.log(`  POST   /v1/activity`);
      console.log(`  GET    /v1/workspaces`);
      console.log(`  PATCH  /v1/workspaces/:workspaceId`);
      console.log(`  POST   /v1/workspaces/:workspaceId/folders`);
      console.log(`  GET    /v1/workspaces/:workspaceId/folders`);
      console.log(`  PATCH  /v1/folders/:folderId`);
      console.log(`  DELETE /v1/folders/:folderId`);
      console.log(`  POST   /v1/folders/:folderId/boards`);
      console.log(`  GET    /v1/folders/:folderId/boards`);
      console.log(`  GET    /v1/boards/:boardId`);
      console.log(`  PUT    /v1/boards/:boardId`);
      console.log(`  PATCH  /v1/boards/:boardId`);
      console.log(`  DELETE /v1/boards/:boardId`);
      console.log(`  POST   /v1/ai/text-to-diagram/chat-streaming`);
      console.log(`  POST   /v1/ai/diagram-to-code/generate`);
    });

    const shutdown = (signal) => {
      console.log(`[aimtutor-ai] ${signal}, shutting down`);
      server.close(() => {
        pool.end(() => process.exit(0));
      });
      setTimeout(() => process.exit(1), 10_000).unref();
    };
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  })
  .catch((error) => {
    console.error("Failed to initialize database schema", error);
    process.exit(1);
  });
