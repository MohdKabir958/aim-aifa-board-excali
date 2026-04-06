import { Footer } from "@excalidraw/excalidraw/index";
import React from "react";

import { isClerkEnabled, useAppAuth } from "../auth/AppAuth";

import { DebugFooter, isVisualDebuggerEnabled } from "./DebugCanvas";
import { EncryptedIcon } from "./EncryptedIcon";

export const AppFooter = React.memo(
  ({ onChange }: { onChange: () => void }) => {
    const { isLoaded, isSignedIn } = useAppAuth();

    return (
      <Footer>
        <div
          style={{
            display: "flex",
            gap: ".5rem",
            alignItems: "center",
          }}
        >
          {isVisualDebuggerEnabled() && <DebugFooter onChange={onChange} />}
          {(!isClerkEnabled() || (isLoaded && !isSignedIn)) && <EncryptedIcon />}
        </div>
      </Footer>
    );
  },
);
