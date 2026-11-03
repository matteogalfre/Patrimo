import { useEffect, useState } from 'react';

import { inflationService } from '../services/inflationService';
import { createInflation } from '../core/inflation';

// Une seule récupération par lancement, partagée par tous les écrans.
let shared = null;
let pending = null;

/** Outils d'inflation (voir core/inflation), ou null tant que l'indice manque. */
export const useInflation = () => {
  const [inflation, setInflation] = useState(shared);
  useEffect(() => {
    if (shared) return undefined;
    let alive = true;
    pending = pending || inflationService.load().then((series) => {
      shared = series ? createInflation(series) : null;
      if (!shared) pending = null; // nouvel essai au prochain écran
      return shared;
    });
    pending.then((value) => alive && setInflation(value)).catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return inflation;
};
