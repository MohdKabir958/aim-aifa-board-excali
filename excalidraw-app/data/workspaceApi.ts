/**
 * REST client for personal workspace / folders / boards (ai-backend).
 */

export function getWorkspaceApiBase(): string {
  const b = import.meta.env.VITE_APP_AI_BACKEND;
  return typeof b === "string" ? b.replace(/\/$/, "") : "";
}

async function headersJson(getToken: () => Promise<string | null>) {
  const t = await getToken();
  const h: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (t) {
    h.Authorization = `Bearer ${t}`;
  }
  return h;
}

export type ApiWorkspace = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type ApiFolder = {
  id: string;
  workspaceId: string;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  boardCount?: number;
};

export type ApiBoardListItem = {
  id: string;
  folderId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  author: string | null;
};

export type ApiBoardDetail = {
  id: string;
  folderId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!res.ok) {
    let msg = text || res.statusText;
    try {
      const j = JSON.parse(text) as { message?: string };
      if (j?.message) {
        msg = j.message;
      }
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

export async function listWorkspaces(
  getToken: () => Promise<string | null>,
): Promise<ApiWorkspace[]> {
  const base = getWorkspaceApiBase();
  if (!base) {
    throw new Error("VITE_APP_AI_BACKEND is not configured");
  }
  const res = await fetch(`${base}/v1/workspaces`, {
    headers: await headersJson(getToken),
  });
  const data = await parseJson<{ workspaces: ApiWorkspace[] }>(res);
  return data.workspaces;
}

export async function createFolder(
  getToken: () => Promise<string | null>,
  workspaceId: string,
  name: string,
): Promise<ApiFolder> {
  const base = getWorkspaceApiBase();
  const res = await fetch(`${base}/v1/workspaces/${workspaceId}/folders`, {
    method: "POST",
    headers: await headersJson(getToken),
    body: JSON.stringify({ name }),
  });
  const data = await parseJson<{ folder: ApiFolder }>(res);
  return data.folder;
}

export async function listFolders(
  getToken: () => Promise<string | null>,
  workspaceId: string,
): Promise<ApiFolder[]> {
  const base = getWorkspaceApiBase();
  const res = await fetch(`${base}/v1/workspaces/${workspaceId}/folders`, {
    headers: await headersJson(getToken),
  });
  const data = await parseJson<{ folders: ApiFolder[] }>(res);
  return data.folders;
}

export async function deleteFolder(
  getToken: () => Promise<string | null>,
  folderId: string,
): Promise<void> {
  const base = getWorkspaceApiBase();
  const res = await fetch(`${base}/v1/folders/${folderId}`, {
    method: "DELETE",
    headers: await headersJson(getToken),
  });
  if (!res.ok) {
    const text = await res.text();
    let msg = text || res.statusText;
    try {
      const j = JSON.parse(text) as { message?: string };
      if (j?.message) {
        msg = j.message;
      }
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
}

export async function listBoardsInFolder(
  getToken: () => Promise<string | null>,
  folderId: string,
): Promise<ApiBoardListItem[]> {
  const base = getWorkspaceApiBase();
  const res = await fetch(`${base}/v1/folders/${folderId}/boards`, {
    headers: await headersJson(getToken),
  });
  const data = await parseJson<{ boards: ApiBoardListItem[] }>(res);
  return data.boards;
}

export async function createBoard(
  getToken: () => Promise<string | null>,
  folderId: string,
  title?: string,
): Promise<ApiBoardListItem> {
  const base = getWorkspaceApiBase();
  const res = await fetch(`${base}/v1/folders/${folderId}/boards`, {
    method: "POST",
    headers: await headersJson(getToken),
    body: JSON.stringify(title ? { title } : {}),
  });
  const data = await parseJson<{ board: ApiBoardListItem }>(res);
  return data.board;
}

export async function getBoardWithScene(
  getToken: () => Promise<string | null>,
  boardId: string,
): Promise<{ board: ApiBoardDetail; scene: Record<string, unknown> }> {
  const base = getWorkspaceApiBase();
  const res = await fetch(`${base}/v1/boards/${boardId}`, {
    headers: await headersJson(getToken),
  });
  return parseJson(res);
}

export async function putBoardScene(
  getToken: () => Promise<string | null>,
  boardId: string,
  body: {
    scene: Record<string, unknown>;
    title?: string;
    expectedUpdatedAt?: string | null;
  },
): Promise<{ board: ApiBoardDetail }> {
  const base = getWorkspaceApiBase();
  const res = await fetch(`${base}/v1/boards/${boardId}`, {
    method: "PUT",
    headers: await headersJson(getToken),
    body: JSON.stringify(body),
  });
  return parseJson(res);
}

export async function renameFolder(
  getToken: () => Promise<string | null>,
  folderId: string,
  name: string,
): Promise<ApiFolder> {
  const base = getWorkspaceApiBase();
  const res = await fetch(`${base}/v1/folders/${folderId}`, {
    method: "PATCH",
    headers: await headersJson(getToken),
    body: JSON.stringify({ name }),
  });
  const data = await parseJson<{ folder: ApiFolder }>(res);
  return data.folder;
}

export async function reorderFolder(
  getToken: () => Promise<string | null>,
  folderId: string,
  sortOrder: number,
): Promise<ApiFolder> {
  const base = getWorkspaceApiBase();
  const res = await fetch(`${base}/v1/folders/${folderId}`, {
    method: "PATCH",
    headers: await headersJson(getToken),
    body: JSON.stringify({ sortOrder }),
  });
  const data = await parseJson<{ folder: ApiFolder }>(res);
  return data.folder;
}

export async function renameBoard(
  getToken: () => Promise<string | null>,
  boardId: string,
  title: string,
): Promise<ApiBoardListItem> {
  const base = getWorkspaceApiBase();
  const res = await fetch(`${base}/v1/boards/${boardId}`, {
    method: "PATCH",
    headers: await headersJson(getToken),
    body: JSON.stringify({ title }),
  });
  const data = await parseJson<{ board: ApiBoardListItem }>(res);
  return data.board;
}

export async function deleteBoard(
  getToken: () => Promise<string | null>,
  boardId: string,
): Promise<void> {
  const base = getWorkspaceApiBase();
  const res = await fetch(`${base}/v1/boards/${boardId}`, {
    method: "DELETE",
    headers: await headersJson(getToken),
  });
  if (!res.ok) {
    const text = await res.text();
    let msg = text || res.statusText;
    try {
      const j = JSON.parse(text) as { message?: string };
      if (j?.message) {
        msg = j.message;
      }
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
}

export async function renameWorkspace(
  getToken: () => Promise<string | null>,
  workspaceId: string,
  name: string,
): Promise<ApiWorkspace> {
  const base = getWorkspaceApiBase();
  const res = await fetch(`${base}/v1/workspaces/${workspaceId}`, {
    method: "PATCH",
    headers: await headersJson(getToken),
    body: JSON.stringify({ name }),
  });
  const data = await parseJson<{ workspace: ApiWorkspace }>(res);
  return data.workspace;
}
