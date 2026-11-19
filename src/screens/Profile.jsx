import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, CloudUpload, Eye, ImagePlus, LogOut, Pencil, Sparkles, Trash2, Users } from 'lucide-react';
import { useCollection } from '../store/collection';
import { useProfile } from '../store/profile';
import { useLang, LANGUAGES } from '../utils/LanguageContext.jsx';
import { pushAllToRemote } from '../utils/persist';
import { signOut, supabase } from '../utils/supabase';
import { cardSnapshot, DEFAULT_SETTINGS, getFollowerCount, USERNAME_RE } from '../lib/community';
import { AVATAR, BANNER, cardImage, croppedFromFile } from '../lib/photos';
import { loadCardsByIds, useSets } from '../lib/tcg';
import { getLocalizedSetName } from '../utils/setNames';
import { Avatar, ProfileHeader, SHOWCASE_MAX, ShareButton, Showcase } from '../components/profile';
import { CardPlaceholder } from '../components/cards';
import { Confirm, Empty, Loading, Page, SearchField, Segmented, Sheet, TopBar } from '../components/ui';

const LANG_NOTE = {
  fr: 'Noms des extensions affichés en français. Les visuels des cartes restent en anglais (les numéros sont identiques).',
  ja: 'Les sets japonais ne sont pas disponibles : visuels en anglais, numéros identiques.',
};

const SECTIONS = [
  ['collection', 'Cartes possédées'],
  ['lists', 'Listes'],
  ['favorites', 'Favoris'],
  ['value', 'Valeur de la collection'],
];

/** « Paul Guttin » → « paul.guttin » : une proposition de pseudo valide. */
const suggestUsername = (text) => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\s+/g, '.').replace(/[^a-z0-9_.]/g, '').slice(0, 20);

function Switch({ label, hint, checked, onChange, disabled }) {
  return (
    <label className="switch-row">
      <span>
        {label}
        {hint && <span className="tiny dim" style={{ display: 'block' }}>{hint}</span>}
      </span>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

// ─── Création du profil ──────────────────────────────────────────────────────
function CreateProfile({ email }) {
  const { save } = useProfile();
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [touched, setTouched] = useState(false);
  const [isPublic, setIsPublic] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const shown = touched ? username : suggestUsername(displayName || (email || '').split('@')[0]);

  const create = async () => {
    setSaving(true);
    setError(null);
    try {
      await save({ username: shown, displayName: displayName.trim() || shown, isPublic, settings: DEFAULT_SETTINGS, showcase: [] });
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  return (
    <div className="card card-pad stack" style={{ gap: 12 }}>
      <div className="row" style={{ gap: 12 }}>
        <Users size={22} />
        <div>
          <b>Crée ton profil</b>
          <p className="small muted">Montre ton classeur à la communauté et découvre celui des autres.</p>
        </div>
      </div>
      <label className="stack" style={{ gap: 6 }}>
        <span className="label" style={{ margin: 0 }}>Nom affiché</span>
        <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={40} placeholder="Ex : Paul" />
      </label>
      <label className="stack" style={{ gap: 6 }}>
        <span className="label" style={{ margin: 0 }}>Pseudo</span>
        <input
          className="input" value={shown} maxLength={20} autoCapitalize="off" autoCorrect="off" spellCheck={false}
          onChange={(e) => { setTouched(true); setUsername(e.target.value.toLowerCase()); }}
          placeholder="Ex : paul.dex"
        />
        <span className="tiny dim">3 à 20 caractères : lettres minuscules, chiffres, « _ » ou « . »</span>
      </label>
      <Switch label="Profil public" hint="Visible par tous dans la communauté. Modifiable à tout moment." checked={isPublic} onChange={setIsPublic} />
      {error && <p className="small" style={{ color: 'var(--danger)' }}>{error}</p>}
      <button className="btn btn-violet btn-block" disabled={!USERNAME_RE.test(shown) || saving} onClick={create}>Créer mon profil</button>
    </div>
  );
}

// ─── Modification ────────────────────────────────────────────────────────────
function EditProfileSheet({ profile, onClose }) {
  const { save } = useProfile();
  const { sets } = useSets();
  const { lang } = useLang();
  const [form, setForm] = useState({
    displayName: profile.displayName, username: profile.username, bio: profile.bio, avatar: profile.avatar, banner: profile.banner,
  });
  const [favoriteSet, setFavoriteSet] = useState(profile.settings.favoriteSet ?? '');
  // Extensions groupées par série, dans l'ordre de la page des extensions.
  const series = useMemo(() => {
    const groups = new Map();
    for (const set of sets) (groups.get(set.series) ?? groups.set(set.series, []).get(set.series)).push(set);
    return [...groups];
  }, [sets]);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const avatarInput = useRef(null);
  const bannerInput = useRef(null);
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const pick = (key, spec) => async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try { set(key, await croppedFromFile(file, spec)); setError(null); } catch (_) { setError('Image illisible.'); }
  };

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const settings = { ...profile.settings };
      if (favoriteSet) settings.favoriteSet = favoriteSet; else delete settings.favoriteSet;
      await save({ ...form, username: form.username.trim(), displayName: form.displayName.trim(), bio: form.bio.trim(), settings });
      onClose();
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  return (
    <Sheet
      title="Modifier le profil" onClose={onClose} tall
      footer={<button className="btn btn-violet grow" disabled={saving || !USERNAME_RE.test(form.username.trim())} onClick={submit}>Enregistrer</button>}
    >
      <div className="stack" style={{ gap: 14 }}>
        <div>
          <p className="label">Bannière</p>
          <button type="button" className="banner-pick" onClick={() => bannerInput.current?.click()} aria-label="Choisir une bannière">
            {form.banner ? <img src={form.banner} alt="" /> : <span className="row" style={{ justifyContent: 'center', height: '100%', gap: 8 }}><ImagePlus size={20} /> Choisir une image</span>}
          </button>
          {form.banner && <button className="link" style={{ marginTop: 6 }} onClick={() => set('banner', null)}>Retirer la bannière</button>}
          <input ref={bannerInput} type="file" accept="image/*" hidden onChange={pick('banner', BANNER)} />
        </div>
        <div className="row" style={{ gap: 14 }}>
          <Avatar profile={{ ...profile, avatar: form.avatar, displayName: form.displayName }} size={72} />
          <div className="stack" style={{ gap: 6 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => avatarInput.current?.click()}><Camera size={15} /> Photo de profil</button>
            {form.avatar && <button className="link" onClick={() => set('avatar', null)}>Retirer la photo</button>}
          </div>
          <input ref={avatarInput} type="file" accept="image/*" hidden onChange={pick('avatar', AVATAR)} />
        </div>
        <label className="stack" style={{ gap: 6 }}>
          <span className="label" style={{ margin: 0 }}>Nom affiché</span>
          <input className="input" value={form.displayName} maxLength={40} onChange={(e) => set('displayName', e.target.value)} />
        </label>
        <label className="stack" style={{ gap: 6 }}>
          <span className="label" style={{ margin: 0 }}>Pseudo</span>
          <input
            className="input" value={form.username} maxLength={20} autoCapitalize="off" autoCorrect="off" spellCheck={false}
            onChange={(e) => set('username', e.target.value.toLowerCase())}
          />
          <span className="tiny dim">3 à 20 caractères : lettres minuscules, chiffres, « _ » ou « . »</span>
        </label>
        <label className="stack" style={{ gap: 6 }}>
          <span className="label" style={{ margin: 0 }}>Bio</span>
          <textarea className="input" rows={3} maxLength={200} value={form.bio} onChange={(e) => set('bio', e.target.value)} placeholder="Ce que tu collectionnes, ce que tu recherches…" style={{ resize: 'vertical', paddingTop: 10 }} />
          <span className="tiny dim" style={{ textAlign: 'right' }}>{form.bio.length} / 200</span>
        </label>
        <label className="stack" style={{ gap: 6 }}>
          <span className="label" style={{ margin: 0 }}>Set préféré</span>
          <select className="input" value={favoriteSet} onChange={(e) => setFavoriteSet(e.target.value)}>
            <option value="">— Aucun —</option>
            {series.map(([name, list]) => (
              <optgroup key={name} label={name}>
                {list.map((set) => <option key={set.id} value={set.id}>{getLocalizedSetName(set.name, lang)}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
        {error && <p className="small" style={{ color: 'var(--danger)' }}>{error}</p>}
      </div>
    </Sheet>
  );
}

// ─── Choix des 3 cartes mises en avant ───────────────────────────────────────
function ShowcasePicker({ current, onClose }) {
  const { owned, customCards, cardPhotos } = useCollection();
  const { save } = useProfile();
  const [cards, setCards] = useState(null);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState(() => current.map((c) => c.id));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    loadCardsByIds(Object.keys(owned)).then(({ map }) => {
      if (!alive) return;
      const all = { ...map };
      for (const [id, card] of Object.entries(customCards)) if (owned[id]) all[id] = card;
      setCards(Object.values(all).sort((a, b) => a.name.localeCompare(b.name)));
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (cards || []).filter((c) => !q || c.name.toLowerCase().includes(q) || (c.set?.name || '').toLowerCase().includes(q));
  }, [cards, query]);

  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < SHOWCASE_MAX ? [...p, id] : p));

  const submit = async () => {
    setSaving(true);
    const byId = Object.fromEntries((cards || []).map((c) => [c.id, c]));
    const showcase = picked.map((id) => byId[id] ?? current.find((c) => c.id === id)).filter(Boolean).map((card) => {
      const snap = cardSnapshot(card);
      // La photo perso de la carte est publiée avec elle (sinon, l'image officielle).
      return cardPhotos[card.id] ? { ...snap, images: { small: cardPhotos[card.id] } } : snap;
    });
    setError(null);
    try {
      await save({ showcase });
      onClose();
    } catch (e) {
      setError(`Enregistrement impossible : ${e.message}`);
      setSaving(false);
    }
  };

  return (
    <Sheet
      title="Ma vitrine" onClose={onClose} tall
      footer={<button className="btn btn-violet grow" disabled={saving} onClick={submit}>Enregistrer ({picked.length} / {SHOWCASE_MAX})</button>}
    >
      <div className="stack" style={{ gap: 12 }}>
        <p className="small muted">Jusqu'à {SHOWCASE_MAX} cartes, dans l'ordre où tu les touches. Sans vitrine, ton profil montre tes favoris.</p>
        {error && <p className="small" style={{ color: 'var(--danger)' }}>{error}</p>}
        <SearchField value={query} onChange={setQuery} placeholder="Chercher dans ma collection" />
        {!cards && <Loading label="Chargement de ta collection…" />}
        {cards && !cards.length && <Empty title="Aucune carte" text="Ajoute des cartes à ta collection pour les mettre en avant." />}
        <div className="card-grid">
          {shown.map((card) => {
            const n = picked.indexOf(card.id);
            const image = cardImage(card, cardPhotos);
            return (
              <button key={card.id} className="ctile" onClick={() => toggle(card.id)} aria-pressed={n >= 0} style={{ textAlign: 'left' }}>
                <span className="ctile-img is-loaded" style={n >= 0 ? { outline: '3px solid var(--signal)', outlineOffset: 2 } : undefined}>
                  {image ? <img src={image} alt="" loading="lazy" /> : <CardPlaceholder card={card} />}
                  {n >= 0 && <span className="pick-check">{n + 1}</span>}
                </span>
                <span className="ctile-cap"><b className="clamp1">{card.name}</b><span className="clamp1">{card.set?.label || card.set?.name}</span></span>
              </button>
            );
          })}
        </div>
      </div>
    </Sheet>
  );
}

// ─── Réglages (ex « Mon compte ») ────────────────────────────────────────────
function Settings({ email, guest }) {
  const { lang, setLang } = useLang();
  const [sync, setSync] = useState(null); // null | 'busy' | 'ok' | 'err'

  const push = async () => {
    setSync('busy');
    const ok = await pushAllToRemote();
    setSync(ok ? 'ok' : 'err');
    setTimeout(() => setSync(null), 2500);
  };

  return (
    <section className="section">
      <h2 className="h2" style={{ marginBottom: 10 }}>Paramètres</h2>
      <div className="stack" style={{ gap: 14 }}>
        <div className="card card-pad">
          <p className="tiny dim">Connecté en tant que</p>
          <b className="clamp1">{email ?? '—'}</b>
        </div>
        <div>
          <p className="label">Langue des extensions</p>
          <Segmented options={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))} value={lang} onChange={setLang} />
          {LANG_NOTE[lang] && <p className="tiny dim" style={{ marginTop: 8 }}>{LANG_NOTE[lang]}</p>}
        </div>
        {!!supabase && !guest && (
          <button className="btn btn-soft btn-block" onClick={push} disabled={sync === 'busy'}>
            <CloudUpload size={18} />
            {sync === 'busy' ? 'Envoi en cours…' : sync === 'ok' ? 'Données envoyées' : sync === 'err' ? "Échec de l'envoi" : 'Forcer la synchronisation'}
          </button>
        )}
        <button className="btn btn-danger btn-block" onClick={async () => { await signOut(); window.location.reload(); }}>
          <LogOut size={18} /> Se déconnecter
        </button>
        <p className="tiny dim" style={{ textAlign: 'center', fontFamily: 'var(--mono)' }}>Dexup v{__APP_VERSION__}</p>
      </div>
    </section>
  );
}

// ─── Écran ───────────────────────────────────────────────────────────────────
export default function Profile({ email }) {
  const navigate = useNavigate();
  const { status, profile, error, guest, save, remove, reload, userId } = useProfile();
  const [followers, setFollowers] = useState(null);
  useEffect(() => {
    if (status !== 'ready') return;
    getFollowerCount(userId).then(setFollowers).catch(() => {});
  }, [status, userId]);
  const [sheet, setSheet] = useState(null); // edit | showcase | delete
  const [saveError, setSaveError] = useState(null);

  // Réglage enregistré tout de suite ; en cas d'échec, l'interrupteur revient et l'erreur s'affiche.
  const update = async (fields) => {
    setSaveError(null);
    try { await save(fields); } catch (e) { setSaveError(`Enregistrement impossible : ${e.message}`); }
  };
  const setSetting = (key, value) => update({ settings: { ...profile.settings, [key]: value } });

  return (
    <Page>
      <TopBar title="Profil" back="/community" />
      {guest && <p className="tiny dim" style={{ marginBottom: 12 }}>Mode invité : profils de démonstration enregistrés sur cet appareil.</p>}

      {status === 'loading' && <Loading />}
      {status === 'unavailable' && (
        <Empty icon={Users} title="Communauté bientôt disponible" text="Les profils ne sont pas encore activés sur le serveur." />
      )}
      {status === 'error' && (
        <Empty icon={Users} title="Profil indisponible" text={error || 'Vérifie ta connexion internet puis réessaie.'}>
          <button className="btn btn-dark" onClick={reload}>Réessayer</button>
        </Empty>
      )}
      {status === 'none' && <CreateProfile email={email} />}

      {status === 'ready' && profile && (
        <>
          <ProfileHeader profile={profile} followers={followers} action={<ShareButton profile={profile} />}>
            <button className="btn btn-dark btn-sm" onClick={() => setSheet('edit')}><Pencil size={15} /> Modifier</button>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/community/${profile.username}`)}><Eye size={15} /> Voir mon profil public</button>
          </ProfileHeader>

          <section className="section">
            <div className="section-head">
              <h2 className="h2">Ma vitrine</h2>
              <button className="link" onClick={() => setSheet('showcase')}>{profile.showcase.length ? 'Modifier' : 'Choisir'}</button>
            </div>
            <Showcase
              cards={profile.showcase}
              empty={(
                <button className="card card-pad row" style={{ width: '100%', gap: 12, textAlign: 'left' }} onClick={() => setSheet('showcase')}>
                  <Sparkles size={22} />
                  <span><b>Mets jusqu'à {SHOWCASE_MAX} cartes en vitrine</b><span className="small muted" style={{ display: 'block' }}>Elles apparaissent sur ton profil. Sans vitrine, ce sont tes favoris qui s'affichent.</span></span>
                </button>
              )}
            />
          </section>

          <section className="section">
            <h2 className="h2" style={{ marginBottom: 10 }}>Visibilité</h2>
            <div className="card card-pad">
              <Switch
                label="Profil public" checked={profile.isPublic} onChange={(v) => update({ isPublic: v })}
                hint={profile.isPublic ? 'Visible dans la communauté.' : 'Personne ne voit ton profil.'}
              />
              {SECTIONS.map(([key, label]) => (
                <Switch key={key} label={`Montrer : ${label.toLowerCase()}`} checked={profile.settings[key] !== false} disabled={!profile.isPublic} onChange={(v) => setSetting(key, v)} />
              ))}
            </div>
            {saveError && <p className="small" style={{ color: 'var(--danger)', marginTop: 8 }}>{saveError}</p>}
            <p className="tiny dim" style={{ marginTop: 8 }}>Ta collection publique se met à jour toute seule quand tu ajoutes ou retires une carte.</p>
          </section>
        </>
      )}

      <Settings email={email} guest={guest} />

      {status === 'ready' && (
        <button className="btn btn-ghost btn-block" style={{ marginTop: 18, color: 'var(--danger)' }} onClick={() => setSheet('delete')}>
          <Trash2 size={16} /> Supprimer mon profil
        </button>
      )}

      {sheet === 'edit' && <EditProfileSheet profile={profile} onClose={() => setSheet(null)} />}
      {sheet === 'showcase' && <ShowcasePicker current={profile.showcase} onClose={() => setSheet(null)} />}
      {sheet === 'delete' && (
        <Confirm
          title="Supprimer ton profil ?"
          message="Ton profil public, ta photo, ta bannière et tes cartes mises en avant seront supprimés. Ta collection, elle, reste intacte."
          confirmLabel="Supprimer" onConfirm={remove} onClose={() => setSheet(null)}
        />
      )}
    </Page>
  );
}
