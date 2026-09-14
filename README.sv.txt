Den nya och förbättrade Simple (Sys) Log.

Den här appen gör det möjligt att lägga till loggning och/eller notifikationer i dina Flows. Valfritt kan en logg ha, förutom sitt meddelande, en App/grupp, allvarlighetsgrad och källa.

Du kan också ansluta till flera Syslog-klienter för att a) skicka specifikt meddelande och b) låta alla standardmeddelanden (med vissa allvarlighetsgrader) skickas dit.

Och sist men inte minst, du kan skapa en Syslog Server-enhet, för att låta andra Syslog-klienter ansluta till, som kommer att skrivas in i Simple (Sys) Log.

Denna nya version sparar loggarna i filer och inte i minnet, vilket möjliggör en mycket större logg än tidigare.

Det finns en helt ny inställningssida, med ett Syslog-liknande gränssnitt, där du kan:
* Rotera skärmen för en bättre vy på en mobil eller annan enhet i liggande läge.
* Söka och filtrera specifika meddelanden, datum, etc.
* Dölja eller flytta kolumner.
* Spara filter eller kolumner som standard.
* Ladda ner hela loggen som fint formaterad Excel, Csv eller JSON, i mobilappen, utvecklarverktyg eller inom flows.


API

Följande API-slutpunkter kan användas:
- Hämta loggdata:
  GET /api/app/nl.nielsdeklerk.log/
- Lägg till loggdata:
  PUT /api/app/nl.nielsdeklerk.log/addlog/
  Content-Type: application/json
  {"log": "Test 1,2,3", "group": "TEST", "severity": 6, "facility": 5, "timestamp":new Date() }
  * Bara logg är obligatoriskt, resten är valfritt.
- Rensa logg:
  GET /api/app/nl.nielsdeklerk.log/clearlog
- 


* Denna app fungerar fortfarande som en fristående app som tidigare, men för att aktivera alla funktioner och det nya gränssnittet, krävs det att Better Logic Library App är installerad.