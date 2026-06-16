// // FEATURE: Kompresi gambar client-side sebelum upload ke Storage.
// Tujuannya menjaga file bukti absensi/foto dokumen tetap jelas, tetapi ukuran turun drastis
// dari multi-MB menjadi ratusan KB agar web ringan di Vercel dan shared hosting.
const MAX_IMAGE_BYTES = 320 * 1024;
const MAX_EDGE = 1440;

function readImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Gagal membaca gambar.'));
    img.src = URL.createObjectURL(file);
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Gagal mengompres gambar.')), type, quality);
  });
}

export async function compressImageFile(file: File, maxBytes = MAX_IMAGE_BYTES) {
  if (!file.type.startsWith('image/')) return file;
  if (file.size <= maxBytes && file.type !== 'image/png') return file;

  const image = await readImage(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(image, 0, 0, width, height);

  let quality = 0.82;
  let blob = await canvasToBlob(canvas, 'image/webp', quality);
  while (blob.size > maxBytes && quality > 0.42) {
    quality -= 0.08;
    blob = await canvasToBlob(canvas, 'image/webp', quality);
  }
  const cleanName = file.name.replace(/\.[^.]+$/, '') || 'upload';
  return new File([blob], `${cleanName}.webp`, { type: 'image/webp', lastModified: Date.now() });
}
