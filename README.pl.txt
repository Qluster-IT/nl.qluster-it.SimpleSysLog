Nowy i ulepszony prosty (Sys) Log.

Ta aplikacja umożliwia dodawanie logów i/lub powiadomień do Twoich Flow.
Opcjonalnie, log może zawierać, obok swojej wiadomości, Aplikację/grupę, poziom ważności i urządzenie.

Możesz także połączyć się z wieloma klientami Syslog, aby a) wysłać określoną wiadomość i b) mieć wysyłane tam wszystkie domyślne wiadomości (o określonych poziomach ważności).

I wreszcie, możesz utworzyć urządzenie serwera Syslog, aby umożliwić połączenie się innym klientom Syslog, które zostaną zapisane w prostym (Sys) Logu.

Ta nowa wersja zapisuje logi do plików, a nie w pamięci, co zapewnia znacznie większy log niż wcześniej.

Istnieje całkowicie nowa strona Ustawień, z interfejsem przypominającym Syslog, w której możesz:
* Obracać ekran dla lepszego widoku na urządzeniu mobilnym lub innym ekranie krajobrazowym.
* Wyszukiwać i filtrować określone wiadomości, daty itp.
* Ukrywać lub przenosić kolumny.
* Zapisz filtry lub kolumny jako domyślne.
* Pobierz kompletny log jako ładnie sformatowany plik Excel, Csv lub JSON, w aplikacji mobilnej, narzędziach developerskich lub wewnątrz Flows.


API

Można używać następujących punktów końcowych API:
- Pobierz dane logu:
  GET /api/app/nl.nielsdeklerk.log/
- Dodaj dane logu:
  PUT /api/app/nl.nielsdeklerk.log/addlog/
  Content-Type: application/json
  {"log": "Test 1,2,3", "group": "TEST", "severity" : 6, "facility": 5, "timestamp":new Date() }
  * Tylko log jest wymagany, reszta jest opcjonalna.
- Wyczyść log
  GET /api/app/nl.nielsdeklerk.log/clearlog
- 


* Ta aplikacja wciąż działa jako samodzielna aplikacja, jak to było wcześniej, jednak aby włączyć wszystkie funkcje i nowy interfejs, wymagana jest instalacja aplikacji Better Logic Library App.