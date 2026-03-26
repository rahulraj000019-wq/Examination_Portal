export type UserRole = 'student' | 'teacher';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string | null;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string | null;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export interface UserProfile {
  uid: string;
  email: string;
  name: string;
  role: UserRole;
  portalPassword?: string;
}

export type QuestionType = 'mcq' | 'subjective' | 'coding';

export interface Question {
  id: string;
  examId: string;
  type: QuestionType;
  text: string;
  options?: string[];
  correctAnswer?: string;
  testCases?: { input: string; output: string }[];
  points: number;
}

export interface Exam {
  id: string;
  title: string;
  description: string;
  startTime: string;
  endTime: string;
  duration: number;
  password?: string;
  creatorUid: string;
}

export interface Submission {
  id: string;
  examId: string;
  examTitle?: string;
  examDescription?: string;
  studentUid: string;
  studentName?: string;
  status: 'started' | 'submitted';
  startTime: string;
  submitTime?: string;
  answers: Record<string, string>;
  gradedQuestions?: Record<string, { correct: boolean; points: number }>;
  marks: number;
  tabSwitchCount: number;
  result?: 'pass' | 'fail' | 'pending';
  remark?: string;
}

export type ProctoringLogType = 'tab-switch' | 'face-missing' | 'multiple-faces' | 'looking-away' | 'snapshot';

export interface ProctoringLog {
  id: string;
  submissionId: string;
  timestamp: string;
  type: ProctoringLogType;
  evidence?: string;
}
