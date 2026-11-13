This app makes it possible to add logging to your Flows.

With simple log You can:

- Add logging to your Flows
- tag your logging data with a group tag for tidy filtering.
- Add logging data while simultaniously showing the message on the Homey App's Timeline.
- Clear all logging.
- View your logged data within the app settings.
- See log events apear in realtime.
- View the log in CSV format.
- You can download the log in CSV format. -> https://developer.athom.com/tools/app-settings
- Use the API to retreive, add and clean logging.

# Log storage

Existing log indexes are upgraded sequentially during startup using streaming I/O.
Paged queries without a message-text filter select index entries before loading
messages. Adjacent messages share read buffers of up to 64 KiB; larger individual
messages are read separately. These buffers are local to each request, not cached.
Message-text searches filter batches of up to 64 records or 64 KiB before reading
more, retaining only matches. A single larger message is processed separately.
Text-filtered paging keeps only the best `skip + take` index entries, discards
message text after checking it, and reloads messages for the returned page.
This bounded path applies when `skip + take` is at most 10,000.
Searches still scan candidate message contents; unbounded queries and exports
require memory for their matching results.
App and hostname searches with no matching names skip logbook reads entirely.
Cursor lookups explicitly close their index files, including on early returns.
Bounded paging reuses compact numeric candidates as newer entries replace older
ones. Dates and app/hostname names are materialized only for the returned page,
not for skipped records, without retaining result objects between requests.
V2 index scans use bounded asynchronous file reads instead of creating a Node.js
read stream and its async-iterator machinery for every daily logbook. Each query
reuses one 16 KiB index buffer across its daily books, including exports; concurrent
queries have separate buffers. File handles close before scans finish or return
early, and no index contents are cached between requests.
Complete scans remember only the maximum indexed timestamp per daily book, so
later paged queries can skip books that cannot improve the selected page.
Bounds include all rows regardless of filters or book dates. Writes invalidate
them immediately, and scans overlapping writes do not establish new bounds.
Exports remain complete scans; messages and index rows are not cached.
Numeric index parsing avoids per-row arrays and unnecessary boxed numbers.
Paged result IDs are created only for selected records. This reduces allocation
pressure without forced garbage collection; Node.js may still retain allocated
memory for reuse.
Automatic retention keeps a single cleanup timer across settings reloads and
releases it when retention is disabled or the app shuts down.
Inactive daily logbooks release their write streams after pending writes finish.
Backdated entries reopen the files for appending, preserving existing messages,
record IDs, and write order without keeping historical writers in memory.

# API

The folowing API endpoints can be used:

- Grab log data:
  GET /api/app/nl.nielsdeklerk.log/
- Add log data:
  PUT /api/app/nl.nielsdeklerk.log/addlog/
  Content-Type: application/json
  {"log": "Test 1,2,3", "group": "TEST"}
- Clear log
  GET /api/app/nl.nielsdeklerk.log/clearlog
