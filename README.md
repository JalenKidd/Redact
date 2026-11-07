# Redact

**Think before you send.** Redact checks a draft for sensitive details before you share it with an AI provider. It shows exactly which categories added points and suggests a version that preserves the request.

Built for Pluto Hacks. Start with the [90-second judging walkthrough](#90-second-judging-walkthrough).

## Run locally

1. Install Node.js 20 or newer. The build also uses the `zip` command, which is included on macOS.
2. Run `npm run dev` in this folder and open [the local dashboard](http://127.0.0.1:4173/).
3. For the desktop integration, open `chrome://extensions` in Chrome. Turn on **Developer mode**, choose **Load unpacked**, and select the generated `build/extension` folder. Refresh ChatGPT.
4. Pin Redact. In the popup, turn on **Keep exposure history** if you want the dashboard to record your submissions. **Open local dashboard** opens the local history view.

`npm test` verifies the sample, scoring, anchored contextual edits, consent, and the history boundary. `npm run build` creates `dist/` and `build/extension/`. The website can also serve `dist/redact-extension.zip` for manual installation. To package for a different HTTPS dashboard origin, set `REDACT_SITE_URL` before building and reload the unpacked extension.

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

**Rehearsal or backup:** Open the dashboard and click **Run the demo**. Follow the on-screen steps through **Check my prompt**, **Replace draft**, and **Simulate send**. Show the 75, 50, 20, and 0 scores in highest-exposure order. Explain that the prior entries are fictional and the simulated send stays in the page. Choose **Exit demo** to return to the real workspace.

**Before judging:** Run the flow once on the same Chrome profile and laptop you'll use on stage. Enable history in the popup, confirm that a fictional send appears in the dashboard, and rehearse switching tabs. Preload Chrome’s local model only if you plan to show contextual detection. The 50-to-0 example uses the rules scanner and works without a model download. If ChatGPT or its composer is unavailable, use the dashboard rehearsal.

## How it works

- **Extension.** The content script runs on ChatGPT. It checks the visible draft when asked, guards against replacing an edited draft, and waits for a matching visible user message before logging an opted-in send.
- **Scanner.** Rules cover common identifiers and credentials. Chrome's Prompt API can nominate verbatim contextual spans on compatible devices. Fixed weights count each category once and cap the score at 100. Rewrites replace the matched spans with typed placeholders. A score of zero means that this scan found no signals.
- **History.** The extension keeps up to 200 summaries in local Chrome storage. The allowlisted dashboard can only read those summaries. The popup owns consent and clearing history. Unchecked submissions use rules for a quick score, while an unchanged checked draft can also carry the contextual categories that were found.
- **Guide.** Source-linked cards cover ChatGPT and DeepSeek consumer services. Actions open provider settings or a privacy portal and offer reviewable deletion request text. Users submit any request themselves.
- **Scope.** The responsive dashboard supports manual checking. Inline checking and submission history target desktop Chrome and the ChatGPT web composer. Desktop packaging with Electron and official chat export import are future work.
