import React, { useEffect, useState } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { BookMarked, Home as HomeIcon, LayoutGrid, ScanLine, Search as SearchIcon, Users, ChartLine } from './components/icons';
import { LanguageProvider } from './utils/LanguageContext.jsx';
import { syncLocalOwner } from './utils/persist';
import { recoveryLink, supabase } from './utils/supabase';
import { CollectionProvider, useCollection } from './store/collection';
import { ProfileProvider, useProfile } from './store/profile';
import Auth, { NewPassword, Splash } from './components/Auth';
import CardSheet from './components/CardSheet';
import Logo from './components/Logo';
import { Avatar } from './components/profile';
import Home from './screens/Home';
import Sets from './screens/Sets';
import SetDetail from './screens/SetDetail';
import Search from './screens/Search';
import Scan from './screens/Scan';
import Binder from './screens/Binder';
import ListDetail from './screens/ListDetail';
import { Collection, Graded } from './screens/Collection';
import Products from './screens/Products';
import Finance from './screens/Finance';
import Profile from './screens/Profile';
import Community, { PublicProfile } from './screens/Community';

const TABS = [
  { path: '/', label: 'Accueil', Icon: HomeIcon, match: (p) => p === '/' || p.startsWith('/products') },
  { path: '/sets', label: 'Extensions', Icon: LayoutGrid, match: (p) => p.startsWith('/sets') },
  { path: '/scan', label: 'Scanner', Icon: ScanLine, match: (p) => p.startsWith('/scan'), primary: true },
  { path: '/search', label: 'Recherche', Icon: SearchIcon, match: (p) => p.startsWith('/search') },
  { path: '/binder', label: 'Classeur', Icon: BookMarked, match: (p) => p.startsWith('/binder') },
  { path: '/finance', label: 'Finance', Icon: ChartLine, match: (p) => p.startsWith('/finance') },
  { path: '/community', label: 'Communauté', Icon: Users, match: (p) => p.startsWith('/community') || p.startsWith('/profile') },
];

// Barre du bas (téléphone) : la recherche s'ouvre depuis le champ en haut de l'accueil, Finance prend sa place.
const TAB_BAR = ['/', '/sets', '/scan', '/finance', '/binder', '/community'].map((path) => TABS.find((t) => t.path === path));

function TabBar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  return (
    <nav className="tabbar" aria-label="Navigation principale">
      {TAB_BAR.map(({ path, label, Icon, match, primary }) => {
        const active = match(pathname) || (path === '/' && pathname.startsWith('/search')); // ouverte depuis l'accueil
        return (
          <button
            key={path}
            className={`tab${primary ? ' tab-scan' : ''}${active ? ' is-active' : ''}`}
            aria-current={active ? 'page' : undefined}
            aria-label={label}
            onClick={() => navigate(path)}
          >
            {/* Barre du bas (téléphone) : icônes seules ; le nom reste lu par les lecteurs d'écran. */}
            <Icon size={primary ? 28 : 26} />
          </button>
        );
      })}
    </nav>
  );
}

function Sidebar({ email }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { profile } = useProfile();
  return (
    <aside className="sidebar">
      <div className="sidebar-brand"><Logo size={28} />Dexup</div>
      {TABS.map(({ path, label, Icon, match }) => {
        const active = match(pathname);
        return (
          <button
            key={path} className={`side-link${active ? ' is-active' : ''}`}
            aria-current={active ? 'page' : undefined} onClick={() => navigate(path)}
          >
            <Icon size={20} /> {label}
          </button>
        );
      })}
      <button
        className={`side-link sidebar-foot${pathname.startsWith('/profile') ? ' is-active' : ''}`}
        onClick={() => navigate('/profile')}
      >
        <Avatar profile={profile} size={26} />
        <span className="clamp1 small">{profile ? `@${profile.username}` : email ?? 'Mon profil'}</span>
      </button>
    </aside>
  );
}

function Shell({ session }) {
  const { pathname } = useLocation();
  const { closeCard } = useCollection();

  // Une fiche ouverte ne doit pas rester par-dessus la page suivante.
  useEffect(() => {
    closeCard();
  }, [pathname, closeCard]);

  return (
    <div className="app">
      <Sidebar email={session.user?.email} />
      <main className="main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/sets" element={<Sets />} />
          <Route path="/sets/:setId" element={<SetDetail />} />
          <Route path="/search" element={<Search />} />
          <Route path="/scan" element={<Scan />} />
          <Route path="/binder" element={<Binder />} />
          <Route path="/binder/collection" element={<Collection />} />
          <Route path="/binder/graded" element={<Graded />} />
          <Route path="/binder/list/:listId" element={<ListDetail />} />
          <Route path="/products" element={<Products />} />
          <Route path="/finance" element={<Finance />} />
          <Route path="/profile" element={<Profile email={session.user?.email} />} />
          <Route path="/community" element={<Community />} />
          <Route path="/community/:username" element={<PublicProfile />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <TabBar />
      <CardSheet />
    </div>
  );
}

const GUEST = { user: { id: 'guest', email: 'Mode invité (local)' } };
// Sans Supabase, ou en dev avec ?guest=1 : l'app tourne en local, sans compte.
const guestMode = !supabase || (import.meta.env.DEV && new URLSearchParams(window.location.search).get('guest') === '1');

export default function App() {
  const [session, setSession] = useState(guestMode ? GUEST : undefined); // undefined = en cours de vérification
  // Ouverte depuis le lien « mot de passe oublié » : on demande d'abord le nouveau mot de passe.
  const [recovering, setRecovering] = useState(recoveryLink);

  useEffect(() => {
    if (guestMode) return undefined;
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      setSession(s ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Les données locales sont celles du compte connecté avant d'afficher quoi que ce soit
  // (vidées si un autre compte s'est connecté sur l'appareil, remplacées par celles en ligne).
  const userId = session?.user?.id;
  const [localReady, setLocalReady] = useState(null); // identifiant du compte prêt
  useEffect(() => {
    if (!userId) return undefined;
    let alive = true;
    syncLocalOwner(userId).finally(() => { if (alive) setLocalReady(userId); });
    return () => { alive = false; };
  }, [userId]);

  if (session === undefined) return null;
  if (!session) return <Auth />;
  if (recovering) return <NewPassword onDone={() => setRecovering(false)} />;
  if (localReady !== userId) {
    // Même écran que le lancement : il s'efface ensuite avec l'animation habituelle.
    return <div className="splash" aria-busy="true"><Logo size={96} /><b>Dexup</b></div>;
  }

  return (
    <HashRouter>
      <LanguageProvider>
        <CollectionProvider key={userId}>
          <Splash />
          <ProfileProvider userId={session.user.id} guest={guestMode}>
            <Shell session={session} />
          </ProfileProvider>
        </CollectionProvider>
      </LanguageProvider>
    </HashRouter>
  );
}
