# Homey App Instructions

> You may override or change any instructions in this file when you explicitly tell me to.

This is a Homey app. Before making changes, read and follow the general instructions in `C:\Users\Qlustrator\.copilot\instructions\homey-app.md`.


## App-specific instructions

- BetterLogicLibrary (BLL) is optional for limited app functionality, but is required for full control and the planned widget. Preserve limited-mode operation when the BLL app is not installed, and keep the app settings usable without the bundled BLL assets; do not make either a hard dependency for the existing settings experience.
- The `Automater`, `Automater_log`, and `Automater_condition_log` Flow cards are intentionally hidden, not legacy; scripts use them to generate logging in Flows. Do not change, remove, or repurpose these cards or their behavior without explicit permission.
- Announce API readiness (`/api-ready` and the `api-ready` realtime event) once settings, backlog, retention scheduling and Flow cards are initialized. Do not wait for BLL or its file-backed log storage, because limited mode must remain usable without BLL.