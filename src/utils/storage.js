import { readStore, writeStore } from './persist';

const KEY = 'owned_cards';
const FAV_CARDS_KEY = 'favorite_cards';
const FAV_SETS_KEY = 'favorite_sets';

// ownedVal peut être : true (ancien format) | { graded: false } | { graded: true, company, grade, value? }
// avec en option, dans les deux formes objet : lang (code de langue) et price (prix constaté en €).
export function getGradingInfo(ownedVal) {
  if (ownedVal && typeof ownedVal === 'object' && ownedVal.graded === true) {
    return ownedVal; // { graded: true, company: 'PSA', grade: '10' }
  }
  return null;
}

export async function getOwnedCards() {
  const data = await readStore(KEY);
  return data ?? {};
}

export async function toggleCard(cardId) {
  const owned = await getOwnedCards();
  if (owned[cardId]) {
    delete owned[cardId];
  } else {
    owned[cardId] = true;
  }
  await writeStore(KEY, owned);
  return owned;
}

export async function setCardGrading(cardId, gradingData) {
  const owned = await getOwnedCards();
  if (!owned[cardId]) return owned;
  owned[cardId] = gradingData; // { graded: false } | { graded: true, company, grade }
  await writeStore(KEY, owned);
  return owned;
}

// ─── Favoris cartes ──────────────────────────────────────────────────────────
// Stocke { cardId: { id, name, number, images, set } } pour affichage offline

export async function getFavoriteCards() {
  const data = await readStore(FAV_CARDS_KEY);
  return data ?? {};
}

export async function toggleFavoriteCard(card) {
  const favs = await getFavoriteCards();
  if (favs[card.id]) {
    delete favs[card.id];
  } else {
    favs[card.id] = {
      id: card.id,
      name: card.name,
      number: card.number,
      images: card.images,
      set: card.set ? { id: card.set.id, name: card.set.name } : undefined,
    };
  }
  await writeStore(FAV_CARDS_KEY, favs);
  return favs;
}

// ─── Favoris produits ────────────────────────────────────────────────────────
const FAV_PRODUCTS_KEY = 'favorite_products';

export async function getFavoriteProducts() {
  const data = await readStore(FAV_PRODUCTS_KEY);
  return data ?? {};
}

export async function toggleFavoriteProduct(product) {
  const favs = await getFavoriteProducts();
  if (favs[product.id]) {
    delete favs[product.id];
  } else {
    favs[product.id] = {
      id: product.id,
      name: product.name,
      nameFr: product.nameFr,
      type: product.type,
      setId: product.setId,
      setName: product.setName,
      color: product.color,
    };
  }
  await writeStore(FAV_PRODUCTS_KEY, favs);
  return favs;
}

// ─── Produits possédés ──────────────────────────────────────────────────────
const OWNED_PRODUCTS_KEY = 'owned_products';

export async function getOwnedProducts() {
  const data = await readStore(OWNED_PRODUCTS_KEY);
  return data ?? {};
}

export async function toggleOwnedProduct(productId) {
  const owned = await getOwnedProducts();
  if (owned[productId]) {
    delete owned[productId];
  } else {
    owned[productId] = true;
  }
  await writeStore(OWNED_PRODUCTS_KEY, owned);
  return owned;
}

// ─── Favoris sets ────────────────────────────────────────────────────────────
// Stocke { setId: { id, name, series, total, images, releaseDate } }

export async function getFavoriteSets() {
  const data = await readStore(FAV_SETS_KEY);
  return data ?? {};
}

export async function toggleFavoriteSet(set) {
  const favs = await getFavoriteSets();
  if (favs[set.id]) {
    delete favs[set.id];
  } else {
    favs[set.id] = {
      id: set.id,
      name: set.name,
      series: set.series,
      total: set.total,
      images: set.images,
      releaseDate: set.releaseDate,
    };
  }
  await writeStore(FAV_SETS_KEY, favs);
  return favs;
}

// ─── Cartes perso et photos ──────────────────────────────────────────────────
// Cartes absentes de la base, saisies par le collectionneur : { id: carte }.
const CUSTOM_CARDS_KEY = 'custom_cards';
// Photo prise par le collectionneur, pour n'importe quelle carte : { id: image JPEG en data URL }.
const CARD_PHOTOS_KEY = 'card_photos';

export async function getCustomCards() {
  return (await readStore(CUSTOM_CARDS_KEY)) ?? {};
}

export async function saveCustomCard(card) {
  const cards = await getCustomCards();
  cards[card.id] = card;
  await writeStore(CUSTOM_CARDS_KEY, cards);
  return cards;
}

export async function deleteCustomCard(cardId) {
  const cards = await getCustomCards();
  delete cards[cardId];
  await writeStore(CUSTOM_CARDS_KEY, cards);
  return cards;
}

export async function getCardPhotos() {
  return (await readStore(CARD_PHOTOS_KEY)) ?? {};
}

/** `photo` : data URL JPEG, ou null pour retirer la photo. */
export async function setCardPhoto(cardId, photo) {
  const photos = await getCardPhotos();
  if (photo) photos[cardId] = photo; else delete photos[cardId];
  await writeStore(CARD_PHOTOS_KEY, photos);
  return photos;
}
