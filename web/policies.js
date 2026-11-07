globalThis.RedactPolicies = Object.freeze([
  {
    id: "chatgpt",
    name: "ChatGPT",
    company: "OPENAI",
    icon: "✳",
    checked: "Nov 6, 2026",
    collects: "OpenAI can collect account information, prompts and uploads, feedback, and details about how you use its services and devices.",
    training: "Eligible consumer chats can be used to improve models when the setting is on. Turning it off applies to new chats. Sharing feedback can include the associated conversation.",
    controls: "Change training in Data Controls, delete individual chats, export eligible account data, or submit a privacy request.",
    sources: [
      { label: "Privacy policy", url: "https://openai.com/policies/privacy-policy/" },
      { label: "Data controls", url: "https://help.openai.com/en/articles/7730893" },
      { label: "Training and feedback", url: "https://help.openai.com/en/articles/5722486" },
    ],
    optOut: {
      description: "Turning off training keeps existing saved chats visible and changes how eligible new chats can be used.",
      steps: ["Sign in and open Settings.", "Choose Data controls.", "Turn off Improve the model for everyone."],
      url: "https://chatgpt.com/#settings/DataControls",
      link: "Open ChatGPT settings ↗",
    },
    remove: {
      description: "To remove individual conversations, use the chat menu in ChatGPT. The Privacy Portal has options for requesting deletion of personal data or your account.",
      url: "https://privacy.openai.com/",
      link: "Open OpenAI Privacy Portal ↗",
    },
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    company: "DEEPSEEK",
    icon: "≈",
    checked: "Nov 6, 2026",
    collects: "DeepSeek says it can collect account details, prompts, uploads, feedback, chat history, and information about your device and activity.",
    training: "DeepSeek says it can use inputs, outputs, and related usage information to improve its services and train its technology. Its terms describe a training opt-out.",
    controls: "Turn off the model improvement setting, manage or delete chat history, or contact DeepSeek about your personal data.",
    sources: [
      { label: "Privacy policy", url: "https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html" },
      { label: "Terms of use", url: "https://cdn.deepseek.com/policies/en-US/deepseek-terms-of-use.html" },
    ],
    optOut: {
      description: "DeepSeek’s terms point to the model-improvement setting for opting out of this use of inputs and outputs.",
      steps: ["Sign in to DeepSeek and open Settings.", "Find Improve the model for everyone.", "Turn the setting off."],
      url: "https://chat.deepseek.com/",
      link: "Open DeepSeek ↗",
    },
    remove: {
      description: "Use DeepSeek settings to manage chat history or delete your account. For a personal-data request, review the draft and DeepSeek’s privacy contact information.",
      url: "https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html",
      link: "Open DeepSeek privacy policy ↗",
    },
  },
]);
