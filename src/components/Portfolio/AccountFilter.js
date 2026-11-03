/**
 * Sélecteur d'enveloppe : Tout, PEA, compte-titres, crypto, liquidités.
 * N'affiche que les enveloppes réellement utilisées.
 */

import React from 'react';

import { useSettings } from '../../context/SettingsContext';
import { ACCOUNT_ORDER } from '../../core/assets';
import SegmentedControl from '../SegmentedControl';

const ALL = 'ALL';

const AccountFilter = ({ value, onChange, available, style }) => {
  const { t } = useSettings();
  const accounts = ACCOUNT_ORDER.filter((a) => !available || available.includes(a));
  if (accounts.length < 2) return null;
  const options = [
    { key: ALL, label: t('accounts.all') },
    ...accounts.map((acc) => ({ key: acc, label: t(`accounts.${acc}`) })),
  ];

  return (
    <SegmentedControl
      options={options}
      value={value || ALL}
      onChange={(k) => onChange(k === ALL ? null : k)}
      scrollable
      style={style}
      contentStyle={{ paddingHorizontal: 12 }}
    />
  );
};

export default AccountFilter;
