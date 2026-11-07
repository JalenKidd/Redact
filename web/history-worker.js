/* Export contents are untrusted data. No imported HTML or source code is executed. */
importScripts("scanner.js", "history-import.js");
let dataset = null;
let working = false;
self.onmessage = async ({ data }) => {
  if (working) return;
  working = true;
  try {
    if (data?.type === "prepare") {
      dataset = null;
      if (!Array.isArray(data.files) || !data.files.length || data.files.length > RedactImport.limits.files ||
          data.files.some(file => !(file instanceof File) || !/\.json$/i.test(file.name)) ||
          data.files.reduce((sum, file) => sum + file.size, 0) > RedactImport.limits.bytes) {
        throw new Error("Choose up to 20 extracted JSON files, totaling at most 16 MiB. ZIP and HTML files are not supported.");
      }
      const files = [];
      for (const file of data.files) files.push({ text: await file.text() });
      dataset = RedactImport.parseExports(files);
      self.postMessage({ type: "preview", preview: RedactImport.preview(dataset) });
    } else if (data?.type === "analyze" && dataset) {
      const result = await RedactImport.analyze(dataset, data.selectedIds, {
        onProgress: progress => self.postMessage({ type: "progress", progress }),
      });
      dataset = null;
      self.postMessage({ type: "complete", result });
    } else throw new Error("Choose an export and review its preview before analyzing.");
  } catch (error) {
    dataset = null;
    self.postMessage({ type: "error", message: error instanceof Error ? error.message : "The export could not be processed." });
  } finally { working = false; }
};
