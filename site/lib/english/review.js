// The English of the annual review (pages/review/, its route, its markup in index.html): kept apart, a page of its own
// that only the managers open. Keys are the French exactly as written (lib/i18n.js), values their English, with the same
// placeholders.

/** @type {Record<string, string>} */
export const REVIEW = {
  // The route, the link of the sidebar and the markup of index.html.
  'Revue annuelle': 'Annual review',
  'Chaque développeur sur les 12 derniers mois complets, et la recommandation de fin d’année':
    'Each developer over the last 12 whole months, and the year-end recommendation',
  'Accès réservé aux managers': 'Managers only',
  'Cette page classe chaque développeur et dit qui récompenser en fin d’année. Elle s’ouvre avec le mot de passe des managers, pour 30 jours sur cet appareil.':
    'This page ranks each developer and says whom to reward at the end of the year. It opens with the managers’ password, for 30 days on this device.',
  'Mot de passe des managers': 'Managers’ password',
  Ouvrir: 'Open',
  'Mot de passe incorrect.': 'Wrong password.',
  'Recommandations de fin d’année': 'Year-end recommendations',
  'Les écarts de productivité sont-ils réels ?': 'Are the gaps in productivity real?',
  'Vue d’ensemble': 'Overview',
  'Un clic sur une colonne la trie. Les quatre notes vont de 0 à 100 : le rang de la personne dans l’équipe, 100 pour la meilleure (face aux devs de même catégorie pour la productivité).':
    'Click a column to sort it. The four marks go from 0 to 100: the person’s rank in the team, 100 for the best (against devs of the same kind for productivity).',
  'Les squads': 'The squads',
  'Par membre évalué. Le résultat d’une squad compte pour un quart de la note de son chef.':
    'Per member evaluated. The result of a squad counts for a quarter of its head’s mark.',
  'Comment lire cette page': 'How to read this page',
  'Fermer l’accès sur cet appareil': 'Close access on this device',

  // The board, the facts, the ranking and the squads.
  'Un clic sur un nom, ici ou dans le classement, ouvre son dossier.': 'Click a name, here or in the ranking, to open their file.',
  'Trop peu de recul': 'Too new to judge',
  'Arrivée récente ou activité de code marginale : pas de recommandation.': 'Recent arrival or little code: no recommendation.',
  'hors TMA': 'outside maintenance',
  'TMA partielle': 'partly maintenance',
  'au-dessus des devs comparables': 'above comparable devs',
  'en dessous des devs comparables': 'below comparable devs',
  'dans la norme des devs comparables': 'in line with comparable devs',
  '{delivered} par mois, médiane des devs {profile} : {median} · {standing}': '{delivered} a month, median of devs {profile}: {median} · {standing}',
  'Livre nettement plus que la médiane des devs {profile} ({times} fois), un écart statistiquement solide.':
    'Delivers clearly more than the median of devs {profile} ({times} times), a statistically sound gap.',
  'Moins de hotfixes livrés que les autres devs TMA ({mine} par mois contre {profile}), un écart statistiquement solide.':
    'Fewer hotfixes delivered than the other maintenance devs ({mine} a month against {profile}), a statistically sound gap.',
  'Livre moins que la médiane des devs {profile} ({share} de la médiane), un écart statistiquement solide.':
    'Delivers less than the median of devs {profile} ({share} of the median), a statistically sound gap.',
  'Stack et TMA. La stack (front, back, mobile, full-stack) se lit comme sur la page Équipe. Selon la part de hotfixes dans ses PR de code, chacun est TMA à partir de 50 %, en TMA partielle de 30 à 50 %, hors TMA en dessous. La productivité ne se compare qu’entre devs de la même catégorie : un hotfix de 5 lignes ne pèse pas comme une fonctionnalité de 400.':
    'Stack and maintenance. The stack (front, back, mobile, full-stack) reads as on the Team page. By the share of hotfixes in their code PRs, each person is TMA from 50%, partly maintenance from 30 to 50%, outside maintenance below. Productivity is only compared among devs of the same kind: a 5-line hotfix does not weigh like a 400-line feature.',
  'Performance exceptionnelle': 'Exceptional performance',
  'Haut niveau sur la livraison, la review et le poids dans l’équipe.': 'High marks on delivery, review and weight in the team.',
  'Au-dessus des attentes': 'Above expectations',
  'Au-dessus de l’équipe sur la plupart des axes.': 'Above the team on most counts.',
  'Conforme aux attentes': 'Meets expectations',
  'Une contribution correcte sans écart marquant, ou un point de process à corriger.':
    'A sound contribution without a marked gap, or a point of process to correct.',
  'En dessous des attentes': 'Below expectations',
  'En retrait sur plusieurs axes, ou une présence à expliquer.': 'Behind on several counts, or a presence to explain.',
  'Chef de squad': 'Head of squad',
  'Jugés d’abord sur le résultat de leur squad, et sur ce que GitHub ne montre pas.':
    'Judged first on the result of their squad, and on what GitHub does not show.',
  'Squad performante : une récompense se justifie si le retour qualitatif suit.':
    'A squad that performs: a reward is warranted if the qualitative feedback agrees.',
  'Squad dans la moyenne : décision à prendre sur le qualitatif.': 'An average squad: decide on the qualitative feedback.',
  'Squad en retrait : faire le point sur son organisation avant toute récompense.':
    'A squad behind: review its organization before any reward.',
  'Recadrer d’abord sur les merges sans review, la récompense ensuite.': 'Address the merges without review first, the reward after.',
  'Prime ou augmentation en priorité.': 'Bonus or raise, as a priority.',
  'Prime ou augmentation.': 'Bonus or raise.',
  'Maintien, avec un ou deux objectifs précis.': 'Keep as is, with one or two precise goals.',
  'Entretien et plan de progrès avant toute récompense.': 'A talk and an improvement plan before any reward.',
  'De {from} à {to} : {people} personnes évaluées, {others} avec trop peu de recul. Tout vient de l’activité GitHub : PR, reviews et merges.':
    'From {from} to {to}: {people} people evaluated, {others} too new to judge. Everything comes from the activity on GitHub: PRs, reviews and merges.',
  '{months} mois évalués, {code} PR de code dont {merged} mergées, {reviewed} PR relues, {tma} de TMA.':
    '{months} months evaluated, {code} code PRs of which {merged} merged, {reviewed} PRs reviewed, {tma} maintenance.',
  'Oui, nettement': 'Yes, clearly',
  Oui: 'Yes',
  'Pas clairement': 'Not clearly',
  'Sur ce que chacun livre par mois, les écarts entre personnes sont {how} que le hasard d’un mois à l’autre (test de Kruskal-Wallis, p = {p}).':
    'On what each person delivers a month, the gaps between people are {how} than chance from one month to the next (Kruskal-Wallis test, p = {p}).',
  'bien plus grands': 'far greater',
  'à peine plus grands': 'hardly greater',
  'des écarts de livraison d’un mois sur l’autre viennent de la personne, le reste des sujets du mois, des congés, des projets. Sur la review, c’est {share} : chacun s’y implique à un niveau très stable.':
    'of the month-to-month gaps in delivery come from the person, the rest from the topics of the month, leave, projects. On review it is {share}: each person takes part at a very steady level.',
  'entre ceux qui livrent le plus et ceux qui livrent le moins, hors TMA (15e et 85e centiles).':
    'between those who deliver the most and those who deliver the least, maintenance aside (15th and 85th percentiles).',
  '{category} : {verdict}': '{category}: {verdict}',
  'écarts réels': 'real gaps',
  'pas d’écart net': 'no clear gap',
  'Entre les {count} personnes {category} évaluées, p = {p}.': 'Among the {count} {category} people evaluated, p = {p}.',
  'de l’activité GitHub tombe entre 9 h et 18 h, du lundi au vendredi : les plus productifs livrent plus dans le même temps, pas en faisant des heures.':
    'of the activity on GitHub falls between 9:00 and 18:00, Monday to Friday: the most productive deliver more in the same time, not by working longer.',
  Recommandation: 'Recommendation',
  Note: 'Mark',
  Productivité: 'Productivity',
  Efficacité: 'Efficiency',
  Importance: 'Importance',
  'Livré par mois': 'Delivered a month',
  '{count} hotfixes': '{count} hotfixes',
  '{count} unités': '{count} units',
  'Relues par mois': 'Reviewed a month',
  Présence: 'Presence',
  Chef: 'Head',
  'Membres évalués': 'Members evaluated',
  'Livré par membre et par mois': 'Delivered per member a month',
  'Relues par membre et par mois': 'Reviewed per member a month',
  'Délai de merge médian': 'Median time to merge',
  'Part de TMA': 'Maintenance share',
  Résultat: 'Result',

  // How to read the page.
  'Livraison. Hors TMA et en TMA partielle, chaque PR mergée compte selon sa taille, sur une échelle logarithmique : 100 lignes valent une unité, 10 lignes une demie, 1 000 lignes une et demie. Le code généré ou importé ne gonfle donc pas les chiffres. Pour la TMA, c’est le nombre de hotfixes mergés par mois.':
    'Delivery. Outside maintenance and partly in it, each merged PR counts by its size, on a logarithmic scale: 100 lines are one unit, 10 lines half a unit, 1,000 lines one and a half. Generated or imported code does not swell the figures. For the TMA, it is the number of hotfixes merged a month.',
  'Fiabilité. Chaque moyenne mensuelle a son intervalle de confiance à 95 %, tiré des mois eux-mêmes (bootstrap). Au-dessus ou en dessous des devs comparables veut dire que tout l’intervalle l’est : l’écart ne tient pas à un ou deux mois atypiques.':
    'Reliability. Each monthly average has its 95% confidence interval, drawn from the months themselves (bootstrap). Above or below comparable devs means the whole interval is: the gap does not rest on one or two odd months.',
  'Heures ouvrées. Chaque délai ne compte que les heures de 9 h à 18 h, du lundi au vendredi, heure de Paris. Une journée vaut 9 heures : « 2,5 j » veut dire deux journées et demie de travail, pas de calendrier. Les jours actifs comptent les jours ouvrés, fériés retirés, où la personne a fait au moins une action sur GitHub : un plancher, une journée de réunions ou de spécifications n’y laisse pas de trace.':
    'Working hours. Every delay only counts the hours from 9:00 to 18:00, Monday to Friday, Paris time. A day is 9 hours: “2.5 d” means two and a half working days, not calendar days. Active days count the working days, public holidays aside, on which the person did at least one thing on GitHub: a floor, as a day of meetings or specifications leaves no trace.',
  'Les quatre notes sont des rangs de 0 à 100. Productivité : ce qu’elle livre par mois, face aux devs de sa catégorie. Efficacité : délai de merge, PR abandonnées, merges sans review, checks en échec, régularité. Collaboration : PR relues par mois, commentaires, personnes qui dépendent de ses reviews, réactivité. Importance : sa part du code, des reviews et de la TMA de l’équipe, les dépôts qui reposent sur elle, ses projets et AC, les PR des autres qu’elle merge.':
    'The four marks are ranks from 0 to 100. Productivity: what the person delivers a month, against devs of the same kind. Efficiency: time to merge, abandoned PRs, merges without review, failed checks, regularity. Collaboration: PRs reviewed a month, comments, people who depend on their reviews, responsiveness. Importance: their share of the team’s code, reviews and maintenance, the repositories that rest on them, their projects and AC, the PRs of others they merge.',
  'Note globale : 35 % de productivité, 25 % de collaboration, 25 % d’importance, 15 % d’efficacité. Pour un chef de squad, la productivité ne compte que pour 15 %, l’efficacité pour 10 %, et le résultat de sa squad pour 25 %. Au-delà de 25 % de PR mergées sans review, aucune récompense n’est recommandée tant que ce n’est pas corrigé.':
    'Overall mark: 35% productivity, 25% collaboration, 25% importance, 15% efficiency. For a head of squad, productivity only counts for 15%, efficiency for 10%, and the result of their squad for 25%. Beyond 25% of PRs merged without review, no reward is recommended until it is corrected.',
  'Niveau : performance exceptionnelle à partir de 72, au-dessus des attentes à partir de 58, conforme aux attentes à partir de 42, en dessous des attentes sous 42.':
    'Level: exceptional performance from 72, above expectations from 58, meets expectations from 42, below expectations under 42.',
  'Limites. GitHub ne voit ni la difficulté d’un sujet, ni l’aide donnée à l’oral, ni les spécifications, l’astreinte ou les réunions. Cette page objective et prépare les entretiens, elle ne remplace pas l’avis des chefs de squad.':
    'Limits. GitHub sees neither how hard a topic is, nor help given in person, nor specifications, on-call duty or meetings. This page grounds and prepares the reviews; it does not replace the opinion of the heads of squad.',
  'Les chiffres viennent des PR que toute l’équipe peut lire sur le dashboard : le mot de passe des managers cache la page, pas les données.':
    'The figures come from the PRs the whole team can read on the dashboard: the managers’ password hides the page, not the data.',

  // A dossier.
  équipe: 'team',
  '{share} de TMA': '{share} maintenance',
  '★ Chef de {squad}': '★ Head of {squad}',
  '{count} mois évalués': '{count} months evaluated',
  'Ancienneté : {label}': 'Seniority: {label}',
  'merge en {merge}, {closed} abandonnées, {unreviewed} sans review': 'merged in {merge}, {closed} abandoned, {unreviewed} without review',
  '{reviews} PR relues par mois, {comments} commentaire par PR relue': '{reviews} PRs reviewed a month, {comments} comments per PR reviewed',
  '{code} du code livré, {reviews} des reviews de l’équipe': '{code} of the code delivered, {reviews} of the team’s reviews',
  'Points forts': 'Strengths',
  'Aucun point ne ressort nettement de l’équipe.': 'Nothing stands out clearly from the team.',
  'Points à travailler': 'To work on',
  'Rien de notable : continuer ainsi.': 'Nothing of note: keep it up.',
  'Mois par mois': 'Month by month',
  Livraison: 'Delivery',
  'PR de code ouvertes / mergées': 'Code PRs opened / merged',
  'Hotfixes mergés par mois': 'Hotfixes merged a month',
  'Unités livrées par mois': 'Units delivered a month',
  '{value} [{low} – {high}]': '{value} [{low} – {high}]',
  'PR mergées par mois': 'PRs merged a month',
  'Taille médiane d’une PR': 'Median size of a PR',
  '{count} lignes': '{count} lines',
  'Lignes ajoutées / supprimées': 'Lines added / deleted',
  'Projets / AC': 'Projects / AC',
  'Hotfix : délai de merge médian': 'Hotfix: median time to merge',
  'Flux et review': 'Flow and review',
  'Attente de la première review': 'Wait for the first review',
  'Mergées sans review': 'Merged without review',
  'Fermées sans merge': 'Closed without merge',
  'PR des autres relues': 'PRs of others reviewed',
  '{count} ({month} par mois)': '{count} ({month} a month)',
  'Approbations sans commentaire': 'Approvals without comment',
  'Changements demandés': 'Changes requested',
  'Réactivité en review': 'Responsiveness in review',
  'PR des autres mergées': 'PRs of others merged',
  'Poids dans l’équipe': 'Weight in the team',
  'Part du code livré': 'Share of the code delivered',
  'Part des reviews': 'Share of the reviews',
  'Part de la TMA': 'Share of the maintenance',
  'Dépôts réguliers (5 PR et plus)': 'Regular repositories (5 PRs or more)',
  'Relit au moins 30 % des PR de : {people}.': 'Reviews at least 30% of the PRs of: {people}.',
  'Repère de : {repos}.': 'Go-to person for: {repos}.',
  'Rythme de travail': 'Work rhythm',
  'Jours ouvrés actifs': 'Active working days',
  '{days} sur {available} ({share})': '{days} of {available} ({share})',
  'Dans les heures ouvrées': 'Within working hours',
  'Tôt ou tard / nuit / week-end': 'Early or late / night / weekend',
  'Journée type sur GitHub': 'Typical day on GitHub',
  'Livré par jour actif': 'Delivered per active day',
  'Cases cerclées : de 9 h à 18 h, du lundi au vendredi. Plus une case est foncée, plus il y a d’actions (PR, reviews, merges).':
    'Ringed cells: 9:00 to 18:00, Monday to Friday. The darker a cell, the more actions (PRs, reviews, merges).',
  'Hotfixes mergés': 'Hotfixes merged',
  'Unités livrées': 'Units delivered',
  '{delivered} et PR relues, mois par mois': '{delivered} and PRs reviewed, month by month',
  'pas encore dans l’équipe': 'not in the team yet',
  '{delivered} (axe)': '{delivered} (axis)',
  'PR relues (jusqu’à {count})': 'PRs reviewed (up to {count})',
  Lun: 'Mon',
  Mar: 'Tue',
  Mer: 'Wed',
  Jeu: 'Thu',
  Ven: 'Fri',
  Sam: 'Sat',
  Dim: 'Sun',
  'Activité sur GitHub par jour et par heure': 'Activity on GitHub by day and hour',
  '{day} {hour} h : {count} actions': '{day} {hour}:00: {count} actions',

  // The notes of a person (pages/review/words.js).
  'Sa squad est parmi les plus performantes (résultat {mark}/100) : {units} unités livrées par membre et par mois, {reviews} PR relues.':
    'Their squad is among those that perform best (result {mark}/100): {units} units delivered per member a month, {reviews} PRs reviewed.',
  'Sa squad est en retrait sur l’année (résultat {mark}/100) : {units} unités livrées par membre et par mois, {reviews} PR relues.':
    'Their squad is behind over the year (result {mark}/100): {units} units delivered per member a month, {reviews} PRs reviewed.',
  'Active sur GitHub {share} des jours ouvrés seulement ({days} sur {available}) : vérifier un temps partiel, d’autres missions ou des absences avant de conclure.':
    'Active on GitHub on only {share} of working days ({days} of {available}): check for part time, other duties or absences before concluding.',
  'Pilier de la review : {mine} PR relues par mois, contre {team} en médiane.': 'A pillar of review: {mine} PRs reviewed a month, against a median of {team}.',
  'Relit peu le code des autres : {mine} PR par mois, contre {team} en médiane.': 'Reviews little of others’ code: {mine} PRs a month, against a median of {team}.',
  '{count} personnes passent par ses reviews pour au moins 30 % de leurs PR.': '{count} people go through their reviews for at least 30% of their PRs.',
  'Reviews approfondies : {mine} commentaires par PR relue, contre {team} en médiane.':
    'Thorough reviews: {mine} comments per PR reviewed, against a median of {team}.',
  '{share} de ses approbations sont données sans aucun commentaire.': '{share} of their approvals come without any comment.',
  'Seul repère de {count} dépôts (au moins 40 % de leurs PR) : un risque en cas d’absence, ce savoir est à partager.':
    'The only go-to person for {count} repositories (at least 40% of their PRs): a risk if they are away, this knowledge should be shared.',
  'Relit surtout les mêmes personnes : {share} de ses reviews vont à {people}. Relire plus largement diffuse la connaissance du code.':
    'Reviews mostly the same people: {share} of their reviews go to {people}. Reviewing more widely spreads the knowledge of the code.',
  'Aucune demande de changements sur {reviewed} PR relues : vérifier que ses reviews ne sont pas des validations de principe.':
    'No changes requested on {reviewed} PRs reviewed: check that their reviews are more than a formality.',
  'Relit le plus : {people}.': 'Reviews the most: {people}.',
  'Référent de {repos} (au moins 40 % des PR).': 'Go-to person for {repos} (at least 40% of the PRs).',
  '{share} de ses PR sont mergées sans aucune review, alors que {approvals} approbations sont requises.':
    '{share} of their PRs are merged without any review, while {approvals} approvals are required.',
  '{share} de ses PR sont fermées sans être mergées : du travail jeté ou mal cadré.': '{share} of their PRs are closed without a merge: work thrown away or poorly scoped.',
  'Ses PR mettent longtemps à être mergées : {mine} en médiane, contre {team} pour l’équipe.':
    'Their PRs take long to be merged: {mine} as a median, against {team} for the team.',
  'PR mergées vite ({mine} en médiane) tout en passant par la review.': 'PRs merged quickly ({mine} as a median) while still going through review.',
  'PR volumineuses : {mine} lignes en médiane, contre {team} pour l’équipe. Plus petites, elles passeraient plus vite en review.':
    'Large PRs: {mine} lines as a median, against {team} for the team. Smaller ones would get through review faster.',
  'Activité très irrégulière d’un mois à l’autre.': 'Very uneven activity from one month to the next.',
  'Très régulière d’un mois à l’autre.': 'Very steady from one month to the next.',
  '{share} de ses PR sont mergées alors que les checks étaient en échec.': '{share} of their PRs are merged while the checks were failing.',
  'Corrige vite : ses hotfixes sont mergés en {mine} en médiane.': 'Fixes fast: their hotfixes are merged in {mine} as a median.',
  'Ses hotfixes mettent {mine} à être mergés en médiane, contre {team} pour l’équipe.':
    'Their hotfixes take {mine} to be merged as a median, against {team} for the team.',
  'Contribue à beaucoup de sujets produit : {projects} projets et {acs} AC sur ces mois.':
    'Contributes to many product topics: {projects} projects and {acs} AC over these months.',
  'Merge souvent les PR des autres ({count} sur ces mois).': 'Often merges others’ PRs ({count} over these months).',
  'Réactive en review : intervient {mine} après l’ouverture d’une PR, en médiane.': 'Responsive in review: steps in {mine} after a PR opens, as a median.',
  'Livre beaucoup sans déborder : {share} de son activité tombe dans les heures ouvrées.':
    'Delivers a lot without overflowing: {share} of their activity falls within working hours.',
  '{share} de son activité tombe la nuit ou le week-end : à surveiller, surcharge ou organisation à part.':
    '{share} of their activity falls at night or on weekends: worth watching, overload or a way of working of their own.',
}
