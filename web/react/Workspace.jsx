import { Catalog } from "./Catalog.jsx";
import { VisibilityPreview } from "./VisibilityPreview.jsx";

function Welcome() {
  return (
    <section className="welcome-screen" id="welcome-screen" aria-labelledby="welcome-heading" role="dialog" aria-modal="true" hidden>
      <div className="welcome-frame">
        <div className="welcome-top"><span className="brand"><img src="brand.svg" alt="" width="35" height="35" /><span>redact.</span></span><span className="edition">BUILT AT PLUTO HACKS</span></div>
        <div className="welcome-content">
          <div>
            <div className="hero-kicker"><span></span> PROMPT PRIVACY</div>
            <h1 id="welcome-heading">Your words.<br /><em>Your call.</em></h1>
            <p>Check an AI prompt for private details before you share it.</p>
            <div className="welcome-actions"><button id="enter-workspace" className="primary-button welcome-primary">Open Redact <span aria-hidden="true">↗</span></button><button id="welcome-demo" className="text-button">Take a quick tour <span aria-hidden="true">→</span></button></div>
          </div>
          <div className="welcome-art" aria-hidden="true">
            <div className="welcome-orbit"></div>
            <div className="welcome-paper"><span>REDACT / LOCAL CHECK</span><div className="paper-lines"><i></i><i></i><i></i><i></i></div><div className="paper-verified"><img src="brand.svg" alt="" width="42" height="42" /><span>CHECKED ON DEVICE</span></div></div>
          </div>
        </div>
        <div className="welcome-bottom"><span className="edition">REDACT</span><span className="edition">YOUR DRAFT STAYS ON YOUR DEVICE</span></div>
      </div>
    </section>
  );
}

function Navigation() {
  return (
    <header className="app-bar">
      <a className="brand" href="#tools" aria-label="Redact home"><img src="brand.svg" alt="" width="36" height="36" /><span>redact<span className="brand-period">.</span></span></a>
      <nav aria-label="Main navigation"><span className="nav-indicator" aria-hidden="true"></span>
        <a href="#tools" data-route="tools" aria-label="AI tools"><svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5v5m0 9v5M2.5 12h5m9 0h5M7 7l2.4 2.4m5.2 5.2L17 17M7 17l2.4-2.4m5.2-5.2L17 7"/><circle cx="12" cy="12" r="2.5"/></svg><span className="nav-label" aria-hidden="true">AI tools</span><span className="nav-short" aria-hidden="true">Tools</span></a>
        <a href="#scan" data-route="scan" aria-label="Check"><svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V6a2 2 0 0 1 2-2h3m6 0h3a2 2 0 0 1 2 2v3m0 6v3a2 2 0 0 1-2 2h-3m-6 0H6a2 2 0 0 1-2-2v-3M4 12h16"/></svg><span className="nav-label" aria-hidden="true">Check</span><span className="nav-short" aria-hidden="true">Check</span></a>
        <a href="#history" data-route="history" aria-label="History"><svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/></svg><span className="nav-label" aria-hidden="true">History</span><span className="nav-short" aria-hidden="true">History</span></a>
        <a href="#overview" data-route="overview" aria-label="Overview"><svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4" width="7" height="7" rx="1.5"/><rect x="13.5" y="4" width="7" height="7" rx="1.5"/><rect x="3.5" y="14" width="7" height="7" rx="1.5"/><rect x="13.5" y="14" width="7" height="7" rx="1.5"/></svg><span className="nav-label" aria-hidden="true">Overview</span><span className="nav-short" aria-hidden="true">Overview</span></a>
        <a href="#devices" data-route="devices" aria-label="Devices"><svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="2.8" y="4.5" width="13.5" height="10" rx="2"/><path d="M2 18h8"/><rect x="13.5" y="9.5" width="7.7" height="11" rx="1.8"/><path d="M16.7 17.7h1.4"/></svg><span className="nav-label" aria-hidden="true">Devices</span><span className="nav-short" aria-hidden="true">Devices</span></a>
      </nav>
      <button className="tour-button" id="start-demo">Take a tour <span aria-hidden="true">↗</span></button>
    </header>
  );
}

function OverviewPage() {
  return (
    <section id="overview-page" className="page" aria-labelledby="overview-heading" hidden>
      <div className="page-heading"><div><div className="section-kicker">YOUR ACTIVITY</div><h1 id="overview-heading">Overview<span>.</span></h1><p>See what Redact finds in the checks you save.</p></div></div>
      <section className="card simple-empty" id="overview-empty"><h2>Start with one prompt</h2><p>Check a draft and save the result to see your activity here.</p><a className="primary-button" href="#scan">Check a prompt <span aria-hidden="true">↗</span></a></section>
      <section className="recent-panel card" id="overview-recent" aria-labelledby="recent-heading" hidden><div className="panel-header"><h2 id="recent-heading">Recent checks</h2><a className="text-button" href="#history">See history ↗</a></div><div id="recent-checks" className="recent-list"></div></section>
      <details className="card disclosure" id="overview-trends" hidden>
        <summary>View trends</summary>
        <div className="disclosure-content">
          <div id="overview-metrics" className="workspace-metrics"></div>
          <div className="overview-grid">
            <section className="activity-panel card" aria-labelledby="activity-heading"><div className="panel-header"><div><span className="tiny-label">LAST 7 DAYS</span><h2 id="activity-heading">Check activity</h2></div><span className="legend"><i></i> Checks <i></i> High exposure</span></div><div id="activity-chart" className="activity-chart"></div></section>
            <section className="category-panel card" aria-labelledby="category-heading"><div className="panel-header"><h2 id="category-heading">Most common details</h2></div><div id="top-categories" className="category-list"></div></section>
          </div>
        </div>
      </details>
    </section>
  );
}

function CheckPage() {
  return (
    <section id="scan-page" className="page" hidden>
      <div className="page-heading scan-heading">
        <div><div className="section-kicker">PROMPT CHECK</div><h1>Check a prompt<span>.</span></h1><p>See if your draft shares more than you intended.</p></div>
        <ol className="scan-steps" aria-label="Check progress"><li id="draft-step" aria-current="step"><span>01</span> Draft</li><li id="review-step"><span>02</span> Review</li></ol>
      </div>
      <div className="tool-destination" id="tool-destination" hidden><div id="selected-tool"></div><a className="text-button" href="#tools">Change tool</a></div>
      <div className="scan-stage">
        <section className="editor-card card" aria-labelledby="draft-heading">
          <div className="card-heading"><h2 id="draft-heading">Your draft</h2><button className="text-button sample-button" id="load-example">Try an example</button></div>
          <label className="sr-only" htmlFor="prompt">Prompt to check</label>
          <div className="editor-field"><div className="scan-light" aria-hidden="true"></div><textarea id="prompt" maxLength="20000" spellCheck="false" autoComplete="off" autoCorrect="off" placeholder="Type or paste what you plan to ask AI."></textarea><div className="draft-effect" id="draft-effect" aria-hidden="true" hidden></div></div>
          <div className="editor-meta" id="char-limit" hidden><span id="char-count"></span></div>
          <div className="editor-actions"><p className="local-note">Your draft stays on this device.</p><div className="check-actions"><button className="text-button" id="clear-draft" hidden>Clear</button><button className="primary-button" id="check-prompt">Check my prompt <span aria-hidden="true">↗</span></button></div></div>
        </section>

        <section className="result-card card" id="check-result" aria-labelledby="result-heading" hidden>
          <div className="result-intro">
          <div className="section-kicker">CHECK RESULT</div>
          <h2 id="result-heading" tabIndex="-1"></h2>
          <p id="result-summary"></p>
          <ul className="result-labels" id="result-labels" aria-label="Types of details found"></ul>
        </div>
        <VisibilityPreview />
        <section className="rewrite-card" id="rewrite-card" aria-label="Rewrite options" hidden>
          <div className="rewrite-bottom"><div><button className="primary-button" id="copy-rewrite">Copy suggestion</button><button className="text-button" id="replace-draft">Replace draft</button></div></div>
          <details className="disclosure result-disclosure" id="rewrite-options">
            <summary>Choose what to keep</summary>
            <div className="disclosure-content">
              <fieldset className="rewrite-choices"><legend>Details in your draft</legend><p>Keep anything AI needs to answer your question.</p><div id="rewrite-choices"></div></fieldset>
              <div id="rewrite-comparison" className="rewrite-comparison" role="status"></div>
            </div>
          </details>
        </section>
        <div className="result-actions" id="result-actions" hidden>
          <button className="primary-button" id="copy-draft" hidden>Copy draft</button>
          <a className="text-button" id="open-destination" target="_blank" rel="noopener noreferrer" hidden></a>
        </div>
        <details className="score-card disclosure result-disclosure" id="score-details">
          <summary>See score and reasons</summary>
          <div className="disclosure-content">
          <div className="score-summary"><div className="score-ring" id="score-ring"><svg className="score-track" viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="54" pathLength="100" className="score-track-base"/><circle cx="60" cy="60" r="54" pathLength="100" className="score-track-value" id="score-track-value"/></svg><div><strong id="score-value">—</strong><span>OUT OF 100</span></div></div><div className="score-caption"><span className="score-badge" id="score-rating">Ready when you are</span><p id="score-description">Check your draft to see<br />what it could reveal.</p></div></div>
          <div id="findings" className="findings"></div>
          <button className="text-button score-help" id="scoring-info">How the score works</button>
          </div>
        </details>
        <button className="text-button save-result" id="save-check" hidden>Save check</button>
        </section>
      </div>

      <div id="demo-send" className="demo-send" hidden><div><strong>Your draft is ready for a practice send.</strong><p>Save a fictional exposure summary to the demo history.</p></div><button className="primary-button" id="simulate-send">Simulate send →</button></div>

      <details className="scanner-options disclosure">
        <summary>More examples and settings</summary>
        <div className="disclosure-content">
          <div className="scenario-grid"><button data-example="job"><span className="scenario-icon">⌑</span><span><strong>Job application</strong><small>Personal email and phone</small></span><span aria-hidden="true">↗</span></button><button data-example="support"><span className="scenario-icon">◈</span><span><strong>Support request</strong><small>Test key and account email</small></span><span aria-hidden="true">↗</span></button></div>
          <div className="setting-links"><button className="text-button" id="enable-ai">Check contextual AI availability</button><span id="engine-status" role="status">Basic check ready</span></div>
        </div>
      </details>
    </section>
  );
}

function HistoryPage() {
  return (
    <section id="history-page" className="page" hidden>
      <div className="page-heading"><div><div className="section-kicker">SAVED CHECKS</div><h1>History<span>.</span></h1><p>Find the checks you’ve saved.</p></div></div>
      <section className="card redaction-activity" id="redaction-activity" aria-labelledby="activity-heading">
        <div className="activity-heading"><div><div className="section-kicker">REDACT ALERTS</div><h2 id="activity-heading">Redaction activity</h2></div>
          <button type="button" className="text-button" id="activity-clear" hidden>Clear alerts</button></div>
        <p id="activity-status">Redactions will appear here when you apply them.</p>
        <ul id="activity-items" className="activity-items" hidden></ul>
        <details className="activity-settings">
          <summary>Alert settings</summary>
          <label><input type="checkbox" id="activity-keep" /> Keep redaction alerts</label>
          <p>Save what happened, the provider, the time, and the number of details replaced. If you pair devices, those alerts sync encrypted. Prompt text stays on your device.</p>
          <p>For ChatGPT send alerts here, enable exposure history in the Chrome extension and open Redact in the same browser.</p>
        </details>
      </section>
      <section className="card history-card" aria-label="Saved checks">
        <div id="history-content"></div>
      </section>
      <details className="card disclosure" id="history-options">
        <summary>History settings and filters</summary>
        <div className="disclosure-content">
          <p id="history-source" className="history-source"></p>
          <div className="history-tools" id="history-filters" hidden><label htmlFor="history-filter">Show</label><select id="history-filter"><option value="all">All checks</option><option value="high">Higher scores (50+)</option><option value="low">Scores under 50</option></select><label htmlFor="history-sort">Sort by</label><select id="history-sort"><option value="recent">Most recent</option><option value="score">Highest score</option></select></div>
          <div className="setting-links"><button className="text-button" id="desktop-history-settings">History settings</button><button className="text-button" id="refresh-history">Refresh history</button></div>
        </div>
      </details>
      <details className="card disclosure import-workspace" id="history-import">
        <summary>Import past ChatGPT conversations</summary>
        <div className="import-body">
          <p>Choose the conversation files from your ChatGPT export. Redact checks them here and clears the results when you close or reload this window.</p>
          <details className="disclosure"><summary>File limits and privacy</summary><p className="import-help">Select up to 20 JSON files (16 MB total). Text is checked on this device. Attachments are skipped. Imported chats don’t sync.</p></details>
          <div className="import-actions"><label className="secondary-button import-picker" htmlFor="history-files">Choose conversation JSON<input id="history-files" type="file" accept=".json,application/json" multiple /></label><a className="text-button" href="https://help.openai.com/en/articles/7260999-exporting-your-chatgpt-history-and-data" target="_blank" rel="noopener noreferrer">Get a ChatGPT export ↗</a><button className="text-button" id="import-cancel" hidden>Cancel import</button><button className="text-button" id="import-clear" hidden>Clear imported history</button></div>
          <p id="import-status" role="status" aria-live="polite">No export loaded. Your saved summaries below are separate.</p>
          <progress id="import-progress" aria-label="History analysis progress" hidden></progress>
          <div id="import-preview" hidden>
            <h3>Review this import</h3><p id="import-preview-summary"></p><p id="import-warnings" className="import-warning"></p>
            <div className="import-actions"><button className="text-button" id="import-select-all">Select all conversations</button><button className="text-button" id="import-select-none">Deselect all conversations</button></div>
            <fieldset className="import-selection"><legend>Conversations to analyze</legend><div id="import-conversations"></div></fieldset>
            <button className="primary-button" id="import-analyze">Analyze selected conversations</button>
          </div>
          <div id="import-results" hidden>
            <h3>Imported user prompts</h3><div id="import-stats" className="import-stats"></div>
            <p id="import-coverage" className="import-help"></p><div id="import-categories" className="import-categories"></div>
            <details className="import-trends"><summary>Monthly exposure trends</summary><div id="import-trends"></div></details>
            <div className="import-filters">
              <label>Exposure<select id="import-filter"><option value="all">All prompts</option><option value="high">Detected score 50+</option><option value="low">Detected score under 50</option><option value="unscanned">Unscanned prompts</option><option value="partial">Partial coverage</option></select></label>
              <label>Category<select id="import-category"><option value="all">All categories</option></select></label>
              <label>Sort<select id="import-sort"><option value="score">Highest exposure</option><option value="recent">Most recent</option></select></label>
            </div>
            <div id="import-table" className="import-table-wrap"></div>
            <div className="import-pagination"><button className="secondary-button" id="import-previous">Previous prompts</button><span id="import-page" role="status"></span><button className="secondary-button" id="import-next">Next prompts</button></div>
          </div>
        </div>
      </details>
    </section>
  );
}

function ToolsPage() {
  return (
    <section id="tools-page" className="page" aria-labelledby="tools-heading" hidden>
      <div className="home-hero">
        <div className="hero-copy">
          <div className="hero-kicker"><span></span> ON-DEVICE PROMPT CHECK</div>
          <h1 id="tools-heading" tabIndex="-1">Think before<br /><em>you send.</em></h1>
          <p>Catch private details in your AI prompts and keep the question you meant to ask.</p>
          <a className="primary-button" href="#scan" data-check-any>Check any prompt <span aria-hidden="true">↗</span></a>
        </div>
        <div className="specimen" id="specimen" data-mode="before" aria-labelledby="specimen-heading">
          <div className="specimen-header">
            <h2 id="specimen-heading">What AI would see</h2>
            <div className="specimen-switch" role="group" aria-label="Preview state">
              <button type="button" data-specimen="before" aria-pressed="true">Before</button>
              <button type="button" data-specimen="after" aria-pressed="false">After</button>
            </div>
          </div>
          <div className="specimen-content" id="specimen-content" aria-live="polite"></div>
          <div className="specimen-footer"><span id="specimen-status">Fictional example</span><button type="button" className="text-button" id="check-example">Try this example <span aria-hidden="true">↗</span></button></div>
        </div>
      </div>
      <Catalog />
    </section>
  );
}

function DevicesPage() {
  return (
    <section id="devices-page" className="page" aria-labelledby="devices-heading" hidden>
      <div className="page-heading"><div><div className="section-kicker">ENCRYPTED SYNC</div><h1 id="devices-heading">Devices<span>.</span></h1><p>See your saved checks on your phone and computer.</p></div></div>
      <div className="device-hero card">
        <div className="device-copy"><h2 id="device-heading">Connect your devices</h2><p id="device-detail">Set up sync here, then scan a QR code with your other device.</p><span className="device-status" id="device-status" role="status" hidden><span className="status-dot"></span><span id="device-phase">This device only</span></span><div className="device-actions"><button className="primary-button" id="create-sync">Enable device sync <span aria-hidden="true">↗</span></button><button className="text-button" id="join-sync">I have a pairing code</button><button className="primary-button" id="invite-device" hidden>Add a device <span aria-hidden="true">＋</span></button></div></div>
        <div className="device-network" aria-hidden="true"><div className="network-halo"></div><svg className="network-path" viewBox="0 0 420 220"><path d="M28 109h76l32-44h41m63 44h74l34 40h43"/><path className="network-signal" d="M28 109h76l32-44h41m63 44h74l34 40h43" pathLength="100"/><circle cx="29" cy="109" r="4"/><circle cx="391" cy="149" r="4"/></svg><div className="network-device"><img src="brand.svg" width="74" height="74" alt="" /></div><div className="network-phone">▯</div></div>
      </div>
      <section className="card device-list-card" id="linked-devices" aria-labelledby="linked-heading" hidden><div className="panel-header"><h2 id="linked-heading">Linked devices</h2><button className="text-button" id="sync-now" hidden>Sync now</button></div><div id="device-list" className="device-list"></div></section>
      <details className="card disclosure" id="device-settings">
        <summary>Appearance and sync settings</summary>
        <div className="disclosure-content">
          <fieldset className="theme-picker"><legend>Theme</legend><button data-theme="aurora" type="button" aria-pressed="true"><span className="theme-swatch aurora"></span>Paper</button><button data-theme="midnight" type="button" aria-pressed="false"><span className="theme-swatch midnight"></span>Midnight</button></fieldset>
          <label className="compact-setting"><strong>Compact layout</strong><input type="checkbox" id="compact-layout" /></label>
          <p className="setting-note">Sync encrypts saved scores, types of details found, and appearance settings before sharing them with your devices. Your drafts stay where you wrote them.</p>
          <div className="setting-links"><button id="clear-sync-history" className="text-button" hidden>Clear synced history</button><button className="text-button" id="install">Get the Chrome extension</button><button className="text-button" id="replay-welcome">Replay welcome</button></div>
        </div>
      </details>
    </section>
  );
}

export function Workspace() {
  return (
    <>
      <div className="app-titlebar"><span>Redact</span></div>
      <Welcome />
      <div id="workspace" hidden>
      <a className="skip" href="#main">Skip to content</a>
      <Navigation />

      <div className="shell">
        <main id="main" tabIndex="-1">
          <div id="demo-banner" className="demo-banner" hidden>
            <div><span className="demo-tag">REHEARSAL MODE</span><span id="demo-instruction">Start with a fictional draft. Check it, replace it, then simulate a send.</span></div>
            <button id="end-demo" className="text-button">Exit demo ×</button>
          </div>

          <OverviewPage />

          <CheckPage />

          <HistoryPage />

          <ToolsPage />
          <DevicesPage />
        </main>
      </div>

      </div>
      <dialog id="modal"><div className="dialog-top"><span className="tiny-label" id="modal-label">REDACT</span><button id="modal-close" className="icon-button" aria-label="Close dialog">×</button></div><div id="modal-content"></div></dialog>
      <div className="toast" id="toast" role="status" hidden></div>
      <div className="sr-only" role="status" aria-live="polite" id="announcement"></div>
    </>
  );
}
