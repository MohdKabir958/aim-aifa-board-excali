import { ClerkProvider, useAuth, useClerk, useUser } from "@clerk/clerk-react";
import React, { createContext, useContext, useEffect, useMemo } from "react";

function readMetaClerkPublishableKey(): string {
  if (typeof document === "undefined") {
    return "";
  }
  const meta = document.querySelector('meta[name="aimtutor-clerk-pk"]');
  const b64 = meta?.getAttribute("content")?.trim();
  if (!b64) {
    return "";
  }
  try {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      bytes[i] = bin.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  } catch {
    return "";
  }
}

function normalizeClerkKeyCandidate(raw: string): string {
  const s = raw.replace(/\r/g, "").trim();
  if (!s || s === "undefined" || s === "null") {
    return "";
  }
  return s;
}

/** Prefer env when it looks like a real publishable key; otherwise use meta (Vite-injected). */
function readClerkPublishableKey(): string {
  let envRaw = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
  if (typeof envRaw !== "string") {
    envRaw = "";
  }
  const fromEnv = normalizeClerkKeyCandidate(envRaw);
  const fromMeta = normalizeClerkKeyCandidate(readMetaClerkPublishableKey());

  if (fromEnv.startsWith("pk_")) {
    return fromEnv;
  }
  if (fromMeta.startsWith("pk_")) {
    return fromMeta;
  }
  return "";
}

/** True when a valid Clerk publishable key is available (env or injected meta). */
export function isClerkEnabled(): boolean {
  return readClerkPublishableKey().length > 0;
}

export type AppAuthValue = {
  isLoaded: boolean;
  isSignedIn: boolean;
  openSignIn: () => void;
  openSignUp: () => void;
  getToken: () => Promise<string | null>;
};

const noop = () => {};

const authDisabledValue: AppAuthValue = {
  isLoaded: true,
  isSignedIn: false,
  openSignIn: noop,
  openSignUp: noop,
  getToken: async () => null,
};

const AppAuthContext = createContext<AppAuthValue>(authDisabledValue);

function ClerkBridge({ children }: { children: React.ReactNode }) {
  const { openSignIn, openSignUp } = useClerk();
  const { isLoaded, isSignedIn } = useUser();
  const { getToken } = useAuth();

  const value = useMemo<AppAuthValue>(
    () => ({
      isLoaded,
      isSignedIn: Boolean(isSignedIn),
      openSignIn,
      openSignUp,
      getToken: async () => (await getToken()) ?? null,
    }),
    [isLoaded, isSignedIn, openSignIn, openSignUp, getToken],
  );

  return (
    <AppAuthContext.Provider value={value}>{children}</AppAuthContext.Provider>
  );
}

export function AppAuthProvider({ children }: { children: React.ReactNode }) {
  const publishableKey = useMemo(() => readClerkPublishableKey(), []);

  useEffect(() => {
    if (import.meta.env.DEV && !publishableKey.startsWith("pk_")) {
      // eslint-disable-next-line no-console
      console.info(
        "[aimtutor] Clerk UI is hidden: set VITE_CLERK_PUBLISHABLE_KEY in aifaboard/.env.development (or .env.development.local), restart Vite, and hard-refresh the browser.",
      );
    }
  }, [publishableKey]);

  if (!publishableKey.startsWith("pk_")) {
    return (
      <AppAuthContext.Provider value={authDisabledValue}>
        {children}
      </AppAuthContext.Provider>
    );
  }

  return (
    <ClerkProvider publishableKey={publishableKey}>
      <ClerkBridge>{children}</ClerkBridge>
    </ClerkProvider>
  );
}

export function useAppAuth(): AppAuthValue {
  return useContext(AppAuthContext);
}
