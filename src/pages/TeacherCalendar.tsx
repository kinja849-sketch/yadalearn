import { useState, useEffect } from 'react';
import { BottomNav } from '@/components/BottomNav';
import { cn } from "@/lib/utils";
import { format, addDays, startOfWeek, getDate, isSameDay } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Plus } from 'lucide-react';

const TeacherCalendar = () => {
    const { user, isLoaded } = useAuth();
    const userId = user?.id;

    const [selectedDate, setSelectedDate] = useState<Date>(new Date());

    // Dynamic Days Generation (Current Week)
    const [days, setDays] = useState<{ day: string; date: number; fullDate: Date }[]>([]);

    useEffect(() => {
        const start = startOfWeek(selectedDate, { weekStartsOn: 0 }); // Sunday start
        const weekDays = [];
        for (let i = 0; i < 7; i++) {
            const currentDate = addDays(start, i);
            weekDays.push({
                day: format(currentDate, 'EEE'), // 'Sun'
                date: getDate(currentDate), // 1
                fullDate: currentDate
            });
        }
        setDays(weekDays);
    }, [selectedDate]);

    // State for Teacher Events loaded from Supabase bookings table
    const [events, setEvents] = useState<any[]>([]);

    useEffect(() => {
        if (!isLoaded || !userId) return;

        async function fetchEvents() {
            try {
                const { data: bookingsData, error: bookingsError } = await supabase
                    .from('bookings')
                    .select('*, student:profiles!bookings_student_id_fkey(*)')
                    .eq('teacher_id', userId)
                    .in('status', ['confirmed', 'scheduled', 'pending', 'completed']);

                if (bookingsError) throw bookingsError;

                const { data: classesData, error: classesError } = await supabase
                    .from('live_classes')
                    .select('*')
                    .eq('teacher_id', userId);

                if (classesError) throw classesError;

                const mappedBookings = (bookingsData || []).map((b: any) => {
                    let formattedDate = b.date;
                    try {
                        const parts = b.date.split('-');
                        if (parts.length === 3) {
                            const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
                            formattedDate = format(d, 'MMMM d, yyyy');
                        }
                    } catch (e) {
                        console.error(e);
                    }
                    return {
                        id: b.id,
                        time: b.time || '10:00 AM',
                        endTime: '1:00 PM',
                        title: b.student?.full_name ? `${b.subject || 'Lesson'} with ${b.student.full_name}` : (b.subject || 'Online Session'),
                        location: b.student ? 'Online Lesson' : 'Online',
                        date: formattedDate,
                        status: b.status === 'completed' ? 'completed' : 'upcoming',
                        type: 'class'
                    };
                });

                const mappedClasses = (classesData || []).map((c: any) => {
                    let formattedDate = '';
                    let formattedTime = '10:00 AM';
                    try {
                        const d = new Date(c.scheduled_at || c.scheduled_start || c.created_at);
                        formattedDate = format(d, 'MMMM d, yyyy');
                        formattedTime = format(d, 'h:mm a');
                    } catch (e) {
                        console.error(e);
                    }
                    return {
                        id: c.id,
                        time: formattedTime,
                        endTime: '1:00 PM',
                        title: c.title || `${c.subject || 'Live'} Class`,
                        location: 'Live Class',
                        date: formattedDate,
                        status: c.status === 'completed' ? 'completed' : 'upcoming',
                        type: 'class'
                    };
                });

                // Deduplicate by ID
                const eventMap = new Map();
                [...mappedBookings, ...mappedClasses].forEach(evt => eventMap.set(evt.id, evt));
                setEvents(Array.from(eventMap.values()));
            } catch (err) {
                console.error('Error fetching calendar events:', err);
            }
        }

        fetchEvents();
    }, [isLoaded, userId]);

    const [showAddModal, setShowAddModal] = useState(false);
    const [newEventTitle, setNewEventTitle] = useState('');
    const [newEventTime, setNewEventTime] = useState('12:00 PM');

    const handleDelete = async (id: string | number) => {
        try {
            if (typeof id === 'string') {
                const { error } = await supabase
                    .from('bookings')
                    .delete()
                    .eq('id', id);
                if (error) throw error;
            }
            setEvents(events.filter(e => e.id !== id));
        } catch (err) {
            console.error('Error deleting event:', err);
            alert('Failed to delete event.');
        }
    };

    const handleAddEvent = async () => {
        if (!newEventTitle || !userId) return;
        const dbDateStr = format(selectedDate, 'yyyy-MM-dd');
        try {
            const newBooking = {
                teacher_id: userId,
                student_id: null,
                subject: newEventTitle,
                date: dbDateStr,
                time: newEventTime,
                status: 'confirmed'
            };
            const { data, error } = await supabase
                .from('bookings')
                .insert(newBooking)
                .select()
                .single();

            if (error) throw error;

            const newEvent = {
                id: data.id,
                time: newEventTime,
                endTime: '1:00 PM',
                title: newEventTitle,
                location: 'Online',
                date: format(selectedDate, 'MMMM d, yyyy'),
                status: 'upcoming',
                type: 'meeting'
            };
            setEvents([...events, newEvent].sort((a, b) => a.time.localeCompare(b.time)));
            setShowAddModal(false);
            setNewEventTitle('');
        } catch (err) {
            console.error('Error adding event:', err);
            alert('Failed to add event.');
        }
    };

    return (
        <div className="min-h-screen bg-[#F8F9FB] dark:bg-zinc-950 pb-24 font-sans text-gray-900 dark:text-white">
            {/* Header Card */}
            <div className="bg-white dark:bg-zinc-900 rounded-b-[40px] shadow-sm px-6 pt-6 pb-8 mb-6 relative z-10">
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-xl font-bold">Teacher Schedule</h1>
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={() => setSelectedDate(prev => addDays(prev, -7))}
                            className="size-8 rounded-full border border-gray-150 dark:border-zinc-700 flex items-center justify-center hover:bg-gray-50 dark:hover:bg-zinc-800"
                        >
                            <span className="material-symbols-outlined text-sm font-bold">chevron_left</span>
                        </button>
                        <button className="flex items-center gap-1 px-4 py-2 border border-gray-100 dark:border-zinc-700 rounded-full bg-white dark:bg-zinc-800 text-sm font-bold shadow-sm">
                            {format(selectedDate, 'MMMM')}
                        </button>
                        <button 
                            onClick={() => setSelectedDate(prev => addDays(prev, 7))}
                            className="size-8 rounded-full border border-gray-150 dark:border-zinc-700 flex items-center justify-center hover:bg-gray-50 dark:hover:bg-zinc-800"
                        >
                            <span className="material-symbols-outlined text-sm font-bold">chevron_right</span>
                        </button>
                    </div>
                </div>

                {/* Days Horizontal Scroll */}
                <div className="flex justify-between items-center">
                    {days.map((item) => {
                        const isSelected = isSameDay(item.fullDate, selectedDate);
                        const isToday = isSameDay(item.fullDate, new Date());

                        return (
                            <button
                                key={item.date}
                                onClick={() => setSelectedDate(item.fullDate)}
                                className="flex flex-col items-center gap-3 transition-transform active:scale-95"
                            >
                                <span className={`text-xs font-semibold ${isSelected ? 'text-gray-900 dark:text-white' : 'text-gray-400'}`}>
                                    {item.day}
                                </span>
                                <div className={`w-11 h-14 rounded-[20px] flex items-center justify-center text-sm font-bold transition-all shadow-sm relative ${isSelected
                                        ? 'bg-[#FF7D46] text-white shadow-orange-200 dark:shadow-orange-950/20 scale-110'
                                        : 'bg-white dark:bg-zinc-800 text-gray-700 dark:text-gray-300 border border-transparent'
                                    }`}>
                                    {item.date}
                                    {/* Small dot for Today if not selected */}
                                    {!isSelected && isToday && (
                                        <div className="absolute -bottom-1 w-1 h-1 bg-[#FF7D46] rounded-full"></div>
                                    )}
                                </div>
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* Timeline Events */}
            <div className="px-6 relative">
                <div className="absolute left-[88px] top-0 bottom-0 w-[2px] bg-gray-200 dark:bg-zinc-800 z-0"></div>

                <div className="space-y-6 pb-20">
                    {/* Check if events exist for selected date */}
                    {events.filter(e => e.date === format(selectedDate, 'MMMM d, yyyy')).length > 0 ? (
                        events.filter(e => e.date === format(selectedDate, 'MMMM d, yyyy')).map((event, index) => {
                            const isActive = event.status === 'active';
                            return (
                                <div key={event.id} className="relative flex gap-4 group z-10 animate-in slide-in-from-bottom-2 duration-300">
                                    {/* Time Column */}
                                    <div className="w-16 pt-2 text-right shrink-0">
                                        <span className={`text-xs font-bold ${isActive ? 'text-gray-900 dark:text-white' : 'text-gray-400'}`}>
                                            {event.time}
                                        </span>
                                    </div>

                                    {/* Timeline Node */}
                                    <div className="relative pt-1 flex justify-center">
                                        {event.status === 'completed' ? (
                                            <div className="w-7 h-7 rounded-full border-2 border-gray-200 bg-white dark:bg-zinc-900 flex items-center justify-center z-20">
                                                <span className="material-symbols-outlined text-gray-300 text-sm">check</span>
                                            </div>
                                        ) : isActive ? (
                                            <div className="w-7 h-7 rounded-full border-[3px] border-[#FF7D46] bg-white dark:bg-zinc-900 flex items-center justify-center relative z-20 shadow-lg shadow-orange-100 dark:shadow-orange-950/20">
                                                <div className="w-2.5 h-2.5 bg-[#FF7D46] rounded-full"></div>
                                            </div>
                                        ) : (
                                            <div className="w-7 h-7 rounded-full border-2 border-orange-100 dark:border-orange-900/30 bg-orange-50 dark:bg-orange-950 flex items-center justify-center z-20">
                                                <div className="w-2.5 h-2.5 bg-orange-300 rounded-full"></div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Event Card */}
                                    <div className="flex-1 min-w-0">
                                        <div className={`p-5 rounded-[24px] transition-all relative group-hover:bg-white group-hover:shadow-md dark:group-hover:bg-zinc-900 ${isActive ? 'bg-gradient-to-r from-orange-50/80 to-transparent dark:from-orange-900/10' : ''
                                            }`}>
                                            {isActive && (
                                                <div className="absolute top-8 -left-8 w-8 h-[2px] bg-[#FF7D46] z-0"></div>
                                            )}

                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <h3 className={`font-bold text-base ${isActive ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}>
                                                            {event.title}
                                                        </h3>
                                                        {event.type === 'class' && (
                                                            <span className="text-[10px] font-bold bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full uppercase">Class</span>
                                                        )}
                                                    </div>

                                                    <div className="space-y-1.5">
                                                        <div className="flex items-center gap-2 text-xs text-gray-400 font-medium">
                                                            <span className="material-symbols-outlined text-[16px] text-orange-400">location_on</span>
                                                            <span>{event.location}</span>
                                                        </div>
                                                        <div className="flex items-center gap-2 text-xs text-gray-400 font-medium">
                                                            <span className="material-symbols-outlined text-[16px] text-orange-400">calendar_today</span>
                                                            <span>{event.date}</span>
                                                        </div>
                                                        <div className="flex items-center gap-2 text-xs text-gray-400 font-medium">
                                                            <span className="material-symbols-outlined text-[16px] text-orange-400">schedule</span>
                                                            <span>{event.time} - {event.endTime}</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <button
                                                    onClick={() => handleDelete(event.id)}
                                                    className="p-2 h-10 w-10 flex items-center justify-center rounded-full bg-white dark:bg-zinc-800 shadow-sm text-gray-400 hover:text-red-500 hover:scale-110 transition-all opacity-0 group-hover:opacity-100"
                                                >
                                                    <span className="material-symbols-outlined text-lg">delete</span>
                                                </button>
                                            </div>

                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    ) : (
                        <div className="text-center py-10 text-gray-400 font-medium">
                            No scheduled items for this day
                        </div>
                    )}
                </div>
            </div>

            {/* Floating Add Plan Button */}
            <button
                onClick={() => setShowAddModal(true)}
                className="fixed bottom-24 right-6 w-16 h-16 bg-[#FF7D46] text-white rounded-full shadow-xl shadow-orange-500/30 flex items-center justify-center hover:scale-105 transition-transform z-40 active:scale-95"
            >
                <Plus className="h-6 w-6" />
            </button>

            {/* Add Plan Modal */}
            {showAddModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-zinc-900 rounded-[32px] w-full max-w-sm p-8 shadow-2xl animate-in zoom-in-95 duration-200">
                        <h2 className="text-2xl font-bold mb-6 text-center">New Session</h2>

                        <div className="space-y-4 mb-8">
                            <div>
                                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-4 mb-2 block">Title</label>
                                <input
                                    type="text"
                                    placeholder="e.g. Staff Meeting"
                                    className="w-full h-14 rounded-2xl bg-gray-50 dark:bg-zinc-800 border-none px-6 font-semibold focus:ring-2 focus:ring-[#FF7D46] transition-all outline-none"
                                    value={newEventTitle}
                                    onChange={e => setNewEventTitle(e.target.value)}
                                    autoFocus
                                />
                            </div>

                            <div>
                                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-4 mb-2 block">Time</label>
                                <input
                                    type="text"
                                    placeholder="e.g. 10:00 AM"
                                    className="w-full h-14 rounded-2xl bg-gray-50 dark:bg-zinc-800 border-none px-6 font-semibold focus:ring-2 focus:ring-[#FF7D46] transition-all outline-none"
                                    value={newEventTime}
                                    onChange={e => setNewEventTime(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="flex gap-4">
                            <button
                                onClick={() => setShowAddModal(false)}
                                className="flex-1 py-4 text-gray-500 font-bold hover:bg-gray-50 dark:hover:bg-zinc-800 rounded-2xl transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleAddEvent}
                                className="flex-1 py-4 bg-[#FF7D46] text-white rounded-2xl font-bold shadow-lg shadow-orange-100 dark:shadow-orange-950/20 hover:bg-[#e06530] transition-colors"
                            >
                                Save
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <BottomNav />
        </div>
    );
};

export default TeacherCalendar;
