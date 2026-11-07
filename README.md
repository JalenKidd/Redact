# Redact

**Think before you send.** Redact checks a draft for sensitive details before you share it with an AI provider. It shows exactly which categories added points and suggests a version that preserves the request.

Built for Pluto Hacks. Start with the [90-second judging walkthrough](#90-second-judging-walkthrough).

## Run the Electron app

1. Install Node.js **22.12 or newer**.
2. Run `npm ci` in this folder.
3. Run `npm start` to open Redact as a native Electron desktop app.

The app bundles its own UI and runs the prompt scanner locally. Check a draft, review the rewrite, and copy it into your AI provider. To keep a manual-check summary, open **Exposure history → History settings**, enable saving, and choose **Save check** after checking a draft. Desktop history persists on this device and labels these records **Manual check**.

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

## Website and Chrome extension

1. Run `npm run dev` and open [the local dashboard](http://127.0.0.1:4173/).
2. For inline checking, open `chrome://extensions` in Chrome. Turn on **Developer mode**, choose **Load unpacked**, and select the generated `build/extension` folder. Refresh ChatGPT.
3. Pin Redact. In the popup, turn on **Keep exposure history** to record summaries of observed ChatGPT submissions. **Open local dashboard** opens that browser history view.

`npm run build` creates the shared web UI in `dist/`, the extension in `build/extension/`, and `dist/redact-extension.zip`. Set `REDACT_SITE_URL` before building to allow a different HTTPS dashboard origin, then reload the unpacked extension.

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
- **Scanner.** Version 2 rules cover common identifiers, explicit names, numbered street addresses, selected health disclosures, and credentials. Chrome's Prompt API or the opt-in desktop Ollama adapter can nominate verbatim contextual spans. Fixed weights count each category once and cap the score at 100. Desktop/dashboard rewrites let users keep necessary details; the extension applies consistent placeholders. A score of zero means that this scan found no signals.
- **History.** The extension keeps up to 200 summaries in local Chrome storage. The allowlisted dashboard can only read those summaries. The popup owns consent and clearing history. Unchecked submissions use rules for a quick score, while an unchanged checked draft can also carry the contextual categories that were found.
- **Guide.** Source-linked cards cover ChatGPT and DeepSeek consumer services. Actions open provider settings or a privacy portal and offer reviewable deletion request text. Users submit any request themselves.
- **Desktop app.** Electron bundles the UI in an isolated renderer with a narrow preload bridge. Manual-check history is opt-in and stored atomically in the app’s local data folder. Provider links open in the system browser.
- **Scope.** The desktop app and responsive website support manual checking. Inline checking and observed-submission history target desktop Chrome and the ChatGPT web composer. The desktop app uses rules by default with an optional local Ollama connection. Official chat export import is future work.

### Integration with device synchronization

This change leaves `desktop/history-store.mjs`, summary record shapes, category keys/weights, consent persistence, and the sync implementation untouched. New analysis results contain `version`, `coverage`, and stable occurrence IDs for the current draft. Keep model enablement and in-flight analysis local to a session. Never replay inference jobs or transfer prompt text merely because a summary synchronizes. Coordinate the additive IPC handlers in `desktop/main.mjs` and `desktop/preload.cjs` when merging a sync branch. Historical summaries retain their original category-weight semantics; detection coverage has expanded and should not be treated as identical across scanner versions.
