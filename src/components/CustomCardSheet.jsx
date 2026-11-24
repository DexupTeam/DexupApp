import React, { useRef, useState } from 'react';
import { Camera } from './icons';
import { useCollection } from '../store/collection';
import { newCustomCard } from '../lib/extraCards';
import { photoFromFile } from '../lib/photos';
import { Sheet } from './ui';

const LANGS = [['', '—'], ['FR', 'Français'], ['EN', 'Anglais'], ['JP', 'Japonais'], ['ZH', 'Chinois'], ['KO', 'Coréen'], ['DE', 'Allemand'], ['ES', 'Espagnol'], ['IT', 'Italien']];

/**
 * Ajoute à la collection une carte absente de la base (exclusivité chinoise ou japonaise, promo,
 * erreur d'impression…) : nom, extension, numéro, langue, photo et prix saisis à la main.
 */
export default function CustomCardSheet({ onClose, onAdded }) {
  const { addCustomCard } = useCollection();
  const fileRef = useRef(null);
  const [form, setForm] = useState({ name: '', setName: '', number: '', lang: '', price: '' });
  const [photo, setPhoto] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const onPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try { setPhoto(await photoFromFile(file)); setError(null); } catch (_) { setError('Image illisible.'); }
  };

  const save = async () => {
    if (!form.name.trim() || saving) return;
    setSaving(true);
    const card = newCustomCard(form);
    const price = parseFloat(form.price.replace(',', '.'));
    try {
      await addCustomCard(card, { price: price > 0 ? price : null, photo });
      onAdded?.(card);
      onClose();
    } catch (_) {
      setError("La carte n'a pas pu être enregistrée.");
      setSaving(false);
    }
  };

  return (
    <Sheet
      title="Carte perso" onClose={onClose} tall
      footer={<button className="btn btn-violet grow" disabled={!form.name.trim() || saving} onClick={save}>Ajouter à ma collection</button>}
    >
      <div className="stack" style={{ gap: 12 }}>
        <p className="small muted">Pour une carte absente de la base : exclusivité chinoise ou japonaise, promo, erreur d'impression…</p>
        <button
          type="button" className="custom-photo" onClick={() => fileRef.current?.click()}
          aria-label={photo ? 'Changer la photo' : 'Ajouter une photo'}
        >
          {photo ? <img src={photo} alt="" /> : <span><Camera size={26} /><b>Photo de la carte</b><i>facultatif</i></span>}
        </button>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={onPhoto} />
        <label className="stack" style={{ gap: 6 }}>
          <span className="label" style={{ margin: 0 }}>Nom *</span>
          <input className="input" value={form.name} onChange={set('name')} placeholder="Ex : Osselait" autoFocus />
        </label>
        <label className="stack" style={{ gap: 6 }}>
          <span className="label" style={{ margin: 0 }}>Extension</span>
          <input className="input" value={form.setName} onChange={set('setName')} placeholder="Ex : Gem Pack Vol. 3" />
        </label>
        <div className="row" style={{ gap: 10 }}>
          <label className="stack grow" style={{ gap: 6 }}>
            <span className="label" style={{ margin: 0 }}>Numéro</span>
            <input className="input" value={form.number} onChange={set('number')} placeholder="Ex : CBB3C 004" />
          </label>
          <label className="stack" style={{ gap: 6, width: 130 }}>
            <span className="label" style={{ margin: 0 }}>Langue</span>
            <select className="input" value={form.lang} onChange={set('lang')}>
              {LANGS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>
        <label className="stack" style={{ gap: 6 }}>
          <span className="label" style={{ margin: 0 }}>Prix en €</span>
          <input className="input" value={form.price} onChange={set('price')} inputMode="decimal" placeholder="Compte dans la valeur de ta collection" />
        </label>
        {error && <p className="small" style={{ color: 'var(--danger)' }}>{error}</p>}
      </div>
    </Sheet>
  );
}
