// Réseaux sociaux affichés sur un profil : on garde le pseudo seul (sans @), le lien se reconstruit.
export const SOCIALS = [
  { key: 'x', label: 'X (Twitter)', placeholder: '@pseudo', re: /^[A-Za-z0-9_]{1,15}$/, hosts: /(?:x|twitter)\.com/i, url: (h) => `https://x.com/${h}` },
  { key: 'instagram', label: 'Instagram', placeholder: '@pseudo', re: /^[A-Za-z0-9._]{1,30}$/, hosts: /instagram\.com/i, url: (h) => `https://www.instagram.com/${h}/` },
];

/** Pseudo tiré de ce qu'on a tapé : « @pseudo », « pseudo » ou un lien collé (x.com/pseudo…).
 *  '' = champ vide ; null = pseudo invalide. */
export function parseHandle(social, input) {
  let v = (input || '').trim();
  if (!v) return '';
  const link = v.match(/^(?:https?:\/\/)?(?:www\.|mobile\.)?([^/]+)\/(?:@)?([^/?#]+)/i);
  if (link) {
    if (!social.hosts.test(link[1])) return null;
    v = link[2];
  }
  v = v.replace(/^@/, '');
  return social.re.test(v) ? v : null;
}
