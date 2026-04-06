import { UserButton } from "@clerk/clerk-react";
import React from "react";

import { isClerkEnabled, useAppAuth } from "../auth/AppAuth";

function explainClerkSetup() {
  /* Intentional when Clerk env is missing — tells devs how to enable real auth */
  // eslint-disable-next-line no-alert
  window.alert(
    "Sign in is not available yet.\n\n" +
      "Add your Clerk publishable key to the repo root env file:\n" +
      "  aifaboard/.env.development.local\n" +
      "  VITE_CLERK_PUBLISHABLE_KEY=pk_test_...\n\n" +
      "Restart the Vite dev server after saving. See aifaboard/.env.example.",
  );
}

export const AppTopBarAuth = () => {
  const { openSignIn, openSignUp, isLoaded, isSignedIn } = useAppAuth();

  if (!isClerkEnabled()) {
    return (
      <div className="aimtutor-auth aimtutor-auth--docked aimtutor-auth--unconfigured">
        <button
          type="button"
          className="aimtutor-auth__btn"
          onClick={explainClerkSetup}
        >
          Sign in
        </button>
        <button
          type="button"
          className="aimtutor-auth__btn aimtutor-auth__btn--primary"
          onClick={explainClerkSetup}
        >
          Sign up
        </button>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div
        className="aimtutor-auth aimtutor-auth--docked aimtutor-auth--loading"
        aria-hidden
      />
    );
  }

  if (isSignedIn) {
    return (
      <div className="aimtutor-auth aimtutor-auth--docked">
        <UserButton afterSignOutUrl="/" />
      </div>
    );
  }

  return (
    <div className="aimtutor-auth aimtutor-auth--docked">
      <button
        type="button"
        className="aimtutor-auth__btn"
        onClick={() => openSignIn()}
      >
        Sign in
      </button>
      <button
        type="button"
        className="aimtutor-auth__btn aimtutor-auth__btn--primary"
        onClick={() => openSignUp()}
      >
        Sign up
      </button>
    </div>
  );
};
