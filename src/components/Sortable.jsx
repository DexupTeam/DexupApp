// Grille réordonnable au doigt ou à la souris : on attrape un élément, il suit le pointeur et les autres
// se décalent en douceur pour lui faire place. Au clavier : flèches gauche / droite sur l'élément.
import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const move = (list, from, to) => {
  const next = [...list];
  next.splice(to, 0, next.splice(from, 1)[0]);
  return next;
};

/**
 * ids : ordre actuel ; onChange(nouvelOrdre) ; render(id, { dragging }) dessine un élément ;
 * label(id) : nom lu par les lecteurs d'écran.
 */
export default function Sortable({ ids, onChange, render, label, className = 'sortable' }) {
  const box = useRef(null);
  const nodes = useRef({});       // id → élément du DOM
  const rects = useRef({});       // id → position au dernier rendu (animation des décalages)
  const [drag, setDrag] = useState(null); // { id, x, y, offX, offY, w, h }
  const dragRef = useRef(null);
  dragRef.current = drag;

  // Position d'un élément dans la grille, sans les décalages animés en cours (offsetLeft/Top ignorent
  // les transformations) : la cible ne « recule » pas sous le doigt pendant qu'elle glisse.
  const slot = (id) => {
    const el = nodes.current[id];
    if (!el || !box.current) return null;
    const b = box.current.getBoundingClientRect();
    const left = b.left + el.offsetLeft;
    const top = b.top + el.offsetTop;
    return { left, top, right: left + el.offsetWidth, bottom: top + el.offsetHeight };
  };

  // Décalage animé (FLIP) : chaque élément part de son ancienne position et glisse vers la nouvelle.
  useLayoutEffect(() => {
    for (const id of ids) {
      const el = nodes.current[id];
      if (!el) continue;
      const now = { left: el.offsetLeft, top: el.offsetTop };
      const before = rects.current[id];
      rects.current[id] = now;
      if (!before || drag?.id === id) continue;
      const dx = before.left - now.left;
      const dy = before.top - now.top;
      if (!dx && !dy) continue;
      el.style.transition = 'none';
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      el.getBoundingClientRect(); // applique la position de départ avant d'animer
      el.style.transition = 'transform 0.22s cubic-bezier(0.2, 0.7, 0.2, 1)';
      el.style.transform = '';
    }
  });

  const start = (e, id) => {
    if (e.button !== undefined && e.button !== 0) return;
    const r = nodes.current[id].getBoundingClientRect();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDrag({ id, x: e.clientX, y: e.clientY, offX: e.clientX - r.left, offY: e.clientY - r.top, w: r.width, h: r.height, moved: false });
  };

  const onMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    e.preventDefault();
    const moved = d.moved || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4;
    setDrag({ ...d, x: e.clientX, y: e.clientY, moved });
    // L'élément visé est celui sous le pointeur : le glissé prend sa place.
    const target = ids.find((id) => {
      if (id === d.id) return false;
      const r = slot(id);
      return r && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    });
    if (target) onChange(move(ids, ids.indexOf(d.id), ids.indexOf(target)));
  };

  const end = () => setDrag(null);

  const onKey = (e, id) => {
    const i = ids.indexOf(id);
    const to = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? i - 1 : e.key === 'ArrowRight' || e.key === 'ArrowDown' ? i + 1 : null;
    if (to === null || to < 0 || to >= ids.length) return;
    e.preventDefault();
    onChange(move(ids, i, to));
    requestAnimationFrame(() => nodes.current[id]?.focus());
  };

  return (
    <>
      <div className={className} role="list" ref={box}>
        {ids.map((id, i) => (
          <div
            key={id} role="listitem" tabIndex={0}
            ref={(el) => { if (el) nodes.current[id] = el; else delete nodes.current[id]; }}
            className={`sortable-item${drag?.id === id ? ' is-placeholder' : ''}`}
            aria-label={`${label?.(id) ?? id}, position ${i + 1} sur ${ids.length}. Flèches pour déplacer.`}
            onPointerDown={(e) => start(e, id)} onPointerMove={onMove} onPointerUp={end} onPointerCancel={end}
            onKeyDown={(e) => onKey(e, id)}
          >
            {render(id, { dragging: false })}
          </div>
        ))}
      </div>
      {drag && createPortal(
        <div
          className="sortable-ghost" aria-hidden="true"
          style={{ width: drag.w, height: drag.h, transform: `translate(${drag.x - drag.offX}px, ${drag.y - drag.offY}px)` }}
        >
          {render(drag.id, { dragging: true })}
        </div>,
        document.body,
      )}
    </>
  );
}
