/**
 * Hook pour surveiller le statut de la connexion réseau
 */

import { useState, useEffect } from 'react';
import NetInfo from '@react-native-community/netinfo';

/**
 * Hook qui surveille l'état de la connexion réseau
 * @returns {{ isOffline: boolean, isConnected: boolean, connectionType: string }}
 */
export const useNetworkStatus = () => {
  const [networkState, setNetworkState] = useState({
    isOffline: false,
    isConnected: true,
    connectionType: 'unknown',
  });

  useEffect(() => {
    // Écouter les changements de connectivité
    const unsubscribe = NetInfo.addEventListener(state => {
      const offline = !state.isConnected || !state.isInternetReachable;
      
      setNetworkState({
        isOffline: offline,
        isConnected: state.isConnected ?? true,
        connectionType: state.type || 'unknown',
      });
    });

    // Vérifier l'état initial
    NetInfo.fetch().then(state => {
      const offline = !state.isConnected || !state.isInternetReachable;
      setNetworkState({
        isOffline: offline,
        isConnected: state.isConnected ?? true,
        connectionType: state.type || 'unknown',
      });
    });

    return () => unsubscribe();
  }, []);

  return networkState;
};

export default useNetworkStatus;
