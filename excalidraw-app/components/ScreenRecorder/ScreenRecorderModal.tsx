import { THEME } from "@excalidraw/excalidraw";
import clsx from "clsx";
import { useEffect } from "react";
import { createPortal } from "react-dom";

import type { Theme } from "@excalidraw/element/types";

import "./screenRecorder.scss";

import type { ScreenRecorderApi } from "../../hooks/useScreenRecorder";

export const ScreenRecorderModal = ({
  api,
  theme,
}: {
  api: ScreenRecorderApi;
  theme: Theme;
}) => {
  const {
    modalOpen,
    closeModal,
    includeMic,
    setIncludeMic,
    includeCamera,
    setIncludeCamera,
    startRecording,
    status,
    error,
  } = api;

  useEffect(() => {
    if (!modalOpen) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeModal();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalOpen, closeModal]);

  if (!modalOpen) {
    return null;
  }

  const starting = status === "starting";

  return createPortal(
    <div
      className={clsx(
        "screen-recorder-modal-root",
        theme === THEME.DARK && "screen-recorder-modal-root--dark",
      )}
      role="dialog"
      aria-modal="true"
      aria-labelledby="screen-recorder-title"
    >
      <button
        type="button"
        className="screen-recorder-modal-backdrop"
        aria-label="Close"
        onClick={() => !starting && closeModal()}
      />
      <div className="screen-recorder-modal">
        <h2 id="screen-recorder-title">Record screen</h2>
        <p className="screen-recorder-modal__hint">
          Your browser will ask which tab, window, or screen to share. In
          Chrome, enable <strong>Share tab audio</strong> in the picker if you
          want sound from that tab. Output is a <code>.webm</code> file (VLC or
          Chrome play it well).
        </p>
        <label className="screen-recorder-modal__label">
          <input
            type="checkbox"
            checked={includeCamera}
            disabled={starting}
            onChange={(e) => setIncludeCamera(e.target.checked)}
          />
          Show camera (floating circle)
        </label>
        <label className="screen-recorder-modal__label">
          <input
            type="checkbox"
            checked={includeMic}
            disabled={starting}
            onChange={(e) => setIncludeMic(e.target.checked)}
          />
          Record microphone
        </label>
        {error ? (
          <div className="screen-recorder-modal__error" role="alert">
            {error}
          </div>
        ) : null}
        <div className="screen-recorder-modal__actions">
          <button
            type="button"
            className="screen-recorder-modal__btn-secondary"
            disabled={starting}
            onClick={closeModal}
          >
            Cancel
          </button>
          <button
            type="button"
            className="screen-recorder-modal__btn-primary"
            disabled={starting}
            onClick={() => void startRecording()}
          >
            {starting ? "Starting…" : "Start recording"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
