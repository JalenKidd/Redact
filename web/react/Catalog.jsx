import { useLayoutEffect, useRef, useState } from "react";
import { matchesQuery, previewCount, toolGroups } from "../../shared/ai-tools.mjs";

function ToolTile({ tool, group, hidden }) {
  const [imageFailed, setImageFailed] = useState(false);
  const tile = useRef(null);
  const wasHidden = useRef(hidden);
  useLayoutEffect(() => {
    if (wasHidden.current && !hidden) globalThis.RedactMotion.reveal(tile.current);
    wasHidden.current = hidden;
  }, [hidden]);

  function select(event) {
    document.dispatchEvent(new CustomEvent("redact:select-tool", {
      detail: { tool, category: group, source: event.currentTarget },
    }));
  }

  return (
    <li hidden={hidden} ref={tile}>
      <button type="button" className="tool-tile" aria-label={tool.name} onClick={select}>
        <span className="tool-mark" aria-hidden="true">
          {imageFailed ? tool.mark : (
            <img className="tool-logo" src={"ai-logos/" + tool.id + ".png"} alt=""
              width="40" height="40" draggable={false} onError={() => setImageFailed(true)} />
          )}
        </span>
        <span className="tool-name">{tool.name}</span>
      </button>
    </li>
  );
}

export function Catalog() {
  const [input, setInput] = useState("");
  const [expanded, setExpanded] = useState(() => new Set());
  const query = input.trim();
  const groups = toolGroups.map((group, index) => ({
    name: group.name,
    id: "tool-group-" + index,
    tools: group.tools.filter(tool => matchesQuery(tool, group.name, query)),
  })).filter(group => group.tools.length);
  const count = groups.reduce((total, group) => total + group.tools.length, 0);

  function toggle(group) {
    setExpanded(current => {
      const next = new Set(current);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }

  return (
    <>
      <div className="catalog-heading">
        <div><div className="section-kicker">AI DIRECTORY</div><h2>Find your AI.</h2></div>
        <div className="tool-search">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="5.5" /><path d="m15 15 4 4" /></svg>
          <label className="sr-only" htmlFor="tool-search">Search AI tools</label>
          <input id="tool-search" type="search" placeholder="Search AI tools" autoComplete="off" spellCheck={false}
            value={input} onChange={event => setInput(event.target.value)} />
        </div>
      </div>
      <p className="sr-only" id="tool-search-status" role="status">
        {query ? count + (count === 1 ? " tool found" : " tools found") : ""}
      </p>
      <div id="tool-groups">
        {groups.map(group => {
          const open = Boolean(query) || expanded.has(group.name);
          return (
            <section key={group.id} className="tool-group" aria-labelledby={group.id + "-title"}>
              <div className="tool-group-header">
                <h2 id={group.id + "-title"}>{group.name}</h2>
                {!query && group.tools.length > previewCount && (
                  <button type="button" className="text-button" aria-expanded={open} aria-controls={group.id}
                    onClick={() => toggle(group.name)}>
                    {open ? "Show fewer" : "Show all " + group.tools.length}
                  </button>
                )}
              </div>
              <ul className="tool-row" id={group.id}>
                {group.tools.map((tool, index) => (
                  <ToolTile key={tool.id} tool={tool} group={group.name} hidden={!open && index >= previewCount} />
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      <div id="no-tools" className="card simple-empty" hidden={count > 0}>
        <h2>No tools found</h2><p>Try another name, or check a prompt for any AI.</p>
        <a className="text-button" href="#scan" data-check-any="">Check a prompt ↗</a>
      </div>
    </>
  );
}
