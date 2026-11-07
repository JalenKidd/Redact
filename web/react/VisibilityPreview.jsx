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
    </section>
  );
}
