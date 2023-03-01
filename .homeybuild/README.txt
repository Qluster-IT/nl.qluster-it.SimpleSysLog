The new and improved Simple (Sys) LOG.

This app makes it possible to add logging and/or notifications to your Flows.
Optionally a log can have, next to it's message, an App/group, severity and facility.

You can also connect to multiple Syslog-clients to a) send specific message and b) have all default messages (with certain severities) send there.

This new version saves the logs into files and not in memory, granting a much larger log then before.

There is a completly new Settings page, with a Syslog-kind-of-interface, in which you can:
* Rotate the screen for better view on a Mobile or other landscape-screen device.
* Search and filter specific messages, dates, etc.
* Hide or move columns.
* Save the filters or columns as default.
* Download the complete Log as Excel, Csv or JSON, in the Mobile App, Developertools or within flows.


API

The folowing API endpoints can be used:
- Grab log data:
  GET /api/app/nl.nielsdeklerk.log/
- Add log data:
  PUT /api/app/nl.nielsdeklerk.log/addlog/
  Content-Type: application/json
  {"log": "Test 1,2,3", "group": "TEST"}
- Clear log
  GET /api/app/nl.nielsdeklerk.log/clearlog
- 


* Requires the Better Logic Library App to be installed.