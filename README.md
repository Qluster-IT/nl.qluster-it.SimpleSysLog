This app makes it possible to add logging to your Flows.

# Changelog

## 3.2.0

- Added live dashboard widgets with search, Level/Date filters and optional paging.
- Added the widget designer, built-in designs and themes, and TWF sharing through Templates and the Widget Exchange with light/dark images.
- Added signed Web widget links for Android dashboards.
- Added **Get log export URL** for CSV, Excel and JSON downloads from Advanced Flow.
- Improved mobile and desktop Excel exports, log storage efficiency, automatic cleanup and widget preview consistency.

# Features

With simple log You can:

- Add logging to your Flows
- tag your logging data with a group tag for tidy filtering.
- Add logging data while simultaniously showing the message on the Homey App's Timeline.
- Clear all logging.
- View your logged data within the app settings.
- See log events apear in realtime.
- View the log in CSV format.
- You can download the log in CSV format. -> https://developer.athom.com/tools/app-settings
- In Advanced Flow, **Get log export URL** creates a CSV, Excel or JSON file and returns **Local URL** (HTTP) and **Local (SSL) URL** (HTTPS) for the same file. Prefer HTTPS; use the link promptly, as it expires according to Better Logic Library's file availability setting. If the export cannot be generated or uploaded, the card takes the error branch without returning tokens.
- Excel exports use compatible column widths without shortening messages. Excel cannot hold more than 32,767 characters in a single cell; exports exceeding that limit fail explicitly instead of producing a damaged or silently truncated workbook. Use JSON or CSV for those entries.
- Settings downloads try the local connection, then the cloud connection when away from home. Failures and timeouts show an error popup instead of leaving the download busy indefinitely; successful downloads do not add panels or buttons to the settings screen.
- JSON, CSV and Excel downloads stream to BLL when supported, reducing peak memory. JSON reads log messages in small batches without changing their order or contents. Unreadable entries are skipped; settings show a popup with the skipped count, and Flow exports report that count in the app diagnostics. Generation and upload failures still fail the export.
- Use the API to retreive, add and clean logging.

# Dashboard widget

TWF exports and imports use the compressed v1 format; unreleased prototype encodings are not supported.

The Simple Sys Log dashboard widget shows recent entries and updates as new
entries arrive. Each widget can set:

- its entries per page and height (100 to 5000 pixels; the search bar stays at the top);
- light, dark, or automatic mode (automatic follows the dashboard);
- no, simple, or advanced search, with filters controlled separately;
- optional Previous/Next paging (off by default);
- a BLL date/time format or a custom format;
- filters for a minimum severity, a facility, and app/group or hostname text.

With **Show filters** enabled, the filter button appears next to the search
field, or on its own when Search Mode is **None**. Click **Level** or **Date**
to open that section; only one section opens at a time.
Under **Level**
you can select one or more levels to show only those entries, even levels
below the widget's minimum severity. Under **Date**, choose an inclusive
**From**/**To** range up to today; either end can be left blank, and changes apply
immediately. **All levels** and **All dates** clear their filters. These
interactive filters are saved separately for each widget instance and restored
when it reloads.
When paging is enabled, **Entries per page** controls the page size; otherwise,
it controls how many recent entries are shown.

The widget needs the Better Logic Library app. When BLL starts after the
widget has loaded, the widget loads its entries automatically.

In the app settings, open **Settings** from the log menu and select the
**Widgets** tab (next to **General**) to create designs and color themes,
then select them in the widget settings. Switch between **Designs** and
**Themes**, pick an item, and use **New**, **Copy** or **Delete**; built-in items
are read-only, so copy them to customize. The built-in **Default** design and
**Default** theme are used until you pick something else; the Default theme
uses fixed severity colors and Homey's default background and fill.
Log cards follow the dashboard's light or dark mode. Theme colors are named colors (red,
orange, yellow, green, teal, cyan, blue, indigo, purple, pink, brown, grey,
black, Black (light/dark), white) or **App default** (the widget's own color),
so every theme works in light and dark mode. Choose **None** for a transparent
widget background.
Black (light/dark) is the fixed `#2B2C36` shade; pure Black remains unchanged.
For an element, App default means its normal appearance based on the Widget colors.

Designs use a grid like Chronograph: select the **Widget**, a row, an `r.c`
column or an element to see its options. Each row has up to five columns that
share five units; a column can span several rows, and each element appears at
most once. Drag the selected row, column or element to move it, or drag an
element to **Unused** to hide it. Select an element to override its size, font,
text case, weight, italic or letter spacing; all are App default by default and
then keep the element's own look (for example the uppercase, bold severity pill).
Alongside Default, the built-in **Compact**, **Journal** and **Console** designs
offer dense, spacious and monospace layouts. Journal gives its App / Group and
Facility badges consistent spacing and a shared vertical center in widgets and previews. **Ocean**, **Forest** and **Sunset**
themes use blue, deep-green and warm-orange labels and accents while keeping
messages unhighlighted and Homey's default widget background and fill.
The **Console** theme pairs a dark-green gradient background with green text and
clear severity colors; combine it with the **Console** design for monospace logs.
**Aurora** pairs a spacious timeline layout with violet badges and teal accents.
Its matching theme keeps Homey's background and readable, unhighlighted messages.
**WidgetKeeper** takes inspiration from [WidgetKeeper](https://github.com/thomassidor/widgetkeeper)'s Light Control, Thermostat
Presets and Device Values: system typography, bold headings, calm blue accents
and understated metadata, with automatic light and dark backgrounds.
Custom gradient fills can use an optional **Gradient end color**; App default
keeps the existing mode-aware gradient.
Compact shows the date above the time, centered, because it has no day separators.
Use the Timestamp element's **Text wrapping** option to wrap to fit, prevent wrapping or
stack its text at spaces; the column's alignment also aligns the text.
Duplicate any built-in preset to customize it; existing widget selections stay unchanged.
All designs share the same default text spacing in widgets and previews;
per-element line-height overrides still take precedence.
Widgets load styles and saved filters together, reuse their card layout and search
expression, and avoid unnecessary scroll measurements during live updates.
Touch gestures scroll the widget without pinch or double-tap zoom.
**Search and filters** sits below Widget, above Day separator; **Paging** sits
below the log-card rows. Both have their own grid of up to two rows. Arrange
Search and Filters, or Previous, Page and Next, just like card elements.
Select either section to set its spacing, or an element to set its text styling,
minimum height, padding and corner radius. Themes can set each control's color
and background. The widget's search, filter and paging settings still determine
which controls are shown. Existing designs keep their appearance until edited.
Select the Timestamp element to pick its
BLL date/time format (default `timeshort`) or type your own; a format set in
the widget settings overrules it. The **Day separator** has its own small grid
of up to two rows with two elements: **Date** and **Line**. Select the Day
separator bar to show or hide the separators and set its number of rows.
While off, their rows and element controls are hidden without losing the layout;
the bar remains available to turn them back on. Select
the Date to set its size, font, text options and format (default `ddd d MMM`),
and the Line to set its position (behind, above or below the date), thickness
and style.
With the line behind the date, the column's vertical alignment places it at the
top, middle or bottom; you can also drag the line into its own row or column.
**Border 1–4** are border elements: drag one into a column and select it to set
its position (left, top, right or bottom) and thickness. A border uses the
severity color unless the theme sets one. When its column covers that whole
side of the card, it becomes the card's own (rounded) border; otherwise it
borders just that column. The Default design has Border 1 as a first column
spanning all rows, which gives the severity bar on the left. In
**Themes**, select the Widget to set the theme colors, or an element to set its
own color and background; the separator line and borders only have a color. Selecting the
Widget in a design also sets the **Border width**: **Homey default** preserves the
standard frame, while **0** removes the border and its subtle dark-mode rim.
The Widget also has optional padding for each side; rows have **Column gap**,
columns have **Element gap**, and text elements have **Line height**. Without
paging, bottom padding remains visible beneath the scrolling log list, including
in the Android Web widget. The Web widget also keeps the configured widget frame
visible while the page scrolls.
In a theme, set the **Widget border** color (default: Homey's line color),
use named or HEX colors, and choose a solid or gradient background fill.
Like Chronograph, the widget fills Homey's tile edge to edge with Homey's rounded corners
(`--homey-border-radius-default`), and in dark mode uses a near-black `#181920` surface with a
subtle light rim. Designer previews emulate the dashboard card's 10px corners instead of the
settings page's radius. Blue, green, orange, red, grey and white follow Homey's own palette.
Critical and Error use different red shades, both available in the designer.
Default (Syslog) uses the Default theme's appearance with syslog-inspired severity colors.
Whatever you select is outlined in the preview. Switching between Designs and
Themes keeps a selection when it is available in both. **Designer help** is open the first time and then
stays open or closed as you leave it.
Search, Level/Date filters and paging work with sample entries in the preview;
they do not change the filters saved for dashboard widgets.
Live updates keep the configured entry limit. New entries return the list to
the top when you are already near it; scrolling further down keeps your reading position.

Use the undo and redo buttons next to **Save** to step through the changes of
the design or theme you are editing. Switching to another design or theme,
between Designs and Themes, to the templates or to another settings tab asks
whether to discard unsaved changes first. Deleting a design or theme takes
effect immediately.

The **Templates** button opens template export, import and the community
templates. Designs and themes are shared as a TWF (The Widget File): compressed
text starting with `[twf:SimpleSysLog:LogViewer:`. Only TWFs for this app's
LogViewer widget family can be imported; other apps and widget families are rejected.

**Create TWF** also creates two preview images of the template, first in light
mode and then in dark mode, and copies a ready-made forum post with the images.
Images include the design's search, filter and paging controls and one entry for
each level, ordered from Emergency to Debug, without clipping the log list.
Switch the forum to its rich-text editor before pasting, so the images are
uploaded with the post. Automatic copying requires a secure context and
clipboard permission, which the Homey settings frame may block. If settings
are opened over HTTP or automatic copying is blocked, click **Copy post and
images** after generation; it copies the post and images without rendering
them again. Opening Homey over HTTPS resolves the insecure-HTTP case.

## Scrolling on Android

Dashboard widgets cannot scroll in the Homey app on Android yet. Enable
**Using scroll on Android?** in the widget settings: the widget then shows two
links to paste as the address of a default Homey **Web** widget:

- **Local link**: works only on your home network.
- **Automatic link**: loads through the Homey cloud and uses the local
  connection when it is reachable.

The Web widget shows this same log widget as a normal, scrollable page. New
entries arrive by long-polling. A Web widget cannot read the Homey app's
theme, so a widget in automatic mode stores the Homey app's current light/dark
theme in the link when you copy it; copy the link again after changing the
theme. When the app starts again (after a restart, update or
reinstall), the Web widget reloads itself once the app reports it is ready. Each link contains that widget's settings, signed by the app, so copy
the link again after changing them. Anyone with a link can read the entries it
shows; **Settings → General → Reset Android links** in the app settings makes all
existing links stop working.

Formatted timestamps are generated for log queries and realtime updates only.
They are not written to the log files; stored entries retain their raw timestamp.

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
They scan row IDs before splitting fields, so skipped rows do not allocate
field arrays. No cursor or index cache is retained between requests.
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
Cleanup runs at 00:05 in the same process-local calendar used for daily storage,
with a catch-up check at startup and after file storage finishes initializing.
File-based retention keeps today and the configured number of preceding days,
deleting all older daily log and index files together, not individual records.
Retained daily files and their streams are left alone. Manual cleanup Flow
actions still run immediately. Failed automatic cleanup is logged and retried
at the next daily check.
The age-based cleanup Flow action requires a finite number of at least 1 day,
including when supplied by a token. Use the separate full-clear action to
delete the entire log; zero and invalid values no longer clear it.
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
- Check readiness
  GET /api/app/nl.nielsdeklerk.log/api-ready

`GET /api-ready` returns `{ "ready": true }` once startup (settings, log backlog,
retention and Flow cards) has succeeded; the app then emits the `api-ready`
realtime event with the same payload. Readiness does not wait for Better Logic
Library: without it the app runs in limited mode and log-file endpoints report
that BLL is not running. Clients should subscribe before probing and confirm
through the endpoint rather than relying on an event they may have missed.
Failed startup remains not ready; a failed realtime notification is logged
without invalidating the endpoint.

When Better Logic Library starts and the file-backed log storage has
initialized, the app emits the `log_storage_ready` realtime event with
`{ "ready": true }`. The dashboard widget uses it to load the logs without a
manual reload.

The public `/android/*` endpoints serve the Web widget links described above.
Apart from `/android/ping`, they only answer requests that carry a valid signed
link.
