
export type AppView = 'login' | 'dashboard' | 'input' | 'results';

export interface SkillGap {
  skill: string;
  importance: 'High' | 'Medium' | 'Low';
}

export interface OptimizedBullet {
  original: string;
  optimized: string;
  explanation: string;
}

export interface AnalysisResult {
  matchScore: number;
  matchReasoning: string;
  missingSkills: SkillGap[];
  optimizedBullets: OptimizedBullet[];
  suggestedAdditions: string[];
  coverLetter: string;
}

export interface FileData {
  data: string;
  mimeType: string;
  name: string;
}

export interface ResumeInput {
  resumeText?: string;
  resumeFile?: FileData;
  jobDescription: string;
}

export interface OptimizationHistory {
  id: string;
  jobTitle: string;
  company: string;
  date: string;
  score: number;
}
