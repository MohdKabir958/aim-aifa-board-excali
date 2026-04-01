import {
  DiagramToCodePlugin,
  exportToBlob,
  getTextFromElements,
  MIME_TYPES,
  TTDDialog,
  TTDStreamFetch,
} from "@excalidraw/excalidraw";
import { getDataURL } from "@excalidraw/excalidraw/data/blob";
import { RequestError } from "@excalidraw/excalidraw/errors";
import { safelyParseJSON } from "@excalidraw/common";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { isClerkEnabled, useAppAuth } from "../auth/AppAuth";

import { TTDIndexedDBAdapter } from "../data/TTDStorage";

export const AIComponents = ({
  excalidrawAPI,
}: {
  excalidrawAPI: ExcalidrawImperativeAPI;
}) => {
  const { getToken, isLoaded, isSignedIn, openSignIn } = useAppAuth();

  return (
    <>
      <DiagramToCodePlugin
        generate={async ({ frame, children }) => {
          const appState = excalidrawAPI.getAppState();

          const blob = await exportToBlob({
            elements: children,
            appState: {
              ...appState,
              exportBackground: true,
              viewBackgroundColor: appState.viewBackgroundColor,
            },
            exportingFrame: frame,
            files: excalidrawAPI.getFiles(),
            mimeType: MIME_TYPES.jpg,
          });

          const dataURL = await getDataURL(blob);

          const textFromFrameChildren = getTextFromElements(children);
          const token = await getToken();

          const response = await fetch(
            `${
              import.meta.env.VITE_APP_AI_BACKEND
            }/v1/ai/diagram-to-code/generate`,
            {
              method: "POST",
              headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
              body: JSON.stringify({
                texts: textFromFrameChildren,
                image: dataURL,
                theme: appState.theme,
              }),
            },
          );

          if (!response.ok) {
            const text = await response.text();
            const errorJSON = safelyParseJSON(text);

            if (!errorJSON) {
              throw new Error(text);
            }

            if (errorJSON.statusCode === 429) {
              return {
                html: `<html>
                <body style="margin: 0; text-align: center">
                <div style="display: flex; align-items: center; justify-content: center; flex-direction: column; height: 100vh; padding: 0 60px">
                  <div style="color:red">Too many requests today,</br>please try again tomorrow!</div>
                  </br>
                  </br>
                  <div>You can also try <a href="${
                    import.meta.env.VITE_APP_PLUS_LP
                  }/plus?utm_source=excalidraw&utm_medium=app&utm_content=d2c" target="_blank" rel="noopener">Excalidraw+</a> to get more requests.</div>
                </div>
                </body>
                </html>`,
              };
            }

            throw new Error(errorJSON.message || text);
          }

          try {
            const { html } = await response.json();

            if (!html) {
              throw new Error("Generation failed (invalid response)");
            }
            return {
              html,
            };
          } catch (error: any) {
            throw new Error("Generation failed (invalid response)");
          }
        }}
      />

      <TTDDialog
        onTextSubmit={async (props) => {
          const { onChunk, onStreamCreated, signal, messages } = props;

          if (isClerkEnabled) {
            if (!isLoaded) {
              return {
                error: new RequestError({
                  message:
                    "Checking sign-in… please wait a moment and try again.",
                  status: 401,
                }),
              };
            }
            if (!isSignedIn) {
              openSignIn();
              return {
                error: new RequestError({
                  message: "Sign in to use Text to diagram.",
                  status: 401,
                }),
              };
            }
            const token = await getToken();
            if (!token) {
              openSignIn();
              return {
                error: new RequestError({
                  message:
                    "Could not get a session token. Sign in and try again.",
                  status: 401,
                }),
              };
            }

            return TTDStreamFetch({
              url: `${
                import.meta.env.VITE_APP_AI_BACKEND
              }/v1/ai/text-to-diagram/chat-streaming`,
              messages,
              onChunk,
              onStreamCreated,
              extractRateLimits: true,
              signal,
              headers: { Authorization: `Bearer ${token}` },
            });
          }

          const token = await getToken();
          return TTDStreamFetch({
            url: `${
              import.meta.env.VITE_APP_AI_BACKEND
            }/v1/ai/text-to-diagram/chat-streaming`,
            messages,
            onChunk,
            onStreamCreated,
            extractRateLimits: true,
            signal,
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          });
        }}
        persistenceAdapter={TTDIndexedDBAdapter}
      />
    </>
  );
};
