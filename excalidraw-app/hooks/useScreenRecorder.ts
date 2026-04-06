import { useCallback, useEffect, useRef, useState } from "react";

export type ScreenRecorderStatus =
  | "idle"
  | "starting"
  | "recording"
  | "stopping";

function pickRecorderMimeType(): { mimeType: string } | Record<string, never> {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  for (const mimeType of candidates) {
    if (
      typeof MediaRecorder !== "undefined" &&
      MediaRecorder.isTypeSupported(mimeType)
    ) {
      return { mimeType };
    }
  }
  return {};
}

function stopTracks(stream: MediaStream | null) {
  stream?.getTracks().forEach((t) => {
    t.stop();
  });
}

function downloadBlob(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const pad = (n: number) => `${n}`.padStart(2, "0");
  const d = new Date();
  a.download = `aimtutor-recording-${d.getFullYear()}-${pad(
    d.getMonth() + 1,
  )}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.webm`;
  a.rel = "noopener";
  a.click();
  URL.revokeObjectURL(url);
}

export function useScreenRecorder(options?: {
  onSaved?: (blob: Blob) => void;
  onRecordingStarted?: () => void;
  onRecordingFinished?: (info: {
    byteLength: number;
    mimeType: string;
  }) => void;
}) {
  const onSavedRef = useRef(options?.onSaved);
  onSavedRef.current = options?.onSaved;
  const onRecordingStartedRef = useRef(options?.onRecordingStarted);
  onRecordingStartedRef.current = options?.onRecordingStarted;
  const onRecordingFinishedRef = useRef(options?.onRecordingFinished);
  onRecordingFinishedRef.current = options?.onRecordingFinished;

  const [modalOpen, setModalOpen] = useState(false);
  const [includeMic, setIncludeMic] = useState(true);
  const [includeCamera, setIncludeCamera] = useState(true);
  const [webcamStream, setWebcamStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<ScreenRecorderStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [lastBlob, setLastBlob] = useState<Blob | null>(null);

  const displayStreamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const outputStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef<string>("video/webm");
  const displayEndedHandlerRef = useRef<(() => void) | null>(null);

  const cleanupStreams = useCallback(() => {
    const v = displayStreamRef.current?.getVideoTracks()[0];
    if (v && displayEndedHandlerRef.current) {
      v.removeEventListener("ended", displayEndedHandlerRef.current);
    }
    displayEndedHandlerRef.current = null;

    setWebcamStream(null);
    stopTracks(displayStreamRef.current);
    stopTracks(micStreamRef.current);
    stopTracks(outputStreamRef.current);
    displayStreamRef.current = null;
    micStreamRef.current = null;
    outputStreamRef.current = null;
    void audioContextRef.current?.close();
    audioContextRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      try {
        mediaRecorderRef.current?.stop();
      } catch {
        /* ignore */
      }
      cleanupStreams();
    };
  }, [cleanupStreams]);

  useEffect(() => {
    if (status !== "recording") {
      return;
    }
    const id = window.setInterval(() => {
      setElapsedSec((s) => s + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [status]);

  const stopRecording = useCallback(() => {
    const rec = mediaRecorderRef.current;
    if (!rec || rec.state === "inactive") {
      cleanupStreams();
      mediaRecorderRef.current = null;
      setStatus("idle");
      setElapsedSec(0);
      return;
    }
    setStatus("stopping");
    try {
      rec.stop();
    } catch {
      cleanupStreams();
      mediaRecorderRef.current = null;
      setStatus("idle");
      setElapsedSec(0);
    }
  }, [cleanupStreams]);

  const startRecording = useCallback(async () => {
    setError(null);
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setError(
        "Screen recording is not supported in this browser (try Chrome, Edge, or Firefox on desktop).",
      );
      return;
    }
    if (typeof MediaRecorder === "undefined") {
      setError("MediaRecorder is not available in this browser.");
      return;
    }

    setStatus("starting");

    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });

      displayStreamRef.current = displayStream;

      let micStream: MediaStream | null = null;
      if (includeCamera || includeMic) {
        try {
          micStream = await navigator.mediaDevices.getUserMedia({
            video: includeCamera
              ? {
                  facingMode: "user",
                  width: { ideal: 640 },
                  height: { ideal: 480 },
                }
              : false,
            audio: includeMic,
          });
          micStreamRef.current = micStream;
        } catch {
          if (includeCamera && includeMic) {
            try {
              micStream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: false,
              });
              micStreamRef.current = micStream;
            } catch {
              micStreamRef.current = null;
              micStream = null;
            }
          } else {
            micStreamRef.current = null;
            micStream = null;
          }
        }
      } else {
        micStreamRef.current = null;
      }

      if (includeCamera && micStream && micStream.getVideoTracks().length > 0) {
        setWebcamStream(new MediaStream(micStream.getVideoTracks()));
      } else {
        setWebcamStream(null);
      }

      const videoTracks = displayStream.getVideoTracks();
      const displayAudioTracks = displayStream.getAudioTracks();
      const hasDisplayAudio = displayAudioTracks.length > 0;
      const hasMic = !!(micStream && micStream.getAudioTracks().length > 0);

      let outputStream: MediaStream;

      if (!hasDisplayAudio && !hasMic) {
        outputStream = new MediaStream([...videoTracks]);
      } else {
        const ctx = new AudioContext();
        audioContextRef.current = ctx;
        if (ctx.state === "suspended") {
          await ctx.resume();
        }
        const dest = ctx.createMediaStreamDestination();

        if (hasDisplayAudio) {
          const da = new MediaStream(displayAudioTracks);
          ctx.createMediaStreamSource(da).connect(dest);
        }
        if (hasMic && micStream) {
          ctx.createMediaStreamSource(micStream).connect(dest);
        }

        const mixedAudio = dest.stream.getAudioTracks();
        outputStream = new MediaStream([...videoTracks, ...mixedAudio]);
      }

      outputStreamRef.current = outputStream;

      const mimeOpts = pickRecorderMimeType();
      const mimeType =
        "mimeType" in mimeOpts ? mimeOpts.mimeType : "video/webm";
      mimeTypeRef.current = mimeType;

      const recorder = new MediaRecorder(outputStream, mimeOpts);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onerror = () => {
        setError("Recording failed.");
        cleanupStreams();
        mediaRecorderRef.current = null;
        setStatus("idle");
        setElapsedSec(0);
      };

      recorder.onstop = () => {
        const chunks = chunksRef.current;
        chunksRef.current = [];
        const blob = new Blob(chunks, { type: mimeTypeRef.current });
        setLastBlob(blob);
        downloadBlob(blob);
        onSavedRef.current?.(blob);
        cleanupStreams();
        mediaRecorderRef.current = null;
        setModalOpen(false);
        setStatus("idle");
        setElapsedSec(0);
      };

      const onDisplayEnded = () => {
        if (mediaRecorderRef.current?.state === "recording") {
          setStatus("stopping");
          try {
            mediaRecorderRef.current.stop();
          } catch {
            /* onstop will still run or recorder inactive */
          }
        }
      };
      displayEndedHandlerRef.current = onDisplayEnded;
      videoTracks[0]?.addEventListener("ended", onDisplayEnded);

      recorder.start(1000);
      setStatus("recording");
      setElapsedSec(0);
      setModalOpen(false);
    } catch (e) {
      cleanupStreams();
      mediaRecorderRef.current = null;
      const name = e instanceof DOMException ? e.name : "";
      if (name === "NotAllowedError" || name === "AbortError") {
        setError("Screen share was cancelled.");
      } else {
        setError(e instanceof Error ? e.message : "Could not start recording.");
      }
      setStatus("idle");
    }
  }, [includeCamera, includeMic, cleanupStreams]);

  const openModal = useCallback(() => {
    setError(null);
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    if (status === "recording" || status === "stopping") {
      return;
    }
    setModalOpen(false);
    setError(null);
  }, [status]);

  const downloadAgain = useCallback(() => {
    if (lastBlob) {
      downloadBlob(lastBlob);
    }
  }, [lastBlob]);

  const isRecording = status === "recording" || status === "stopping";

  return {
    modalOpen,
    openModal,
    closeModal,
    includeMic,
    setIncludeMic,
    includeCamera,
    setIncludeCamera,
    webcamStream,
    startRecording,
    stopRecording,
    status,
    error,
    elapsedSec,
    lastBlob,
    downloadAgain,
    isRecording,
  };
}

export type ScreenRecorderApi = ReturnType<typeof useScreenRecorder>;
