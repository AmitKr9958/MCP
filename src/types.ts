export interface Job {
  id: string;
  url: string;
  title?: string;
  notes?: string;
}

export type JobStatus =
  | "pending"
  | "in-progress"
  | "completed"
  | "skipped"
  | "failed";

export type CheckpointStage =
  | "none"
  | "navigated"
  | "analyzed"
  | "tailored"
  | "pdf"
  | "filled";

export interface JobState {
  id: string;
  status: JobStatus;
  lastUpdated: string;
  error?: string;
  checkpoint?: CheckpointStage;
  tailoredResumePath?: string;
  analysisPath?: string;
  pdfPath?: string;
}

export interface Profile {
  fullName: string;
  email: string;
  phone: string;
  linkedin?: string;
  github?: string;
  location?: string;
  summary: string;
  skills: string[];
  experience: Array<{
    company: string;
    title: string;
    start: string;
    end: string;
    bullets: string[];
  }>;
  education: Array<{
    school: string;
    degree: string;
    year: string;
  }>;
}

export interface AnalyzedJD {
  requiredSkills: string[];
  preferredSkills: string[];
  keywords: string[];
  experienceYears?: number | null;
  summary: string;
  rawTextPreview?: string;
}

export interface AppConfig {
  apiKey: string;
  baseURL: string;
  model: string;
  jobs: Job[];
  profile: Profile;
  masterResume: string;
  paths: {
    root: string;
    analyzedDir: string;
    tailoredDir: string;
    statusFile: string;
  };
}

export interface CliOptions {
  fromId?: string;
  retryId?: string;
  skipId?: string;
  resumeId?: string;
  statusOnly?: boolean;
  help?: boolean;
}

/** LLM-proposed form field mapping */
export interface FormFieldMapping {
  selector: string;
  value: string;
  reason?: string;
}
