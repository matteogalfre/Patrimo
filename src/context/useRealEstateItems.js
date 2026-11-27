/**
 * Crédits et biens immobiliers du portefeuille : ajout, modification,
 * suppression. Saisis à la main, sans cours à charger, ils n'ont rien à faire
 * dans le chargement des marchés de PortfolioContext.
 */

import { useCallback } from 'react';

import { loansRepo, propertiesRepo } from '../services/storage';
import { withEstimate } from '../core/realEstate';

const useRealEstateItems = ({ loans, setLoans, properties, setProperties }) => {
  const addLoan = useCallback(async (fields) => {
    const { data: record, error: err } = await loansRepo.add(fields);
    if (err) throw err;
    setLoans((prev) => [...prev, record]);
    return record;
  }, [setLoans]);
  const updateLoan = useCallback(async (id, patch) => {
    const { data: record, error: err } = await loansRepo.update(id, patch);
    if (err) throw err;
    setLoans((prev) => prev.map((x) => (x.id === id ? record : x)));
    return record;
  }, [setLoans]);
  const deleteLoan = useCallback(async (id) => {
    const { error: err } = await loansRepo.remove(id);
    if (err) throw err;
    setLoans((prev) => prev.filter((x) => x.id !== id));
  }, [setLoans]);
  const addProperty = useCallback(async (fields) => {
    const { data: record, error: err } = await propertiesRepo.add(fields);
    if (err) throw err;
    setProperties((prev) => [...prev, record]);
    return record;
  }, [setProperties]);
  const updateProperty = useCallback(async (id, patch) => {
    const { data: record, error: err } = await propertiesRepo.update(id, patch);
    if (err) throw err;
    setProperties((prev) => prev.map((x) => (x.id === id ? record : x)));
    return record;
  }, [setProperties]);
  /** Nouvelle estimation de la valeur d'un bien (remplace celle du même jour). */
  const recordPropertyValue = useCallback(async (id, value, date = new Date()) => {
    const property = properties.find((x) => x.id === id);
    if (!property) throw new Error('NOT_FOUND');
    return updateProperty(id, { history: withEstimate(property, value, date).history });
  }, [properties, updateProperty]);
  const deleteProperty = useCallback(async (id) => {
    const { error: err } = await propertiesRepo.remove(id);
    if (err) throw err;
    setProperties((prev) => prev.filter((x) => x.id !== id));
    // Un crédit lié reste : il ne pointe plus vers rien.
    const linked = loans.filter((l) => l.propertyId === id);
    await loansRepo.updateMany(linked.map((l) => ({ id: l.id, propertyId: null })));
    if (linked.length) setLoans((prev) => prev.map((l) => (l.propertyId === id ? { ...l, propertyId: null } : l)));
  }, [loans, setLoans, setProperties]);

  return { addLoan, updateLoan, deleteLoan, addProperty, updateProperty, recordPropertyValue, deleteProperty };
};

export default useRealEstateItems;
