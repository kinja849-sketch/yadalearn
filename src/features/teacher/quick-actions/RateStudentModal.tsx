import React, { useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

interface RateStudentModalProps {
    isOpen: boolean;
    onClose: () => void;
    students: any[];
}

export const RateStudentModal = ({ isOpen, onClose, students }: RateStudentModalProps) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [ratings, setRatings] = useState<Record<string, { rating: number; comment: string }>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { user } = useAuth();

    const currentStudent = students[currentIndex];

    const handleNext = () => {
        if (currentIndex < students.length - 1) {
            setCurrentIndex(currentIndex + 1);
        } else {
            handleSubmit();
        }
    };

    const handleSubmit = async () => {
        setIsSubmitting(true);
        try {
            const currentTeacherId = user?.id || localStorage.getItem('yadalearn-user-id');
            const entries = Object.entries(ratings);

            if (currentTeacherId && entries.length > 0) {
                for (const [studentId, evalData] of entries) {
                    if (evalData.rating > 0) {
                        await supabase
                            .from('session_ratings')
                            .insert({
                                rater_id: currentTeacherId,
                                rated_id: studentId,
                                rating: evalData.rating,
                                feedback: evalData.comment || 'Weekly Student Evaluation',
                                rated_as: 'student'
                            });
                    }
                }
            }
            alert("Weekly student evaluations submitted successfully!");
            onClose();
        } catch (err) {
            console.error('Error submitting weekly evaluation:', err);
            alert("Failed to save evaluation. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const setRatingForCurrent = (val: number) => {
        setRatings(prev => ({
            ...prev,
            [currentStudent.id]: {
                ...prev[currentStudent.id],
                rating: val
            }
        }));
    };

    const setCommentForCurrent = (val: string) => {
        setRatings(prev => ({
            ...prev,
            [currentStudent.id]: {
                ...prev[currentStudent.id],
                comment: val
            }
        }));
    };

    if (!currentStudent) return null;

    const currentRating = ratings[currentStudent.id]?.rating || 0;
    const currentComment = ratings[currentStudent.id]?.comment || '';

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="!max-w-xl mx-auto bg-white dark:bg-zinc-900 text-gray-900 dark:text-white border-0 p-0 overflow-hidden rounded-[2.5rem] shadow-2xl">
                <div className="p-8">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-2xl font-bold">Weekly Student Evaluation</h2>
                        <span className="text-sm font-semibold bg-orange-100 dark:bg-orange-500/20 text-orange-600 px-3 py-1 rounded-full">
                            {currentIndex + 1} of {students.length}
                        </span>
                    </div>

                    <div className="flex items-center gap-4 mb-8 bg-gray-50 dark:bg-zinc-800/50 p-4 rounded-2xl">
                        {currentStudent.avatar ? (
                            <img src={currentStudent.avatar} alt="avatar" className="w-16 h-16 rounded-full" />
                        ) : (
                            <div className="w-16 h-16 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center">
                                <span className="material-symbols-outlined text-3xl">person</span>
                            </div>
                        )}
                        <div>
                            <h3 className="text-xl font-bold">{currentStudent.name}</h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400">Rate attendance, assignments, and progress</p>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div className="flex justify-center gap-2">
                            {[1, 2, 3, 4, 5].map((star) => (
                                <button
                                    key={star}
                                    type="button"
                                    onClick={() => setRatingForCurrent(star)}
                                    className="transition-transform hover:scale-110 active:scale-95 focus:outline-none"
                                >
                                    <span className={`material-symbols-outlined text-5xl ${
                                        currentRating >= star 
                                            ? 'text-yellow-400 filled' 
                                            : 'text-gray-300 dark:text-zinc-700'
                                    }`} style={{ fontVariationSettings: currentRating >= star ? "'FILL' 1" : "'FILL' 0" }}>
                                        star
                                    </span>
                                </button>
                            ))}
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 dark:text-zinc-300 mb-2">
                                Teacher's Notes (Optional)
                            </label>
                            <textarea
                                value={currentComment}
                                onChange={(e) => setCommentForCurrent(e.target.value)}
                                placeholder="Write down any notes about their progress this week..."
                                rows={3}
                                className="w-full bg-white dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-orange-500/50 resize-none transition-all"
                            />
                        </div>

                        <button
                            onClick={handleNext}
                            className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3.5 rounded-xl transition-colors"
                        >
                            {currentIndex < students.length - 1 ? 'Next Student' : 'Submit Evaluations'}
                        </button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};
