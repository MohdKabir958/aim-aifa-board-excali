import { UserButton } from "@clerk/clerk-react";
import React from "react";

import { isClerkEnabled, useAppAuth } from "../auth/AppAuth";

export const AppTopBarAuth = () => {
  const { openSignIn, openSignUp, isLoaded, isSignedIn } = useAppAuth();

  if (!isClerkEnabled) {
    return null;
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
