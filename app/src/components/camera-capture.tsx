"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, ImageIcon, X, Zap, ZapOff } from "lucide-react";

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

const press = "transition-transform duration-150 ease-[var(--ease-out-custom)] active:scale-[0.97]";
const corner = "pointer-events-none absolute size-9 border-white/80";

export function CameraCapture({ onCapture, onClose, onGallery }: {
  onCapture: (file: File) => void;
  onClose: () => void;
  onGallery?: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const track = useRef<MediaStreamTrack | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(() => hasCamera() ? null : "This browser does not allow the camera on this page.");
  const [attempt, setAttempt] = useState(0);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [review, setReview] = useState<{ file: File; url: string } | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    const stop = () => { stream?.getTracks().forEach((t) => t.stop()); track.current = null; };
    if (!hasCamera()) return;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false })
      .then((s) => {
        if (cancelled) { s.getTracks().forEach((t) => t.stop()); return; }
        stream = s;
        track.current = s.getVideoTracks()[0] ?? null;
        setTorchSupported(Boolean((track.current?.getCapabilities?.() as { torch?: boolean } | undefined)?.torch));
        const el = video.current;
        if (!el) return;
        el.srcObject = s;
        void el.play().then(() => setReady(true)).catch((err) => { if (!cancelled) { stop(); setError(cameraError(err)); } });
      })
      .catch((err) => { if (!cancelled) setError(cameraError(err)); });
    return () => { cancelled = true; stop(); };
  }, [attempt]);

  // Android back gesture and Escape close the camera instead of leaving the page.
  useEffect(() => {
    window.history.pushState({ ...window.history.state, camera: true }, "");
    const onPop = () => onClose();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("popstate", onPop);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("keydown", onKey);
      if (window.history.state?.camera) window.history.back();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => { if (review) URL.revokeObjectURL(review.url); }, [review]);

  const snap = () => {
    const el = video.current;
    if (!el || !el.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = el.videoWidth;
    canvas.height = el.videoHeight;
    canvas.getContext("2d")?.drawImage(el, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `meal-${Date.now()}.jpg`, { type: "image/jpeg" });
      setReview({ file, url: URL.createObjectURL(file) });
    }, "image/jpeg", 0.9);
  };

  const toggleTorch = () => {
    const next = !torchOn;
    void track.current?.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] }).then(() => setTorchOn(next)).catch(() => setTorchSupported(false));
  };

  return createPortal(<div role="dialog" aria-modal="true" aria-label="Camera" className="fixed inset-0 z-[100] flex h-dvh flex-col bg-black text-white">
    <div className="relative min-h-0 flex-1">
      {error
        ? <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
          <p role="alert" className="text-sm">{error}</p>
          <button type="button" onClick={() => { setError(null); setAttempt((n) => n + 1); }} className={`min-h-11 rounded-xl bg-white/15 px-5 text-sm ${press}`}>Try again</button>
        </div>
        : <video ref={video} playsInline muted className="size-full object-cover" />}
      {!error && !review && <>
        <div className="pointer-events-none absolute inset-x-8 inset-y-24">
          <span className={`${corner} left-0 top-0 rounded-tl-xl border-l-2 border-t-2`} />
          <span className={`${corner} right-0 top-0 rounded-tr-xl border-r-2 border-t-2`} />
          <span className={`${corner} bottom-0 left-0 rounded-bl-xl border-b-2 border-l-2`} />
          <span className={`${corner} bottom-0 right-0 rounded-br-xl border-b-2 border-r-2`} />
        </div>
        <p className="pointer-events-none absolute inset-x-0 bottom-4 text-center text-sm text-white/85 [text-shadow:0_1px_6px_rgba(0,0,0,0.6)]">Frame the whole meal</p>
      </>}
      {review && <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={review.url} alt="Photo preview" className="absolute inset-0 size-full object-cover" />
      </>}
      <button type="button" aria-label="Close camera" onClick={onClose} className={`absolute left-4 top-[max(1rem,env(safe-area-inset-top))] flex size-11 items-center justify-center rounded-full bg-black/45 ${press}`}><X size={20} /></button>
      {torchSupported && !review && <button type="button" aria-label={torchOn ? "Turn flash off" : "Turn flash on"} onClick={toggleTorch} className={`absolute right-4 top-[max(1rem,env(safe-area-inset-top))] flex size-11 items-center justify-center rounded-full bg-black/45 ${press}`}>{torchOn ? <Zap size={20} /> : <ZapOff size={20} />}</button>}
    </div>
    {review
      ? <div className="flex items-center justify-between gap-3 px-6 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <button type="button" onClick={() => setReview(null)} className={`min-h-12 flex-1 rounded-xl bg-white/15 px-5 text-sm font-medium ${press}`}>Retake</button>
        <button type="button" onClick={() => onCapture(review.file)} className={`min-h-12 flex-1 rounded-xl bg-white px-5 text-sm font-medium text-black ${press}`}>Use photo</button>
      </div>
      : <div className="flex items-center justify-between px-6 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        {onGallery
          ? <button type="button" aria-label="Choose from gallery" onClick={onGallery} className={`flex size-12 items-center justify-center rounded-full bg-white/15 ${press}`}><ImageIcon size={20} /></button>
          : <span className="size-12" aria-hidden />}
        <button type="button" aria-label="Take photo" disabled={!ready} onClick={snap} className={`flex size-16 items-center justify-center rounded-full border-4 border-white bg-white/25 disabled:opacity-40 ${press}`}><Camera size={24} /></button>
        <span className="size-12" aria-hidden />
      </div>}
  </div>, document.body);
}
