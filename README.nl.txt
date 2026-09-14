De nieuwe en verbeterde Simple (Sys) Log.

Met deze app kun je logging en/of notificaties toevoegen aan je Flows. Optioneel kan een log naast het bericht een App/groep, belangrijkheid en faciliteit bevatten.

Je kunt ook verbinden met meerdere Syslog-clients om a) een specifiek bericht te sturen en b) alle standaardberichten (met bepaalde belangrijkheden) daarheen te laten sturen.

En last but not least, je kunt een Syslog Server-apparaat maken, waar andere Syslog-clients mee kunnen verbinden, die vervolgens in de Simple (Sys) Log worden geschreven.

Deze nieuwe versie slaat de logs op in bestanden en niet in het geheugen, wat zorgt voor een veel grotere log dan voorheen.

Er is een compleet nieuwe Instellingenpagina, met een Syslog-achtige interface, waarin je kunt:
* Het scherm draaien voor een beter zicht op een mobiel of ander landschapschermapparaat.
* Specifieke berichten, data, etc. zoeken en filteren.
* Kolommen verbergen of verplaatsen.
* De filters of kolommen als standaard opslaan.
* De volledige log downloaden als mooi opgemaakt Excel-, Csv- of JSON-bestand, in de Mobiele App, Ontwikkelaarstools of binnen flows.

API

De volgende API-eindpunten kunnen worden gebruikt:
- Loggegevens ophalen:
  GET /api/app/nl.nielsdeklerk.log/
- Loggegevens toevoegen:
  PUT /api/app/nl.nielsdeklerk.log/addlog/
  Content-Type: application/json
  {"log": "Test 1,2,3", "group": "TEST", "severity": 6, "facility": 5, "timestamp": new Date()}
  * Alleen log is vereist, de rest is optioneel.
- Log leegmaken:
  GET /api/app/nl.nielsdeklerk.log/clearlog

* Deze app functioneert nog steeds als zelfstandige app zoals voorheen, maar om alle functionaliteiten en nieuwe interface mogelijk te maken, is het de Better Logic Library App vereist om te installeren.