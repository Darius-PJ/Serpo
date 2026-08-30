// Shared between the server-side card builder (boardData.ts) and the client
// board (components/PipelineBoard.tsx) — keep this module import-safe for both.
export interface PipelineCard {
  id: string;
  company: string;
  role: string;
  status: string;
  source: string;
  stageAgeLabel: string;
  stageAgeStale: boolean;
  followUpDue: boolean;
}
