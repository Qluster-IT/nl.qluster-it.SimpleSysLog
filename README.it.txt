La nuova e migliorata Simple (Sys) Log.

Questa app permette di aggiungere registri e/o notifiche ai tuoi Flows. Facoltativamente, un registro può avere, oltre al suo messaggio, un App/gruppo, severità e facilità.

Puoi anche connetterti a più client Syslog per a) inviare messaggi specifici e b) inviare lì tutti i messaggi predefiniti (con certe severità).

E per ultimo, ma non meno importante, puoi creare un dispositivo Server Syslog, a cui altri client Syslog possono connettersi, che verranno scritti nel Simple (Sys) Log.

Questa nuova versione salva i registri nei file e non in memoria, permettendo un registro molto più grande rispetto a prima.

C'è una nuova pagina delle impostazioni, con un'interfaccia in stile Syslog, in cui puoi:
* Ruotare lo schermo per una migliore vista su un dispositivo mobile o altri schermi orizzontali.
* Cercare e filtrare messaggi specifici, date, ecc.
* Nascondere o spostare colonne.
* Salvare i filtri o le colonne come predefinito.
* Scaricare il registro completo come file Excel, Csv o JSON ben formattati, nell'App Mobile, nei Developertools o all'interno dei flow.


API

I seguenti endpoint API possono essere utilizzati:
- Afferramento dati del registro:
  GET /api/app/nl.nielsdeklerk.log/
- Aggiunta dati del registro:
  PUT /api/app/nl.nielsdeklerk.log/addlog/
  Content-Type: application/json
  {"log": "Test 1,2,3", "group": "TEST", "severity": 6, "facility": 5, "timestamp": new Date() }
  * Solo il registro è richiesto, il resto è facoltativo.
- Cancellazione registro
  GET /api/app/nl.nielsdeklerk.log/clearlog
- 


* Questa app funziona ancora come app indipendente come in passato, tuttavia, per abilitare tutte le funzionalità e la nuova interfaccia, richiede l'installazione della Better Logic Library App.