Die neue und verbesserte Simple (Sys) Log.

Diese App ermöglicht es, Protokollierung und/oder Benachrichtigungen zu deinen Flows hinzuzufügen. Optional kann ein Protokoll neben seiner Nachricht eine App/Gruppe, Schweregrad und Einrichtung enthalten.

Du kannst auch mehrere Syslog-Clients verbinden, um a) spezifische Nachrichten zu senden und b) alle Standardnachrichten (mit bestimmten Schweregraden) dorthin zu senden.

Und zu guter Letzt kannst du ein Syslog-Servergerät erstellen, damit sich andere Syslog-Clients verbinden können, was in das Simple (Sys) Log geschrieben wird.

Diese neue Version speichert die Protokolle in Dateien und nicht im Speicher, was ein viel größeres Protokoll als zuvor ermöglicht.

Es gibt eine komplett neue Einstellungsseite mit einer Syslog-ähnlichen Oberfläche, in der du:
* Den Bildschirm drehen kannst, um eine bessere Ansicht auf einem Mobilgerät oder anderen horizontalen Bildschirmen zu erhalten.
* Spezifische Nachrichten, Daten usw. suchen und filtern kannst.
* Spalten ausblenden oder verschieben kannst.
* Die Filter oder Spalten als Standard speichern kannst.
* Das komplette Protokoll als schön formatiertes Excel, CSV oder JSON herunterladen kannst, in der mobilen App, den Developer-Tools oder innerhalb von Flows.

API

Die folgenden API-Endpunkte können verwendet werden:
- Logdaten abrufen:
  GET /api/app/nl.nielsdeklerk.log/
- Logdaten hinzufügen:
  PUT /api/app/nl.nielsdeklerk.log/addlog/
  Content-Type: application/json
  {"log": "Test 1,2,3", "group": "TEST", "severity": 6, "facility": 5, "timestamp": new Date() }
  * Nur der Log ist erforderlich, der Rest ist optional.
- Log löschen
  GET /api/app/nl.nielsdeklerk.log/clearlog

* Diese App funktioniert nach wie vor als eigenständige App, jedoch erfordert sie die Installation der Better Logic Library App, um alle Funktionen und die neue Benutzeroberfläche zu aktivieren.