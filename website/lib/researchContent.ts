export type CitationEntry = {
  title: string;
  url: string;
  annotation: string;
};

export type TimelineStep = {
  title: string;
  body: string;
  icon: "ingest" | "embed" | "extract" | "objective" | "library" | "optimize" | "emit";
};

export const TIMELINE_STEPS: TimelineStep[] = [
  {
    icon: "ingest",
    title: "Ingest & normalise",
    body:
      "Canonicalise the raw prompt with token profiling, whitespace cleanup, and structural parsing into requirements, constraints, examples, and format hints.[1]"
  },
  {
    icon: "embed",
    title: "Embed into a high-dimensional vector space",
    body:
      "Represent the prompt as a dense vector p in R^d so similar prompts, reusable patterns, and neighbouring intents can be compared and clustered.[2]"
  },
  {
    icon: "extract",
    title: "Extract goal, intent, constraints, and output contract",
    body:
      "Decompose the prompt into explicit fields such as task goal, audience, input assumptions, safety boundaries, and output schema.[3]"
  },
  {
    icon: "objective",
    title: "Parameterise the aim as a constrained optimisation objective",
    body:
      "Translate those fields into a conceptual architecture for optimisation, where quality, ambiguity, format discipline, and token cost are balanced under a rubric.[4]"
  },
  {
    icon: "library",
    title: "Retrieve templates, prompt patterns, and tags",
    body:
      "Search a prompt library for nearby templates, prompt-pattern fragments, and technique tags that can be reused as modular building blocks.[2]"
  },
  {
    icon: "optimize",
    title: "Optimise with search and textual gradients",
    body:
      "Generate candidate rewrites, critique them in natural language, and search for a clearer prompt that better satisfies the target rubric.[4]"
  },
  {
    icon: "emit",
    title: "Emit an optimised prompt, diff view, and export",
    body:
      "Return a polished prompt program, surface the edits as a readable diff, and package the result for reuse in downstream tools and workflows.[2][4]"
  }
];

export const PAPER_ENTRIES: CitationEntry[] = [
  {
    title: "Effective Prompts for AI: The Essentials",
    url: "https://mitsloanedtech.mit.edu/ai/basics/effective-prompts/",
    annotation:
      "MIT Sloan Teaching & Learning Technologies introduces prompting as 'programming with words' and highlights three practical principles: provide context, be specific, and build on the conversation."
  },
  {
    title: "Glossary of Terms: Generative AI Basics",
    url: "https://mitsloanedtech.mit.edu/ai/basics/glossary/",
    annotation:
      "MIT Sloan's glossary gives concise definitions for prompt engineering, hallucinations, context windows, and related terms used throughout the Labs page."
  },
  {
    title: "The Prompt Report: A Systematic Survey of Prompt Engineering Techniques",
    url: "https://arxiv.org/abs/2406.06608",
    annotation:
      "A broad survey that organizes prompt engineering into a shared taxonomy and vocabulary, making it useful for explaining prompt patterns, few-shot examples, retrieval grounding, and optimisation loops."
  },
  {
    title: "Automatic Prompt Optimization with \"Gradient Descent\" and Beam Search",
    url: "https://arxiv.org/abs/2305.03495",
    annotation:
      "Introduces Automatic Prompt Optimization, where natural-language critiques act like textual gradients to guide search over rewritten prompts."
  },
  {
    title: "Measuring and Controlling Instruction (In)Stability in Language Model Dialogs",
    url: "https://arxiv.org/abs/2402.10962",
    annotation:
      "Measures instruction drift in multi-turn dialog and links part of the effect to attention decay, which is directly relevant when explaining why prompt structure can matter across long chats."
  },
  {
    title: "A Theoretical Framework for Prompt Engineering: Approximating Smooth Functions with Transformer Prompts",
    url: "https://arxiv.org/abs/2503.20561",
    annotation:
      "A recent theory paper with a Harvard-affiliated author that frames prompts as inference-time configurations capable of shaping transformer computation."
  },
  {
    title: "Large Language Models Are Human-Level Prompt Engineers",
    url: "https://arxiv.org/abs/2211.01910",
    annotation:
      "Presents Automatic Prompt Engineer (APE), which treats instruction search as a program-synthesis style optimisation problem over candidate prompts."
  },
  {
    title: "Large Language Models as Optimizers",
    url: "https://arxiv.org/abs/2309.03409",
    annotation:
      "Explores optimisation by prompting (OPRO), where an LLM iteratively proposes new candidates after seeing prior solutions and scores."
  }
];

export const RESEARCH_FAQS = [
  {
    question: "What is prompt engineering?",
    answer:
      "MIT Sloan defines prompt engineering as the practice of designing prompts to guide an AI model's output, including setting roles, specifying format, adding constraints, or giving examples."
  },
  {
    question: "Why do prompts drift in long chats?",
    answer:
      "Prompt stability can weaken over long multi-turn dialogs. Recent work measures meaningful instruction drift within several rounds and links part of the effect to attention decay, so it is useful to restate important constraints and output contracts."
  },
  {
    question: "Can prompts be optimised automatically?",
    answer:
      "Yes, at least conceptually and sometimes algorithmically. Research on automatic prompt optimisation, APE, and OPRO treats prompts as search objects that can be critiqued, rescored, and revised, although exact gains depend on task, model, and evaluation setup."
  },
  {
    question: "Do templates help?",
    answer:
      "Templates can help when the task benefits from a repeatable structure. MIT's guidance on context and specificity, together with survey work on prompt taxonomies, supports using reusable prompt patterns and explicit output contracts when consistency matters."
  },
  {
    question: "What should I do if the model makes things up?",
    answer:
      "Tighten the prompt's evidence boundary: specify the allowed sources, request explicit assumptions, and require the model to distinguish grounded statements from open uncertainty. That does not eliminate hallucinations, but it makes them easier to inspect and catch."
  }
] as const;
