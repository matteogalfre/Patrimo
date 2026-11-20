# Patrimo

Suivre tout son patrimoine financier au même endroit : actions et ETF (PEA, compte-titres), cryptos, livrets et comptes. Sans compte, sans cloud. Tout reste sur le téléphone.

Pensée d'abord pour les investisseurs français. *[Read in English](README.md)*

## Ce que fait l'app

- **Patrimoine total** dans ta devise (euro par défaut), variation du jour, plus-value totale et rendement.
- **Filtre par enveloppe** : tout, PEA, compte-titres, crypto, liquidités.
- **Liquidités et épargne** : Livret A, LDDS, LEP, Livret Jeune, CEL, PEL, comptes, assurance-vie, épargne salariale (PEE, PERCOL). On saisit un solde de temps en temps, pas chaque virement ; l'historique des soldes alimente le graphique. Livret A, LDDS et LEP prennent d'office le taux officiel du moment ; pour les autres comptes, un taux facultatif donne une estimation des intérêts. Chaque compte se compare à l'inflation : ce qu'il fait gagner ou perdre en pouvoir d'achat par an.
- **Banques reliées** (facultatif) : le solde des comptes courants et livrets se met à jour tout seul via GoCardless (accès DSP2 en lecture : nom et solde, pas les opérations). Tu crées tes propres clés dans le portail GoCardless et tu les saisis dans l'app ; elles restent dans le coffre sécurisé du téléphone. L'accord dure 90 à 180 jours selon la banque, puis se renouvelle en deux touches. Les courtiers (Bourse Direct, Trade Republic…) ne sont pas couverts.
- **Mode discret** : un appui sur l'œil masque tous les montants (widget compris) et laisse les pourcentages.
- **D'où vient la performance** : évolution des cours, effet de change, plus-values réalisées, dividendes. La somme se recoupe à l'écran.
- **Suivi du PEA** : versements face au plafond de 150 000 €, date des 5 ans.
- **Fiche par actif** : historique des cours avec tes achats, ventes et dividendes, position par enveloppe, toutes les opérations modifiables, et rendement moyen par an de l'actif (de 1 à 30 ans selon l'historique, année par année). Pour un ETF reconnu, la moyenne de son indice sur plusieurs décennies (S&P 500 dividendes réinvestis depuis 1988, MSCI World depuis 1972, Nasdaq-100, CAC 40…).
- **Saisie d'opération** : recherche unique actions, ETF et cryptos (par nom, ticker ou ISIN, avec toutes les places de cotation), prix de clôture du jour pré-rempli mais modifiable, frais pré-remplis selon la règle de l'enveloppe (grilles d'une dizaine de courtiers datées et sourcées, dont le PEA Trade Republic, ou pourcentage ou montant fixe ; plafond légal de 0,5 % sur PEA, TTF sur les grandes valeurs françaises), prix en devise de cotation ou en euros, dividendes.
- **Dividendes à confirmer** : un titre qui a versé un dividende il y a un an en reverse un à la même période ; s'il n'est pas saisi, l'app le propose, pré-rempli.
- **Sauvegarde** en fichier (opérations, dividendes, comptes, crédits et biens), à réimporter sur un nouveau téléphone (réimporter le même fichier ne crée pas de doublon). Elle peut être protégée par un mot de passe (chiffrement AES-256 ; sans le mot de passe, le fichier est illisible).
- **Courbe à explorer au doigt** : valeur et date au point touché, ligne « argent investi » en pointillés, périodes de 7 jours à tout l'historique.
- **Revenus passifs** : dividendes par mois et par année, rendement sur prix de revient, projection sur 12 mois avec les intérêts des livrets, et calendrier des dividendes à venir (chaque versement des 12 derniers mois revient à la même période, ajusté à la quantité détenue aujourd'hui).
- **Diversification** : les actions et ETF par pays et par secteur. Un ETF est décomposé selon l'indice qu'il suit (MSCI World, S&P 500, Nasdaq-100, émergents, Europe, CAC 40, Euro Stoxx 50, ACWI) ; une action compte pour son pays et son secteur. Ce qui n'est pas reconnu se corrige sur la fiche de l'actif. La vue « Titres » montre les sociétés détenues à travers les ETF (Apple, NVIDIA…), additionnées aux actions en direct, et les doublons entre ETF.
- **Crédits** : prêt immobilier, auto, étudiant, conso, prêt à taux zéro. La mensualité, le capital restant dû, les intérêts payés et à venir, la date de fin, et ce que changerait un remboursement anticipé (durée raccourcie ou mensualité allégée). Pour un crédit à deux, seule ta part compte.
- **Immobilier** : tes biens, leur valeur estimée (à mettre à jour de temps en temps), la plus-value face au prix payé frais compris, le crédit restant et le rendement locatif. Le patrimoine net additionne placements, liquidités et immobilier, moins ce qu'il reste à rembourser. Les mensualités s'ajoutent au budget en un toucher.
- **Simulateur d'achat** : pour un prix, les frais de notaire, l'apport, la mensualité, le taux d'endettement face à la règle des 35 % et le coût du crédit, ainsi que le prix le plus élevé que tes revenus permettent. Pré-rempli avec ton budget, ton épargne disponible et tes crédits en cours ; l'apport peut devenir un objectif.
- **Marchés** : le S&P 500 et le Bitcoin, avec leur courbe, les moyennes mobiles sur 50 et 200 jours, l'écart au plus haut et l'indice de peur (VIX, Fear & Greed crypto). Puis ce qui s'est passé les autres fois dans la même situation, calculé sur tout l'historique (depuis 1950 pour le S&P 500, 2014 pour le Bitcoin) : jusqu'où la baisse est allée, où en était l'indice 1 an et 3 ans après, avec toujours le pire cas affiché. Ce que ça représente pour toi : ton épargne au-delà de ta réserve, ce qu'il manque pour ta cible, un étalement à programmer. Et un plan anti-panique, une règle fixée à froid (« si le S&P 500 passe à −10 %, préviens-moi pour investir 2 000 € ») rappelée par notification. Des statistiques et des calculs, jamais une prévision.
- **Patrimoine futur** : épargne mensuelle, horizon de 10 à 30 ans, trois rendements moyens.
- **Budget** : revenus, investissements et dépenses du mois en diagramme de Sankey (l'épaisseur d'un flux est son montant), taux d'épargne, taux possible et reste à vivre. Pré-rempli avec le profil et les achats programmés, tout se modifie.
- **Premier lancement** : un accueil propose le questionnaire (2 minutes), des données d'exemple ou de passer. Il n'apparaît jamais quand des données existent déjà.
- **Tes chiffres, une seule fois** : revenus, dépenses et épargne possible viennent du budget (sinon des objectifs, du questionnaire ou de ce que l'app mesure) et sont repris partout : épargne de précaution, patrimoine futur, indépendance financière, objectifs, rééquilibrage.
- **Mon profil** : un questionnaire de 2 minutes (une question par écran, réponse d'un toucher) qui situe parmi cinq profils, du prudent à l'audacieux, en croisant ce que la situation permet et ce qu'on supporte vraiment. Il débouche sur un plan d'action dans l'ordre, calculé sur le patrimoine réel : dettes chères, épargne de précaution, projets proches, enveloppes, investissement, répartition, crypto, diversification, frais. Des repères généraux, pas de conseil sur un produit.
- **Indépendance financière** : le capital qui suffirait pour un revenu mensuel voulu (taux de retrait de 3 à 4 %), et la probabilité de l'atteindre année après année, simulée sur 600 trajectoires de marché d'après ta répartition.
- **Comparer avec un indice** : tes versements rejoués sur un ETF MSCI World, S&P 500, Nasdaq-100, CAC 40… ou le Livret A, aux mêmes dates et pour les mêmes montants.
- **Rendement annualisé et performance par année** : le rendement de ton argent, versements pris en compte, avant et après inflation, et le gain de chaque année civile face à l'inflation de l'année.
- **Objectifs** : un montant à une date, la progression et ce qu'il faudrait épargner par mois. Plus l'épargne de précaution, en mois de dépenses couverts.
- **Rééquilibrage** : une répartition cible entre actions, crypto et liquidités, et comment répartir le prochain versement pour s'en rapprocher sans rien vendre.
- **Achats programmés** : un montant chaque mois sur un actif, avec un rappel le jour venu et l'opération pré-remplie. L'app ne passe aucun ordre.
- **Frais** : TER des ETF (connu pour une quarantaine d'ETF courants, sinon saisi sur la fiche) et courtage réellement payé, en euros par an et en part du patrimoine. Un verdict face aux repères du marché : chaque ETF face aux grands ETF du même indice, l'économie face à un fonds actif moyen (chiffres AMF), et tes propres ordres repassés à la grille de chaque courtier. Le manque à gagner sur 20 ans n'apparaît que si les frais sont élevés.
- **Fiscalité** : plus-values du compte-titres (formulaire 2074) et des cryptos (formule du 2086), situation du PEA, export CSV. Une aide au calcul, à comparer avec l'IFU du courtier.
- **Données d'exemple** : un patrimoine fictif d'environ 5 000 € pour essayer ou montrer l'app ; les vraies données restent à part, intactes.
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
- Banques reliées : GoCardless Bank Account Data, appelé directement depuis le téléphone avec les clés de l'utilisateur. Quatre lectures par jour et par compte au plus, donc une relecture toutes les 6 h maximum (automatique toutes les 12 h à l'ouverture). L'IBAN n'est jamais gardé, seulement une empreinte pour reconnaître un compte au renouvellement.
- Logos : CoinCap pour les cryptos, Financial Modeling Prep pour les actions, favicon public du site (service de Google) pour une quarantaine de banques, néobanques, courtiers et plateformes crypto reconnus. Quand un logo manque, l'app affiche les initiales.

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

- Version iOS publiée.

## Licence

Patrimo est sous licence [GNU GPL v3](LICENSE) : tu peux l'utiliser, l'étudier, le modifier et le partager, tant que ta version reste libre elle aussi.

Patrimo est un outil de suivi, pas un conseil financier ni fiscal.
