"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, X } from "lucide-react";

// Live camera viewfinder. `<input capture>` is only a hint, and many browsers
// fall back to the photo gallery, so this opens the camera stream directly.
// There is deliberately no file-input fallback: it opens the gallery or the
// system camera app, which saves the photo to the phone. When the camera cannot
// start, the dialog says why and offers a retry.
const hasCamera = () => typeof navigator.mediaDevices?.getUserMedia === "function";

function cameraError(err: unknown) {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "Camera access is blocked. Allow Camera for this site in your browser settings, then tap Try again.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No camera was found on this device.";
  if (name === "NotReadableError") return "Another app is using the camera. Close it, then tap Try again.";
  return `The camera could not start${name ? ` (${name})` : ""}.`;
}

export function CameraCapture({ onCapture, onClose }: {
  onCapture: (file: File) => void;
  onClose: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(() => hasCamera() ? null : "This browser does not allow the camera on this page.");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    if (!hasCamera()) return;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false })
      .then((s) => {
        if (cancelled) { s.getTracks().forEach((t) => t.stop()); return; }
        stream = s;
        const el = video.current;
        if (!el) return;
        el.srcObject = s;
        void el.play().then(() => setReady(true)).catch((err) => { if (!cancelled) setError(cameraError(err)); });
      })
      .catch((err) => { if (!cancelled) setError(cameraError(err)); });
    return () => { cancelled = true; stream?.getTracks().forEach((t) => t.stop()); };
  }, [attempt]);

  const snap = () => {
    const el = video.current;
    if (!el || !el.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = el.videoWidth;
    canvas.height = el.videoHeight;
    canvas.getContext("2d")?.drawImage(el, 0, 0);
    canvas.toBlob((blob) => {
      if (blob) onCapture(new File([blob], `meal-${Date.now()}.jpg`, { type: "image/jpeg" }));
    }, "image/jpeg", 0.9);
  };

  return <div role="dialog" aria-modal="true" aria-label="Camera" className="fixed inset-0 z-50 flex flex-col bg-black">
    {error
      ? <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-8 text-center text-white">
        <p role="alert" className="text-sm">{error}</p>
        <button type="button" onClick={() => { setError(null); setAttempt((n) => n + 1); }} className="min-h-11 rounded-xl bg-white/15 px-5 text-sm transition-transform duration-150 ease-[var(--ease-out-custom)] active:scale-[0.97]">Try again</button>
      </div>
      : <video ref={video} playsInline muted className="min-h-0 w-full flex-1 object-cover" />}
    <div className="flex items-center justify-between px-6 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      <button type="button" aria-label="Close camera" onClick={onClose} className="flex size-12 items-center justify-center rounded-full bg-white/15 text-white transition-transform duration-150 ease-[var(--ease-out-custom)] active:scale-[0.97]"><X size={20} /></button>
      <button type="button" aria-label="Take photo" disabled={!ready} onClick={snap} className="flex size-16 items-center justify-center rounded-full border-4 border-white bg-white/25 text-white transition-transform duration-150 ease-[var(--ease-out-custom)] active:scale-[0.97] disabled:opacity-40"><Camera size={24} /></button>
      <span className="size-12" aria-hidden />
    </div>
  </div>;
}
