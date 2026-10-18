import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

interface User {
  id: string; // Supabase auth.users(id)
  email: string;
  name: string;
  firstName?: string;
  lastName?: string;
  imageUrl?: string;
  bio?: string;
  country?: string;
}

interface AuthContextType {
  user: User | null;
  isLoaded: boolean;
  userRole: 'teacher' | 'student' | 'parent' | null;
  onboardingCompleted: boolean;
  subjects: string[];
  setUserRole: (role: 'teacher' | 'student' | 'parent' | null) => void;
  setOnboardingCompleted: (completed: boolean, subjects?: string[], preferredLanguages?: string[], onboardingAnswers?: any, role?: 'teacher' | 'student' | 'parent' | null) => Promise<void>;
  clearUserRole: () => void;
  login: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, name: string) => Promise<any>;
  signInWithGoogle: () => Promise<void>;
  logout: () => void;
  refreshUser: () => void;
  endSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);


const rawFetchAuth = async (table, queryStr, method = 'GET', body = null, token = null) => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '') || '';
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
    
    // If token is not provided, try to get it
    if (!token) {
        try {
            const sessionData = await Promise.race([
                supabase.auth.getSession(),
                new Promise(r => setTimeout(() => r({ data: { session: null } }), 1000))
            ]);
            token = sessionData?.data?.session?.access_token || supabaseKey;
        } catch {
            token = supabaseKey;
        }
    }
    
    const headers = {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${token}`
    };
    if (body) {
        headers['Content-Type'] = 'application/json';
        if (method === 'POST' || method === 'PATCH') headers['Prefer'] = 'return=representation';
    }
    
    const url = `${supabaseUrl}/rest/v1/${table}${queryStr ? '?' + queryStr : ''}`;
    const res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined
    });
    
    if (!res.ok) throw new Error(`HTTP ${res.status}: ` + await res.text());
    if (res.status === 204) return null;
    return res.json();
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(() => {
    const savedUser = localStorage.getItem('yadalearn-user');
    if (savedUser) {
      try {
        const parsed = JSON.parse(savedUser);
        if (parsed && parsed.id) {
          return {
            id: parsed.id,
            email: parsed.email || '',
            name: parsed.name || '',
            imageUrl: parsed.imageUrl || parsed.avatar_url,
            bio: parsed.bio || '',
            country: parsed.country || ''
          };
        }
      } catch (e) {
        console.error('Error parsing cached user:', e);
      }
    }
    return null;
  });
  const [userRole, setUserRoleState] = useState<'teacher' | 'student' | 'parent' | null>(() => {
    const savedRole = localStorage.getItem('yadalearn-user-role');
    return (savedRole === 'teacher' || savedRole === 'student' || savedRole === 'parent') ? savedRole : null;
  });
  const [onboardingCompleted, setOnboardingCompletedState] = useState<boolean>(() => {
    return localStorage.getItem('yadalearn-onboarding-completed') === 'true';
  });
  const [subjects, setSubjectsState] = useState<string[]>([]);
  const [isLoaded, setIsLoaded] = useState(() => {
    const hash = window.location.hash;
    const search = window.location.search;
    const hasOAuthToken = 
      hash.includes('access_token=') || 
      hash.includes('id_token=') || 
      hash.includes('refresh_token=') || 
      search.includes('code=') ||
      search.includes('access_token=');
      
    if (hasOAuthToken) {
      return false; // Force loading state during OAuth redirect parsing
    }

    const hasRole = localStorage.getItem('yadalearn-user-role');
    const hasUser = localStorage.getItem('yadalearn-user');
    return !!(hasRole && hasUser);
  });
  const fetchingUserIdRef = useRef<string | null>(null);
  const fetchedUserIdRef = useRef<string | null>(null);
  const oauthTimeoutRef = useRef<any>(null);
  const initialCheckCompletedRef = useRef(false);
  const oauthTokenPresentRef = useRef(false);

  // Real-time Presence sync
  useEffect(() => {
    if (!user?.id) return;
    
    // Set online on mount/auth change
    supabase
      .from('profiles')
      .update({ is_online: true, last_active_at: new Date().toISOString() })
      .eq('id', user.id)
      .then();

    const handlePageHide = () => {
      const url = `https://yxqezrvgvfwdgrlwczea.supabase.co/rest/v1/profiles?id=eq.${user.id}`;
      const headers = {
        "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl4cWV6cnZndmZ3ZGdybHdjemVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5NTEwMTcsImV4cCI6MjA5NzUyNzAxN30.82swG99ZvWtYHwjgHxb5RlKVqwlIP6E-fevsdCz4Qzk",
        "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl4cWV6cnZndmZ3ZGdybHdjemVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5NTEwMTcsImV4cCI6MjA5NzUyNzAxN30.82swG99ZvWtYHwjgHxb5RlKVqwlIP6E-fevsdCz4Qzk",
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
      };
      const body = JSON.stringify({ is_online: false, last_active_at: new Date().toISOString() });
      fetch(url, { method: "PATCH", headers, body, keepalive: true });
    };

    window.addEventListener('beforeunload', handlePageHide);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      window.removeEventListener('beforeunload', handlePageHide);
      window.removeEventListener('pagehide', handlePageHide);
      handlePageHide();
    };
  }, [user?.id]);

  useEffect(() => {
    // Self-healing check: clean up any bloated auth token in local storage immediately on mount
    let hasBloatedCache = false;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.includes('auth-token')) {
        const val = localStorage.getItem(key);
        if (val && (val.includes('data:image') || val.length > 10000)) {
          console.warn('AuthContext: Bloated cache detected. Clearing local cache.');
          hasBloatedCache = true;
        }
      }
    }

    if (hasBloatedCache) {
      // Clear localStorage auth state
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && (key.includes('auth-token') || key.startsWith('yadalearn-') || key === 'sb-')) {
          localStorage.removeItem(key);
        }
      }
      // Clear bloated cookies starting with sb-
      document.cookie.split(';').forEach(cookie => {
        const parts = cookie.split('=');
        const name = parts[0].trim();
        if (name.startsWith('sb-')) {
          document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
        }
      });
      // Force reload to get a clean login state
      window.location.reload();
      return;
    }

    // Check for OAuth redirect errors in hash or query parameters
    const hash = window.location.hash;
    const search = window.location.search;
    
    if (hash && (hash.includes('error=') || hash.includes('error_description='))) {
      const hashStr = hash.startsWith('#') ? hash.substring(1) : hash;
      const params = new URLSearchParams(hashStr);
      const errorMsg = params.get('error_description') || params.get('error') || 'OAuth authentication failed';
      
      console.error('Supabase OAuth Error:', errorMsg);
      sessionStorage.setItem('oauth_error', decodeURIComponent(errorMsg).replace(/\+/g, ' '));
      
      window.location.hash = '';
      initialCheckCompletedRef.current = true;
      setIsLoaded(true);
      return;
    } else if (search && (search.includes('error=') || search.includes('error_description='))) {
      const params = new URLSearchParams(search);
      const errorMsg = params.get('error_description') || params.get('error') || 'OAuth authentication failed';
      
      console.error('Supabase OAuth Error:', errorMsg);
      sessionStorage.setItem('oauth_error', decodeURIComponent(errorMsg).replace(/\+/g, ' '));
      
      initialCheckCompletedRef.current = true;
      setIsLoaded(true);
      return;
    }

    const hasHashToken = 
      window.location.hash.includes('access_token=') || 
      window.location.hash.includes('id_token=') || 
      window.location.hash.includes('refresh_token=') || 
      window.location.search.includes('code=') ||
      window.location.search.includes('access_token=');

    if (hasHashToken) {
      oauthTokenPresentRef.current = true;
    }

    // Check active session on mount, but ONLY if there's no OAuth token in URL to prevent deadlocking Supabase's PKCE exchange
    if (!hasHashToken) {
      supabase.auth.getSession().then(async ({ data: { session } }) => {
        initialCheckCompletedRef.current = true;
        try {
          await handleSession(session);
        } catch (err) {
          console.error('AuthContext: getSession handleSession failed:', err);
          setIsLoaded(true);
        }
      }).catch(err => {
        console.error('AuthContext: getSession promise rejected:', err);
        initialCheckCompletedRef.current = true;
        setIsLoaded(true);
      });
    } else {
      console.log('AuthContext: Skipping getSession() on mount because URL has OAuth token. Deferring to onAuthStateChange.');
    }

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN') {
        initialCheckCompletedRef.current = true;
        const hasCache = localStorage.getItem('yadalearn-user-role') && localStorage.getItem('yadalearn-user');
        if (!hasCache) {
          setIsLoaded(false);
        }
      }
      try {
        await handleSession(session);
      } catch (err) {
        console.error('AuthContext: onAuthStateChange handleSession failed:', err);
        setIsLoaded(true);
      }
    });

    // Fallback timer: in case OAuth parsing fails or takes too long, attempt manual recovery after 5 seconds
    if (hasHashToken) {
      oauthTimeoutRef.current = setTimeout(() => {
        console.warn('AuthContext: OAuth fallback timer fired (5s), attempting manual recovery');
        
        const h = window.location.hash;
        const s = window.location.search;
        
        if (s.includes('code=')) {
          const code = new URLSearchParams(s).get('code');
          if (code) {
            console.log('AuthContext: Manual PKCE recovery');
            supabase.auth.exchangeCodeForSession(code).then(({ data, error }) => {
              if (error) console.error('AuthContext: Manual PKCE failed', error);
              if (data?.session) {
                handleSession(data.session);
              } else {
                initialCheckCompletedRef.current = true;
                setIsLoaded(true);
              }
            });
            return;
          }
        } else if (h.includes('access_token=')) {
          const hashStr = h.startsWith('#') ? h.substring(1) : h;
          const params = new URLSearchParams(hashStr);
          const access_token = params.get('access_token');
          const refresh_token = params.get('refresh_token');
          if (access_token && refresh_token) {
            console.log('AuthContext: Manual Implicit recovery');
            supabase.auth.setSession({ access_token, refresh_token }).then(({ data, error }) => {
              if (error) console.error('AuthContext: Manual Implicit failed', error);
              if (data?.session) {
                handleSession(data.session);
              } else {
                initialCheckCompletedRef.current = true;
                setIsLoaded(true);
              }
            });
            return;
          }
        }

        initialCheckCompletedRef.current = true;
        setIsLoaded(true);
      }, 5000);
    }

    return () => {
      subscription.unsubscribe();
      if (oauthTimeoutRef.current) {
        clearTimeout(oauthTimeoutRef.current);
        oauthTimeoutRef.current = null;
      }
    };
  }, []);

  const handleSession = async (session: any) => {
    console.log('AuthContext: handleSession start for user:', session?.user?.id);
    if (session?.user) {
      if (oauthTimeoutRef.current) {
        clearTimeout(oauthTimeoutRef.current);
        oauthTimeoutRef.current = null;
      }

      const hasUrlParams = 
        window.location.hash.includes('access_token=') || 
        window.location.hash.includes('id_token=') || 
        window.location.hash.includes('refresh_token=') || 
        window.location.search.includes('code=') ||
        window.location.search.includes('access_token=');
      if (hasUrlParams) {
        window.history.replaceState(null, '', window.location.pathname);
      }

      initialCheckCompletedRef.current = true;
      const u = session.user;
      
      // If we have already fully fetched this user's profile, skip database query
      if (fetchedUserIdRef.current === u.id) {
        console.log('AuthContext: Already fetched profile for user:', u.id);
        const savedUserStr = localStorage.getItem('yadalearn-user');
        let cachedUser: any = null;
        if (savedUserStr) {
          try {
            const parsed = JSON.parse(savedUserStr);
            if (parsed && parsed.id === u.id) {
              cachedUser = parsed;
            }
          } catch (e) {
            console.error(e);
          }
        }
        setUser(prev => prev || {
          id: u.id,
          email: u.email,
          name: cachedUser?.name || u.user_metadata?.full_name || u.email?.split('@')[0] || 'User',
          imageUrl: cachedUser?.imageUrl || u.user_metadata?.avatar_url,
          bio: cachedUser?.bio,
          country: cachedUser?.country
        });
        return;
      }

      // If we are currently fetching this user's profile, wait for the query to resolve
      if (fetchingUserIdRef.current === u.id) {
        console.log('AuthContext: Fetch in progress for user:', u.id);
        return;
      }
      
      fetchingUserIdRef.current = u.id;

      // Check cache to prevent flicker
      const savedUserStr = localStorage.getItem('yadalearn-user');
      let cachedUser: any = null;
      if (savedUserStr) {
        try {
          const parsed = JSON.parse(savedUserStr);
          if (parsed && parsed.id === u.id) {
            cachedUser = parsed;
          }
        } catch (e) {
          console.error(e);
        }
      }

      setUser({
        id: u.id,
        email: u.email,
        name: cachedUser?.name || u.user_metadata?.full_name || u.email?.split('@')[0] || 'User',
        imageUrl: cachedUser?.imageUrl || u.user_metadata?.avatar_url,
        bio: cachedUser?.bio,
        country: cachedUser?.country
      });

      if (cachedUser && localStorage.getItem('yadalearn-user-role')) {
        console.log('AuthContext: Found cached user AND role, resolving isLoaded immediately to prevent flicker');
        setIsLoaded(true);
      }

      try {
        console.log('AuthContext: Fetching profile for id:', u.id);
        
        let profile = null; let error = null;
        try {
            const data = await rawFetchAuth('profiles', `id=eq.${u.id}&select=role,onboarding_completed,subjects,avatar_url,full_name,bio,country`, 'GET', null, session?.access_token);
            profile = data[0] || null;
        } catch (e) { error = e; }

        if (error) {
          console.warn('AuthContext: Profile fetch returned error:', error);
        }
        console.log('AuthContext: Profile fetch completed, profile:', profile);

        if (profile) {
          fetchedUserIdRef.current = u.id;
          if (profile.role) {
            setUserRoleState(profile.role as 'teacher' | 'student');
            localStorage.setItem('yadalearn-user-role', profile.role);
          } else {
            setUserRoleState(null);
            localStorage.removeItem('yadalearn-user-role');
          }
          setOnboardingCompletedState(!!profile.onboarding_completed);
          localStorage.setItem('yadalearn-onboarding-completed', String(!!profile.onboarding_completed));
          setSubjectsState(profile.subjects || []);
          
          const updatedUserObj = {
            id: u.id,
            email: u.email || '',
            name: profile.full_name || u.user_metadata?.full_name || u.email?.split('@')[0] || 'User',
            imageUrl: profile.avatar_url || u.user_metadata?.avatar_url,
            bio: profile.bio,
            country: profile.country
          };
          localStorage.setItem('yadalearn-user', JSON.stringify(updatedUserObj));
          setUser(updatedUserObj);
        } else {
          // If the profile query succeeded but returned null (no profile in DB) and there was no error, clear local storage
          if (!error) {
            setUserRoleState(null);
            setOnboardingCompletedState(false);
            setSubjectsState([]);
            localStorage.removeItem('yadalearn-user-role');
            localStorage.removeItem('yadalearn-onboarding-completed');
          }
          fetchingUserIdRef.current = null;
          fetchedUserIdRef.current = null;
        }
      } catch (dbErr) {
        console.error('AuthContext: Database profile query failed (retaining cached localStorage role/onboarding states):', dbErr);
        fetchingUserIdRef.current = null;
        fetchedUserIdRef.current = null;
      } finally {
        console.log('AuthContext: handleSession profile fetch completed, setting isLoaded to true');
        setIsLoaded(true);
      }
    } else {
      console.log('AuthContext: No session, clearing user data');
      setUser(null);
      setUserRoleState(null);
      setOnboardingCompletedState(false);
      setSubjectsState([]);
      localStorage.removeItem('yadalearn-user-role');
      localStorage.removeItem('yadalearn-onboarding-completed');
      fetchingUserIdRef.current = null;
      fetchedUserIdRef.current = null;

      const hasOAuthToken = 
        window.location.hash.includes('access_token=') || 
        window.location.hash.includes('id_token=') || 
        window.location.hash.includes('refresh_token=') || 
        window.location.search.includes('code=') ||
        window.location.search.includes('access_token=') ||
        oauthTokenPresentRef.current;
        
      if (!hasOAuthToken) {
        setIsLoaded(true);
      } else {
        console.log('AuthContext: Skipping setIsLoaded(true) during OAuth initialization');
      }
    }
    console.log('AuthContext: handleSession end');
  };

  const login = async (email: string, password: string): Promise<void> => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signUpWithEmail = async (email: string, password: string, name: string): Promise<any> => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } }
    });
    if (error) throw error;
    return data;
  };

  const signInWithGoogle = async (): Promise<void> => {
    let redirectUrl = window.location.origin;
    if (redirectUrl.startsWith('http://') && !redirectUrl.includes('localhost')) {
      redirectUrl = redirectUrl.replace('http://', 'https://');
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
        queryParams: {
          prompt: 'select_account',
        }
      }
    });
    if (error) throw error;
  };


  const logout = async () => {
    const currentUserId = user?.id;
    // Immediately clear state for snappy UI and trigger ProtectedRoute to /welcome
    setUser(null);
    setUserRoleState(null);
    setOnboardingCompletedState(false);
    setSubjectsState([]);
    localStorage.removeItem('yadalearn-user-role');
    localStorage.removeItem('yadalearn-onboarding-completed');

    if (currentUserId) {
      try {
        await supabase
          .from('profiles')
          .update({ is_online: false, last_active_at: new Date().toISOString() })
          .eq('id', currentUserId);
      } catch (err) {
        console.error("Failed to update status on logout:", err);
      }
    }
    await supabase.auth.signOut();
    fetchingUserIdRef.current = null;
    fetchedUserIdRef.current = null;
  };

  const setUserRole = async (role: 'teacher' | 'student' | 'parent' | null) => {
    setUserRoleState(role);
    if (role) {
      localStorage.setItem('yadalearn-user-role', role);
    } else {
      localStorage.removeItem('yadalearn-user-role');
    }
    if (role && user) {
      // Upsert role to Supabase profile
      await supabase.from('profiles').upsert({
        id: user.id,
        email: user.email,
        full_name: user.name,
        role: role,
        avatar_url: user.imageUrl
      }, { onConflict: 'id' });
    }
  };

  const setOnboardingCompleted = async (
    completed: boolean,
    selectedSubjects: string[] = [],
    selectedLanguages: string[] = [],
    onboardingAnswers: any = null,
    role: 'teacher' | 'student' | 'parent' | null = null
  ) => {
    setOnboardingCompletedState(completed);
    setSubjectsState(selectedSubjects);
    localStorage.setItem('yadalearn-onboarding-completed', String(completed));
    const activeRole = role || userRole;
    if (activeRole) {
      localStorage.setItem('yadalearn-user-role', activeRole);
    }
    if (user) {
      await supabase.from('profiles').update({
        onboarding_completed: completed,
        subjects: selectedSubjects,
        preferred_languages: selectedLanguages
      }).eq('id', user.id);

      if (onboardingAnswers && activeRole) {
        if (activeRole === 'student') {
          await supabase.from('student_profiles').upsert({
            id: user.id,
            study_path: onboardingAnswers.studyPath,
            current_level: onboardingAnswers.currentLevel,
            learning_objective: onboardingAnswers.learningObjective,
            class_preference: onboardingAnswers.classPreference,
            time_availability: onboardingAnswers.timeAvailability,
            grade_level: onboardingAnswers.gradeLevel,
            study_goal: onboardingAnswers.studyGoal,
            study_preference: onboardingAnswers.studyPreference,
            study_schedule: onboardingAnswers.studySchedule
          });
        } else if (activeRole === 'teacher') {
          await supabase.from('teacher_profiles').upsert({
            id: user.id,
            teaching_focus: selectedSubjects,
            language_specialization: selectedLanguages,
            subject_specialization: onboardingAnswers.subjectSpecialization || [],
            teaching_level: onboardingAnswers.teachingLevel || [],
            teaching_approach: onboardingAnswers.teachingApproach,
            lesson_format: onboardingAnswers.lessonFormat,
            availability: onboardingAnswers.availability,
            min_rate: onboardingAnswers.minRate ? parseInt(onboardingAnswers.minRate) : null,
            max_rate: onboardingAnswers.maxRate ? parseInt(onboardingAnswers.maxRate) : null,
            grade_level_focus: onboardingAnswers.gradeLevelFocus,
            teaching_style: onboardingAnswers.teachingStyle,
            class_type: onboardingAnswers.classType,
            schedule: onboardingAnswers.schedule
          });
        } else if (activeRole === 'parent') {
          await supabase.from('profiles').update({
            gender: onboardingAnswers.gender,
            date_of_birth: onboardingAnswers.dateOfBirth,
            contact_number: onboardingAnswers.contactNumber
          }).eq('id', user.id);
        }
      }
    }
  };

  const clearUserRole = () => {
    setUserRoleState(null);
  };

  const refreshUser = async () => {
    if (user?.id) {
      console.log('AuthContext: refreshUser called, fetching profile manually to avoid logout risk');
      fetchingUserIdRef.current = null;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          console.warn('AuthContext: refreshUser found no session, aborting refresh to prevent accidental logout');
          return;
        }
        const data = await rawFetchAuth('profiles', `id=eq.${user.id}&select=role,onboarding_completed,subjects,avatar_url,full_name,bio,country`, 'GET', null, session.access_token);
        const profile = data?.[0];
        
        if (profile) {
          if (profile.role) {
            setUserRoleState(profile.role as 'teacher' | 'student');
            localStorage.setItem('yadalearn-user-role', profile.role);
          }
          setOnboardingCompletedState(!!profile.onboarding_completed);
          localStorage.setItem('yadalearn-onboarding-completed', String(!!profile.onboarding_completed));
          setSubjectsState(profile.subjects || []);
          
          const updatedUserObj = {
            id: user.id,
            email: user.email || '',
            name: profile.full_name || user.name,
            imageUrl: profile.avatar_url || user.imageUrl,
            bio: profile.bio,
            country: profile.country
          };
          localStorage.setItem('yadalearn-user', JSON.stringify(updatedUserObj));
          setUser(updatedUserObj);
        }
      } catch (err) {
        console.error('AuthContext: refreshUser failed:', err);
      }
    }
  };

  const endSession = async () => {
    console.log("AuthContext: Ending current session and refreshing profile state...");
    fetchingUserIdRef.current = null;
    fetchedUserIdRef.current = null;
    if (user?.id) {
      const { data: { session } } = await supabase.auth.getSession();
      await handleSession(session);
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      isLoaded,
      userRole,
      onboardingCompleted,
      subjects,
      setUserRole,
      setOnboardingCompleted,
      clearUserRole,
      login,
      signUpWithEmail,
      signInWithGoogle,
      logout,
      refreshUser,
      endSession
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
