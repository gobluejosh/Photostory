"use client";

import { Photo } from "./types";

let idCounter = 0;

function generateId(): string {
  return `photo_${Date.now()}_${idCounter++}`;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function resizeImage(
  dataUrl: string,
  maxWidth: number,
  maxHeight: number
): Promise<{ dataUrl: string; width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);
      resolve({
        dataUrl: canvas.toDataURL("image/jpeg", 0.8),
        width,
        height,
      });
    };
    img.src = dataUrl;
  });
}

function dataUrlToFile(dataUrl: string, fileName: string): File {
  const [header, base64] = dataUrl.split(",");
  const mime = header.match(/:(.*?);/)?.[1] || "image/jpeg";
  const binary = atob(base64);
  const array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    array[i] = binary.charCodeAt(i);
  }
  return new File([array], fileName, { type: mime });
}

async function uploadToBlob(photoId: string, file: File): Promise<string | null> {
  try {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("photoId", photoId);

    const res = await fetch("/api/upload", { method: "POST", body: formData });
    if (!res.ok) return null;
    const data = await res.json();
    return data.url || null;
  } catch {
    return null;
  }
}

// Yield to the browser so the UI stays responsive during heavy processing
function yieldToMain(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export async function processPhotos(files: File[]): Promise<Photo[]> {
  const photos: Photo[] = [];

  for (const file of files) {
    if (!file.type.startsWith("image/")) continue;

    try {
      const id = generateId();
      const fullDataUrl = await readFileAsDataUrl(file);

      await yieldToMain();

      // Create thumbnail for Claude (small, ~512px) — kept as base64 in memory
      const thumbnail = await resizeImage(fullDataUrl, 512, 512);

      // Create display version and try uploading to Vercel Blob
      const display = await resizeImage(fullDataUrl, 1600, 1600);

      await yieldToMain();

      const displayFile = dataUrlToFile(display.dataUrl, file.name);
      const blobUrl = await uploadToBlob(id, displayFile);

      // Fall back to data URL if Blob upload isn't available
      const fullUrl = blobUrl || display.dataUrl;

      photos.push({
        id,
        file: null,
        fileName: file.name,
        thumbnailDataUrl: thumbnail.dataUrl,
        fullUrl,
        width: display.width,
        height: display.height,
      });
    } catch (err) {
      console.error(`Failed to process ${file.name}:`, err);
      // Skip this photo but continue with others
    }
  }

  return photos;
}
