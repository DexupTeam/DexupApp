// Photos de cartes prises par le collectionneur : réduites et compressées avant d'être enregistrées
// (elles sont synchronisées avec le compte, chaque octet compte).
const MAX_HEIGHT = 560;
const QUALITY = 0.72;

/** Fichier image → data URL JPEG d'au plus MAX_HEIGHT pixels de haut (≈ 30-50 Ko). */
export async function photoFromFile(file) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, MAX_HEIGHT / bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', QUALITY);
}

/** Image à afficher pour une carte : la photo du collectionneur d'abord, sinon l'image officielle. */
export const cardImage = (card, photos, size = 'small') => photos?.[card.id]
  ?? (size === 'large' ? card.images?.large ?? card.images?.small : card.images?.small) ?? null;
