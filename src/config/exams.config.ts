export const EXAM_CONFIGS = [
  { name: "UT-I", term: 1, displayOrder: 1, maxMarks: 10, passMarks: 3.3 },
  { name: "UT-II", term: 1, displayOrder: 2, maxMarks: 10, passMarks: 3.3 },
  { name: "Half Yearly", term: 1, displayOrder: 3, maxMarks: 80, passMarks: 26.4 },
  { name: "UT-III", term: 2, displayOrder: 4, maxMarks: 10, passMarks: 3.3 },
  { name: "UT-IV", term: 2, displayOrder: 5, maxMarks: 10, passMarks: 3.3 },
  { name: "Annual", term: 2, displayOrder: 6, maxMarks: 80, passMarks: 26.4 },
] as const;

export function getExamConfig(name: string) {
  return EXAM_CONFIGS.find((c) => c.name === name) ?? null;
}
