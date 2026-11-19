// Comptes de l'équipe Dexup, signalés par un badge « Dexup Team » sur leur profil.
// Identifiés par leur identifiant de compte Supabase (auth.users.id), qui ne change jamais et
// qu'aucun utilisateur ne peut choisir — contrairement au pseudo. Pour ajouter quelqu'un :
// son identifiant se lit dans Supabase → Authentication → Users, ou dans la table pokecollect_profiles.
export const TEAM = new Set([
  'ae2876c1-c9d5-4181-9391-2a5aa588daff', // @paul
]);

// En développement, le compte invité en fait partie, pour voir le badge dans l'aperçu.
if (import.meta.env.DEV) TEAM.add('guest');

export const isTeam = (userId) => !!userId && TEAM.has(userId);
