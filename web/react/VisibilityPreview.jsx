import { useLayoutEffect, useState } from "react";
import { flushSync } from "react-dom";

function markedText(text, matches) {
  let offset = 0;
  const output = [];
  for (const { start, end, kind, id, placeholder } of matches) {
    output.push(text.slice(offset, start));
    output.push(
      <mark key={start + "-" + end} className={placeholder ? "replacement-token" : "redact-mask"}
        title={globalThis.Redact.categories[kind].label} data-occurrence={id}>{text.slice(start, end)}</mark>,
    );
    offset = end;
  }
  output.push(text.slice(offset));
  return output;
}

function BeyondDraft({ tool }) {
  const context = globalThis.RedactDataContext[tool?.id];
  return (
    <details className="beyond-draft">
      <summary><span>Beyond this draft</span><small>Earlier chats, uploads, and account data</small></summary>
      <p>Redact checked the text above. Review these other sources in your AI app before you share.</p>
      <dl>
        <div><dt>Conversation and uploads</dt><dd>{context?.conversation ||
          "Earlier messages, attachments, and enabled memory or connected apps can add context. What applies depends on the service."}</dd></div>
        <div><dt>Account and device data</dt><dd>{context?.account ||
          "Check the provider’s privacy policy for the account, activity, and device information it collects."}</dd></div>
      </dl>
      {context?.action && <a className="text-button" href={context.action.url} target="_blank" rel="noopener noreferrer">{context.action.label} ↗</a>}
      {tool?.privacy && <a className="text-button" href={tool.privacy} target="_blank" rel="noopener noreferrer">Official privacy information ↗</a>}
      {context && <small className="context-date">Consumer service · sources checked Nov 7, 2026</small>}
    </details>
  );
}

export function VisibilityPreview() {
  const [preview, setPreview] = useState(null);
  useLayoutEffect(() => {
    const update = event => flushSync(() => setPreview(event.detail));
    document.addEventListener("redact:preview", update);
    return () => document.removeEventListener("redact:preview", update);
  }, []);

  const recipient = preview?.tool?.name || "the AI";
  const suggested = preview?.version === "suggested";
  const count = preview?.count ?? 0;
  const select = version => document.dispatchEvent(new CustomEvent("redact:preview-version", { detail: version }));
  return (
    <section className="visibility-preview" id="visibility-preview" aria-labelledby="visibility-heading" hidden={!preview}>
      <div className="visibility-head">
        <h3 id="visibility-heading">What {recipient} would see</h3>
        <a className="text-button" id="visibility-policy" href={preview?.tool?.privacy}
          target="_blank" rel="noopener noreferrer" hidden={!preview?.tool?.privacy}>Provider privacy ↗</a>
      </div>
      <p className="visibility-note" id="visibility-note">If you send this version, {recipient} receives the full text. Red marks private details Redact detected.</p>
      <div className="visibility-tabs" id="visibility-tabs" role="group" aria-label="Draft version" hidden={!preview?.hasSuggestion}>
        <button type="button" data-visibility="original" aria-pressed={!suggested} aria-controls="highlighted"
          onClick={() => { if (suggested) select("original"); }}>Original draft</button>
        <button type="button" data-visibility="suggested" aria-pressed={suggested} aria-controls="rewrite-output"
          onClick={() => { if (!suggested) select("suggested"); }}>Suggested draft</button>
      </div>
      <div className={"visibility-body" + (count ? " has-private-details" : "")} id="visibility-body" data-version={preview?.version || "original"}>
        <div className="visibility-status" id="visibility-status" role="status">
          {count ? count + (count === 1 ? " private detail flagged" : " private details flagged") : "No private details detected"}
        </div>
        <div id="highlighted" className="highlighted" aria-label="Original draft with flagged details" hidden={suggested}>
          {preview && markedText(preview.original, preview.originalSpans)}
        </div>
        <div className="rewrite-output" id="rewrite-output" hidden={!suggested}>
          <p id="rewritten" aria-label="Suggested draft">{preview && markedText(preview.rewrite, preview.rewriteSpans)}</p>
        </div>
      </div>
      {preview && <BeyondDraft key={preview.tool?.id || "any"} tool={preview.tool} />}
    </section>
  );
}
