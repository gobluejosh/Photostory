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

export async function processPhotos(files: File[]): Promise<Photo[]> {
  const photos: Photo[] = [];

  for (const file of files) {
    if (!file.type.startsWith("image/")) continue;

    const fullDataUrl = await readFileAsDataUrl(file);

    // Create thumbnail for Claude (small, ~512px)
    const thumbnail = await resizeImage(fullDataUrl, 512, 512);

    // Create display version (reasonable size)
    const display = await resizeImage(fullDataUrl, 1200, 1200);

    photos.push({
      id: generateId(),
      file,
      fileName: file.name,
      thumbnailDataUrl: thumbnail.dataUrl,
      fullDataUrl: display.dataUrl,
      width: display.width,
      height: display.height,
    });
  }

  return photos;
}
