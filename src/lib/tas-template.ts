import { TasSection } from "@/lib/types";

export const TAS_TEMPLATE: TasSection[] = [
  { id: "strategic-initiative", title: "Strategic Initiative & CEO Priority", questions: [
    { id: "q1", sectionId: "strategic-initiative", prompt: "What is the strategic initiative tied to this deal?", stageCriticalAt: "Discovery", autopopPriority: "medium" },
    { id: "q2", sectionId: "strategic-initiative", prompt: "What CEO-level priority does this initiative serve?", stageCriticalAt: "Discovery", autopopPriority: "medium" },
    { id: "q3", sectionId: "strategic-initiative", prompt: "What board-level pressure is influencing urgency?", stageCriticalAt: "Solutioning", autopopPriority: "low" },
    { id: "q4", sectionId: "strategic-initiative", prompt: "What outcome must happen this quarter?", stageCriticalAt: "Solutioning", autopopPriority: "medium" },
    { id: "q5", sectionId: "strategic-initiative", prompt: "What happens if this initiative slips?", stageCriticalAt: "Commit", autopopPriority: "medium" }
  ]},
  { id: "economic-value", title: "Economic Value & Consequences", questions: [
    { id: "q6", sectionId: "economic-value", prompt: "What is the primary metric this deal moves?", stageCriticalAt: "Discovery", autopopPriority: "high" },
    { id: "q7", sectionId: "economic-value", prompt: "What is the baseline value today?", stageCriticalAt: "Solutioning", autopopPriority: "high" },
    { id: "q8", sectionId: "economic-value", prompt: "What is the projected value at success?", stageCriticalAt: "Solutioning", autopopPriority: "high" },
    { id: "q9", sectionId: "economic-value", prompt: "What is the quantified cost of inaction?", stageCriticalAt: "Commit", autopopPriority: "high" },
    { id: "q10", sectionId: "economic-value", prompt: "Who validates the value model?", stageCriticalAt: "Commit", autopopPriority: "medium" },
    { id: "q11", sectionId: "economic-value", prompt: "What financial risk remains unresolved?", stageCriticalAt: "Commit", autopopPriority: "medium" }
  ]},
  { id: "power-politics", title: "Power, Politics, Signature & Partners", questions: [
    { id: "q12", sectionId: "power-politics", prompt: "Who is the economic buyer?", stageCriticalAt: "Discovery", autopopPriority: "high" },
    { id: "q13", sectionId: "power-politics", prompt: "Who signs and what is the signature path?", stageCriticalAt: "Commit", autopopPriority: "high" },
    { id: "q14", sectionId: "power-politics", prompt: "Who can block this deal internally?", stageCriticalAt: "Solutioning", autopopPriority: "high" },
    { id: "q15", sectionId: "power-politics", prompt: "Who champions this deal and why?", stageCriticalAt: "Discovery", autopopPriority: "medium" },
    { id: "q16", sectionId: "power-politics", prompt: "Who influences technical selection?", stageCriticalAt: "Solutioning", autopopPriority: "medium" },
    { id: "q17", sectionId: "power-politics", prompt: "Which procurement constraints matter?", stageCriticalAt: "Solutioning", autopopPriority: "medium" },
    { id: "q18", sectionId: "power-politics", prompt: "Which legal/security approvers are required?", stageCriticalAt: "Commit", autopopPriority: "high" },
    { id: "q19", sectionId: "power-politics", prompt: "What partner dependencies affect close?", stageCriticalAt: "Commit", autopopPriority: "medium" }
  ]},
  { id: "vision-alignment", title: "Vision Alignment", questions: [
    { id: "q20", sectionId: "vision-alignment", prompt: "What future-state vision did customer confirm?", stageCriticalAt: "Solutioning", autopopPriority: "medium" },
    { id: "q21", sectionId: "vision-alignment", prompt: "What proof points made the vision credible?", stageCriticalAt: "Commit", autopopPriority: "medium" }
  ]},
  { id: "openai-differentiation", title: "OpenAI Differentiation", questions: [
    { id: "q22", sectionId: "openai-differentiation", prompt: "Which OpenAI differentiator matters most for this deal?", stageCriticalAt: "Solutioning", autopopPriority: "medium" },
    { id: "q23", sectionId: "openai-differentiation", prompt: "How is differentiation proven in customer context?", stageCriticalAt: "Commit", autopopPriority: "medium" }
  ]},
  { id: "competitive-reality", title: "Competitive Reality", questions: [
    { id: "q24", sectionId: "competitive-reality", prompt: "Who are active competitors and why could they win?", stageCriticalAt: "Commit", autopopPriority: "high" }
  ]}
];

export const TAS_TOTAL_QUESTIONS = 24;
