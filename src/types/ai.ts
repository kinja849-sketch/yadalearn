export type AIMessageRole = 'user' | 'assistant' | 'system';

export interface DetectedAssignment {
  id: string;
  title: string;
  description?: string;
  courseTitle: string;
  dueDate?: string;
  status: string;
}

export interface AIMessage {
  id: string;
  sender: 'ai' | 'user';
  text: string;
  time: string;
  subject?: string;
  assignmentTitle?: string;
  actionType?: 'hint' | 'quiz' | 'breakdown' | 'summary' | 'chat';
}

export type GeminiLiveConnectionState = 'idle' | 'connecting' | 'listening' | 'processing' | 'speaking' | 'interrupted' | 'error';

export interface GeminiLiveServerEvent {
  type: 'setupComplete' | 'audio' | 'text' | 'interrupted' | 'turnComplete' | 'error' | 'toolExecuted';
  data?: string;
  mimeType?: string;
  text?: string;
  toolName?: string;
  toolResult?: any;
  error?: string;
}

export interface GeminiLiveClientEvent {
  type: 'audio' | 'text' | 'interrupt' | 'reset';
  pcmBase64?: string;
  text?: string;
}

export interface StudentAIRequest {
  messages: Array<{ role: AIMessageRole; content: string }>;
  subject: string;
  studentName: string;
  activeAssignment?: DetectedAssignment | null;
  detectedAssignments?: DetectedAssignment[];
  actionType?: 'hint' | 'quiz' | 'breakdown' | 'summary' | 'chat';
}

export interface StudentAIResponse {
  reply: string;
  detectedAssignment?: string;
  actionType?: string;
}

export type TeacherAIAction = 'grade_submission' | 'lesson_plan' | 'engagement_radar' | 'chat';

export interface GradeSubmissionRequest {
  action: 'grade_submission';
  assignmentTitle: string;
  submissionContent: string;
  studentName?: string;
}

export interface GradeSubmissionResponse {
  suggestedGrade: number;
  strengths: string;
  growthAreas: string;
  suggestedFeedback: string;
  summary: string;
}

export interface LessonPlanRequest {
  action: 'lesson_plan';
  subject: string;
  title: string;
  duration?: string;
  studentCount?: number;
}

export interface LessonTimelineItem {
  phase: string;
  duration: string;
  activity: string;
}

export interface LessonPlanResponse {
  learningObjectives: string[];
  hook: string;
  timeline: LessonTimelineItem[];
  discussionQuestions: string[];
  descriptionText: string;
}

export interface EngagementRadarRequest {
  action: 'engagement_radar';
  studentName: string;
  attendance?: string;
  grade?: string;
  missingWork?: number;
  recentNotes?: string;
}

export interface EngagementRadarResponse {
  riskLevel: 'low' | 'medium' | 'high';
  trendAnalysis: string;
  recommendedAction: string;
  suggestedMessage: string;
}

export interface TeacherAIChatRequest {
  action: 'chat';
  message: string;
  teacherName?: string;
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface TeacherAIChatResponse {
  reply: string;
}

export type TeacherAIRequest = 
  | GradeSubmissionRequest 
  | LessonPlanRequest 
  | EngagementRadarRequest 
  | TeacherAIChatRequest;

