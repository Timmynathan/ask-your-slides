// Phone photos are 3–5 MB; shrunk in the browser to a 1600 px long edge (JPEG) they are a few
// hundred KB: quicker on mobile data and the right size for reading. Used by Upload and the chat box.
const LONG_EDGE = 1600;

export async function shrinkImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error(`"${file.name}" can't be opened. Use a JPEG or PNG photo.`);
  });
  const scale = Math.min(1, LONG_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't prepare that photo."))), "image/jpeg", 0.82));
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Couldn't read that photo."));
    r.readAsDataURL(blob);
  });
}
