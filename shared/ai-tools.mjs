export const previewCount = 4;

export const toolGroups = [
  {
    name: "Chat & search",
    tools: [
      { id: "chatgpt", name: "ChatGPT", mark: "✳", color: "green", url: "https://chatgpt.com/", description: "Ask questions, brainstorm, or draft a message.", example: "Write a friendly note asking for one more day on a school assignment." },
      { id: "claude", name: "Claude", mark: "✺", color: "peach", url: "https://claude.ai/", privacy: "https://www.anthropic.com/legal/privacy", description: "Talk through an idea, read a document, or write a draft.", example: "Help me compare two options for a weekend volunteer project." },
      { id: "gemini", name: "Gemini", mark: "✦", color: "blue", url: "https://gemini.google.com/", privacy: "https://support.google.com/gemini/answer/13594961", description: "Ask Google’s AI for help with questions, ideas, and writing.", example: "Explain how a solar eclipse works to a curious middle schooler." },
      { id: "microsoft-copilot", name: "Microsoft Copilot", mark: "Co", color: "spectrum", url: "https://copilot.com/", privacy: "https://www.microsoft.com/en-us/privacy/privacystatement", description: "Ask Microsoft’s AI to explain a topic or help you write.", example: "Turn these meeting notes into three clear action items." },
      { id: "perplexity", name: "Perplexity", mark: "P", color: "teal", url: "https://www.perplexity.ai/", description: "Research a question and see links to sources.", example: "Find sources that explain why cities plant more street trees." },
      { id: "deepseek", name: "DeepSeek", mark: "≈", color: "blue", url: "https://chat.deepseek.com/", description: "Ask questions or work through a problem in chat.", example: "Explain this algebra problem one step at a time." },
      { id: "grok", name: "Grok", mark: "G", color: "ink", url: "https://grok.com/", description: "Explore questions, ideas, and images with xAI’s assistant.", example: "Brainstorm five science fair ideas using everyday materials." },
      { id: "meta-ai", name: "Meta AI", mark: "M", color: "blue", url: "https://www.meta.ai/", description: "Chat with Meta’s assistant or brainstorm creative ideas.", example: "Suggest a few low-cost activities for a rainy Saturday." },
    ],
  },
  {
    name: "Writing & study",
    tools: [
      { id: "grammarly", name: "Grammarly", mark: "G", color: "teal", url: "https://www.grammarly.com/", description: "Edit a draft for clarity, grammar, and tone.", example: "Make this reminder sound friendly and direct." },
      { id: "quillbot", name: "QuillBot", mark: "Q", color: "green", url: "https://quillbot.com/", description: "Rephrase text or summarize a passage.", example: "Rephrase this paragraph using shorter sentences." },
      { id: "notebooklm", name: "NotebookLM", mark: "N", color: "violet", url: "https://notebooklm.google.com/", description: "Study and ask questions about sources you add.", example: "Turn my notes about the water cycle into a five-question study guide." },
      { id: "jasper", name: "Jasper", mark: "J", color: "peach", url: "https://www.jasper.ai/", description: "Draft marketing content and campaign ideas.", example: "Draft a short welcome email for a community garden newsletter." },
      { id: "copy-ai", name: "Copy.ai", mark: "C", color: "ink", url: "https://www.copy.ai/", description: "Create marketing and sales copy.", example: "Write three subject lines for a neighborhood book swap." },
      { id: "writesonic", name: "Writesonic", mark: "W", color: "violet", url: "https://writesonic.com/", description: "Research and draft marketing content for search.", example: "Outline a beginner’s guide to growing herbs indoors." },
    ],
  },
  {
    name: "Images, video & audio",
    tools: [
      { id: "firefly", name: "Adobe Firefly", mark: "Ff", color: "rose", url: "https://firefly.adobe.com/", description: "Make or edit images, video, and audio.", example: "Create a poster of a retro rocket launch in warm orange and cream." },
      { id: "midjourney", name: "Midjourney", mark: "M", color: "blue", url: "https://www.midjourney.com/", description: "Generate images from a written description.", example: "A tiny bookshop on a rainy evening, illustrated in watercolor." },
      { id: "runway", name: "Runway", mark: "R", color: "ink", url: "https://app.runwayml.com/", description: "Create or edit video with AI.", example: "A slow camera move through a miniature city made of paper." },
      { id: "elevenlabs", name: "ElevenLabs", mark: "Ⅱ", color: "violet", url: "https://elevenlabs.io/", description: "Make a voiceover or turn text into speech.", example: "Read this museum welcome in a calm, conversational voice." },
    ],
  },
  {
    name: "Coding & building",
    tools: [
      { id: "github-copilot", name: "GitHub Copilot", mark: "GH", color: "ink", url: "https://github.com/features/copilot", description: "Get help writing, explaining, or reviewing code.", example: "Show a JavaScript function that removes duplicate names from a list." },
      { id: "cursor", name: "Cursor", mark: "C", color: "blue", url: "https://cursor.com/", description: "Work on code in an AI editor.", example: "Explain how this component tracks which tab is selected." },
      { id: "replit", name: "Replit", mark: "R", color: "peach", url: "https://replit.com/", description: "Build and run an app in your browser.", example: "Build a small browser game where players guess a mystery word." },
      { id: "v0", name: "v0", mark: "v0", color: "teal", url: "https://v0.app/", description: "Turn a written idea into a website or app.", example: "Design a simple event page with a schedule and an RSVP button." },
    ],
  },
];

export function matchesQuery(tool, groupName, query) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [tool.name, tool.description, groupName].some(text => text.toLowerCase().includes(needle));
}

export function searchCatalog(query) {
  return toolGroups.flatMap(group =>
    group.tools.filter(tool => matchesQuery(tool, group.name, query)).map(tool => ({ ...tool, group: group.name }))
  );
}
