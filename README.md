# Redact

**Think before you send.** Redact checks a draft for sensitive details before you share it with an AI provider. It shows exactly which categories added points and suggests a version that preserves the request.

Built for Pluto Hacks. Start with the [90-second judging walkthrough](#90-second-judging-walkthrough).

## Run the Electron app

1. Install Node.js **22.12 or newer**.
2. Run `npm ci` in this folder.
3. Run `npm start` to open Redact as a native Electron desktop app.

The welcome screen uses a two-beat logo and wordmark animation inspired by Pulse. Choose **Open Redact** to enter the workspace, or **Take a quick tour** to rehearse the demo. **Replay welcome** repeats the introduction. Page transitions, score counts, and redaction effects follow the system’s reduced-motion preference.

The app bundles its own UI and runs the prompt scanner locally. Check a draft, review the rewrite, and copy it into your AI provider. To keep a manual-check summary, open **Exposure history → History settings**, enable saving, and choose **Save check** after checking a draft. Desktop history persists on this device and labels these records **Manual check**.

## Sync your devices

Open **Devices → Enable device sync** on your first device. Select **Add a device** to generate a one-time QR code or pairing link. Scan it with your phone, or paste the code under **Devices → Enter pairing code** on another device. The [web app](https://redact-pluto-hacks.electbush1.chatgpt.site) supports phone browsers and pairs with Electron.

Redact encrypts saved check summaries and appearance preferences on the device before uploading them. Pairing links carry the encryption key in the URL fragment. The service stores encrypted summaries alongside the device names and connection times needed to manage the workspace. Prompt checks run locally. Removing a device blocks its future sync requests. You can clear the shared history in Devices.

Linked devices sync while Redact is open. **Sync now** refreshes immediately. Chrome extension summaries join the shared history when its connected dashboard is open. The **Overview** tab charts the saved summaries available to that workspace.

### Package the desktop app

- `npm run package:desktop` creates a runnable application folder for the current OS.
- `npm run dist:mac` creates a Mac ZIP and DMG.
- `npm run dist:win` creates a Windows installer.
- `npm run dist:linux` creates a Linux AppImage.

Outputs go in `release/`. Build each distribution on its target OS. Mac builds are unsigned local/demo builds. Public distribution needs platform signing credentials.

`npm test` checks scoring, consent, and the two history stores. `npm run test:desktop` launches an isolated Electron test that verifies rewriting, saving, persistence after restart, and clearing. `REDACT_USER_DATA_DIR` can point the app at an isolated profile for tests and rehearsals.

## Website and Chrome extension

1. Run `npm run dev` and open [the local dashboard](http://127.0.0.1:4173/).
2. For inline checking, open `chrome://extensions` in Chrome. Turn on **Developer mode**, choose **Load unpacked**, and select the generated `build/extension` folder. Refresh ChatGPT.
3. Pin Redact. In the popup, turn on **Keep exposure history** to record summaries of observed ChatGPT submissions. **Open local dashboard** opens that browser history view.

`npm run build` creates the shared web UI in `dist/`, the extension in `build/extension/`, and `dist/redact-extension.zip`. Set `REDACT_SITE_URL` before building to allow a different HTTPS dashboard origin, then reload the unpacked extension.

The local web server also runs the pairing API with SQLite. Use `REDACT_SYNC_URL=http://127.0.0.1:4173 npm start` to connect the development Electron app to that local service. Hosted builds package the same API as a Worker with a D1 database. Database schema changes are generated with `npm run db:generate`.

## 90-second judging walkthrough

| Time | What to show | What to say |
| --- | --- | --- |
| 0–15s | Open a fresh ChatGPT tab with the fictional draft below. | “I need help writing an email to my professor. I’m about to share two details the AI doesn’t need.” |
| 15–35s | Click **Check with Redact**. Point to the phone number and student ID, then the **50/100** rules score. | “This check runs on my device. Each category has a fixed weight, so I can see exactly where the score comes from.” |
| 35–55s | Click **Replace draft**. Point to the same email request and the two placeholders. Send the revised fictional draft. | “My request still makes sense. I can review the draft and decide when to send it.” |
| 55–70s | Open **Exposure history** and choose **Most recent**. Point to the new 0-point summary. | “I opted into history. Redact saved the date, provider, score, and reason labels in this browser. The original words stayed out of the history.” |
| 70–90s | Open **Privacy guide**. Show the two ChatGPT actions, then the DeepSeek card. | “Before I send, Redact helps me share less. After I send, it shows me how to change my provider’s training or deletion settings.” |

**Fictional draft to paste**

> Draft a short email asking my professor for a one-day extension on my lab report. For reference, my phone number is (202) 555-0147 and my student ID is PH-482716.

**Desktop presentation:** Open Redact with `npm start` and click **Run the demo** for a self-contained walkthrough. To show real desktop persistence, exit the demo, check the fictional draft, enable history, choose **Save check**, and open **Exposure history**.

**Rehearsal or backup:** Open the dashboard and click **Run the demo**. Follow the on-screen steps through **Check my prompt**, **Replace draft**, and **Simulate send**. Show the 75, 50, 20, and 0 scores in highest-exposure order. Explain that the prior entries are fictional and the simulated send stays in the page. Choose **Exit demo** to return to the real workspace.

**Before judging:** Run the flow once on the same Chrome profile and laptop you'll use on stage. Enable history in the popup, confirm that a fictional send appears in the dashboard, and rehearse switching tabs. Preload Chrome’s local model only if you plan to show contextual detection. The 50-to-0 example uses the rules scanner and works without a model download. If ChatGPT or its composer is unavailable, use the dashboard rehearsal.

## How it works

- **Extension.** The content script runs on ChatGPT. It checks the visible draft when asked, guards against replacing an edited draft, and waits for a matching visible user message before logging an opted-in send.
- **Scanner.** Rules cover common identifiers and credentials. Chrome's Prompt API can nominate verbatim contextual spans on compatible devices. Fixed weights count each category once and cap the score at 100. Rewrites replace the matched spans with typed placeholders. A score of zero means that this scan found no signals.
- **History.** The extension keeps up to 200 summaries in local Chrome storage. The allowlisted dashboard can only read those summaries. The popup owns consent and clearing history. Unchecked submissions use rules for a quick score, while an unchanged checked draft can also carry the contextual categories that were found.
- **Guide.** Source-linked cards cover ChatGPT and DeepSeek consumer services. Actions open provider settings or a privacy portal and offer reviewable deletion request text. Users submit any request themselves.
- **Desktop app.** Electron bundles the UI in an isolated renderer with a narrow preload bridge. Manual-check history is opt-in and stored atomically in the app’s local data folder. Provider links open in the system browser.
- **Scope.** The desktop app and responsive website support manual checking. Inline checking and observed-submission history target desktop Chrome and the ChatGPT web composer. The desktop app uses the rules scanner. Official chat export import is future work.
