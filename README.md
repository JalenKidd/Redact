# Redact

**Think before you send.** Redact checks a draft for sensitive details before you share it with an AI provider. It shows exactly which categories added points and suggests a version that preserves the request.

Built for Pluto Hacks. Start with the [90-second judging walkthrough](#90-second-judging-walkthrough).

## Run the Electron app

1. Install Node.js **22.12 or newer**.
2. Run `npm ci` in this folder.
3. Run `npm start` to open Redact as a native Electron desktop app.

The welcome screen uses a two-beat logo and wordmark animation inspired by Pulse. Choose **Open Redact** to enter the workspace, or **Take a quick tour** to rehearse the demo. **Replay welcome** repeats the introduction. Page transitions, score counts, and redaction effects follow the system’s reduced-motion preference.

The app bundles its own UI and runs the prompt scanner locally. Check a draft, review the rewrite, and copy it into your AI provider. To keep a manual-check summary, choose **Save check** after checking a draft. Redact asks you to allow saving the first time. Desktop history persists on this device and labels these records **Manual check**.

### Improved privacy checks and rewrite controls

The scanner now catches explicit full-name introductions (including many accented and hyphenated names), common numbered street addresses, several first-person/family health disclosures, labeled passwords/tokens, and additional credential formats. These are English-oriented heuristics, not universal person-name, address, or medical recognition. Contextual AI can add further exact-span findings.

After a check, **Choose what the task needs** lets you replace each flagged detail or keep necessary context. For example, keep a medical condition when preparing questions for a doctor while replacing an email address. The before/after comparison keeps retained details in the revised exposure score. Distinct values use distinct placeholders, and repeated identical values share a placeholder. Existing placeholders are not reused for a different value. Text outside the selected spans—including task instructions, units, and output constraints—is preserved.

The revised score uses the same rules and carries retained contextual findings through the edits. It does not claim a fresh semantic scan of the rewrite or guaranteed downstream answer quality. Review the final text before sharing. A failed or incomplete contextual check is labeled **rules only**; a zero score means no detected signals, not guaranteed safety.

### Optional local contextual AI in Electron

The desktop app can use a separately installed **Ollama** server. This is opt-in for each Redact session; drafts are not sent to it until you enable the connection and choose **Check my prompt**.

1. Install a current version of [Ollama](https://ollama.com/download).
2. Download the model once with `ollama pull qwen3:4b`. This download uses the internet and requires several GB of disk space.
3. Disable Ollama cloud features and restart its server. Redact checks `/api/status` and requires `cloud.disabled: true`, then verifies the installed model through `/api/tags` and `/api/show`. An older server that cannot provide these checks will remain unavailable.
4. In Redact, choose **Check contextual AI availability**, then **Enable for this session**. The setup dialog discloses the local recipient and limits. Use the same dialog to disable it.

On Windows, quit the Ollama tray application before starting a local-only server in a separate PowerShell window:

```powershell
$env:OLLAMA_NO_CLOUD = "1"
ollama serve
```

Leave that window running. On macOS/Linux, the equivalent terminal command is `OLLAMA_NO_CLOUD=1 ollama serve`. For a managed Ollama service or desktop application, set the variable for that service/application and restart it as described in [Ollama's configuration instructions](https://docs.ollama.com/faq#how-do-i-disable-ollamas-cloud-features).

Redact contacts only `127.0.0.1:11434` through a main-process adapter, ignores ambient proxy configuration, does not follow redirects, and does not download models or call cloud endpoints. Each inference rechecks local-only status. The model may nominate bounded exact spans; deterministic local code validates spans, assigns scores, and applies edits. It receives no tools or filesystem permissions from Redact. There is a 6,000-character contextual limit, 45-second deadline, bounded responses, cancellation on draft edits, and a rules-only fallback. The full rules scan supports 20,000 characters. Enabling local AI does not save prompts or change history consent.

The connection and failure paths are covered with controlled local responses. Actual Qwen accuracy, speed, and memory use still need benchmarking on target hardware; a real model inference was not run in this development environment. Loopback traffic is protected by the user's local Ollama configuration, not by an application sandbox around the separately installed server.

### Package the desktop app

- `npm run package:desktop` creates a runnable application folder for the current OS.
- `npm run dist:mac` creates a Mac ZIP and DMG.
- `npm run dist:win` creates a Windows installer.
- `npm run dist:linux` creates a Linux AppImage.

Outputs go in `release/`. Build each distribution on its target OS. Mac builds are unsigned local/demo builds. Public distribution needs platform signing credentials.

`npm test` checks scoring, consent, and the two history stores. `npm run test:desktop` launches an isolated Electron test that verifies rewriting, saving, persistence after restart, and clearing. `REDACT_USER_DATA_DIR` can point the app at an isolated profile for tests and rehearsals.

The expanded tests cover missed disclosures, benign topics, Unicode names, credential formats, placeholder collisions, retained-context scoring, output validation, local-only checks, cancellation, and transport limits. For restricted Linux CI, `REDACT_HEADLESS=1 npm run test:desktop` uses headless Chromium and a test-only shim for the Unix-socket singleton lock. The normal desktop launch and normal smoke test do not load that shim. Platform installer signing and live model quality require separate target-machine checks.

## Sync your devices

Open **Devices → Enable device sync** on your first device. Select **Add a device** to generate a one-time QR code or pairing link. Scan it with your phone, or paste the code under **Devices → Enter pairing code** on another device. The [web app](https://redact-pluto-hacks.electbush1.chatgpt.site) supports phone browsers and pairs with Electron.

Redact encrypts saved check summaries and appearance preferences on the device before uploading them. Pairing links carry the encryption key in the URL fragment. The service stores encrypted summaries alongside the device names and connection times needed to manage the workspace. Prompt checks run locally. Removing a device blocks its future sync requests. You can clear the shared history in Devices.

Linked devices sync while Redact is open. **Sync now** refreshes immediately. Chrome extension summaries join the shared history when its connected dashboard is open. The **Overview** tab charts the saved summaries available to that workspace.

## Import and analyze past ChatGPT conversations

Open **History → Import past ChatGPT conversations** in the Electron app or browser. This feature is separate from saved desktop checks and Chrome submission summaries.

1. Get a ChatGPT export through **Settings → Data controls → Export data**. Follow the [official export instructions](https://help.openai.com/en/articles/7260999-exporting-your-chatgpt-history-and-data). Download and extract the ZIP, then find `conversations.json` or the numbered conversation JSON files described in [OpenAI's transfer guide](https://help.openai.com/en/articles/9106926-transfer-exported-conversations-between-chatgpt-accounts).
2. Choose one or more of those JSON files in Redact. ZIP and HTML imports are not supported. For a fictional trial, select `examples/chatgpt-synthetic.json` from this source repository.
3. Review the preview: conversation titles, user-prompt counts, attachments, malformed records, duplicate copies, and conflicts. Select the conversations you want to analyze.
4. Choose **Analyze selected conversations**. A dedicated local worker performs the rules scan and reports progress. You can cancel without replacing previously completed results.
5. Explore prompts ranked by detected score, filter by category or scan coverage, and open **Monthly exposure trends**. **Inspect prompt** shows the original exported user text, highlighted findings, scoring reasons, timestamps and branch labels. **Open in prompt scanner** copies the selected text into a draft for review; it does not automatically analyze, send, or save it.
6. Choose **Clear imported history** to clear the in-memory import and results. Closing or reloading the window also clears them. If you copied a prompt into the scanner, clear that separate draft there as needed.

### Supported format and coverage

The adapter supports ChatGPT-style conversation objects with `id`/`conversation_id`, a `mapping` keyed by node ID, and `message.author.role` / `message.content.parts`. Root arrays, a single conversation, and a `conversations` wrapper are accepted. This is a bounded adapter for that format, not a claim to support every current or future export variant. Initial validation uses synthetic fixtures, real Electron file inputs, and an isolated HTTP renderer; a representative sanitized real account export still needs acceptance testing.

Only user-authored prompts are scored. Assistant, system and tool message contents are not retained in the normalized dataset or counted as the user's disclosures. Current and alternate exported branches stay distinct using their node identities. Identical text in separate branches or conversations is not deduplicated. Missing/cyclic branch paths receive unknown labels. Duplicate node copies across numbered files are excluded; changed copies with the same identity keep the first version and produce a visible conflict count. Titles and text are rendered as inert text, never imported markup.

Bulk analysis uses **local rules only**, even if contextual AI is enabled for the draft scanner. It makes no model calls, provider requests, or attachment fetches. Names, medical context, languages and unusual identifier formats still have detection gaps. No cumulative conversation-level identity/linkability analysis is performed.

- **Full exported text:** a rules score is assigned to the supported text.
- **Partial:** attachments or other unsupported parts were excluded. The score is labeled `≥` as a lower bound on detected exposure; partial records are excluded from mean scores.
- **Unscanned:** no supported text, or a prompt longer than 20,000 characters. No score is assigned. Oversized prompt inspection displays only the first 20,000 characters with an explicit warning.
- **Mean and trends:** calculated only from fully scanned text prompts. Missing dates remain unknown; monthly buckets use UTC. Zero means no detected signals, not safety.

Limits apply to the whole import before selection: 20 JSON files / 16 MiB combined, 1,000 conversation records, 25,000 message nodes, 10,000 user prompt records and 4 million extracted text characters. Oversized jobs fail with an explanation; they are not silently truncated into a complete-looking result. Large exports may need smaller numbered files. Rendering uses 25 prompts per page.

### Data lifetime and sync boundary

Raw imports, previews and detailed results stay in the worker/window memory. They are not written into `exposure-history.json`, Chrome storage, localStorage or sessionStorage, and are not added to device sync. The existing saved summary format and consent controls are unchanged. This is application-level memory-only handling, not guaranteed physical memory erasure or control over operating-system swap/crash capture. The original export files remain where the user saved them.

Persistent imported history is deferred until an encrypted vault and deletion/sync contracts are implemented. Keep raw conversations out of summary synchronization. A new successful analysis replaces the imported view; a failed or cancelled replacement keeps the prior completed view.

Run `npm test` for parser/scoring/coverage/resource tests and `npm run test:import` for the real Electron import journey. On restricted Linux CI use `REDACT_HEADLESS=1 npm run test:import`. The smoke test uses synthetic in-memory files, verifies isolation from saved summaries and model calls, handles malformed replacements and inert markup, and checks clearing/reload behavior.

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
| 55–70s | Open **History**. Point to the new 0-point summary. | “I opted into history. Redact saved the date, provider, score, and reason labels in this browser. The original words stayed out of the history.” |
| 70–90s | Open **Privacy guide**. Show the two ChatGPT actions, then the DeepSeek card. | “Before I send, Redact helps me share less. After I send, it shows me how to change my provider’s training or deletion settings.” |

**Fictional draft to paste**

> Draft a short email asking my professor for a one-day extension on my lab report. For reference, my phone number is (202) 555-0147 and my student ID is PH-482716.

**Desktop presentation:** Open Redact with `npm start` and click **Take a tour** for a walkthrough. To show real desktop persistence, exit the demo, check the fictional draft, choose **Save check**, and open **History**.

**Rehearsal or backup:** Open the dashboard and click **Take a tour**. Follow the on-screen steps through **Check my prompt**, **Replace draft**, and **Simulate send**. Show the 75, 50, 20, and 0 scores in highest-exposure order. Explain that the prior entries are fictional and the simulated send stays in the page. Choose **Exit demo** to return to the real workspace.

**Before judging:** Run the flow once on the same Chrome profile and laptop you'll use on stage. Enable history in the popup, confirm that a fictional send appears in the dashboard, and rehearse switching tabs. Preload Chrome’s local model only if you plan to show contextual detection. The 50-to-0 example uses the rules scanner and works without a model download. If ChatGPT or its composer is unavailable, use the dashboard rehearsal.

## How it works

- **Extension.** The content script runs on ChatGPT. It checks the visible draft when asked, guards against replacing an edited draft, and waits for a matching visible user message before logging an opted-in send.
- **Scanner.** Version 2 rules cover common identifiers, explicit names, numbered street addresses, selected health disclosures, and credentials. Chrome's Prompt API or the opt-in desktop Ollama adapter can nominate verbatim contextual spans. Fixed weights count each category once and cap the score at 100. Desktop/dashboard rewrites let users keep necessary details; the extension applies consistent placeholders. A score of zero means that this scan found no signals.
- **History.** The extension keeps up to 200 summaries in local Chrome storage. The allowlisted dashboard can only read those summaries. The popup owns consent and clearing history. Unchecked submissions use rules for a quick score, while an unchanged checked draft can also carry the contextual categories that were found.
- **Guide.** Source-linked cards cover ChatGPT and DeepSeek consumer services. Actions open provider settings or a privacy portal and offer reviewable deletion request text. Users submit any request themselves.
- **Desktop app.** Electron bundles the UI in an isolated renderer with a narrow preload bridge. Manual-check history is opt-in and stored atomically in the app’s local data folder. Provider links open in the system browser.
- **Scope.** The desktop app and responsive website support manual checking and memory-only analysis of supported ChatGPT JSON exports. Inline checking and observed-submission history target desktop Chrome and the ChatGPT web composer. The desktop app uses rules by default with an optional local Ollama connection for individual drafts. Other provider importers, attachment analysis, encrypted persistent imported history, and cumulative conversation-level risk remain future work.

### Analysis and device sync

Contextual AI consent applies to the current app session on each device. Sync covers saved summary metadata and the appearance settings in Devices. Historical scores use the same category weights across devices, even as detection coverage changes between scanner versions.
