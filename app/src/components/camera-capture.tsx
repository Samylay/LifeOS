"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, X } from "lucide-react";

// Live camera viewfinder. `<input capture>` is only a hint, and many browsers
// fall back to the photo gallery, so this opens the camera stream directly.
// `onUnavailable` fires when there is no camera API (for example a non-HTTPS
// origin) or permission is denied, so the caller can fall back to the file input.
export function CameraCapture({ onCapture, onClose, onUnavailable }: {
  onCapture: (file: File) => void;
  onClose: () => void;
  onUnavailable: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    if (!navigator.mediaDevices?.getUserMedia) { onUnavailable(); return; }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false })
      .then((s) => {
        if (cancelled) { s.getTracks().forEach((t) => t.stop()); return; }
        stream = s;
        const el = video.current;
        if (!el) return;
        el.srcObject = s;
        void el.play().then(() => setReady(true)).catch(() => onUnavailable());
      })
      .catch(() => { if (!cancelled) onUnavailable(); });
    return () => { cancelled = true; stream?.getTracks().forEach((t) => t.stop()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    <video ref={video} playsInline muted className="min-h-0 w-full flex-1 object-cover" />
    <div className="flex items-center justify-between px-6 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      <button type="button" aria-label="Close camera" onClick={onClose} className="flex size-12 items-center justify-center rounded-full bg-white/15 text-white transition-transform duration-150 ease-[var(--ease-out-custom)] active:scale-[0.97]"><X size={20} /></button>
      <button type="button" aria-label="Take photo" disabled={!ready} onClick={snap} className="flex size-16 items-center justify-center rounded-full border-4 border-white bg-white/25 text-white transition-transform duration-150 ease-[var(--ease-out-custom)] active:scale-[0.97] disabled:opacity-40"><Camera size={24} /></button>
      <span className="size-12" aria-hidden />
    </div>
  </div>;
}
