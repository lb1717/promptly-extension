export type LabModule = {
  id: string;
  number: number;
  name: string;
  summary: string;
  learnings: string[];
};

export const LAB_MODULES: LabModule[] = [
  {
    id: "lab-1",
    number: 1,
    name: "Prompt Anatomy",
    summary: "Turn vague requests into precise instructions with clear success criteria.",
    learnings: [
      "How to specify the task, constraints, and output format",
      "How to separate instructions from input data",
      "How to write prompts that are easy to debug"
    ]
  },
  {
    id: "lab-2",
    number: 2,
    name: "Examples and Few-Shot Prompting",
    summary: "Use examples to lock in formatting, tone, and edge cases.",
    learnings: [
      "Zero-shot vs one-shot vs few-shot",
      "How to choose representative examples",
      "How to prevent “example overfitting”"
    ]
  },
  {
    id: "lab-3",
    number: 3,
    name: "Structured Outputs",
    summary: "Get predictable JSON and schema-valid results.",
    learnings: [
      "How to describe the output contract",
      "How to validate and repair outputs",
      "When schemas beat “formatting instructions”"
    ]
  },
  {
    id: "lab-4",
    number: 4,
    name: "Decomposition and Reasoning Scaffolds",
    summary: "Make hard problems solvable by breaking them into steps.",
    learnings: [
      "Decomposition patterns (least-to-most)",
      "Multi-path reasoning (self-consistency, tree search ideas)",
      "When reasoning prompts help (and when they don’t)"
    ]
  },
  {
    id: "lab-5",
    number: 5,
    name: "Retrieval-Augmented Prompting (RAG Basics)",
    summary: "Ground answers in documents instead of guessing.",
    learnings: [
      "How to insert retrieved context safely",
      "How to force evidence-based answers",
      "How to detect and reduce hallucinations"
    ]
  },
  {
    id: "lab-6",
    number: 6,
    name: "Prompt Optimisation",
    summary: "Generate, test, and select prompts using metrics.",
    learnings: [
      "A/B testing for prompts",
      "Automatic prompt generation and selection (APE-style)",
      "“Compiler” approaches to prompt pipelines (DSPy-style)"
    ]
  },
  {
    id: "lab-7",
    number: 7,
    name: "Evaluation and Evals",
    summary: "Measure prompt quality across accuracy, robustness, and cost.",
    learnings: [
      "Build a test suite and scoring rubric",
      "Judge-based evaluation and its pitfalls",
      "Regression testing when models or prompts change"
    ]
  },
  {
    id: "lab-8",
    number: 8,
    name: "Security Lab (Prompt Injection)",
    summary: "Learn what prompt injection is and how to design safer systems.",
    learnings: [
      "Common injection patterns and failure modes",
      "Guardrails: delimiters, constraints, validation",
      "How to red-team your prompts continuously"
    ]
  }
];

export const LABS_FAQ = [
  {
    q: "What is prompt engineering?",
    a: "Prompt engineering is writing instructions and examples that steer a model’s behaviour toward your requirements consistently."
  },
  {
    q: "Why do my results change between runs?",
    a: "Model outputs are probabilistic and can vary with sampling settings, input phrasing, and model updates. That’s why we use test suites and metrics."
  },
  {
    q: "Is there a single “best prompt”?",
    a: "No. A good prompt is task- and model-specific. The goal is a prompt that meets your success criteria reliably on your real inputs."
  },
  {
    q: "When should I use retrieval (RAG) instead of a bigger prompt?",
    a: "Use retrieval when correctness depends on external information or your own documents. A bigger prompt can’t reliably “add facts” the model doesn’t have."
  },
  {
    q: "Can prompts be optimised automatically?",
    a: "Yes. There are research methods that generate and select prompts using evaluation scores. Our labs teach the core ideas and how to apply them safely."
  }
] as const;
