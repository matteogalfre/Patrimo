# Patrimo

Suivre tout son patrimoine financier au même endroit : actions et ETF (PEA, compte-titres), cryptos, livrets et comptes. Sans compte, sans cloud. Tout reste sur le téléphone.

Patrimo réunit CryptoTrackr et StockTrackr dans une seule app, pensée d'abord pour les investisseurs français.

## Ce que fait l'app

- **Patrimoine total** dans ta devise (euro par défaut), variation du jour, plus-value totale et rendement.
- **Filtre par enveloppe** : tout, PEA, compte-titres, crypto, liquidités.
- **Liquidités** : Livret A, LDDS, LEP, comptes, assurance-vie. On saisit un solde de temps en temps, pas chaque virement ; l'historique des soldes alimente le graphique. Livret A, LDDS et LEP prennent d'office le taux officiel du moment ; pour les autres comptes, un taux facultatif donne une estimation des intérêts. Chaque compte se compare à l'inflation : ce qu'il fait gagner ou perdre en pouvoir d'achat par an.
- **Mode discret** : un appui sur l'œil masque tous les montants (widget compris) et laisse les pourcentages.
- **D'où vient la performance** : évolution des cours, effet de change, plus-values réalisées, dividendes. La somme se recoupe à l'écran.
- **Suivi du PEA** : versements face au plafond de 150 000 €, date des 5 ans.
- **Fiche par actif** : historique des cours avec tes achats et ventes, position par enveloppe, toutes les opérations modifiables, et rendement moyen par an de l'actif (de 1 à 30 ans selon l'historique, année par année). Pour un ETF reconnu, la moyenne de son indice sur plusieurs décennies (S&P 500 dividendes réinvestis depuis 1988, MSCI World depuis 1972, Nasdaq-100, CAC 40…).
- **Saisie d'opération** : recherche unique actions, ETF et cryptos (par nom, ticker ou ISIN, avec toutes les places de cotation), prix de clôture du jour pré-rempli mais modifiable, frais, prix en devise de cotation ou en euros, dividendes.
- **Sauvegarde** en fichier, à réimporter sur un nouveau téléphone (réimporter le même fichier ne crée pas de doublon). Elle peut être protégée par un mot de passe (chiffrement AES-256 ; sans le mot de passe, le fichier est illisible).
- **Courbe à explorer au doigt** : valeur et date au point touché, ligne « argent investi » en pointillés, périodes de 7 jours à tout l'historique.
- **Revenus passifs** : dividendes par mois et par année, rendement sur prix de revient, projection sur 12 mois avec les intérêts des livrets, et calendrier des dividendes à venir (chaque versement des 12 derniers mois revient à la même période, ajusté à la quantité détenue aujourd'hui).
- **Diversification** : les actions et ETF par pays et par secteur. Un ETF est décomposé selon l'indice qu'il suit (MSCI World, S&P 500, Nasdaq-100, émergents, Europe, CAC 40, Euro Stoxx 50, ACWI) ; une action compte pour son pays et son secteur. Ce qui n'est pas reconnu se corrige sur la fiche de l'actif.
- **Patrimoine futur** : épargne mensuelle, horizon de 10 à 30 ans, trois rendements moyens.
- **Rendement annualisé et performance par année** : le rendement de ton argent, versements pris en compte, avant et après inflation, et le gain de chaque année civile face à l'inflation de l'année.
- **Objectifs** : un montant à une date, la progression et ce qu'il faudrait épargner par mois. Plus l'épargne de précaution, en mois de dépenses couverts.
- **Rééquilibrage** : une répartition cible entre actions, crypto et liquidités, et comment répartir le prochain versement pour s'en rapprocher sans rien vendre.
- **Achats programmés** : un montant chaque mois sur un actif, avec un rappel le jour venu et l'opération pré-remplie. L'app ne passe aucun ordre.
- **Frais** : TER des ETF (saisi sur la fiche) et courtage réellement payé, en euros par an, en part du patrimoine et en manque à gagner sur 20 ans. Les ETF sans TER et les ordres où les frais dépassent 1 % du montant sont signalés.
- **Fiscalité** : plus-values du compte-titres (formulaire 2074) et des cryptos (formule du 2086), situation du PEA, export CSV. Une aide au calcul, à comparer avec l'IFU du courtier.
- Alertes de cours, widget Android, code PIN et biométrie, 6 langues.

## Comment les chiffres sont calculés

Tout le calcul est dans `src/core/`, en fonctions pures et testées.

- Une position, c'est un actif dans une enveloppe : le même ETF en PEA et en compte-titres a deux prix de revient.
- Prix de revient au coût moyen pondéré, frais d'achat compris (la méthode du fisc pour les titres). Les frais de vente réduisent le produit de cession.
- Chaque opération est convertie au taux de change de son jour, la valeur actuelle au taux du jour. L'écart est l'effet de change.
- Les positions soldées restent dans les totaux : leur plus-value réalisée fait partie de la performance.
- Un prix d'opération manquant (vieil import, réseau absent) est complété avec la clôture du jour depuis l'historique. En attendant, la ligne est valorisée au cours actuel et signalée.
- Sans cours connu à une date passée (titre radié, historique absent), un actif compte au prix de sa dernière opération, pas à zéro.
- Le rendement annualisé est un taux de rendement interne (chaque versement compte à sa date). La performance d'une année rapporte son gain au capital moyen investi pendant l'année.
- Le rendement après inflation convertit chaque versement en euros d'aujourd'hui avec l'indice des prix du mois, puis recalcule le même taux.

## Sources de données

- Actions, ETF, fonds : Yahoo Finance (cours dans la devise de cotation, pence londoniens ramenés en livres).
- Cryptos : API publique Binance (paires USDT, traitées comme du dollar).
- Taux de change : taux de référence de la BCE via Frankfurter, Yahoo en secours pour les devises hors BCE.
- Inflation : indice des prix à la consommation harmonisé de la France, publié chaque mois par Eurostat (gardé en cache une semaine).
- Taux du Livret A, du LDDS et du LEP : table intégrée à l'app d'après les arrêtés du Journal officiel, à mettre à jour au 1er février et au 1er août. La Banque de France publie ces séries, mais son API demande une clé personnelle.
- Recherche par ISIN : OpenFIGI liste les places de cotation d'un titre, seulement quand on tape un ISIN.
- Diversification : répartitions des indices relevées sur les fiches iShares (BlackRock) au 30 octobre 2026 et intégrées à l'app (aucune requête), dans `src/constants/exposureData.js`. Secteurs des actions courantes selon la classification GICS.
- Logos : CoinCap pour les cryptos, Financial Modeling Prep pour les actions. Quand un logo manque, l'app affiche les initiales.

Aucune clé d'API. Ce sont les seules requêtes réseau de l'app : ces services voient quels symboles ou ISIN sont demandés, jamais les montants.

## Lancer le projet

```bash
npm install
npx expo start
```

Vérifications (lint, tests, imports) :

```bash
npm run verify
```

Build Android :

```bash
eas build --platform android --profile preview
```

## Organisation du code

```
src/
├── core/        moteur de calcul, change, import des sauvegardes (testés)
├── services/    cours (Yahoo, Binance), change, stockage local
├── context/     état de l'app : patrimoine, réglages, alertes
├── screens/     tableau de bord, portefeuille, fiche actif, saisie, réglages, simulateur
├── components/  cartes, graphiques, recherche d'actif, sélecteur de date
├── i18n/        traductions (fr, en, es, de, it, pt)
└── widget/      widget Android
```

## Pas encore là

- Objectifs (montant cible à une date) et épargne de précaution.
- Diversification géographique et sectorielle des ETF.
- Version iOS publiée.
