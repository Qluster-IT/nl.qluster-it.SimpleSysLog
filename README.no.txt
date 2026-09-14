Den nye og forbedrede Simple (Sys) Log.

Denne appen gjør det mulig å legge til logging og/eller varsler til dine Flows. Valgfritt kan en logg ha, i tillegg til meldingen, en App/gruppe, alvorlighetsgrad og anlegg.

Du kan også koble til flere Syslog-klienter for å a) sende spesifikke meldinger og b) ha alle standardmeldinger (med visse alvorlighetsgrader) sendt dit.

Og sist men ikke minst, kan du opprette en Syslog Server-enhet som lar andre Syslog-klienter koble seg til, som vil bli skrevet inn i Simple (Sys) Log.

Denne nye versjonen lagrer loggene i filer og ikke i minne, noe som gir en mye større logg enn før.

Det er en helt ny Innstillinger-side med et Syslog-lignende grensesnitt, hvor du kan:
* Roter skjermen for en bedre visning på en mobil eller annen enhet med landskapsskjerm.
* Søk og filtrer spesifikke meldinger, datoer, osv.
* Skjul eller flytt kolonner.
* Lagre filtrene eller kolonnene som standard.
* Last ned hele loggen som pent formatert Excel, Csv eller JSON, i mobilappen, Developertools eller innenfor flows.

API

Følgende API-endepunkter kan brukes:
- Hent loggdata:
  GET /api/app/nl.nielsdeklerk.log/
- Legg til loggdata:
  PUT /api/app/nl.nielsdeklerk.log/addlog/
  Content-Type: application/json
  {"log": "Test 1,2,3", "group": "TEST", "severity" : 6, "facility": 5, "timestamp":new Date() }
  * Bare log er påkrevd, resten er valgfritt.
- Tøm logg
  GET /api/app/nl.nielsdeklerk.log/clearlog
- 

* Denne appen fungerer fortsatt som en frittstående app som den pleide, men for å aktivere alle funksjonaliteter og det nye grensesnittet, krever det at Better Logic Library App er installert.