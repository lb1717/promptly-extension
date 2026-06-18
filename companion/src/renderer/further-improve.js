/** Further-improve chip groups — mirrored from content/index.js */
export const FURTHER_IMPROVE_GROUPS = [
  {
    options: [
      {
        id: "uploaded-sources",
        label: "Use Uploaded Sources",
        snippet:
          "<<Restrict all responses strictly to the provided uploaded sources and do not use any external knowledge.>>"
      },
      {
        id: "web-research",
        label: "Enable Web Research",
        snippet:
          "<<Incorporate relevant, up-to-date information from external sources when necessary to improve accuracy.>>"
      }
    ]
  },
  {
    options: [
      {
        id: "concise-output",
        label: "Concise Output Mode",
        snippet: "<<Deliver responses that are brief, direct, and free of unnecessary verbosity.>>"
      },
      {
        id: "in-depth",
        label: "In-Depth Explanation",
        snippet:
          "<<Provide thorough, detailed explanations with depth, nuance, and supporting reasoning.>>"
      }
    ]
  },
  {
    options: [
      {
        id: "beginner-friendly",
        label: "Beginner-Friendly Mode",
        snippet:
          "<<Explain concepts clearly and simply, defining terms and avoiding unnecessary complexity.>>"
      },
      {
        id: "expert-detail",
        label: "Expert-Level Detail",
        snippet: "<<Assume an expert audience and use advanced terminology with deep technical detail.>>"
      }
    ]
  },
  {
    options: [
      {
        id: "human-like",
        label: "Human-Like Writing",
        snippet:
          "<<Write in a natural, human-like tone with varied sentence structure and avoid robotic phrasing.>>"
      },
      {
        id: "professional-tone",
        label: "Professional Tone",
        snippet:
          "<<Use a formal, structured, and professional tone appropriate for business or academic contexts.>>"
      },
      {
        id: "creative-thinking",
        label: "Creative Thinking Mode",
        snippet: "<<Encourage originality and generate creative, non-obvious ideas or approaches.>>"
      }
    ]
  },
  {
    options: [
      {
        id: "step-by-step",
        label: "Step-by-Step Logic",
        snippet: "<<Break down reasoning into clear, sequential steps that are easy to follow.>>"
      },
      {
        id: "structured-formatting",
        label: "Structured Formatting",
        snippet:
          "<<Organize the response using clear sections, headings, and structured formatting for readability.>>"
      }
    ]
  },
  {
    options: [
      {
        id: "no-hallucination",
        label: "Strict No Hallucination",
        snippet:
          "<<Do not fabricate information; if uncertain or lacking data, explicitly state the limitation.>>"
      },
      {
        id: "self-check",
        label: "Self-Check Responses",
        snippet:
          "<<Review the response for errors, inconsistencies, or omissions and correct them before finalizing.>>"
      }
    ]
  },
  {
    options: [
      {
        id: "cite-sources",
        label: "Cite All Sources",
        snippet: "<<Provide clear citations or references for all factual claims and sourced information.>>"
      }
    ]
  },
  {
    options: [
      {
        id: "actionable",
        label: "Actionable Responses",
        snippet: "<<Focus on practical, executable guidance and avoid abstract or non-actionable content.>>"
      }
    ]
  }
];

function shuffleGroups(groups) {
  const arr = [...groups];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function pickFurtherImproveOptions(wordCount) {
  const need = wordCount <= 100 ? 5 : 6;
  const shuffled = shuffleGroups(FURTHER_IMPROVE_GROUPS);
  const n = Math.min(need, shuffled.length);
  return shuffled.slice(0, n).map((group) => {
    const opts = group.options;
    return opts[Math.floor(Math.random() * opts.length)];
  });
}

export function countWords(text) {
  return String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}
