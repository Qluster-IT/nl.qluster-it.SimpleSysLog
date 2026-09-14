La nouvelle et améliorée Simple (Sys) Log.

Cette application vous permet d'ajouter des journaux et/ou des notifications à vos Flows. Optionnellement, un journal peut inclure, en plus de son message, une application/groupe, une gravité et une installation.

Vous pouvez également vous connecter à plusieurs clients Syslog pour a) envoyer des messages spécifiques et b) faire envoyer tous les messages par défaut (avec certaines gravités) là-bas.

Et enfin, mais pas le moindre, vous pouvez créer un appareil serveur Syslog, pour permettre à d'autres clients Syslog de s'y connecter, qui seront inscrits dans le Simple (Sys) Log.

Cette nouvelle version enregistre les journaux dans des fichiers et non plus en mémoire, offrant ainsi un journal beaucoup plus large qu'auparavant.

Il y a une toute nouvelle page de paramètres, avec une interface de type Syslog, dans laquelle vous pouvez :
* Faire pivoter l'écran pour une meilleure vue sur un appareil mobile ou autre écran en mode paysage.
* Rechercher et filtrer des messages spécifiques, des dates, etc.
* Masquer ou déplacer des colonnes.
* Enregistrer les filtres ou les colonnes par défaut.
* Télécharger le journal complet sous forme de fichier Excel, CSV ou JSON joliment formaté, dans l'application mobile, les outils de développement ou dans les flows.


API

Les points d'accès API suivants peuvent être utilisés :
- Obtenir des données de journal :
  GET /api/app/nl.nielsdeklerk.log/
- Ajouter des données de journal :
  PUT /api/app/nl.nielsdeklerk.log/addlog/
  Content-Type: application/json
  {"log": "Test 1,2,3", "group": "TEST", "severity" : 6, "facility": 5, "timestamp": new Date() }
  * Seul le journal est requis, le reste est optionnel.
- Effacer le journal :
  GET /api/app/nl.nielsdeklerk.log/clearlog
- 


* Cette application fonctionne toujours comme une application autonome comme auparavant, cependant, pour activer toutes les fonctionnalités et la nouvelle interface, il est nécessaire d'installer l'application Better Logic Library.