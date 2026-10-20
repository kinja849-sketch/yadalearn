import { useState, useCallback } from 'react';
import type {
  GradeSubmissionResponse,
  LessonPlanResponse,
  EngagementRadarResponse,
  TeacherAIRequest
} from '@/types/ai';

export const useTeacherAI = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestTeacherAI = useCallback(async (payload: TeacherAIRequest) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/teacher-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Teacher AI request failed with status ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (err: any) {
      console.error('[useTeacherAI] Error:', err);
      setError(err.message || 'Failed to communicate with Teacher AI');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const gradeSubmission = useCallback(async (
    assignmentTitle: string,
    submissionContent: string,
    studentName: string = 'Student'
  ): Promise<GradeSubmissionResponse | null> => {
    return requestTeacherAI({
      action: 'grade_submission',
      assignmentTitle,
      submissionContent,
      studentName
    });
  }, [requestTeacherAI]);

  const generateLessonPlan = useCallback(async (
    subject: string,
    title: string,
    duration: string = '60 min'
  ): Promise<LessonPlanResponse | null> => {
    return requestTeacherAI({
      action: 'lesson_plan',
      subject,
      title,
      duration
    });
  }, [requestTeacherAI]);

  const analyzeEngagement = useCallback(async (
    studentName: string,
    attendance?: string,
    grade?: string,
    missingWork?: number
  ): Promise<EngagementRadarResponse | null> => {
    return requestTeacherAI({
      action: 'engagement_radar',
      studentName,
      attendance,
      grade,
      missingWork
    });
  }, [requestTeacherAI]);

  const askTeacherCoPilot = useCallback(async (
    message: string,
    teacherName: string = 'Teacher'
  ): Promise<string | null> => {
    const res = await requestTeacherAI({
      action: 'chat',
      message,
      teacherName
    });
    return res?.reply || null;
  }, [requestTeacherAI]);

  return {
    isLoading,
    error,
    gradeSubmission,
    generateLessonPlan,
    analyzeEngagement,
    askTeacherCoPilot
  };
};
