import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

import "./screenRecorder.scss";

export const ScreenRecorderWebcamBubble = ({
  stream,
}: {
  stream: MediaStream | null;
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) {
      return;
    }
    if (stream) {
      el.srcObject = stream;
      void el.play().catch(() => {
        /* autoplay policies */
      });
    } else {
      el.srcObject = null;
    }
    return () => {
      el.srcObject = null;
    };
  }, [stream]);

  if (!stream) {
    return null;
  }

  return createPortal(
    <div
      className="screen-recorder-webcam"
      role="img"
      aria-label="Camera preview"
    >
      <video
        ref={videoRef}
        className="screen-recorder-webcam__video"
        playsInline
        muted
        autoPlay
      />
    </div>,
    document.body,
  );
};
