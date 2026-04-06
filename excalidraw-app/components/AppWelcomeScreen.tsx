import React from "react";

import { POINTER_EVENTS } from "@excalidraw/common";
import { loginIcon } from "@excalidraw/excalidraw/components/icons";
import { WelcomeScreen } from "@excalidraw/excalidraw/index";
import { useI18n } from "@excalidraw/excalidraw/i18n";

import { isClerkEnabled, useAppAuth } from "../auth/AppAuth";

import { AimtutorWordmark } from "./AimtutorWordmark";

export const AppWelcomeScreen: React.FC<{
  onCollabDialogOpen: () => any;
  isCollabEnabled: boolean;
}> = React.memo((props) => {
  const { t } = useI18n();
  const { openSignUp, isLoaded, isSignedIn } = useAppAuth();
  let headingContent;

  if (isClerkEnabled() && isLoaded && isSignedIn) {
    headingContent = (
      <>
        Continue in{" "}
        <a
          style={{ pointerEvents: POINTER_EVENTS.inheritFromUI }}
          href={`${
            import.meta.env.VITE_APP_PLUS_APP
          }?utm_source=aimtutor.ai&utm_medium=app&utm_content=welcomeScreenSignedInUser`}
        >
          aimtutor.ai+
        </a>
      </>
    );
  } else {
    headingContent = (
      <>
        {t("welcomeScreen.app.center_heading")}
        <br />
        {t("welcomeScreen.app.center_heading_line2")}
        <br />
        {t("welcomeScreen.app.center_heading_line3")}
      </>
    );
  }

  return (
    <WelcomeScreen>
      <WelcomeScreen.Hints.MenuHint>
        {t("welcomeScreen.app.menuHint")}
      </WelcomeScreen.Hints.MenuHint>
      <WelcomeScreen.Hints.ToolbarHint />
      <WelcomeScreen.Hints.HelpHint />
      <WelcomeScreen.Center>
        <AimtutorWordmark variant="welcome" />
        <WelcomeScreen.Center.Heading>
          {headingContent}
        </WelcomeScreen.Center.Heading>
        <WelcomeScreen.Center.Menu>
          <WelcomeScreen.Center.MenuItemLoadScene />
          <WelcomeScreen.Center.MenuItemHelp />
          {props.isCollabEnabled && (
            <WelcomeScreen.Center.MenuItemLiveCollaborationTrigger
              onSelect={() => props.onCollabDialogOpen()}
            />
          )}
          {isClerkEnabled() && isLoaded && !isSignedIn && (
            <WelcomeScreen.Center.MenuItem
              shortcut={null}
              icon={loginIcon}
              onSelect={() => openSignUp()}
            >
              Sign up
            </WelcomeScreen.Center.MenuItem>
          )}
        </WelcomeScreen.Center.Menu>
      </WelcomeScreen.Center>
    </WelcomeScreen>
  );
});
