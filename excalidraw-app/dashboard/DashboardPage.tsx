import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { AimtutorWordmark } from "../components/AimtutorWordmark";
import { useUser } from "@clerk/clerk-react";
import { isClerkEnabled, useAppAuth } from "../auth/AppAuth";
import {
  createBoard,
  createFolder,
  deleteBoard,
  deleteFolder,
  getWorkspaceApiBase,
  listBoardsInFolder,
  listFolders,
  listWorkspaces,
  renameBoard,
  renameFolder,
  renameWorkspace,
  reorderFolder,
  type ApiBoardListItem,
  type ApiFolder,
  type ApiWorkspace,
} from "../data/workspaceApi";

import "./DashboardPage.scss";

// ── Theme sync (reads/writes localStorage + html.dark class) ─────────────────
const THEME_KEY = "excalidraw-theme";

function useThemeSync() {
  const [isDark, setIsDark] = useState(
    () => document.documentElement.classList.contains("dark"),
  );

  const toggle = useCallback(() => {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem(THEME_KEY, next ? "dark" : "light");
    setIsDark(next);
  }, []);

  // Keep in sync if the app changes the theme while on this page
  useEffect(() => {
    const obs = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains("dark"));
    });
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => obs.disconnect();
  }, []);

  return { isDark, toggle };
}

// ── Inline SVG icons ──────────────────────────────────────────────────────────
function IconSun() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
  );
}

function IconMoon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  );
}

function IconFolder({ active }: { active?: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: active ? 0.9 : 0.6 }}>
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
    </svg>
  );
}

function IconDocument() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4 }}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
    </svg>
  );
}

function IconSearch() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  );
}

function IconPencil() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  );
}

function IconChevronUp() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="18 15 12 9 6 15"/>
    </svg>
  );
}

function IconChevronDown() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  );
}

function IconArrowLeft() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12"/>
      <polyline points="12 19 5 12 12 5"/>
    </svg>
  );
}

function IconTrash() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
    </svg>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatDate(iso: string) {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);
    if (mins < 2) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: days > 365 ? "numeric" : undefined,
    });
  } catch {
    return iso;
  }
}

function getInitials(name: string | null | undefined) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((p) => p[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("");
}

// ── Main Component ─────────────────────────────────────────────────────────────
export function DashboardPage() {
  const { isLoaded, isSignedIn, openSignIn, getToken } = useAppAuth();
  const { user: clerkUser } = useUser();
  // Best-effort display name from Clerk (used as author fallback)
  const currentUserName =
    clerkUser?.fullName ||
    [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(" ") ||
    clerkUser?.username ||
    clerkUser?.primaryEmailAddress?.emailAddress ||
    null;
  const { isDark, toggle: toggleTheme } = useThemeSync();
  const navigate = useNavigate();

  const [error, setError] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<ApiWorkspace | null>(null);
  const [folders, setFolders] = useState<ApiFolder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [boards, setBoards] = useState<ApiBoardListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newFolderName, setNewFolderName] = useState(""); // kept for compat, unused by modal
  const [search, setSearch] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  // Modal state (new board)
  const [showNewBoardModal, setShowNewBoardModal] = useState(false);
  const [modalBoardTitle, setModalBoardTitle] = useState("");

  // Modal state (new folder)
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [modalFolderName, setModalFolderName] = useState("");

  // Inline-edit state
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState("");
  const [editingBoardId, setEditingBoardId] = useState<string | null>(null);
  const [editingBoardTitle, setEditingBoardTitle] = useState("");
  const [editingWorkspace, setEditingWorkspace] = useState(false);
  const [workspaceNameDraft, setWorkspaceNameDraft] = useState("");

  const folderCreatingRef = useRef(false);
  const boardCreatingRef  = useRef(false);
  const folderEditRef = useRef<HTMLInputElement>(null);
  const boardEditRef = useRef<HTMLInputElement>(null);
  const workspaceEditRef = useRef<HTMLInputElement>(null);
  const newFolderRef = useRef<HTMLInputElement>(null);
  const modalInputRef = useRef<HTMLInputElement>(null);
  const modalFolderInputRef = useRef<HTMLInputElement>(null);

  const apiConfigured = getWorkspaceApiBase().length > 0;

  const filteredBoards = boards.filter((b) =>
    b.title.toLowerCase().includes(search.toLowerCase()),
  );

  // Auto-focus inline edit inputs
  useEffect(() => {
    if (editingFolderId) {
      folderEditRef.current?.focus();
      folderEditRef.current?.select();
    }
  }, [editingFolderId]);
  useEffect(() => {
    if (editingBoardId) {
      boardEditRef.current?.focus();
      boardEditRef.current?.select();
    }
  }, [editingBoardId]);
  useEffect(() => {
    if (editingWorkspace) {
      workspaceEditRef.current?.focus();
      workspaceEditRef.current?.select();
    }
  }, [editingWorkspace]);

  // Auto-focus modal input when it opens
  useEffect(() => {
    if (showNewBoardModal) {
      const t = setTimeout(() => {
        modalInputRef.current?.focus();
        modalInputRef.current?.select();
      }, 40);
      return () => clearTimeout(t);
    }
  }, [showNewBoardModal]);

  // Auto-focus folder modal input
  useEffect(() => {
    if (showNewFolderModal) {
      const t = setTimeout(() => {
        modalFolderInputRef.current?.focus();
        modalFolderInputRef.current?.select();
      }, 40);
      return () => clearTimeout(t);
    }
  }, [showNewFolderModal]);

  // ── Data fetching ────────────────────────────────────────────────────────────
  const refreshFolders = useCallback(async () => {
    const ws = await listWorkspaces(getToken);
    if (!ws.length) throw new Error("No workspace returned");
    const w = ws[0];
    setWorkspace(w);
    const fs = await listFolders(getToken, w.id);
    setFolders(fs);
    return { workspace: w, folders: fs };
  }, [getToken]);

  const refreshBoards = useCallback(
    async (folderId: string) => {
      const list = await listBoardsInFolder(getToken, folderId);
      setBoards(list);
    },
    [getToken],
  );

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !apiConfigured) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { folders: fs } = await refreshFolders();
        if (cancelled) return;
        setSelectedFolderId((prev) => {
          if (prev && fs.some((f) => f.id === prev)) return prev;
          return fs[0]?.id ?? null;
        });
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to load workspace");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isLoaded, isSignedIn, apiConfigured, refreshFolders]);

  useEffect(() => {
    if (!selectedFolderId || !isSignedIn) { setBoards([]); return; }
    let cancelled = false;
    setSearch("");
    (async () => {
      try { await refreshBoards(selectedFolderId); }
      catch (e: any) { if (!cancelled) setError(e?.message || "Failed to load boards"); }
    })();
    return () => { cancelled = true; };
  }, [selectedFolderId, isSignedIn, refreshBoards]);

  // ── Workspace ────────────────────────────────────────────────────────────────
  const startWorkspaceRename = () => {
    setEditingWorkspace(true);
    setWorkspaceNameDraft(workspace?.name ?? "");
  };
  const commitWorkspaceRename = async () => {
    if (!workspace) { setEditingWorkspace(false); return; }
    const name = workspaceNameDraft.trim();
    setEditingWorkspace(false);
    if (!name || name === workspace.name) return;
    const prevName = workspace.name;
    // Optimistic update — feels instant
    setWorkspace((prev) => (prev ? { ...prev, name } : prev));
    setError(null);
    try {
      await renameWorkspace(getToken, workspace.id, name);
    } catch (e: any) {
      setWorkspace((prev) => (prev ? { ...prev, name: prevName } : prev));
      setError(e?.message || "Could not rename workspace");
    }
  };

  // ── Folders ──────────────────────────────────────────────────────────────────
  const openNewFolderModal = () => {
    setModalFolderName("");
    setShowNewFolderModal(true);
  };

  const closeNewFolderModal = () => {
    setShowNewFolderModal(false);
    setModalFolderName("");
  };

  const onCreateFolder = async () => {
    const name = modalFolderName.trim();
    if (!name || !workspace || folderCreatingRef.current) return;

    closeNewFolderModal();
    folderCreatingRef.current = true;
    setError(null);

    // Optimistic: add a placeholder folder immediately
    const tempId = `__tmp__${Date.now()}`;
    const now = new Date().toISOString();
    setFolders((prev) => [
      ...prev,
      { id: tempId, name, boardCount: 0, workspaceId: workspace.id, createdAt: now, updatedAt: now, sortOrder: prev.length * 10 } as ApiFolder,
    ]);
    setSelectedFolderId(tempId);

    try {
      const real = await createFolder(getToken, workspace.id, name);
      // Replace temp with the real folder from server
      setFolders((prev) => prev.map((f) => f.id === tempId ? { ...real, boardCount: 0 } : f));
      setSelectedFolderId(real.id);
    } catch (e: any) {
      // Revert — remove the placeholder
      setFolders((prev) => prev.filter((f) => f.id !== tempId));
      setSelectedFolderId((prev) => (prev === tempId ? null : prev));
      setError(e?.message || "Could not create folder");
    } finally {
      folderCreatingRef.current = false;
    }
  };

  const onDeleteFolder = async (folderId: string) => {
    if (!window.confirm("Delete this folder and all boards inside?")) return;
    setError(null);
    try {
      await deleteFolder(getToken, folderId);
      const { folders: fs } = await refreshFolders();
      if (selectedFolderId === folderId) setSelectedFolderId(fs[0]?.id ?? null);
      if (!fs.length) setBoards([]);
    } catch (e: any) { setError(e?.message || "Could not delete folder"); }
  };

  const startFolderRename = (folder: ApiFolder) => {
    setEditingFolderId(folder.id);
    setEditingFolderName(folder.name);
  };

  const commitFolderRename = async () => {
    if (!editingFolderId) return;
    const id = editingFolderId;
    const name = editingFolderName.trim();
    setEditingFolderId(null);
    if (!name) return;
    const prevName = folders.find((f) => f.id === id)?.name ?? name;
    // Optimistic: apply new name instantly
    setFolders((prev) => prev.map((f) => (f.id === id ? { ...f, name } : f)));
    setError(null);
    try {
      await renameFolder(getToken, id, name);
    } catch (e: any) {
      // Revert
      setFolders((prev) => prev.map((f) => (f.id === id ? { ...f, name: prevName } : f)));
      setError(e?.message || "Could not rename folder");
    }
  };

  const moveFolder = async (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= folders.length || actionLoading) return;
    const newFolders = [...folders];
    [newFolders[index], newFolders[target]] = [newFolders[target], newFolders[index]];
    setFolders(newFolders);
    setActionLoading(true);
    setError(null);
    try {
      await Promise.all(newFolders.map((f, i) => reorderFolder(getToken, f.id, i * 10)));
    } catch (e: any) {
      setError(e?.message || "Could not reorder folders");
      await refreshFolders();
    } finally { setActionLoading(false); }
  };

  // ── Boards ────────────────────────────────────────────────────────────────────
  const openNewBoardModal = () => {
    if (!selectedFolderId) return;
    setModalBoardTitle("");
    setShowNewBoardModal(true);
  };

  const closeNewBoardModal = () => {
    setShowNewBoardModal(false);
    setModalBoardTitle("");
  };

  const onCreateBoard = async () => {
    if (!selectedFolderId || boardCreatingRef.current) return;
    const title = modalBoardTitle.trim();

    closeNewBoardModal();
    boardCreatingRef.current = true;
    setError(null);

    // Optimistic: prepend a placeholder board immediately
    const tempId = `__tmp__${Date.now()}`;
    const now = new Date().toISOString();
    setBoards((prev) => [
      { id: tempId, title: title || "Untitled board", folderId: selectedFolderId, author: currentUserName ?? null, createdAt: now, updatedAt: now } as ApiBoardListItem,
      ...prev,
    ]);
    setFolders((prev) =>
      prev.map((f) => f.id === selectedFolderId ? { ...f, boardCount: (f.boardCount ?? 0) + 1 } : f),
    );

    try {
      await createBoard(getToken, selectedFolderId, title || undefined);
      // Refresh to get the real board ID (needed to open it)
      await refreshBoards(selectedFolderId);
    } catch (e: any) {
      // Revert placeholder
      setBoards((prev) => prev.filter((b) => b.id !== tempId));
      setFolders((prev) =>
        prev.map((f) => f.id === selectedFolderId ? { ...f, boardCount: Math.max(0, (f.boardCount ?? 1) - 1) } : f),
      );
      setError(e?.message || "Could not create board");
    } finally {
      boardCreatingRef.current = false;
    }
  };

  const onDeleteBoard = async (boardId: string, title: string) => {
    if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) return;
    setActionLoading(true);
    setError(null);
    try {
      await deleteBoard(getToken, boardId);
      setBoards((prev) => prev.filter((b) => b.id !== boardId));
      setFolders((prev) =>
        prev.map((f) =>
          f.id === selectedFolderId
            ? { ...f, boardCount: Math.max(0, (f.boardCount ?? 1) - 1) }
            : f,
        ),
      );
    } catch (e: any) {
      setError(e?.message || "Could not delete board");
    } finally { setActionLoading(false); }
  };

  const startBoardRename = (board: ApiBoardListItem) => {
    setEditingBoardId(board.id);
    setEditingBoardTitle(board.title);
  };

  const commitBoardRename = async () => {
    if (!editingBoardId) return;
    const id = editingBoardId;
    const title = editingBoardTitle.trim();
    setEditingBoardId(null);
    if (!title) return;
    const prevTitle = boards.find((b) => b.id === id)?.title ?? title;
    // Optimistic: show new name right away
    setBoards((prev) => prev.map((b) => (b.id === id ? { ...b, title } : b)));
    setError(null);
    try {
      await renameBoard(getToken, id, title);
    } catch (e: any) {
      // Revert
      setBoards((prev) => prev.map((b) => (b.id === id ? { ...b, title: prevTitle } : b)));
      setError(e?.message || "Could not rename board");
    }
  };

  // ── Guard renders ────────────────────────────────────────────────────────────
  if (!isClerkEnabled()) {
    return (
      <div className="aim-dashboard">
        <div className="aim-dashboard__centered">
          <div className="aim-dashboard__card">
            <span className="aim-dashboard__card-icon">🔑</span>
            <h2>Auth not configured</h2>
            <p>Set <code>VITE_CLERK_PUBLISHABLE_KEY</code> to enable sign-in.</p>
            <Link className="aim-dashboard__btn aim-dashboard__btn--primary" to="/">Open whiteboard</Link>
          </div>
        </div>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="aim-dashboard">
        <div className="aim-dashboard__centered">
          <div className="aim-dashboard__spinner" aria-label="Loading" />
        </div>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="aim-dashboard">
        <div className="aim-dashboard__centered">
          <div className="aim-dashboard__card">
            <span className="aim-dashboard__card-icon">📋</span>
            <h2>Your workspace</h2>
            <p>Sign in to open your folders and teaching boards.</p>
            <button
              type="button"
              className="aim-dashboard__btn aim-dashboard__btn--primary"
              onClick={() => openSignIn()}
            >
              Sign in
            </button>
            <p className="aim-dashboard__hint">
              <Link to="/">Continue without account →</Link>
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!apiConfigured) {
    return (
      <div className="aim-dashboard">
        <div className="aim-dashboard__centered">
          <div className="aim-dashboard__card">
            <span className="aim-dashboard__card-icon">⚙️</span>
            <h2>Backend not configured</h2>
            <p>Set <code>VITE_APP_AI_BACKEND</code> to your API URL.</p>
            <Link className="aim-dashboard__btn aim-dashboard__btn--primary" to="/">Open whiteboard</Link>
          </div>
        </div>
      </div>
    );
  }

  const selectedFolder = folders.find((f) => f.id === selectedFolderId);

  // ── Main Dashboard ────────────────────────────────────────────────────────────
  return (
    <>
    <div className="aim-dashboard">

      {/* ── Top header bar ── */}
      <header className="aim-dashboard__top">

        {/* Brand + workspace name */}
        <div className="aim-dashboard__header-left">
          <Link className="aim-dashboard__brand" to="/" aria-label="Back to whiteboard">
            <AimtutorWordmark variant="toolbar" />
          </Link>
          <span className="aim-dashboard__sep" aria-hidden>/</span>
          {editingWorkspace ? (
            <input
              ref={workspaceEditRef}
              className="aim-dashboard__input aim-dashboard__workspace-input"
              value={workspaceNameDraft}
              onChange={(e) => setWorkspaceNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void commitWorkspaceRename();
                if (e.key === "Escape") setEditingWorkspace(false);
              }}
              onBlur={() => void commitWorkspaceRename()}
            />
          ) : (
            <button
              type="button"
              className="aim-dashboard__workspace-name"
              title="Click to rename workspace"
              onClick={startWorkspaceRename}
            >
              {workspace?.name ?? "My workspace"}
              <span className="aim-dashboard__edit-badge" aria-hidden>
                <IconPencil />
              </span>
            </button>
          )}
        </div>

        {/* Right controls */}
        <div className="aim-dashboard__header-right">
          <button
            type="button"
            className="aim-dashboard__theme-btn"
            onClick={toggleTheme}
            title={isDark ? "Switch to light mode" : "Switch to dark mode"}
            aria-label="Toggle theme"
          >
            {isDark ? <IconSun /> : <IconMoon />}
          </button>
          <Link className="aim-dashboard__btn aim-dashboard__btn--sm" to="/">
            <IconArrowLeft /> Whiteboard
          </Link>
          <button
            type="button"
            className="aim-dashboard__btn aim-dashboard__btn--primary aim-dashboard__btn--sm"
            onClick={openNewBoardModal}
            disabled={!selectedFolderId}
            title={!selectedFolderId ? "Select a folder first" : "Create a new board"}
          >
            + New board
          </button>
        </div>
      </header>

      {/* ── Error banner ── */}
      {error && (
        <div className="aim-dashboard__error" role="alert">
          <span>{error}</span>
          <button
            type="button"
            className="aim-dashboard__error-close"
            onClick={() => setError(null)}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {/* ── Body: sidebar + main ── */}
      <div className="aim-dashboard__body">

        {/* ── Sidebar ── */}
        <aside className="aim-dashboard__sidebar">
          <div className="aim-dashboard__sidebar-label desktop-only">Folders</div>

          {/* New Folder button (Desktop) */}
          <div className="aim-dashboard__sidebar-top desktop-only">
            <button
              type="button"
              className="aim-dashboard__new-folder-btn"
              onClick={openNewFolderModal}
              disabled={!workspace}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              New Folder
            </button>
          </div>

          <nav className="aim-dashboard__sidebar-scroll">
            {loading ? (
              <div className="aim-dashboard__skeleton-wrap">
                {[90, 75, 60].map((w) => (
                  <div key={w} className="aim-dashboard__skeleton" style={{ width: `${w}%` }} />
                ))}
              </div>
            ) : folders.length === 0 ? (
              <div className="aim-dashboard__folder-list">
                <button
                  type="button"
                  className="aim-dashboard__new-folder-btn mobile-only"
                  onClick={openNewFolderModal}
                  disabled={!workspace}
                >
                  + New Folder
                </button>
                <p className="aim-dashboard__no-folders desktop-only">
                  No folders yet. Create one below.
                </p>
              </div>
            ) : (
              <ul className="aim-dashboard__folder-list">
                {/* Mobile-only New Folder button inserted directly into the horizontally scrolling strip */}
                <li className="mobile-only">
                  <button
                    type="button"
                    className="aim-dashboard__new-folder-btn"
                    onClick={openNewFolderModal}
                    disabled={!workspace}
                  >
                    + New Folder
                  </button>
                </li>
                {folders.map((f, index) => (
                  <li key={f.id} className="aim-dashboard__folder-item">
                    {editingFolderId === f.id ? (
                      <input
                        ref={folderEditRef}
                        className="aim-dashboard__input aim-dashboard__folder-rename-input"
                        value={editingFolderName}
                        onChange={(e) => setEditingFolderName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void commitFolderRename();
                          if (e.key === "Escape") setEditingFolderId(null);
                        }}
                        onBlur={() => void commitFolderRename()}
                      />
                    ) : (
                      <>
                        <button
                          type="button"
                          className={`aim-dashboard__folder-btn${f.id === selectedFolderId ? " aim-dashboard__folder-btn--active" : ""}`}
                          onClick={() => setSelectedFolderId(f.id)}
                          title={f.name}
                        >
                          <span className="aim-dashboard__folder-icon">
                            <IconFolder active={f.id === selectedFolderId} />
                          </span>
                          <span className="aim-dashboard__folder-name">{f.name}</span>
                          {typeof f.boardCount === "number" && (
                            <span className="aim-dashboard__folder-badge">{f.boardCount}</span>
                          )}
                        </button>
                        <div className="aim-dashboard__folder-actions">
                          <button
                            type="button"
                            className="aim-dashboard__icon-btn"
                            title="Move up"
                            aria-label="Move folder up"
                            onClick={() => void moveFolder(index, -1)}
                            disabled={index === 0 || actionLoading}
                          >
                            <IconChevronUp />
                          </button>
                          <button
                            type="button"
                            className="aim-dashboard__icon-btn"
                            title="Move down"
                            aria-label="Move folder down"
                            onClick={() => void moveFolder(index, 1)}
                            disabled={index >= folders.length - 1 || actionLoading}
                          >
                            <IconChevronDown />
                          </button>
                          <button
                            type="button"
                            className="aim-dashboard__icon-btn"
                            title="Rename folder"
                            aria-label={`Rename ${f.name}`}
                            onClick={() => startFolderRename(f)}
                            disabled={actionLoading}
                          >
                            <IconPencil />
                          </button>
                          <button
                            type="button"
                            className="aim-dashboard__icon-btn aim-dashboard__icon-btn--danger"
                            title="Delete folder"
                            aria-label={`Delete ${f.name}`}
                            onClick={() => void onDeleteFolder(f.id)}
                          >
                            <IconTrash />
                          </button>
                        </div>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </nav>


        </aside>

        {/* ── Main content ── */}
        <main className="aim-dashboard__main">

          {/* Toolbar */}
          <div className="aim-dashboard__toolbar">
            <div className="aim-dashboard__toolbar-left">
              <div className="aim-dashboard__breadcrumb">
                <span>{workspace?.name ?? "Workspace"}</span>
                <span className="aim-dashboard__bc-sep">›</span>
                <span>{selectedFolder?.name ?? "—"}</span>
              </div>
              <h1 className="aim-dashboard__page-title">
                {selectedFolder ? selectedFolder.name : "Select a folder"}
              </h1>
            </div>

            <div className="aim-dashboard__toolbar-right">
              {/* Search */}
              <div className="aim-dashboard__search-wrap">
                <span className="aim-dashboard__search-icon"><IconSearch /></span>
                <input
                  className="aim-dashboard__search"
                  placeholder="Search boards…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  disabled={!selectedFolderId}
                />
              </div>
            </div>
          </div>

          {/* Board list */}
          <div className="aim-dashboard__content">
            {!selectedFolderId ? (
              <div className="aim-dashboard__empty">
                <span className="aim-dashboard__empty-icon">📁</span>
                <p className="aim-dashboard__empty-title">No folder selected</p>
                <p className="aim-dashboard__empty-desc">
                  Create a folder in the sidebar to start organising your teaching boards.
                </p>
              </div>
            ) : filteredBoards.length === 0 ? (
              <div className="aim-dashboard__empty">
                <span className="aim-dashboard__empty-icon">
                  {search ? "🔍" : "📄"}
                </span>
                <p className="aim-dashboard__empty-title">
                  {search ? `No results for "${search}"` : "No boards yet"}
                </p>
                <p className="aim-dashboard__empty-desc">
                  {search
                    ? "Try a different search term."
                    : 'Click "+ New board" to create your first board in this folder.'}
                </p>
              </div>
            ) : (
              <div className="aim-dashboard__table-wrap">
                <table className="aim-dashboard__table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Created</th>
                      <th>Last edited</th>
                      <th>Author</th>
                      <th style={{ width: 72 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBoards.map((b) => (
                      <tr
                        key={b.id}
                        onClick={() => {
                          if (editingBoardId !== b.id) {
                            navigate(`/board/${b.id}`);
                          }
                        }}
                        style={{ cursor: editingBoardId === b.id ? "default" : "pointer" }}
                      >
                        {/* Name */}
                        <td className="aim-dashboard__name-cell">
                          {editingBoardId === b.id ? (
                            <input
                              ref={boardEditRef}
                              className="aim-dashboard__input aim-dashboard__board-rename-input"
                              value={editingBoardTitle}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => setEditingBoardTitle(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") void commitBoardRename();
                                if (e.key === "Escape") setEditingBoardId(null);
                              }}
                              onBlur={() => void commitBoardRename()}
                            />
                          ) : (
                            <span className="aim-dashboard__board-name">
                              <span className="aim-dashboard__board-icon"><IconDocument /></span>
                              <span className="aim-dashboard__board-title-text">{b.title}</span>
                              <span className="aim-dashboard__open-hint">→</span>
                            </span>
                          )}
                        </td>

                        {/* Dates */}
                        <td className="aim-dashboard__meta-cell">{formatDate(b.createdAt)}</td>
                        <td className="aim-dashboard__meta-cell">{formatDate(b.updatedAt)}</td>

                        {/* Author */}
                        <td>
                          {(() => {
                            const displayName = b.author || currentUserName;
                            return displayName ? (
                              <div className="aim-dashboard__author-cell">
                                <span className="aim-dashboard__avatar">
                                  {getInitials(displayName)}
                                </span>
                                <span className="aim-dashboard__meta-cell">
                                  {displayName}
                                </span>
                              </div>
                            ) : (
                              <span className="aim-dashboard__meta-cell">—</span>
                            );
                          })()}
                        </td>

                        {/* Actions */}
                        <td>
                          <div
                            className="aim-dashboard__row-actions"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              className="aim-dashboard__icon-btn"
                              title="Rename board"
                              aria-label={`Rename ${b.title}`}
                              onClick={() => startBoardRename(b)}
                              disabled={actionLoading}
                            >
                              <IconPencil />
                            </button>
                            <button
                              type="button"
                              className="aim-dashboard__icon-btn aim-dashboard__icon-btn--danger"
                              title="Delete board"
                              aria-label={`Delete ${b.title}`}
                              onClick={() => void onDeleteBoard(b.id, b.title)}
                              disabled={actionLoading}
                            >
                              <IconTrash />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Footer hint */}
          <div className="aim-dashboard__footer">
            {selectedFolder && boards.length > 0 && (
              <span>
                {boards.length} board{boards.length !== 1 ? "s" : ""}
                {search && filteredBoards.length !== boards.length
                  ? ` · ${filteredBoards.length} shown`
                  : ""}
              </span>
            )}
            <span>Click a row to open · Open board to export or download .excalidraw</span>
          </div>
        </main>
      </div>
    </div>

      {/* ── New Board Modal ── */}
      {showNewBoardModal && (
        <div
          className="db-modal-overlay"
          role="presentation"
          onClick={closeNewBoardModal}
        >
          <div
            className="db-modal"
            role="dialog"
            aria-modal
            aria-labelledby="db-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="db-modal__header">
              <div className="db-modal__header-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="12" y1="18" x2="12" y2="12"/>
                  <line x1="9" y1="15" x2="15" y2="15"/>
                </svg>
              </div>
              <h2 className="db-modal__title" id="db-modal-title">New board</h2>
              <button type="button" className="db-modal__close" onClick={closeNewBoardModal} aria-label="Close">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className="db-modal__body">
              <label className="db-modal__label" htmlFor="db-modal-board-name">Board name</label>
              <input
                ref={modalInputRef}
                id="db-modal-board-name"
                className="aim-dashboard__input db-modal__input"
                placeholder="e.g. Week 1 — Introduction"
                value={modalBoardTitle}
                onChange={(e) => setModalBoardTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void onCreateBoard(); if (e.key === "Escape") closeNewBoardModal(); }}
                maxLength={200}
                autoComplete="off"
              />
              <p className="db-modal__hint">Creating in folder: <strong>{selectedFolder?.name ?? "—"}</strong></p>
            </div>
            <div className="db-modal__footer">
              <button type="button" className="aim-dashboard__btn" onClick={closeNewBoardModal}>Cancel</button>
              <button type="button" className="aim-dashboard__btn aim-dashboard__btn--primary" onClick={() => void onCreateBoard()}>Create board</button>
            </div>
          </div>
        </div>
      )}

      {/* ── New Folder Modal ── */}
      {showNewFolderModal && (
        <div
          className="db-modal-overlay"
          role="presentation"
          onClick={closeNewFolderModal}
        >
          <div
            className="db-modal"
            role="dialog"
            aria-modal
            aria-labelledby="db-folder-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="db-modal__header">
              <div className="db-modal__header-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
              </div>
              <h2 className="db-modal__title" id="db-folder-modal-title">New folder</h2>
              <button type="button" className="db-modal__close" onClick={closeNewFolderModal} aria-label="Close">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className="db-modal__body">
              <label className="db-modal__label" htmlFor="db-folder-modal-name">Folder name</label>
              <input
                ref={modalFolderInputRef}
                id="db-folder-modal-name"
                className="aim-dashboard__input db-modal__input"
                placeholder="e.g. Unit 1 — Basics"
                value={modalFolderName}
                onChange={(e) => setModalFolderName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void onCreateFolder(); if (e.key === "Escape") closeNewFolderModal(); }}
                maxLength={200}
                autoComplete="off"
              />
              <p className="db-modal__hint">Inside: <strong>{workspace?.name ?? "—"}</strong></p>
            </div>
            <div className="db-modal__footer">
              <button type="button" className="aim-dashboard__btn" onClick={closeNewFolderModal}>Cancel</button>
              <button type="button" className="aim-dashboard__btn aim-dashboard__btn--primary" onClick={() => void onCreateFolder()} disabled={!modalFolderName.trim()}>Create folder</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
