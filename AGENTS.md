# Instructions

This is a Homey app. Before making changes, read and follow the personal Homey App instructions at `C:\Users\Qlustrator\.copilot\instructions\homey-app.md`.
Use the npm package instructions (`C:\Users\Qlustrator\.copilot\instructions\homey-npm.md`), wiki instructions (`C:\Users\Qlustrator\.copilot\instructions\homey-wiki.md`) or Community Forum instructions (`C:\Users\Qlustrator\.copilot\instructions\homey-forum.md`) only when the task specifically involves those areas.


# App-specific instructions

- BetterLogicLibrary (BLL) is optional for limited app functionality, but is required for full control and the planned widget. Preserve limited-mode operation when the BLL app is not installed, and keep the app settings usable without the bundled BLL assets; do not make either a hard dependency for the existing settings experience.
- The `Automater`, `Automater_log`, and `Automater_condition_log` Flow cards are intentionally hidden, not legacy; scripts use them to generate logging in Flows. Do not change, remove, or repurpose these cards or their behavior without explicit permission.