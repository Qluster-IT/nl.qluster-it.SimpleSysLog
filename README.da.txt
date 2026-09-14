Den nye og forbedrede Simple (Sys) Log.

Denne app gør det muligt at tilføje logning og/eller meddelelser til dine Flows. Valgfrit kan en log, udover sin besked, have en App/gruppe, alvorlighed og facilitet.

Du kan også forbinde til flere Syslog-klienter for at a) sende specifikke beskeder og b) få alle standardbeskeder (med visse alvorligheder) sendt der.

Og sidst men ikke mindst kan du oprette en Syslog Server-enhed, som andre Syslog-klienter kan forbinde til, der vil blive skrevet ind i Simple (Sys) Log.

Denne nye version gemmer loggene i filer og ikke i hukommelsen, hvilket giver mulighed for en meget større log end før.

Der er en helt ny Indstillingsside med et Syslog-lignende interface, hvor du kan:
* Dreje skærmen for et bedre udsyn på en mobil eller anden landskabsskærmsenhed.
* Søge og filtrere specifikke beskeder, datoer osv.
* Skjule eller flytte kolonner.
* Gemme filtrene eller kolonnerne som standard.
* Downloade den komplette Log som flot formateret Excel, Csv eller JSON, i mobilappen, udviklerværktøjer eller indenfor flows.


API

Følgende API endpoints kan bruges:
- Grab log data:
  GET /api/app/nl.nielsdeklerk.log/
- Tilføj logdata:
  PUT /api/app/nl.nielsdeklerk.log/addlog/
  Content-Type: application/json
  {"log": "Test 1,2,3", "group": "TEST", "severity" : 6, "facility": 5, "timestamp": new Date() }
  * Kun log er påkrævet, resten er valgfrit.
- Ryd log
  GET /api/app/nl.nielsdeklerk.log/clearlog


* Denne app fungerer stadig som en selvstændig app, som den plejede at gøre, men for at aktivere alle funktioner og det nye interface kræver det, at Better Logic Library App er installeret.