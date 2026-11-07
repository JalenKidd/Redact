import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { Workspace } from "./Workspace.jsx";

const root = createRoot(document.getElementById("redact-root"));
// The shared desktop and browser controllers attach to the mounted workspace next.
flushSync(() => root.render(<Workspace />));
