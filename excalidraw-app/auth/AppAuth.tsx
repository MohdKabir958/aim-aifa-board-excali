import { ClerkProvider, useAuth, useClerk, useUser } from "@clerk/clerk-react";
import React, { createContext, useContext, useMemo } from "react";

const clerkPublishableKey =
  typeof import.meta.env.VITE_CLERK_PUBLISHABLE_KEY === "string"
    ? import.meta.env.VITE_CLERK_PUBLISHABLE_KEY.trim()
    : "";

/** True when `VITE_CLERK_PUBLISHABLE_KEY` is set (Clerk UI and JWT available). */
export const isClerkEnabled = clerkPublishableKey.length > 0;

if (import.meta.env.DEV && !isClerkEnabled) {
  // eslint-disable-next-line no-console
  console.info(
    "[aimtutor] Clerk UI is hidden: set VITE_CLERK_PUBLISHABLE_KEY in the repo-root .env.development.local and restart Vite.",
  );
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
  if (!isClerkEnabled) {
    return (
      <AppAuthContext.Provider value={authDisabledValue}>
        {children}
      </AppAuthContext.Provider>
    );
  }

  return (
    <ClerkProvider publishableKey={clerkPublishableKey}>
      <ClerkBridge>{children}</ClerkBridge>
    </ClerkProvider>
  );
}

export function useAppAuth(): AppAuthValue {
  return useContext(AppAuthContext);
}
