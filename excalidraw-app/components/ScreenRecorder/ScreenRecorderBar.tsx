import { createPortal } from "react-dom";

import "./screenRecorder.scss";

import type { ScreenRecorderApi } from "../../hooks/useScreenRecorder";

function formatElapsed(totalSec: number) {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${`${s}`.padStart(2, "0")}`;
}

export const ScreenRecorderBar = ({ api }: { api: ScreenRecorderApi }) => {
  const { isRecording, status, elapsedSec, stopRecording } = api;

  if (!isRecording) {
    return null;
  }

  const stopping = status === "stopping";

  return createPortal(
    <div className="screen-recorder-bar" role="status" aria-live="polite">
      <div className="screen-recorder-bar__rec">
        <span className="screen-recorder-bar__dot" aria-hidden />
        <span>{stopping ? "Saving…" : "REC"}</span>
      </div>
      <span className="screen-recorder-bar__time">
        {formatElapsed(elapsedSec)}
      </span>
      <button
        type="button"
        className="screen-recorder-bar__stop"
        disabled={stopping}
        onClick={stopRecording}
      >
        Stop
      </button>
    </div>,
    document.body,
  );
};
