/**
 * Logo et nom de l'établissement d'une enveloppe (PEA chez Bourse Direct…),
 * s'il a été indiqué dans les réglages. Rien sinon.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { useTheme } from '../../theme/theme';
import { usePlanning } from '../../context/PlanningContext';
import { institutionById } from '../../core/institutions';
import AssetLogo from '../AssetLogo';

const AccountInstitution = ({ account, size = 18, showName = true }) => {
  const theme = useTheme();
  const { accountInstitutions } = usePlanning();
  const institution = institutionById(accountInstitutions?.[account]);
  if (!institution) return null;
  return (
    <View style={styles.row}>
      <AssetLogo institution={institution} size={size} />
      {showName && <Text style={[styles.name, { color: theme.colors.textTertiary }]} numberOfLines={1}>{institution.name}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 12, fontWeight: '600' },
});

export default AccountInstitution;
