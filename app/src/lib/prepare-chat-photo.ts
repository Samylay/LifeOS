/** Resize before upload to keep camera photos quick on mobile connections. */
export async function prepareChatPhoto(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) throw new Error("Choose a photo");
  if (file.size > 30_000_000) throw new Error("Choose a photo smaller than 30 MB");
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch { throw new Error("This photo format isn't supported. Choose a JPEG, PNG or WebP image."); }
  try {
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Couldn't prepare this photo");
    context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Couldn't prepare this photo")), "image/jpeg", 0.85));
    if (blob.size > 2_500_000) throw new Error("Photo is too large. Choose a smaller image.");
    return new File([blob], "meal.jpg", { type: "image/jpeg" });
  } finally { bitmap.close(); }
}
