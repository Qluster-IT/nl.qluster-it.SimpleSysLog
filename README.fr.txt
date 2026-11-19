Simple (Sys) Log.

FONCTIONNALITÉS
* Widgets de tableau de bord en direct avec recherche, filtres de niveau et de date, pagination facultative et modes clair et sombre.
* Personnalisez les designs et les thèmes, dont les designs Compact, Journal et Console et les thèmes Océan, Forêt, Coucher de soleil et Console.
* Partagez des designs et des thèmes au format TWF via les Modèles et The Widget Exchange(r), avec des aperçus zoomables en mode clair et sombre.
* Utilisez Homey Web Widgets pour faire défiler les journaux sur Android.
* Créez des liens temporaires de téléchargement CSV, Excel ou JSON depuis Advanced Flow.

Cette application permet d'ajouter des journaux et/ou des notifications à vos Flows. Optionnellement, un journal peut avoir, en plus de son message, une App/groupe, une sévérité et une installation.

Vous pouvez également vous connecter à plusieurs clients Syslog pour a) envoyer un message spécifique et b) envoyer tous les messages par défaut (avec certaines sévérités) là-bas.

Et enfin, vous pouvez créer un appareil serveur Syslog, pour permettre à d'autres clients Syslog de se connecter, qui seront inscrits dans le Simple (Sys) Log.

Les journaux sont stockés dans des fichiers plutôt qu'en mémoire, ce qui permet un journal plus volumineux.

La page des paramètres propose une interface de type Syslog, dans laquelle vous pouvez :
* Faire pivoter l'écran pour une meilleure vue sur un appareil Mobile ou autre écran en mode paysage.
* Rechercher et filtrer des messages, des dates, etc.
* Masquer ou déplacer des colonnes.
* Enregistrer les filtres ou colonnes comme par défaut.
* Télécharger le journal complet sous forme d'Excel, Csv ou JSON joliment formaté, dans l'application Mobile, l'application Web ou au sein des flows.

Vous pouvez utiliser les points de terminaison de l'API pour accéder au journal.

Better Logic Library est pris en charge (facultatif pour la journalisation de base, requis pour l'interface complète, les exports et les widgets). Utilisez le code BLL dans les champs de message et de groupe compatibles des Flows ; consultez les paramètres de l'app Better Logic Library pour les instructions.

Voir le sujet sur le Forum Communautaire pour des exemples et des informations.
Pour le wiki et le manuel de Simple (Sys) Log, sélectionnez "Visiter le site Web" sous "Site Web du développeur" sur la page de cette app dans le Homey App Store.