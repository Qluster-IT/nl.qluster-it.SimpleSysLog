This app makes it possible to add logging to your Flows.

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
in Homey Web Widgets for scrolling on Android. The Web widget also keeps the configured widget frame
visible while the page scrolls.
In a theme, set the **Widget border** color (default: Homey's line color),
use named or HEX colors, and choose a solid or gradient background fill.
Like Chronograph, the widget fills Homey's tile edge to edge with Homey's rounded corners
(`--homey-border-radius-default`), and in dark mode uses a near-black `#181920` surface with a
subtle light rim. Designer previews emulate the dashboard card's 10px corners instead of the
settings page's radius. Blue, green, orange, red, grey and white follow Homey's own palette.
Critical and Error use different red shades, both available in the designer.
Default (Syslog) uses the Default theme's appearance with syslog-inspired severity colors.
The live preview shows all entries on the current preview page. While editing
a custom design or theme, it pins above the settings tabs as you scroll down.
The pinned preview uses up to 45% of the viewport height, with the log list
scrolling inside it. The widget's own padding is preserved.
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

**The Widget Exchange(r)** remembers your sort order, including **Newest** or
**Oldest**. Under **Templates**, expand
a template to replace its live preview with its details and posted screenshots.
Tap a posted screenshot to open it full screen. Scroll to see
the rest of the image, and pinch or use the zoom buttons to inspect details.
With a mouse, use Ctrl+wheel to zoom at the pointer and drag to pan while zoomed in.
Posted screenshots keep their original colors in both light and dark mode.

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

# Changelog

## 4.0.0

- Added dashboard widgets with customizable designs and themes, search, filters and paging.
- Share templates and zoom in on screenshots in The Widget Exchange(r).
- Use Homey Web Widgets for scrolling on Android.
- Added Flow export links and improved exports, log storage and reliability.
- Improved browsing in The Widget Exchange(r) with saved sorting, an Oldest option and expanded template details.
- Updated light and dark widget picker previews to follow Homey App Store guidelines.

## 3.1.6

- Changed sourcecode and issues from Bitbucket to GitHub.

## 3.1.5

- Added: Automatic refresh in the App Settings (in preparation of the upcoming widget).

## 3.1.4

- Resolved: Issues with Homeys FontAwesome v5.

## 3.1.3

- Resolved: Fault in the API when not using BLL.

## 3.1.2

- Added: Search tag for the Store.

## 3.1.1

- Translated: Translated into all supported languages.

## 3.1.0

- Translated: Translated into all supported languages.

## 3.0.37

- Resolved: Reading non existing files could make the app crash.

## 3.0.36

- Added: Facility: Variable.

## 3.0.34

- Added: Flowcards now support BLL Coding.

## 3.0.33

- Resolved: Flowcard error because of a certain startup sequence.

## 3.0.32

- Improved: From now on, logs will be counted.

## 3.0.31

- Improved: From now on, logs will be counted.

## 3.0.30

- Resolved: "Old" Simple Log Startup on iOS devices.

## 3.0.29

- Added: Hidden flowcards for the Script to add log to all flows.

## 3.0.28

- Added: The facilities to all flowcards.

## 3.0.27

- Added: A triggercard which triggers when something is written to the log.

## 3.0.26

- Added: Setting to disable [Group] in the Timeline.

## 3.0.25

- Bugixing: Having a Syslogclient setup might duplicate logs.

## 3.0.24

- Bugixing: Settingsscreen not opening correct on iOS.

## 3.0.23

- Resolved: Rows sometimes have empty messages, the are now automaticly fixed.

## 3.0.22

- Bugfixing: Rows sometimes have empty messages, trying to find the issue.

## 3.0.21

- Solved: Transforming old logs into the new format made the app crash with many logs.

## 3.0.20

- Debugging: Solving an issue with startup from old version.

## 3.0.19

- Debugging: Solving an issue with startup.

## 3.0.18

- Removed: Debugging info from the App Settings (diagnostic is to small to work with).

## 3.0.17

- Added: Script for HS to send a log if there are faults in the log.

## 3.0.16

- Improved: Automatic removal of old logs will only show a logline when there were logfiles to be deleted.

## 3.0.15

- Added: Debugging logs.

## 3.0.14

- Added: Debugging logs.

## 3.0.13

- Added: Debugging logs.

## 3.0.12

- Added: More debugging options.

## 3.0.11

- Added: More debugging options.

## 3.0.10

- Added: A Debug option in the App Settings - Settings for diagnostics.

## 3.0.9

- Added: Settings: Automaticly removal of logs after x number of days.
- Bugfixed: Having the grid set to other than 50 rows would still only load 50 on opening App Settings.
- Loading App Settings has been speedup because of this.

## 3.0.8

- Resolved: A wrong error after clearing the log.

## 3.0.7

- Resolved: Automatic logging to Syslog client based on severity.

## 3.0.6

- Update: BLL dependency.

## 3.0.5

- Resolved: Double logging after Settings update!

## 3.0.4

- Resolved: UTC issue with Sysloc Clients: Update BLL to resolve the issue!

## 3.0.3

- Added:Facilities scene, trigger, condition and action.

## 3.0.2

- Bugfixes a report: Reading file error, please send diagnostic if lines are empty.

## 3.0.1

- Bugfixes a report: Reading file error.

## 3.0.0

- Version 3: First full release.

## 2.9.49

- Building Version 3: Testing an issue after Homey restart with the log.

## 2.9.48

- Building Version 3: Testing an issue after Homey restart with the log.

## 2.9.47

- Building Version 3: Testing an issue after Homey restart with the log.

## 2.9.46

- Building Version 3: Testing an issue after Homey restart with the log.

## 2.9.45

- Building Version 3: Resolving an issue after Homey restart with the log.

## 2.9.44

- Building Version 3: Resolving an issue after Homey restart with the log.

## 2.9.43

- Building Version 3: You can now create a Syslog Server device, turn Simple Log into a Syslog for network devices (improved settings).

## 2.9.42

- Building Version 3: You can now create a Syslog Server device, turn Simple Log into a Syslog for network devices.

## 2.9.41

- Building Version 3: API call PUT /addlog can now include severity, facility and timestamp in its json body properties.

## 2.9.40

- Building Version 3: API call PUT /addlog can now include severity, facility and timestamp in its json body properties.

## 2.9.39

- Building Version 3: Solving an issue.

## 2.9.38

- Building Version 3: Fixed Syslog client message and app.

## 2.9.37

- Building Version 3: Excel default date format can now be set through BLL.

## 2.9.36

- Building Version 3: Log can now also be retrieved in flows as CSV (base64), JSON (base64) and Excel (base64).

## 2.9.35

- Building Version 3: Log can now also be retrieved in flows as CSV (base64), JSON (base64) and Excel (base64).

## 2.9.34

- Building Version 3: Hidden Automater flowcards for the Include-Logging Script.

## 2.9.33

- Building Version 3: Hidden Automater flowcards for the Include Logging Script.

## 2.9.32

- Building Version 3: Exportfiles now also works through the Cloud (it will check one second if local is available, else send you through the cloud to the file).

## 2.9.31

- Building Version 3: Exportfiles can now take longer than the 10 seconds timeout of App Settings. Also, groups, messages and files can have Emoticons, new lines (enters/returns), etc.

## 2.9.30

- Building Version 3: Memory improvement.

## 2.9.29

- Building Version 3: Memory improvement.

## 2.9.28

- Building Version 3: Memory improvement.

## 2.9.27

- Building Version 3: Added a Show Hints in the Settings which is displayed the first time you open the App Settings.

## 2.9.26

- Building Version 3: Solved another potential HP2023 startup bug.

## 2.9.25

- Building Version 3: Solved another startup bug.

## 2.9.24

- Building Version 3: Excel, csv and json can now be downloaded from anywhere, also remote: save and secure!

## 2.9.23

- Building Version 3: Migration fixes.

## 2.9.22

- Building Version 3: Without BLL Simple LOG is exactly as before and functions as it used to.

## 2.9.21

- Building Version 3: Without BLL Simple LOG is exactly as before and functions as it used to.

## 2.9.20

- Building Version 3: Without BLL Simple LOG is exactly as before and functions as it used to.

## 2.9.19

- Building Version 3: More error handling.

## 2.9.18

- Building Version 3: More translations.

## 2.9.17

- Building Version 3: Excel headers translated, styled, sticky and sized.

## 2.9.16

- Building Version 3: Almost done.

## 2.9.15

- Building Version 3: Works with all Homey Pro's again.

## 2.9.14

- Building Version 3: Export large logs in Excel, CSV and JSON on Developer-site and the Homey Mobile App.

## 2.9.13

- Building Version 3: Export large logs in Excel, CSV and JSON on Developer-site and the Homey Mobile App.

## 2.9.12

- Building Version 3: Export the log in Excel, CSV and JSON on Developer-site and the Homey Mobile App.

## 2.9.11

- Building: Version 3.0.0.

## 2.9.10

- Building: Version 3.0.0.

## 2.9.9

- Building: Version 3.0.0.

## 2.9.8

- Building: Version 3.0.0.

## 2.9.7

- Bugfixed: CSV can now be downloaded again and the CSV text can be selected within the Homey App Settings. And some minor other bugs.

## 2.9.6

- Bugfixed: CSV can now be downloaded again and the CSV text can be selected within the Homey App Settings.

## 2.9.5

- Improved: Works with Early 2023!

## 2.9.4

- Resolved: AddLog api bug.

## 2.9.3

- Added: Flowcard (then) to retrieve the log as json.

## 2.9.2

- Resolved: getLogs API back to public.

## 2.9.1

- Updated to SDK3.

## 2.9.0

- SDK3

## 2.4.5

- Fixed textual errors within the readme.EXT

## 2.4.4

- API Fix
