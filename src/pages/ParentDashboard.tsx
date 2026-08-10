import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Home, Search, Calendar, User, Settings, LogOut, Menu, QrCode, TrendingUp, BookOpen, Activity, LayoutDashboard, History, CheckCircle2 } from 'lucide-react';
import { BottomNav } from '@/components/BottomNav';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { removeImageBackground } from '@/utils/imageProcessor';
import ScanQRModal from '@/features/parent/ScanQRModal';
import { MessageTeacherModal } from '@/features/student/quick-actions/MessageTeacherModal';
import { Dialog, DialogContent } from '@/components/ui/dialog';

const ParentDashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, refreshUser, logout } = useAuth();
  
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isScanModalOpen, setIsScanModalOpen] = useState(false);
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [selectedTeacherIdForChat, setSelectedTeacherIdForChat] = useState<string | undefined>(undefined);
  const [selectedChildForChat, setSelectedChildForChat] = useState<string | undefined>(undefined);
  const [childLastMessages, setChildLastMessages] = useState<Record<string, any>>({});
  const [childUnreadCounts, setChildUnreadCounts] = useState<Record<string, number>>({});
  
  const [linkedChildren, setLinkedChildren] = useState<any[]>([]);
  const [selectedChild, setSelectedChild] = useState<any | null>(null);
  const [viewingStudentId, setViewingStudentId] = useState<string | null>(null);
  const [childTeachers, setChildTeachers] = useState<any[]>([]);
  const [childAlerts, setChildAlerts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const [uploading, setUploading] = useState(false);
  const [localImage, setLocalImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [progressPercent, setProgressPercent] = useState(0);

  const userId = user?.id;
  let userName = user?.name || (user?.firstName && user?.lastName ? `${user.firstName} ${user.lastName}` : user?.firstName) || user?.user_metadata?.first_name || 'Guardian';
  
  // Clean up any "(Parent of X)" suffix if it somehow got saved into the user's name
  if (userName.includes('(Parent of')) {
      userName = userName.split('(Parent of')[0].trim();
  }
  // Also replace 'Guardian' with actual first name if available via metadata
  if (userName === 'Guardian' && user?.user_metadata?.first_name) {
      userName = user.user_metadata.first_name;
  }

  // Real data fetching logic
  useEffect(() => {
    async function fetchLinkedChildren() {
      if (!user?.id) return;
      try {
        const { data: links, error } = await supabase
          .from('parent_student_links')
          .select(`
            student_id,
            student:profiles!parent_student_links_student_id_fkey(
              id, full_name, avatar_url,
              student_profiles(grade_level, study_goal)
            )
          `)
          .eq('parent_id', user.id);

        if (error) throw error;
        
        const children = links.map((link: any) => ({
          id: link.student.id,
          name: link.student.full_name,
          avatar: link.student.avatar_url,
          grade: link.student.student_profiles?.[0]?.grade_level || 'General',
          focus: link.student.student_profiles?.[0]?.study_goal || 'General Focus'
        }));
        
        setLinkedChildren(children);
        if (children.length > 0) {
          setSelectedChild(children[0]);
        }
      } catch (err) {
        console.error("Error fetching linked children", err);
      } finally {
        setLoading(false);
      }
    }
    fetchLinkedChildren();
  }, [user?.id]);

  useEffect(() => {
    async function fetchAlerts() {
      if (!linkedChildren || linkedChildren.length === 0) return;
      const studentIds = linkedChildren.map(c => c.id);
      
      const { data: bookings } = await supabase
        .from('bookings')
        .select('student_id')
        .in('student_id', studentIds);
      
      const { data: submissions } = await supabase
        .from('submissions')
        .select('student_id')
        .in('student_id', studentIds)
        .is('grade', null);
      
      const alerts: Record<string, string> = {};
      linkedChildren.forEach(child => {
        const childBookings = bookings?.filter(b => b.student_id === child.id) || [];
        const childSubmissions = submissions?.filter(s => s.student_id === child.id) || [];
        
        if (childSubmissions.length > 0) {
            alerts[child.id] = `${childSubmissions.length} Pending Assignment${childSubmissions.length > 1 ? 's' : ''}`;
        } else if (childBookings.length > 0) {
            alerts[child.id] = `Upcoming Class Scheduled`;
        } else {
            alerts[child.id] = `Grade ${child.grade} • ${child.focus}`;
        }
      });
      setChildAlerts(alerts);
    }
    fetchAlerts();
  }, [linkedChildren]);

  useEffect(() => {
    async function fetchChildTeachers() {
      if (!selectedChild?.id) return;
      try {
        const { data: bookings } = await supabase
          .from('bookings')
          .select('teacher_id')
          .eq('student_id', selectedChild.id);

        const teacherIds = bookings ? Array.from(new Set(bookings.map((b: any) => b.teacher_id).filter(Boolean))) : [];
        if (teacherIds.length > 0) {
           const { data: teachers } = await supabase
            .from('profiles')
            .select(`
              id, full_name, avatar_url, subjects, is_online,
              teacher_profiles(rating)
            `)
            .in('id', teacherIds)
            .eq('role', 'teacher');
            
           if (teachers) {
             setChildTeachers(teachers.map((t: any) => ({
               id: t.id,
               name: t.full_name,
               avatar: t.avatar_url,
               subjects: t.subjects || ['General Subjects'],
               isOnline: !!t.is_online,
               rating: (Array.isArray(t.teacher_profiles) ? t.teacher_profiles[0]?.rating : t.teacher_profiles?.rating) || 0
             })));
           }
        }
      } catch (err) {
        console.error("Error fetching child teachers", err);
      }
    }
    fetchChildTeachers();
  }, [selectedChild?.id]);

  useEffect(() => {
    async function fetchChildMessages() {
      if (!user?.id) return;
      try {
        const { data } = await supabase
          .from('chat_messages')
          .select('*')
          .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
          .order('created_at', { ascending: true });

        if (data) {
          const mapping: Record<string, any> = {};
          const counts: Record<string, number> = {};
          data.forEach((m: any) => {
            const partnerId = m.sender_id === user.id ? m.receiver_id : m.sender_id;
            mapping[partnerId] = m;
            if (!m.is_read && m.receiver_id === user.id) {
              counts[partnerId] = (counts[partnerId] || 0) + 1;
            }
          });
          setChildLastMessages(mapping);
          setChildUnreadCounts(counts);
        }
      } catch (err) {
        console.error("Error fetching child messages:", err);
      }
    }

    if (user?.id) {
      fetchChildMessages();
      const channel = supabase.channel('parent-dashboard-chat-messages')
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'chat_messages'
        }, () => {
          fetchChildMessages();
        })
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [user?.id]);

  const handleImageClick = () => {
    fileInputRef.current?.click();
  };

  const resizeProfileImage = (base64Str: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = base64Str;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(base64Str);
          return;
        }

        const targetWidth = 250;
        const targetHeight = 300;
        canvas.width = targetWidth;
        canvas.height = targetHeight;

        const imgRatio = img.width / img.height;
        const targetRatio = targetWidth / targetHeight;
        let sx = 0, sy = 0, sWidth = img.width, sHeight = img.height;

        if (imgRatio > targetRatio) {
          sWidth = img.height * targetRatio;
          sx = (img.width - sWidth) / 2;
        } else {
          sHeight = img.width / targetRatio;
          sy = (img.height - sHeight) / 2;
        }

        ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, targetWidth, targetHeight);
        resolve(canvas.toDataURL('image/png')); 
      };
      img.onerror = () => {
        resolve(base64Str);
      };
    });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const userId = user?.id;
    if (!userId) return;

    setUploading(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64String = reader.result as string;
      try {
        const resizedImage = await resizeProfileImage(base64String);
        const processedImage = await removeImageBackground(resizedImage);
        
        const { error } = await supabase
          .from('profiles')
          .update({ avatar_url: processedImage })
          .eq('id', userId);

        if (!error) {
          setLocalImage(processedImage);
          if (refreshUser) await refreshUser();
        }
      } catch (err) {
        console.error(err);
      } finally {
        setUploading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  if (viewingStudentId) {
    return (
      <StudentDashboard 
        viewAsStudentId={viewingStudentId} 
        onBackToParent={() => setViewingStudentId(null)} 
      />
    );
  }

  return (
    <div className="flex min-h-screen bg-[#FCFAF5] dark:bg-zinc-950 font-sans text-[#1C1B19] dark:text-slate-200 w-full relative overflow-x-hidden">
      
      {/* Sidebar Navigation */}
      <aside className={`hidden flex-col justify-between w-64 bg-white/40 dark:bg-zinc-900/30 backdrop-blur-md border-r border-slate-200/20 dark:border-zinc-850/20 p-8 shrink-0 relative z-25 ${!isSidebarCollapsed ? 'md:flex' : 'md:hidden'}`}>
        <div className="flex flex-col gap-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 px-1">
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-slate-50 dark:bg-zinc-800 flex items-center justify-center overflow-hidden shrink-0 border border-slate-100 dark:border-zinc-700 shadow-sm relative">
                <img 
                  src="/logo (2).png" 
                  alt="YadaLearn Logo" 
                  className="absolute w-[185%] h-[185%] max-w-none object-contain top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" 
                />
              </div>
              <span className="font-extrabold text-xl text-slate-900 dark:text-white tracking-tight">YadaLearn</span>
            </div>
            <button 
              onClick={() => setIsSidebarCollapsed(true)} 
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-550 dark:text-zinc-400 transition-colors"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>

          <nav className="flex flex-col gap-2">
            {[
              { label: 'Home', path: '/parent-dashboard', icon: Home },
              { label: 'Progress', path: '/child-progress', icon: Search },
              { label: 'Profile', path: '/settings', icon: User }
            ].map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <button
                  key={item.label}
                  onClick={() => navigate(item.path)}
                  className={cn(
                    "flex items-center gap-3.5 px-4 py-3 rounded-2xl font-bold transition-all text-left w-full",
                    isActive
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/15 font-bold"
                      : "text-slate-600 dark:text-slate-400 hover:bg-white/40 dark:hover:bg-zinc-800/30 font-semibold"
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="flex flex-col gap-4">
          <button
            onClick={() => navigate('/settings')}
            className="flex items-center gap-3.5 px-4 py-3 text-slate-600 dark:text-slate-400 hover:bg-white/40 dark:hover:bg-zinc-800/30 rounded-2xl font-semibold transition-all text-left w-full"
          >
            <Settings className="h-5 w-5" />
            <span>Settings</span>
          </button>
          <button
            onClick={() => logout()}
            className="flex items-center gap-3.5 px-4 py-3 text-slate-600 dark:text-[#F43F5E] hover:bg-white/40 dark:hover:bg-zinc-800/30 rounded-2xl font-semibold transition-all text-left w-full"
          >
            <Avatar className="h-6 w-6">
              <AvatarImage src={localImage || user?.imageUrl} />
              <AvatarFallback className="bg-emerald-600 text-white text-[10px] font-bold">
                {userName ? userName.split(' ').map((n: string) => n[0]).join('') : 'G'}
              </AvatarFallback>
            </Avatar>
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="relative flex-1 overflow-y-auto px-4 md:px-10 py-10 pb-28 lg:pb-10 w-full bg-transparent overflow-x-hidden">
        {/* Soft floating background blobs for glassmorphism refraction (emerald/lime version) */}
        <div className="absolute top-[0%] left-[10%] w-[50%] h-[50%] bg-emerald-200/40 dark:bg-emerald-900/10 blur-[120px] rounded-full pointer-events-none z-0" />
        <div className="absolute bottom-[20%] right-[-10%] w-[60%] h-[60%] bg-lime-200/40 dark:bg-lime-900/10 blur-[150px] rounded-full pointer-events-none z-0" />

        {/* Header */}
        <header className="relative flex justify-between items-center mb-8 z-10">
          <div className="flex items-center gap-4">
            {isSidebarCollapsed && (
              <button 
                onClick={() => setIsSidebarCollapsed(false)} 
                className="hidden md:flex p-2.5 rounded-xl bg-white/60 dark:bg-zinc-800/60 backdrop-blur-md border border-slate-200/40 dark:border-zinc-700/40 text-slate-700 dark:text-zinc-200 shadow-sm hover:scale-105 active:scale-95 transition-all"
              >
                <Menu className="h-6 w-6" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-4 cursor-pointer" onClick={() => navigate('/settings')}>
            <div className="relative">
              <div className="relative w-12 h-12 rounded-full border border-white/30 bg-white/10 dark:bg-zinc-950/15 backdrop-blur-md shadow-sm overflow-hidden flex items-center justify-center select-none">
                {user?.imageUrl ? (
                  <>
                    <img
                      src={localImage || user?.imageUrl}
                      alt={userName}
                      className="w-full h-full object-cover object-center pointer-events-none"
                    />
                    <div className="absolute inset-0 border border-white/25 rounded-full bg-gradient-to-tr from-white/10 via-transparent to-white/5 pointer-events-none" />
                  </>
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-emerald-100/30 dark:bg-emerald-900/10 rounded-full text-emerald-600">
                    <span className="material-symbols-outlined text-xl">person</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Hero Section (Matching Teacher/Student Dashboard) */}
        <div className="relative flex flex-col md:flex-row items-center md:items-start justify-start gap-12 mt-4 md:mt-0 mb-4 pt-4 w-full z-10">
          
          {/* Portrait Image Area (Interactive / Uploadable) */}
          <div className="relative shrink-0 md:-mb-[55px] z-30 group">
            {/* Soft, organic localized emerald glow behind the portrait */}
            <div className="absolute top-[45%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-[480px] h-[480px] md:w-[640px] md:h-[640px] bg-[radial-gradient(circle,rgba(16,185,129,0.4)_0%,rgba(132,204,22,0.2)_50%,transparent_75%)] blur-[60px] pointer-events-none z-0" />
            
            {user?.imageUrl ? (
              <div className="relative">
                <div 
                  className="w-64 h-80 md:w-72 md:h-96 rounded-[2rem] border border-white/40 bg-white/20 dark:bg-zinc-900/30 backdrop-blur-xl shadow-2xl shadow-slate-300/40 dark:shadow-black/40 flex items-center justify-center relative cursor-pointer overflow-hidden z-10 transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl hover:shadow-slate-400/50" 
                  onClick={handleImageClick}
                >
                  <img
                    src={localImage || user?.imageUrl}
                    alt={userName}
                    className="w-full h-full object-cover select-none transition-transform duration-300 group-hover:scale-[1.01]"
                  />
                  <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none rounded-[2rem] z-16" />
                  <div className="absolute inset-0 border border-white/30 dark:border-white/20 bg-gradient-to-br from-white/20 via-white/5 to-transparent pointer-events-none rounded-[2rem] z-15" />
                </div>
                <div 
                  onClick={handleImageClick}
                  className="absolute bottom-4 left-4 bg-white dark:bg-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-700 p-3 rounded-full shadow-xl opacity-0 group-hover:opacity-100 transition-all duration-200 flex items-center justify-center border border-slate-100 dark:border-zinc-700 hover:scale-110 z-50 cursor-pointer w-11 h-11"
                >
                  <span className="material-symbols-outlined text-base text-slate-700 dark:text-zinc-300">edit</span>
                </div>
              </div>
            ) : (
              <div className="relative">
                <div
                  onClick={handleImageClick}
                  className="w-64 h-80 md:w-72 md:h-96 rounded-[2rem] border border-white/40 bg-white/20 dark:bg-zinc-900/30 backdrop-blur-xl shadow-[0_20px_50px_rgba(16,185,129,0.15)] flex flex-col items-center justify-center gap-3 cursor-pointer hover:scale-[1.02] transition-all group z-10"
                >
                  <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-950/20 flex items-center justify-center text-emerald-500 group-hover:scale-115 transition-transform duration-200 shadow-sm border border-emerald-100/50 dark:border-zinc-800">
                    <span className="material-symbols-outlined text-2xl">upload</span>
                  </div>
                  <div className="text-center px-4">
                    <p className="text-xs font-bold text-slate-655 dark:text-zinc-300">Upload Portrait</p>
                    <p className="text-[10px] font-semibold text-slate-400 dark:text-zinc-500 mt-1">Recommended:<br/>Professional Photo</p>
                  </div>
                </div>
              </div>
            )}
            <input 
              type="file" 
              ref={fileInputRef}
              accept="image/*" 
              className="hidden" 
              onChange={handleImageUpload} 
            />
          </div>

          {/* Guardian Welcome Details */}
          <div className="flex-1 flex flex-col lg:flex-row items-center lg:items-start justify-between gap-8 pt-6 w-full text-center md:text-left">
            <div className="flex-1 text-center md:text-left">
              <h1 className="text-3xl md:text-4xl font-extrabold text-slate-800 dark:text-white tracking-tight mb-1 font-serif">
                {userName}
              </h1>
              <p className="text-lg font-bold text-slate-850 dark:text-slate-100">Welcome Back,</p>
              
              <div className="flex flex-col gap-2.5 max-w-xs mx-auto md:mx-0 mt-6">
                <div className="flex items-center gap-1.5 text-sm">
                  <span className="text-slate-600 dark:text-slate-350 font-semibold">Linked Children:</span>
                  <span className="font-extrabold text-slate-850 dark:text-slate-100">{linkedChildren.length}</span>
                </div>
                <div className="flex items-center gap-1.5 text-sm">
                  <span className="text-slate-600 dark:text-slate-355 font-semibold">Status:</span>
                  <span className="font-extrabold text-emerald-600 dark:text-emerald-400">Active Guardian</span>
                </div>
              </div>
            </div>

            {/* Parent Widget (Replacing Student Progress Widget) */}
            <div className="shrink-0 flex flex-col items-center justify-center p-5 bg-white/45 dark:bg-zinc-900/30 backdrop-blur-md border border-white/20 rounded-[2.5rem] shadow-sm z-20 hover:scale-[1.02] transition-transform">
              <div className="relative w-44 h-44 rounded-full border border-emerald-500/35 overflow-hidden flex items-center justify-center bg-emerald-50/10 dark:bg-zinc-950/20 shadow-[0_8px_32px_0_rgba(16,185,129,0.15)] shrink-0">
                {/* Liquid Wave 1 */}
                <div 
                  className="absolute bg-gradient-to-t from-emerald-500/60 to-lime-500/60 w-[200%] h-[200%] rounded-[38%] opacity-85"
                  style={{
                    left: '50%',
                    bottom: `${progressPercent - 180}%`,
                    animation: 'wave-rotation-1 12s infinite linear'
                  }}
                />
                
                {/* Liquid Wave 2 */}
                <div 
                  className="absolute bg-gradient-to-t from-emerald-400/40 to-lime-400/40 w-[195%] h-[195%] rounded-[40%] opacity-65"
                  style={{
                    left: '50%',
                    bottom: `${progressPercent - 175}%`,
                    animation: 'wave-rotation-2 9s infinite linear'
                  }}
                />

                <div className="relative z-10 flex flex-col items-center justify-center select-none text-center">
                  <span className="text-4xl font-black text-emerald-600 tracking-tighter drop-shadow-sm mb-0.5">{progressPercent}%</span>
                  <span className="text-[9px] font-extrabold text-emerald-700/80 uppercase tracking-widest mt-1">Guardian Access</span>
                </div>
              </div>
              <p className="text-[10px] font-extrabold text-slate-650 dark:text-zinc-405 mt-3 tracking-wide text-center uppercase">
                Activity Progress
              </p>
            </div>
          </div>
        </div>

        {/* Main Grid matching Student/Teacher Dashboard */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-10 pt-10">
          
          {/* Left Column: Quick Actions */}
          <div className="lg:col-span-3 flex flex-col gap-6 z-10 relative">
            <div className="bg-white/75 dark:bg-zinc-900/60 backdrop-blur-xl rounded-[2rem] p-6 md:p-8 shadow-[-12px_24px_50px_-10px_rgba(16,185,129,0.15),_0_8px_24px_rgba(0,0,0,0.02)] border-t-2 border-t-[#D1FAE5] border-l-2 border-l-[#D1FAE5]/65 border-r border-r-emerald-100/40 border-b border-b-emerald-100/40 z-10 relative">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-slate-800 dark:text-white tracking-tight">Quick Actions</h2>
                <button className="w-8 h-8 flex items-center justify-center hover:bg-slate-100/50 dark:hover:bg-zinc-800/50 rounded-full shrink-0 text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-white">
                  <span className="material-symbols-outlined">more_horiz</span>
                </button>
              </div>

              <div className="grid grid-cols-3 gap-4 relative z-10">
                <div 
                  onClick={() => setIsScanModalOpen(true)}
                  className="bg-white/50 hover:bg-white/70 dark:bg-zinc-800/30 dark:hover:bg-zinc-800/50 p-5 rounded-[1.5rem] border border-white/60 dark:border-zinc-700/20 shadow-sm flex flex-col items-center justify-center gap-2 cursor-pointer hover:scale-[1.02] active:scale-95 transition-all text-center h-28"
                >
                  <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
                    <QrCode className="text-emerald-500 dark:text-emerald-400 w-5 h-5" />
                  </div>
                  <p className="text-xs font-bold text-slate-750 dark:text-zinc-200">Scan QR Code</p>
                </div>
                
                <div 
                  onClick={() => navigate(`/child-progress?studentId=${selectedChild?.id || ''}`, { state: { studentId: selectedChild?.id } })}
                  className="bg-white/50 hover:bg-white/70 dark:bg-zinc-800/30 dark:hover:bg-zinc-800/50 p-5 rounded-[1.5rem] border border-white/60 dark:border-zinc-700/20 shadow-sm flex flex-col items-center justify-center gap-2 cursor-pointer hover:scale-[1.02] active:scale-95 transition-all text-center h-28"
                >
                  <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
                    <TrendingUp className="text-emerald-500 dark:text-emerald-400 w-5 h-5" />
                  </div>
                  <p className="text-xs font-bold text-slate-750 dark:text-zinc-200">Progress Overview</p>
                </div>

                <div 
                  onClick={() => navigate(`/parent/assignments?studentId=${selectedChild?.id || ''}`, { state: { studentId: selectedChild?.id, childrenList: linkedChildren } })}
                  className="bg-white/50 hover:bg-white/70 dark:bg-zinc-800/30 dark:hover:bg-zinc-800/50 p-5 rounded-[1.5rem] border border-white/60 dark:border-zinc-700/20 shadow-sm flex flex-col items-center justify-center gap-2 cursor-pointer hover:scale-[1.02] active:scale-95 transition-all text-center h-28"
                >
                  <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
                    <BookOpen className="text-emerald-500 dark:text-emerald-400 w-5 h-5" />
                  </div>
                  <p className="text-xs font-bold text-slate-750 dark:text-zinc-200">Assignments</p>
                </div>

                <div 
                  onClick={() => navigate(`/parent/performance?studentId=${selectedChild?.id || ''}`, { state: { studentId: selectedChild?.id, childrenList: linkedChildren } })}
                  className="bg-white/50 hover:bg-white/70 dark:bg-zinc-800/30 dark:hover:bg-zinc-800/50 p-5 rounded-[1.5rem] border border-white/60 dark:border-zinc-700/20 shadow-sm flex flex-col items-center justify-center gap-2 cursor-pointer hover:scale-[1.02] active:scale-95 transition-all text-center h-28"
                >
                  <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
                    <Activity className="text-emerald-500 dark:text-emerald-400 w-5 h-5" />
                  </div>
                  <p className="text-xs font-bold text-slate-750 dark:text-zinc-200">Performance</p>
                </div>

                <div 
                  onClick={() => navigate(`/parent/classes?studentId=${selectedChild?.id || ''}`, { state: { studentId: selectedChild?.id, childrenList: linkedChildren } })}
                  className="bg-white/50 hover:bg-white/70 dark:bg-zinc-800/30 dark:hover:bg-zinc-800/50 p-5 rounded-[1.5rem] border border-white/60 dark:border-zinc-700/20 shadow-sm flex flex-col items-center justify-center gap-2 cursor-pointer hover:scale-[1.02] active:scale-95 transition-all text-center h-28"
                >
                  <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
                    <LayoutDashboard className="text-emerald-500 dark:text-emerald-400 w-5 h-5" />
                  </div>
                  <p className="text-xs font-bold text-slate-750 dark:text-zinc-200">Classes</p>
                </div>

                <div 
                  onClick={() => navigate(`/parent/classes?studentId=${selectedChild?.id || ''}`, { state: { studentId: selectedChild?.id, childrenList: linkedChildren } })}
                  className="bg-white/50 hover:bg-white/70 dark:bg-zinc-800/30 dark:hover:bg-zinc-800/50 p-5 rounded-[1.5rem] border border-white/60 dark:border-zinc-700/20 shadow-sm flex flex-col items-center justify-center gap-2 cursor-pointer hover:scale-[1.02] active:scale-95 transition-all text-center h-28"
                >
                  <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
                    <History className="text-emerald-500 dark:text-emerald-400 w-5 h-5" />
                  </div>
                  <p className="text-xs font-bold text-slate-750 dark:text-zinc-200">Attended History</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Linked Children & Teachers */}
          <div className="lg:col-span-2 flex flex-col gap-8 z-10 relative">
            
            {/* Linked Children Panel */}
            <div className="flex-1 bg-white/75 dark:bg-zinc-900/60 backdrop-blur-xl rounded-[2rem] p-6 md:p-8 border-t-2 border-t-[#D1FAE5] border-l-2 border-l-[#D1FAE5]/65 border-r border-r-emerald-100/40 border-b border-b-emerald-100/40 shadow-sm flex flex-col relative">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-slate-800 dark:text-white tracking-tight">My Children</h2>
                <button className="w-8 h-8 flex items-center justify-center hover:bg-slate-100/50 dark:hover:bg-zinc-800/50 rounded-full shrink-0 text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-white">
                  <span className="material-symbols-outlined">more_horiz</span>
                </button>
              </div>

              {linkedChildren.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-8 text-center bg-emerald-50/50 rounded-2xl border border-dashed border-emerald-200">
                  <QrCode className="w-12 h-12 text-emerald-300 mb-3" />
                  <p className="text-sm font-bold text-slate-700">No children linked yet</p>
                  <p className="text-xs text-slate-500 mt-1 mb-4">Scan their QR code to get started.</p>
                  <button 
                    onClick={() => setIsScanModalOpen(true)}
                    className="px-6 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl shadow-md"
                  >
                    Scan QR Code
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-3">
                    {linkedChildren.map(child => (
                      <div 
                        key={child.id} 
                        onClick={() => setSelectedChild(child)}
                        className={cn(
                          "flex items-center gap-4 p-4 rounded-2xl cursor-pointer transition-all border-2",
                          selectedChild?.id === child.id 
                            ? "border-emerald-500 bg-emerald-50/50 shadow-md" 
                            : "border-transparent bg-white hover:bg-emerald-50/30 shadow-sm hover:border-emerald-200"
                        )}
                      >
                         <div className="relative shrink-0">
                           <Avatar className="h-12 w-12 border-2 border-white shadow-sm">
                             <AvatarImage src={child.avatar} />
                             <AvatarFallback className="bg-emerald-100 text-emerald-700 font-bold">
                               {child.name.charAt(0)}
                             </AvatarFallback>
                           </Avatar>
                           {childUnreadCounts[child.id] > 0 && (
                             <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-extrabold w-5 h-5 rounded-full flex items-center justify-center border-2 border-white animate-pulse">
                               {childUnreadCounts[child.id]}
                             </span>
                           )}
                         </div>
                         <div className="flex-1 min-w-0">
                           <h4 className="font-bold text-slate-800 dark:text-white text-base truncate">{child.name}</h4>
                           <p className="text-xs text-slate-500 dark:text-zinc-400 font-medium truncate">
                             {childLastMessages[child.id] ? (
                               <>
                                 <span className="font-semibold text-slate-700 dark:text-zinc-200">
                                   {childLastMessages[child.id].sender_id === user?.id ? "You: " : `${child.name.split(' ')[0]}: `}
                                 </span>
                                 {childLastMessages[child.id].attachment_type === 'image' ? '📷 Photo' :
                                  childLastMessages[child.id].attachment_type === 'audio' ? '🎤 Voice note' :
                                  childLastMessages[child.id].message}
                               </>
                             ) : (
                               childAlerts[child.id] || `Grade ${child.grade} • ${child.focus}`
                             )}
                           </p>
                         </div>
                         <button
                           onClick={(e) => {
                             e.stopPropagation();
                             setSelectedChild(child);
                             setSelectedChildForChat(child.id);
                             setActiveModal('message');
                           }}
                           title={`Chat with ${child.name}`}
                           className="p-2 px-3 rounded-xl bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 font-bold text-xs flex items-center gap-1.5 transition-colors z-10 shrink-0"
                         >
                           <span className="material-symbols-outlined text-base">chat</span>
                           <span className="hidden sm:inline">Text Child</span>
                         </button>
                         {selectedChild?.id === child.id && (
                           <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                         )}
                      </div>
                    ))}
                   </div>
                </div>
              )}
            </div>

            {/* My Child's Teachers */}
            {selectedChild && (
              <div className="bg-white/75 dark:bg-zinc-900/60 backdrop-blur-xl rounded-[2rem] p-6 md:p-8 shadow-[-12px_24px_50px_-10px_rgba(16,185,129,0.15),_0_8px_24px_rgba(0,0,0,0.02)] border-t-2 border-t-[#D1FAE5] border-l-2 border-l-[#D1FAE5]/65 border-r border-r-emerald-100/40 border-b border-b-emerald-100/40 z-10 relative">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold text-slate-800 dark:text-white tracking-tight">{selectedChild.name.split(' ')[0]}'s Teachers</h2>
                  <button className="w-8 h-8 flex items-center justify-center hover:bg-slate-100/50 dark:hover:bg-zinc-800/50 rounded-full shrink-0 text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-white">
                    <span className="material-symbols-outlined">more_horiz</span>
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-white/5 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                        <th className="pb-3 font-semibold">Teacher</th>
                        <th className="pb-3 font-semibold">Enrolled Subjects</th>
                        <th className="pb-3 font-semibold">Rating</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {childTeachers.length > 0 ? (
                        childTeachers.map(teacher => (
                          <tr 
                            key={teacher.id} 
                            onClick={() => {
                              setSelectedTeacherIdForChat(teacher.id);
                              setActiveModal('message');
                            }}
                            className="hover:bg-emerald-50/50 transition-colors cursor-pointer"
                          >
                            <td className="py-3.5 flex items-center gap-3">
                              <div className="relative shrink-0">
                                <Avatar className="h-9 w-9">
                                  <AvatarImage src={teacher.avatar} />
                                  <AvatarFallback className="bg-gradient-to-br from-emerald-400 to-lime-400 text-white">
                                    {teacher.name.charAt(0)}
                                  </AvatarFallback>
                                </Avatar>
                                <div className={cn(
                                  "absolute bottom-0 right-0 w-2.5 h-2.5 border border-white rounded-full",
                                  teacher.isOnline ? "bg-green-500" : "bg-gray-300"
                                )} />
                              </div>
                              <span className="font-bold text-slate-800 text-sm">{teacher.name}</span>
                            </td>
                            <td className="py-3.5 text-slate-700 text-xs font-bold">
                              {teacher.subjects.join(', ')}
                            </td>
                            <td className="py-3.5 text-slate-600 text-xs font-medium">
                              ⭐ {Number(teacher.rating).toFixed(1)}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={3} className="py-8 text-center text-slate-500 font-semibold text-xs">
                            No teachers found for {selectedChild.name} yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      <BottomNav />
      {isScanModalOpen && <ScanQRModal onClose={() => setIsScanModalOpen(false)} />}
      <MessageTeacherModal 
        isOpen={activeModal === 'message'} 
        onClose={() => { setActiveModal(null); setSelectedTeacherIdForChat(undefined); setSelectedChildForChat(undefined); }} 
        recipientId={selectedTeacherIdForChat || selectedChildForChat} 
      />


      {activeModal && !['message', 'scan', 'assignments', 'classes', 'history', 'performance'].includes(activeModal) && (
        <Dialog open={true} onOpenChange={() => setActiveModal(null)}>
          <DialogContent className="sm:max-w-[425px] rounded-[2rem] p-6 bg-white dark:bg-zinc-900 border-0 shadow-2xl">
            <div className="flex flex-col items-center justify-center text-center gap-4 py-8">
                <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                    <span className="material-symbols-outlined text-3xl">info</span>
                </div>
                {!selectedChild ? (
                    <>
                        <h3 className="text-xl font-bold text-slate-900 dark:text-white">Select a Child</h3>
                        <p className="text-sm text-slate-500 dark:text-zinc-400">Please select a child from the list first to view their {activeModal}.</p>
                    </>
                ) : (
                    <>
                        <h3 className="text-xl font-bold capitalize text-slate-900 dark:text-white">{activeModal}</h3>
                        <p className="text-sm text-slate-500 dark:text-zinc-400">Viewing {activeModal} data for {selectedChild.name} is coming soon.</p>
                    </>
                )}
                <button onClick={() => setActiveModal(null)} className="mt-4 px-6 py-2 bg-slate-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-full font-bold hover:bg-slate-800 dark:hover:bg-white transition-colors">Close</button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default ParentDashboard;
