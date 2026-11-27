/**
 * Remise à zéro de l'état en mémoire après un effacement.
 *
 * Les contextes (portefeuille, planification, banque, alertes, réglages)
 * gardent leurs données en mémoire et les réécrivent à la prochaine
 * modification : après « Tout effacer », l'ancien plan ou les anciens liens
 * bancaires reviendraient. On les remonte donc tous, ils relisent le
 * stockage vide comme au premier lancement.
 */

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

const DataResetContext = createContext({ resetMemory: () => {} });

export const DataResetProvider = ({ children }) => {
  const [epoch, setEpoch] = useState(0);
  const resetMemory = useCallback(() => setEpoch((e) => e + 1), []);
  const value = useMemo(() => ({ resetMemory }), [resetMemory]);
  return (
    <DataResetContext.Provider value={value}>
      <React.Fragment key={epoch}>{children}</React.Fragment>
    </DataResetContext.Provider>
  );
};

export const useDataReset = () => useContext(DataResetContext);
