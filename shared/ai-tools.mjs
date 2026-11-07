export const toolGroups = [
  {
    name: "Chat & search",
    tools: [
      { id: "chatgpt", name: "ChatGPT", mark: "✳", color: "green", url: "https://chatgpt.com/", description: "Ask questions, brainstorm, or draft a message." },
      { id: "claude", name: "Claude", mark: "✺", color: "peach", url: "https://claude.ai/", privacy: "https://www.anthropic.com/legal/privacy", description: "Talk through an idea, read a document, or write a draft." },
      { id: "gemini", name: "Gemini", mark: "✦", color: "blue", url: "https://gemini.google.com/", privacy: "https://support.google.com/gemini/answer/13594961", description: "Ask Google’s AI for help with questions, ideas, and writing." },
      { id: "microsoft-copilot", name: "Microsoft Copilot", mark: "Co", color: "spectrum", url: "https://copilot.com/", privacy: "https://www.microsoft.com/en-us/privacy/privacystatement", description: "Ask Microsoft’s AI to explain a topic or help you write." },
      { id: "perplexity", name: "Perplexity", mark: "P", color: "teal", url: "https://www.perplexity.ai/", description: "Research a question and see links to sources." },
      { id: "deepseek", name: "DeepSeek", mark: "≈", color: "blue", url: "https://chat.deepseek.com/", description: "Ask questions or work through a problem in chat." },
      { id: "grok", name: "Grok", mark: "G", color: "ink", url: "https://grok.com/", description: "Explore questions, ideas, and images with xAI’s assistant." },
      { id: "meta-ai", name: "Meta AI", mark: "M", color: "blue", url: "https://www.meta.ai/", description: "Chat with Meta’s assistant or brainstorm creative ideas." },
    ],
  },
  {
    name: "Writing & study",
    tools: [
      { id: "grammarly", name: "Grammarly", mark: "G", color: "teal", url: "https://www.grammarly.com/", description: "Edit a draft for clarity, grammar, and tone." },
      { id: "quillbot", name: "QuillBot", mark: "Q", color: "green", url: "https://quillbot.com/", description: "Rephrase text or summarize a passage." },
      { id: "notebooklm", name: "NotebookLM", mark: "N", color: "violet", url: "https://notebooklm.google.com/", description: "Study and ask questions about sources you add." },
      { id: "jasper", name: "Jasper", mark: "J", color: "peach", url: "https://www.jasper.ai/", description: "Draft marketing content and campaign ideas." },
      { id: "copy-ai", name: "Copy.ai", mark: "C", color: "ink", url: "https://www.copy.ai/", description: "Create marketing and sales copy." },
      { id: "writesonic", name: "Writesonic", mark: "W", color: "violet", url: "https://writesonic.com/", description: "Research and draft marketing content for search." },
    ],
  },
  {
    name: "Images, video & audio",
    tools: [
      { id: "firefly", name: "Adobe Firefly", mark: "Ff", color: "rose", url: "https://firefly.adobe.com/", description: "Make or edit images, video, and audio." },
      { id: "midjourney", name: "Midjourney", mark: "M", color: "blue", url: "https://www.midjourney.com/", description: "Generate images from a written description." },
      { id: "runway", name: "Runway", mark: "R", color: "ink", url: "https://app.runwayml.com/", description: "Create or edit video with AI." },
      { id: "elevenlabs", name: "ElevenLabs", mark: "Ⅱ", color: "violet", url: "https://elevenlabs.io/", description: "Make a voiceover or turn text into speech." },
    ],
  },
  {
    name: "Coding & building",
    tools: [
      { id: "github-copilot", name: "GitHub Copilot", mark: "GH", color: "ink", url: "https://github.com/features/copilot", description: "Get help writing, explaining, or reviewing code." },
      { id: "cursor", name: "Cursor", mark: "C", color: "blue", url: "https://cursor.com/", description: "Work on code in an AI editor." },
      { id: "replit", name: "Replit", mark: "R", color: "peach", url: "https://replit.com/", description: "Build and run an app in your browser." },
      { id: "v0", name: "v0", mark: "v0", color: "teal", url: "https://v0.app/", description: "Turn a written idea into a website or app." },
    ],
  },
];
