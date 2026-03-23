import { useState, useEffect, useRef } from 'react';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  query, 
  where, 
  onSnapshot,
  addDoc,
  updateDoc,
  serverTimestamp,
  getDocs
} from 'firebase/firestore';
import { db, auth } from './firebase';
import { UserProfile, UserRole, Exam, Question, Submission, ProctoringLog, QuestionType, ProctoringLogType } from './types';
import { 
  Layout, 
  Shield, 
  BookOpen, 
  Plus, 
  LogOut, 
  Clock, 
  AlertTriangle, 
  CheckCircle, 
  Code, 
  Eye, 
  User as UserIcon,
  ChevronRight,
  Settings,
  FileText,
  Monitor,
  Camera,
  ArrowLeft,
  ArrowRight,
  Users,
  XCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, isAfter, isBefore, addMinutes } from 'date-fns';
import Editor from '@monaco-editor/react';
import Webcam from 'react-webcam';
import { FaceMesh } from '@mediapipe/face_mesh';
import * as cam from '@mediapipe/camera_utils';

// --- Error Handling ---

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// --- Components ---

const Button = ({ children, onClick, variant = 'primary', size = 'md', className = '', disabled = false, icon: Icon }: any) => {
  const variants: any = {
    primary: 'bg-indigo-600 text-white hover:bg-indigo-700',
    secondary: 'bg-white text-gray-900 border border-gray-200 hover:bg-gray-50',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    ghost: 'bg-transparent text-gray-600 hover:bg-gray-100',
  };

  const sizes: any = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2',
    lg: 'px-6 py-3 text-lg',
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center justify-center gap-2 rounded-lg font-medium transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {Icon && <Icon size={18} />}
      {children}
    </button>
  );
};

const Card = ({ children, className = '' }: any) => (
  <div className={`bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden ${className}`}>
    {children}
  </div>
);

// --- Portal Authentication Component ---

function PortalAuth({ profile, onAuthenticated, showToast }: { profile: UserProfile, onAuthenticated: () => void, showToast: (m: string, t?: 'success' | 'error') => void }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isSettingPassword = !profile.portalPassword;

  const handleSubmit = async () => {
    setError(null);
    if (!password) {
      setError('Password is required');
      return showToast('Password is required', 'error');
    }
    
    if (isSettingPassword) {
      if (password !== confirmPassword) {
        setError('Passwords do not match');
        return showToast('Passwords do not match', 'error');
      }
      if (password.length < 6) {
        setError('Password must be at least 6 characters');
        return showToast('Password must be at least 6 characters', 'error');
      }
      
      setLoading(true);
      try {
        await updateDoc(doc(db, 'users', profile.uid), { portalPassword: password });
        showToast('Portal password set successfully');
        onAuthenticated();
      } catch (e) {
        setError('Failed to set password');
        showToast('Failed to set password', 'error');
      } finally {
        setLoading(false);
      }
    } else {
      if (password === profile.portalPassword) {
        onAuthenticated();
      } else {
        setError('Incorrect portal password');
        showToast('Incorrect portal password', 'error');
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="max-w-md w-full">
        <Card className="p-8 space-y-6">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-indigo-100 mb-4">
              <Shield className="text-white" size={32} />
            </div>
            <h2 className="text-2xl font-bold text-slate-900">
              {isSettingPassword ? 'Set Portal Password' : 'Portal Authentication'}
            </h2>
            <p className="text-slate-500 text-sm">
              {isSettingPassword 
                ? 'Create a secondary password for your portal access.' 
                : 'Enter your secondary portal password to continue.'}
            </p>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                {isSettingPassword ? 'New Password' : 'Password'}
              </label>
              <input 
                type="password" 
                value={password} 
                onChange={e => { setPassword(e.target.value); setError(null); }} 
                className={`w-full px-4 py-3 rounded-xl border focus:ring-2 outline-none transition-all ${
                  error ? 'border-red-300 focus:ring-red-500 bg-red-50' : 'border-slate-200 focus:ring-indigo-500'
                }`}
                placeholder="••••••••"
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              />
              {error && (
                <p className="text-xs font-bold text-red-500 mt-1 flex items-center gap-1">
                  <AlertTriangle size={12} />
                  {error}
                </p>
              )}
            </div>

            {isSettingPassword && (
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Confirm Password</label>
                <input 
                  type="password" 
                  value={confirmPassword} 
                  onChange={e => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="••••••••"
                  onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                />
              </div>
            )}

            <Button className="w-full py-4" onClick={handleSubmit} disabled={loading}>
              {loading ? 'Processing...' : (isSettingPassword ? 'Set Password' : 'Login to Portal')}
            </Button>
            
            <button 
              onClick={() => signOut(auth)}
              className="w-full text-xs text-slate-400 hover:text-slate-600 font-medium"
            >
              Sign out of Google
            </button>
          </div>
        </Card>
      </motion.div>
    </div>
  );
}

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'dashboard' | 'exam' | 'create-exam' | 'manage-exam' | 'result-viewer'>('dashboard');
  const [selectedExam, setSelectedExam] = useState<Exam | null>(null);
  const [activeSubmission, setActiveSubmission] = useState<Submission | null>(null);
  const [isPortalAuthenticated, setIsPortalAuthenticated] = useState(false);
  const [loginRole, setLoginRole] = useState<UserRole | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authLoading, setAuthLoading] = useState(false);
  const [authSetupError, setAuthSetupError] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [showProfile, setShowProfile] = useState(false);
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setView('dashboard'); // Reset view on auth change
      if (u) {
        const docRef = doc(db, 'users', u.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const p = docSnap.data() as UserProfile;
          setProfile(p);
          
          // If user logged in via Email/Password, skip secondary portal auth
          // as they already entered a password.
          const isEmailPassword = u.providerData.some(prov => prov.providerId === 'password');
          if (isEmailPassword) {
            setIsPortalAuthenticated(true);
          } else if (!p.portalPassword) {
            // Google user needs to set password
            setIsPortalAuthenticated(false);
          } else {
            // Google user needs to enter password
            setIsPortalAuthenticated(false);
          }
        } else {
          // Default to student if no profile
          const newProfile: UserProfile = {
            uid: u.uid,
            email: u.email || '',
            name: u.displayName || 'User',
            role: 'student'
          };
          await setDoc(docRef, newProfile);
          setProfile(newProfile);
          
          const isEmailPassword = u.providerData.some(prov => prov.providerId === 'password');
          setIsPortalAuthenticated(isEmailPassword);
        }
      } else {
        setProfile(null);
        setIsPortalAuthenticated(false);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      if (loginRole && result.user) {
        // If it's a new user, we want to ensure they get the role they selected
        const docRef = doc(db, 'users', result.user.uid);
        const docSnap = await getDoc(docRef);
        if (!docSnap.exists()) {
          const newProfile: UserProfile = {
            uid: result.user.uid,
            email: result.user.email || '',
            name: result.user.displayName || 'User',
            role: loginRole
          };
          await setDoc(docRef, newProfile);
          setProfile(newProfile);
        }
      }
    } catch (error) {
      console.error('Login failed', error);
      showToast('Google login failed', 'error');
    }
  };

  const handleEmailAuth = async () => {
    setAuthError(null);
    if (!email || !password) {
      setAuthError('Email and password are required');
      return showToast('Email and password are required', 'error');
    }
    if (password.length < 6) {
      setAuthError('Password must be at least 6 characters');
      return showToast('Password must be at least 6 characters', 'error');
    }
    
    setAuthLoading(true);
    setAuthSetupError(false);
    try {
      if (authMode === 'signup') {
        const result = await createUserWithEmailAndPassword(auth, email, password);
        const newProfile: UserProfile = {
          uid: result.user.uid,
          email: email,
          name: email.split('@')[0],
          role: loginRole || 'student'
        };
        await setDoc(doc(db, 'users', result.user.uid), newProfile);
        setProfile(newProfile);
        showToast('Account created successfully! Please log in with your new credentials.', 'success');
        
        // Sign out after signup as requested
        await signOut(auth);
        setAuthMode('login');
        setPassword(''); // Clear password for security
      } else {
        await signInWithEmailAndPassword(auth, email, password);
        showToast('Logged in successfully');
      }
    } catch (error: any) {
      console.error('Auth failed', error);
      let message = 'Authentication failed';
      if (error.code === 'auth/email-already-in-use') {
        message = 'This email is already registered. Switching to login mode...';
        setAuthMode('login');
      } else if (error.code === 'auth/operation-not-allowed') {
        message = 'Email/Password sign-in is not enabled.';
        setAuthSetupError(true);
      } else if (error.code === 'auth/invalid-credential') {
        message = 'Invalid email or password. If you don\'t have an account, please sign up first.';
      } else if (error.code === 'auth/user-not-found') {
        message = 'No account found with this email. Please sign up first.';
        setAuthMode('signup');
      } else if (error.code === 'auth/wrong-password') {
        message = 'Incorrect password. Please try again or reset your password.';
      } else if (error.code === 'auth/weak-password') {
        message = 'Password is too weak. Please use at least 6 characters.';
      } else if (error.code === 'auth/too-many-requests') {
        message = 'Too many failed attempts. Please try again later.';
      }
      setAuthError(message);
      showToast(message, 'error');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) return showToast('Please enter your email address first', 'error');
    try {
      await sendPasswordResetEmail(auth, email);
      showToast('Password reset email sent! Please check your inbox.', 'success');
    } catch (error: any) {
      console.error('Reset failed', error);
      let message = 'Failed to send reset email';
      if (error.code === 'auth/user-not-found') {
        message = 'No account found with this email.';
      }
      showToast(message, 'error');
    }
  };

  const toggleRole = async () => {
    if (!user || !profile) return;
    // Only allow admin to toggle roles freely for themselves
    const isAdmin = profile.email === "rahulraj000019@gmail.com";
    if (!isAdmin) {
      showToast('Only administrators can change roles', 'error');
      return;
    }
    const newRole = profile.role === 'student' ? 'teacher' : 'student';
    const docRef = doc(db, 'users', user.uid);
    await updateDoc(docRef, { role: newRole });
    setProfile({ ...profile, role: newRole });
    showToast(`Switched to ${newRole} mode`);
  };

  const handleLogout = () => {
    signOut(auth);
    setAuthMode('login');
    setLoginRole(null);
  };

  if (loading || (user && !profile)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
          className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  if (!user) {
    if (loginRole) {
      return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-md w-full"
          >
            <Card className="p-8 space-y-6">
              <div className="text-center space-y-2">
                <button 
                  onClick={() => setLoginRole(null)}
                  className="absolute top-8 left-8 p-2 hover:bg-slate-100 rounded-full transition-colors"
                >
                  <ArrowLeft size={20} className="text-slate-400" />
                </button>
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto shadow-lg mb-4 ${
                  loginRole === 'teacher' ? 'bg-emerald-600 shadow-emerald-100' : 'bg-indigo-600 shadow-indigo-100'
                }`}>
                  {loginRole === 'teacher' ? <Shield className="text-white" size={32} /> : <UserIcon className="text-white" size={32} />}
                </div>
                <h2 className="text-2xl font-bold text-slate-900">
                  {authMode === 'login' ? `Login as ${loginRole === 'teacher' ? 'Teacher' : 'Student'}` : `Sign up as ${loginRole === 'teacher' ? 'Teacher' : 'Student'}`}
                </h2>
                <p className="text-slate-500 text-sm">
                  {authMode === 'login' ? 'Enter your credentials to access your portal.' : 'Create an account to get started.'}
                </p>
              </div>

              <div className="space-y-4">
                {authSetupError && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                    <p className="font-bold mb-1 flex items-center gap-2">
                      <Shield size={16} />
                      Sign-in method disabled
                    </p>
                    <p className="mb-3 opacity-90">Email/Password sign-in must be enabled in the Firebase Console to use this feature.</p>
                    <a 
                      href="https://console.firebase.google.com/project/gen-lang-client-0678347303/authentication/providers" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-red-800 underline font-bold hover:text-red-900"
                    >
                      Enable it here <ArrowRight size={14} />
                    </a>
                  </div>
                )}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Email Address</label>
                  <input 
                    type="email" 
                    value={email} 
                    onChange={e => setEmail(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder="name@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Password</label>
                  <input 
                    type="password" 
                    value={password} 
                    onChange={e => { setPassword(e.target.value); setAuthError(null); }}
                    className={`w-full px-4 py-3 rounded-xl border focus:ring-2 outline-none transition-all ${
                      authError ? 'border-red-300 focus:ring-red-500 bg-red-50' : 'border-slate-200 focus:ring-indigo-500'
                    }`}
                    placeholder="••••••••"
                  />
                  {authError && (
                    <p className="text-xs font-bold text-red-500 mt-1 flex items-center gap-1">
                      <AlertTriangle size={12} />
                      {authError}
                    </p>
                  )}
                  {authMode === 'login' && (
                    <div className="flex justify-end">
                      <button 
                        onClick={handleForgotPassword}
                        className="text-xs text-indigo-600 font-semibold hover:underline"
                      >
                        Forgot Password?
                      </button>
                    </div>
                  )}
                </div>

                <Button className="w-full py-4" onClick={handleEmailAuth} disabled={authLoading}>
                  {authLoading ? 'Processing...' : (authMode === 'login' ? 'Sign In' : 'Create Account')}
                </Button>

                <div className="relative py-4">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200"></div></div>
                  <div className="relative flex justify-center text-xs uppercase"><span className="bg-white px-2 text-slate-400">Or continue with</span></div>
                </div>

                <Button variant="secondary" className="w-full py-3" onClick={handleLogin} icon={UserIcon}>
                  Google Account
                </Button>

                <div className="text-center pt-2">
                  <button 
                    onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}
                    className="text-sm text-indigo-600 font-semibold hover:underline"
                  >
                    {authMode === 'login' ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
                  </button>
                </div>
              </div>
            </Card>
          </motion.div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-4xl w-full text-center space-y-12"
        >
          <div className="space-y-4">
            <div className="flex justify-center">
              <div className="w-20 h-20 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-xl shadow-indigo-200">
                <Shield className="text-white" size={40} />
              </div>
            </div>
            <div className="space-y-2">
              <h1 className="text-5xl font-bold text-slate-900 tracking-tight">ExamPortal AI</h1>
              <p className="text-slate-500 text-xl">Secure, AI-powered examinations for the modern era.</p>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-8 text-left">
            {/* Student Login Card */}
            <motion.div whileHover={{ y: -5 }} className="h-full">
              <Card className="p-8 h-full flex flex-col border-2 border-transparent hover:border-indigo-100 transition-all">
                <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center mb-6">
                  <UserIcon className="text-indigo-600" size={24} />
                </div>
                <h2 className="text-2xl font-bold text-slate-900 mb-2">Student Portal</h2>
                <p className="text-slate-500 mb-8 flex-1">Take exams, view your results, and track your academic progress in a secure environment.</p>
                <Button onClick={() => setLoginRole('student')} className="w-full py-4" icon={UserIcon}>
                  Login as Student
                </Button>
              </Card>
            </motion.div>

            {/* Teacher Login Card */}
            <motion.div whileHover={{ y: -5 }} className="h-full">
              <Card className="p-8 h-full flex flex-col border-2 border-transparent hover:border-indigo-100 transition-all">
                <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center mb-6">
                  <Shield className="text-emerald-600" size={24} />
                </div>
                <h2 className="text-2xl font-bold text-slate-900 mb-2">Teacher Portal</h2>
                <p className="text-slate-500 mb-8 flex-1">Create exams, manage student submissions, and monitor proctoring logs with AI assistance.</p>
                <Button onClick={() => setLoginRole('teacher')} variant="secondary" className="w-full py-4 border-emerald-200 text-emerald-700 hover:bg-emerald-50" icon={Shield}>
                  Login as Teacher
                </Button>
              </Card>
            </motion.div>
          </div>

          <p className="text-sm text-slate-400">
            By signing in, you agree to our terms of service and academic integrity policies.
          </p>
        </motion.div>
      </div>
    );
  }

  if (!isPortalAuthenticated) {
    return (
      <PortalAuth 
        profile={profile!} 
        onAuthenticated={() => setIsPortalAuthenticated(true)} 
        showToast={showToast} 
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Toast */}
      {toast && (
        <motion.div 
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 50 }}
          className={`fixed bottom-8 right-8 px-6 py-3 rounded-xl shadow-2xl z-[100] flex items-center gap-3 border ${
            toast.type === 'error' ? 'bg-red-50 border-red-100 text-red-700' : 'bg-emerald-50 border-emerald-100 text-emerald-700'
          }`}
        >
          <div className={`w-2 h-2 rounded-full ${toast.type === 'error' ? 'bg-red-500' : 'bg-emerald-500'}`} />
          <span className="font-medium">{toast.message}</span>
        </motion.div>
      )}

      {/* Navbar */}
      <nav className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => setView('dashboard')}>
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-100">
            <Shield className="text-white" size={24} />
          </div>
          <span className="text-xl font-bold text-slate-900">ExamPortal AI</span>
        </div>
        
        <div className="flex items-center gap-6">
          {profile?.email === "rahulraj000019@gmail.com" && (
            <Button variant="ghost" size="sm" onClick={toggleRole} className="text-xs text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50">
              Switch to {profile?.role === 'student' ? 'Teacher' : 'Student'}
            </Button>
          )}
          <div className="flex items-center gap-3 px-3 py-1.5 bg-slate-50 rounded-full border border-slate-100">
            <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-sm">
              {profile?.name?.[0]}
            </div>
            <div className="hidden sm:block">
              <p className="text-sm font-semibold text-slate-900 leading-none">{profile?.name}</p>
              <button 
                onClick={() => setShowProfile(true)}
                className="text-[10px] text-indigo-600 font-bold uppercase tracking-wider hover:underline text-left block mt-0.5"
              >
                Edit Profile
              </button>
            </div>
          </div>
          <Button variant="ghost" onClick={handleLogout} icon={LogOut}>Logout</Button>
        </div>
      </nav>
      
      {showProfile && (
        <ProfileEditor 
          profile={profile!} 
          onClose={() => setShowProfile(false)} 
          onUpdate={(p) => setProfile(p)}
          showToast={showToast}
        />
      )}

      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
        {view === 'dashboard' && (
          <Dashboard 
            profile={profile!} 
            onSelectExam={(e) => { 
              setSelectedExam(e); 
              if (profile!.role === 'teacher') {
                setView('manage-exam');
              } else {
                setView('exam');
              }
            }} 
            onCreateExam={() => setView('create-exam')} 
            onViewResult={(sub) => {
              setActiveSubmission(sub);
              setView('result-viewer');
            }}
          />
        )}
        {view === 'create-exam' && <ExamCreator onCancel={() => setView('dashboard')} showToast={showToast} />}
        {view === 'manage-exam' && selectedExam && <ExamManager exam={selectedExam} onBack={() => setView('dashboard')} showToast={showToast} />}
        {view === 'result-viewer' && activeSubmission && <ResultViewer submission={activeSubmission} onBack={() => setView('dashboard')} />}
        {view === 'exam' && selectedExam && (
          <ExamRoom 
            exam={selectedExam} 
            profile={profile!} 
            onFinish={() => setView('dashboard')} 
            showToast={showToast}
          />
        )}
      </main>
    </div>
  );
}

// --- Profile Editor Component ---

function ProfileEditor({ profile, onClose, onUpdate, showToast }: { profile: UserProfile, onClose: () => void, onUpdate: (p: UserProfile) => void, showToast: (m: string, t?: 'success' | 'error') => void }) {
  const [name, setName] = useState(profile.name);
  const [newPortalPassword, setNewPortalPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return showToast('Name cannot be empty', 'error');
    setLoading(true);
    try {
      const updates: any = { name };
      if (newPortalPassword) {
        if (newPortalPassword.length < 6) {
          showToast('Password must be at least 6 characters', 'error');
          setLoading(false);
          return;
        }
        updates.portalPassword = newPortalPassword;
      }
      await updateDoc(doc(db, 'users', profile.uid), updates);
      onUpdate({ ...profile, ...updates });
      showToast('Profile updated successfully');
      onClose();
    } catch (e) {
      showToast('Failed to update profile', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="max-w-md w-full"
      >
        <Card className="p-8 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-slate-900">Edit Profile</h2>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full">
              <XCircle className="text-slate-400" size={24} />
            </button>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Full Name</label>
              <input 
                type="text" 
                value={name} 
                onChange={e => setName(e.target.value)} 
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="Enter your full name"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Email Address</label>
              <input 
                type="text" 
                value={profile.email} 
                disabled 
                className="w-full px-4 py-3 rounded-xl border border-slate-100 bg-slate-50 text-slate-400 outline-none cursor-not-allowed"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Update Portal Password</label>
              <input 
                type="password" 
                value={newPortalPassword} 
                onChange={e => setNewPortalPassword(e.target.value)} 
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="Leave blank to keep current"
              />
            </div>
          </div>

          {profile.role === 'student' && (
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
              <p className="text-xs text-slate-500 leading-relaxed">
                <span className="font-bold text-slate-700">Need Teacher Access?</span><br />
                Please contact the administrator at <span className="text-indigo-600 font-mono">rahulraj000019@gmail.com</span> to request teacher privileges.
              </p>
            </div>
          )}

          <div className="pt-4 flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button className="flex-1" onClick={handleSave} disabled={loading}>
              {loading ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </Card>
      </motion.div>
    </div>
  );
}

// --- Dashboard Component ---

function Dashboard({ profile, onSelectExam, onCreateExam, onViewResult }: { profile: UserProfile, onSelectExam: (e: Exam) => void, onCreateExam: () => void, onViewResult: (s: Submission) => void }) {
  const [exams, setExams] = useState<Exam[]>([]);
  const [submissions, setSubmissions] = useState<Record<string, Submission>>({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'available' | 'results'>('available');

  useEffect(() => {
    let q = query(collection(db, 'exams'));
    // If teacher, only show their own exams
    if (profile.role === 'teacher') {
      q = query(collection(db, 'exams'), where('creatorUid', '==', profile.uid));
    }
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const examList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Exam));
      setExams(examList);
      setLoading(false);
    });
    return unsubscribe;
  }, [profile.uid, profile.role]);

  useEffect(() => {
    if (profile.role === 'student') {
      const q = query(collection(db, 'submissions'), where('studentUid', '==', profile.uid));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const subMap: Record<string, Submission> = {};
        snapshot.docs.forEach(doc => {
          const data = doc.data() as Submission;
          subMap[data.examId] = { id: doc.id, ...data };
        });
        setSubmissions(subMap);
      });
      return unsubscribe;
    }
  }, [profile.uid, profile.role]);

  const availableExams = exams.filter(exam => {
    if (profile.role === 'teacher') return true;
    const isExpired = new Date(exam.endTime) < new Date();
    const isSubmitted = submissions[exam.id]?.status === 'submitted';
    return !isExpired && !isSubmitted;
  });

  const studentResults = (Object.values(submissions) as Submission[])
    .filter(sub => sub.status === 'submitted')
    .map(sub => {
      const exam = exams.find(e => e.id === sub.examId);
      return {
        id: sub.id,
        examId: sub.examId,
        title: exam?.title || sub.examTitle || 'Unknown Exam',
        description: exam?.description || sub.examDescription || 'No description available',
        duration: exam?.duration || 0,
        startTime: exam?.startTime || sub.startTime,
        submission: sub
      };
    });

  const displayItems = activeTab === 'available' 
    ? availableExams.map(exam => ({ ...exam, submission: submissions[exam.id] }))
    : studentResults;

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-slate-900">Welcome back, {profile.name}</h2>
          <p className="text-slate-500">
            {profile.role === 'teacher' 
              ? 'Manage your assessments and monitor student progress.' 
              : activeTab === 'available' 
                ? 'Here are your active and upcoming exams.' 
                : 'View your performance and teacher feedback.'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {profile.role === 'student' && (
            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button 
                onClick={() => setActiveTab('available')}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'available' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Available
              </button>
              <button 
                onClick={() => setActiveTab('results')}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'results' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Results
              </button>
            </div>
          )}
          {profile.role === 'teacher' && (
            <Button onClick={onCreateExam} icon={Plus}>Create New Exam</Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          [1, 2, 3].map(i => <div key={i} className="h-48 bg-slate-200 animate-pulse rounded-xl" />)
        ) : displayItems.length === 0 ? (
          <div className="col-span-full py-20 text-center space-y-4">
            <BookOpen className="mx-auto text-slate-300" size={64} />
            <p className="text-slate-400 text-lg">
              {profile.role === 'teacher' 
                ? 'No exams found. Create one to get started!' 
                : activeTab === 'available' 
                  ? 'No active exams available at the moment.' 
                  : 'You haven\'t submitted any exams yet.'}
            </p>
          </div>
        ) : (
          displayItems.map((item) => {
            const exam = item as any; // item can be Exam + submission or our mapped result
            const submission = item.submission;
            return (
              <motion.div key={item.id} whileHover={{ y: -4 }}>
                <Card className="p-6 h-full flex flex-col">
                  <div className="flex justify-between items-start mb-4">
                    <div className={`p-2 rounded-lg ${activeTab === 'results' ? 'bg-emerald-50 text-emerald-600' : 'bg-indigo-50 text-indigo-600'}`}>
                      {activeTab === 'results' ? <CheckCircle size={24} /> : <FileText size={24} />}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      {activeTab === 'available' && (
                        <div className="flex flex-col items-end gap-2">
                          <div className="flex items-center gap-1 text-xs font-bold text-slate-400 uppercase tracking-widest">
                            <Clock size={12} />
                            {exam.duration}m
                          </div>
                          {new Date(exam.startTime) > new Date() && (
                            <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-[10px] font-bold uppercase tracking-wider">
                              Not Started
                            </span>
                          )}
                        </div>
                      )}
                      {activeTab === 'results' && submission && (
                        <div className="text-right">
                          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Score</div>
                          <div className="text-xl font-black text-slate-900">{submission.marks} pts</div>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <h3 className="text-xl font-bold text-slate-900 mb-2">{exam.title}</h3>
                  <p className="text-slate-500 text-sm mb-4 line-clamp-2">{exam.description}</p>
                  
                  {activeTab === 'results' && submission && (
                    <div className="space-y-4 mb-4">
                      <div className="flex items-center justify-between p-2 bg-slate-50 rounded-lg border border-slate-100">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Status</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          submission.result === 'pass' ? 'bg-emerald-100 text-emerald-700' : 
                          submission.result === 'fail' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          {submission.result || 'pending'}
                        </span>
                      </div>
                      
                      {submission.remark && (
                        <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-100">
                          <div className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-1">Teacher Remark</div>
                          <p className="text-xs text-indigo-700 italic">"{submission.remark}"</p>
                        </div>
                      )}
                    </div>
                  )}
                  
                  <div className="mt-auto space-y-4">
                    {activeTab === 'available' && (
                      <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
                        <span>Starts: {format(new Date(exam.startTime), 'MMM d, h:mm a')}</span>
                      </div>
                    )}
                    {activeTab === 'results' && submission && (
                      <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
                        <span>Submitted: {submission.submitTime ? format(new Date(submission.submitTime), 'MMM d, h:mm a') : 'N/A'}</span>
                      </div>
                    )}
                    
                    <Button 
                      className="w-full" 
                      variant={profile.role === 'teacher' ? 'secondary' : (activeTab === 'results' ? 'ghost' : 'primary')}
                      onClick={() => {
                        if (profile.role === 'student' && activeTab === 'results' && submission) {
                          onViewResult(submission);
                        } else {
                          onSelectExam(exam);
                        }
                      }}
                      icon={profile.role === 'teacher' ? Settings : (activeTab === 'results' ? Eye : ChevronRight)}
                    >
                      {profile.role === 'teacher' ? 'Manage Exam' : (activeTab === 'results' ? 'View Result' : 'Enter Exam')}
                    </Button>
                  </div>
                </Card>
              </motion.div>
            );
          })
        )}
      </div>
    </div>
  );
}

// --- Exam Creator Component ---

function ExamCreator({ onCancel, showToast }: { onCancel: () => void, showToast: (m: string, t?: 'success' | 'error') => void }) {
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [duration, setDuration] = useState(60);
  const [password, setPassword] = useState('');
  const [questions, setQuestions] = useState<Partial<Question>[]>([]);
  const [loading, setLoading] = useState(false);

  const addQuestion = (type: QuestionType) => {
    setQuestions([...questions, { type, text: '', points: 10, options: type === 'mcq' ? ['', '', '', ''] : [] }]);
  };

  const handleSubmit = async () => {
    if (!title || !startTime || !endTime) return showToast('Please fill required fields', 'error');
    setLoading(true);
    try {
      const examRef = await addDoc(collection(db, 'exams'), {
        title,
        description: desc,
        startTime,
        endTime,
        duration,
        password,
        creatorUid: auth.currentUser?.uid,
        createdAt: serverTimestamp()
      });

      for (const q of questions) {
        await addDoc(collection(db, 'exams', examRef.id, 'questions'), {
          ...q,
          examId: examRef.id
        });
      }
      onCancel();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-20">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold text-slate-900">Create New Assessment</h2>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? 'Creating...' : 'Publish Exam'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <Card className="p-6 space-y-4">
          <h3 className="text-lg font-bold flex items-center gap-2"><Settings size={20} /> Basic Settings</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1 uppercase tracking-wider">Exam Title</label>
              <input value={title} onChange={e => setTitle(e.target.value)} className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="e.g. Midterm Algorithms" />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1 uppercase tracking-wider">Description</label>
              <textarea value={desc} onChange={e => setDesc(e.target.value)} className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none h-24" placeholder="Instructions for students..." />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1 uppercase tracking-wider">Start Time</label>
                <input type="datetime-local" value={startTime} onChange={e => setStartTime(e.target.value)} className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1 uppercase tracking-wider">End Time</label>
                <input type="datetime-local" value={endTime} onChange={e => setEndTime(e.target.value)} className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1 uppercase tracking-wider">Duration (min)</label>
                <input type="number" value={duration} onChange={e => setDuration(parseInt(e.target.value))} className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1 uppercase tracking-wider">Access Password</label>
                <input type="text" value={password} onChange={e => setPassword(e.target.value)} className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="Optional" />
              </div>
            </div>
          </div>
        </Card>

        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold flex items-center gap-2"><BookOpen size={20} /> Questions ({questions.length})</h3>
            <div className="flex gap-2">
              <Button variant="secondary" className="text-xs py-1" onClick={() => addQuestion('mcq')}>+ MCQ</Button>
              <Button variant="secondary" className="text-xs py-1" onClick={() => addQuestion('coding')}>+ Code</Button>
            </div>
          </div>

          <div className="space-y-4">
            {questions.map((q, idx) => (
              <Card key={idx} className="p-4 space-y-4 border-l-4 border-indigo-500">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-indigo-600 uppercase tracking-widest">Q{idx + 1}: {q.type}</span>
                  <Button variant="ghost" className="text-red-500 p-1" onClick={() => setQuestions(questions.filter((_, i) => i !== idx))}>Remove</Button>
                </div>
                <input 
                  value={q.text} 
                  onChange={e => {
                    const newQ = [...questions];
                    newQ[idx].text = e.target.value;
                    setQuestions(newQ);
                  }} 
                  className="w-full px-3 py-1.5 bg-slate-50 rounded border border-slate-200 text-sm" 
                  placeholder="Question text..." 
                />
                {q.type === 'mcq' && (
                  <div className="grid grid-cols-2 gap-2">
                    {q.options?.map((opt, oIdx) => (
                      <input 
                        key={oIdx} 
                        value={opt} 
                        onChange={e => {
                          const newQ = [...questions];
                          newQ[idx].options![oIdx] = e.target.value;
                          setQuestions(newQ);
                        }}
                        className="px-3 py-1 bg-white border border-slate-200 rounded text-xs" 
                        placeholder={`Option ${oIdx + 1}`} 
                      />
                    ))}
                  </div>
                )}
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Exam Manager Component ---

function ExamManager({ exam, onBack, showToast }: { exam: Exam, onBack: () => void, showToast: (m: string, t?: 'success' | 'error') => void }) {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSub, setSelectedSub] = useState<Submission | null>(null);
  const [logs, setLogs] = useState<ProctoringLog[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [remark, setRemark] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);

  useEffect(() => {
    const q = query(collection(db, 'submissions'), where('examId', '==', exam.id));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setSubmissions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Submission)));
      setLoading(false);
    });
    return unsubscribe;
  }, [exam.id]);

  useEffect(() => {
    const fetchQuestions = async () => {
      const qSnap = await getDocs(collection(db, 'exams', exam.id, 'questions'));
      setQuestions(qSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Question)));
    };
    fetchQuestions();
  }, [exam.id]);

  useEffect(() => {
    if (selectedSub) {
      const q = query(collection(db, 'submissions', selectedSub.id, 'logs'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const sortedLogs = snapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() } as ProctoringLog))
          .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        setLogs(sortedLogs);
      });
      setRemark(selectedSub.remark || '');
      return unsubscribe;
    }
  }, [selectedSub]);

  // Video Replay Logic
  useEffect(() => {
    let interval: NodeJS.Timeout;
    const snapshots = logs.filter(l => l.evidence?.startsWith('data:image'));
    if (isPlaying && snapshots.length > 0) {
      interval = setInterval(() => {
        setCurrentFrame(prev => (prev + 1) % snapshots.length);
      }, 1000); // Play at 1 frame per second
    }
    return () => clearInterval(interval);
  }, [isPlaying, logs]);

  const updateResult = async (subId: string, result: 'pass' | 'fail') => {
    try {
      await updateDoc(doc(db, 'submissions', subId), { result, remark });
      showToast(`Student marked as ${result}`);
      if (selectedSub?.id === subId) {
        setSelectedSub(prev => prev ? { ...prev, result, remark } : null);
      }
    } catch (e) {
      showToast('Failed to update result', 'error');
    }
  };

  const toggleQuestionGrade = async (qId: string, points: number) => {
    if (!selectedSub) return;
    const currentGraded = selectedSub.gradedQuestions || {};
    const isCorrect = !currentGraded[qId]?.correct;
    
    const newGraded = {
      ...currentGraded,
      [qId]: { correct: isCorrect, points: isCorrect ? points : 0 }
    };

    // Recalculate total marks
    const newMarks = Object.values(newGraded).reduce((sum, g: any) => sum + (g.points || 0), 0);

    try {
      await updateDoc(doc(db, 'submissions', selectedSub.id), { 
        gradedQuestions: newGraded,
        marks: newMarks
      });
      setSelectedSub({ ...selectedSub, gradedQuestions: newGraded, marks: newMarks });
      showToast(isCorrect ? 'Question marked as correct' : 'Question marked as incorrect');
    } catch (e) {
      showToast('Failed to update question grade', 'error');
    }
  };

  const saveRemark = async () => {
    if (!selectedSub) return;
    try {
      await updateDoc(doc(db, 'submissions', selectedSub.id), { remark });
      showToast('Remark saved successfully');
    } catch (e) {
      showToast('Failed to save remark', 'error');
    }
  };

  if (selectedSub) {
    const snapshots = logs.filter(l => l.evidence?.startsWith('data:image'));
    return (
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => setSelectedSub(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
              <ArrowLeft size={24} />
            </button>
            <div>
              <h2 className="text-3xl font-bold text-slate-900">{selectedSub.studentName}</h2>
              <p className="text-slate-500">Reviewing submission for {exam.title}</p>
            </div>
          </div>
          <div className="flex gap-3">
            <Button 
              variant={selectedSub.result === 'pass' ? 'primary' : 'secondary'}
              onClick={() => updateResult(selectedSub.id, 'pass')}
              icon={CheckCircle}
              className={selectedSub.result === 'pass' ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
            >
              Pass
            </Button>
            <Button 
              variant={selectedSub.result === 'fail' ? 'danger' : 'secondary'}
              onClick={() => updateResult(selectedSub.id, 'fail')}
              icon={XCircle}
            >
              Fail
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <Card className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Monitor size={20} className="text-indigo-600" />
                  Video Replay (Snapshot Sequence)
                </h3>
                {snapshots.length > 0 && (
                  <Button 
                    size="sm" 
                    variant={isPlaying ? 'secondary' : 'primary'}
                    onClick={() => setIsPlaying(!isPlaying)}
                    icon={isPlaying ? LogOut : Monitor}
                  >
                    {isPlaying ? 'Stop Replay' : 'Play Replay'}
                  </Button>
                )}
              </div>
              
              <div className="aspect-video bg-slate-900 rounded-xl overflow-hidden relative border border-slate-800">
                {snapshots.length > 0 ? (
                  <>
                    <img 
                      src={snapshots[currentFrame]?.evidence} 
                      alt="Replay Frame" 
                      className="w-full h-full object-contain"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between bg-black/50 backdrop-blur-md p-3 rounded-lg text-white">
                      <div className="text-xs font-mono">
                        Frame {currentFrame + 1} / {snapshots.length}
                      </div>
                      <div className="text-xs font-mono">
                        {format(new Date(snapshots[currentFrame]?.timestamp), 'h:mm:ss a')}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 space-y-4">
                    <Camera size={48} className="opacity-20" />
                    <p>No snapshots available for replay.</p>
                  </div>
                )}
              </div>
              
              {snapshots.length > 0 && (
                <div className="mt-4">
                  <input 
                    type="range" 
                    min="0" 
                    max={snapshots.length - 1} 
                    value={currentFrame} 
                    onChange={(e) => { setCurrentFrame(parseInt(e.target.value)); setIsPlaying(false); }}
                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                  />
                </div>
              )}
            </Card>

            <Card className="p-6">
              <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
                <FileText size={20} className="text-indigo-600" />
                Student Answers
              </h3>
              <div className="space-y-6">
                {questions.map((q, idx) => (
                  <div key={q.id} className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="flex justify-between mb-2">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Question {idx + 1}</span>
                      <span className="text-xs font-bold text-indigo-600">{q.points} Points</span>
                    </div>
                    <p className="text-slate-900 font-medium mb-4">{q.text}</p>
                    <div className="bg-white p-4 rounded-lg border border-slate-200">
                      <div className="flex justify-between items-start mb-2">
                        <div className="text-xs text-slate-400 font-bold uppercase">Answer:</div>
                        <button 
                          onClick={() => toggleQuestionGrade(q.id, q.points)}
                          className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold transition-all ${
                            selectedSub.gradedQuestions?.[q.id]?.correct 
                              ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' 
                              : 'bg-slate-100 text-slate-400 border border-slate-200 hover:border-indigo-200 hover:text-indigo-600'
                          }`}
                        >
                          <CheckCircle size={14} />
                          {selectedSub.gradedQuestions?.[q.id]?.correct ? 'Correct' : 'Mark Correct'}
                        </button>
                      </div>
                      <div className="text-slate-700 whitespace-pre-wrap">
                        {selectedSub.answers[q.id] || <span className="italic text-slate-300">No answer provided</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <div className="space-y-8">
            <Card className="p-6">
              <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                <AlertTriangle size={20} className="text-amber-500" />
                Proctoring Summary
              </h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
                  <span className="text-sm text-slate-600">Tab Switches</span>
                  <span className={`font-bold ${selectedSub.tabSwitchCount > 2 ? 'text-red-500' : 'text-slate-900'}`}>
                    {selectedSub.tabSwitchCount}
                  </span>
                </div>
                <div className="space-y-2">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Recent Logs</span>
                  {logs.filter(l => l.type !== 'snapshot').slice(0, 5).map(log => (
                    <div key={log.id} className="text-xs p-2 bg-red-50 text-red-700 rounded border border-red-100">
                      <span className="font-bold">{log.type}:</span> {log.evidence}
                      <div className="text-[10px] opacity-60 mt-1">{format(new Date(log.timestamp), 'h:mm:ss a')}</div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                <Settings size={20} className="text-indigo-600" />
                Teacher Remarks
              </h3>
              <textarea
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                className="w-full h-32 p-3 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none resize-none text-sm mb-4"
                placeholder="Enter your remarks for the student..."
              />
              <Button className="w-full" onClick={saveRemark}>Save Remark</Button>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <ArrowLeft size={24} />
          </button>
          <div>
            <h2 className="text-3xl font-bold text-slate-900">{exam.title}</h2>
            <p className="text-slate-500">Managing submissions and proctoring results</p>
          </div>
        </div>
        <div className="flex items-center gap-3 px-4 py-2 bg-indigo-50 text-indigo-700 rounded-xl font-bold">
          <Users size={20} />
          <span>{submissions.length} Submissions</span>
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Student</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Status</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Tab Switches</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Submission Time</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Result</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-slate-400">Loading submissions...</td></tr>
              ) : submissions.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-slate-400">No submissions yet.</td></tr>
              ) : (
                submissions.map((sub) => (
                  <tr key={sub.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-900">{sub.studentName || `Student (${sub.studentUid.slice(0, 5)}...)`}</div>
                      <div className="text-xs text-slate-400">{sub.studentUid}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        sub.status === 'submitted' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {sub.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className={`flex items-center gap-2 font-bold ${sub.tabSwitchCount > 2 ? 'text-red-500' : 'text-slate-700'}`}>
                        <AlertTriangle size={14} />
                        {sub.tabSwitchCount}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">
                      {sub.submitTime ? format(new Date(sub.submitTime), 'MMM d, h:mm a') : '-'}
                    </td>
                    <td className="px-6 py-4">
                      {sub.result ? (
                        <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          sub.result === 'pass' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {sub.result}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400 italic">Pending</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <Button 
                          size="sm" 
                          variant="secondary"
                          onClick={() => setSelectedSub(sub)}
                          icon={Eye}
                        >
                          View Details
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// --- Result Viewer Component ---

function ResultViewer({ submission, onBack }: { submission: Submission, onBack: () => void }) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchQuestions = async () => {
      try {
        const qSnap = await getDocs(collection(db, 'exams', submission.examId, 'questions'));
        setQuestions(qSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Question)));
      } catch (error) {
        console.error("Error fetching questions for result:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchQuestions();
  }, [submission.examId]);

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <ArrowLeft size={24} />
          </button>
          <div>
            <h2 className="text-3xl font-bold text-slate-900">Exam Result</h2>
            <p className="text-slate-500">{submission.examTitle || 'Assessment Summary'}</p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Final Score</div>
          <div className="text-4xl font-black text-indigo-600">{submission.marks} <span className="text-lg text-slate-400 font-bold">pts</span></div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-2 space-y-6">
          <Card className="p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
              <FileText size={20} className="text-indigo-600" />
              Detailed Question Review
            </h3>
            <div className="space-y-6">
              {loading ? (
                <div className="py-12 text-center text-slate-400">Loading questions...</div>
              ) : questions.length === 0 ? (
                <div className="py-12 text-center text-slate-400">No questions found for this exam.</div>
              ) : (
                questions.map((q, idx) => {
                  const grade = submission.gradedQuestions?.[q.id];
                  return (
                    <div key={q.id} className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                      <div className="flex justify-between mb-2">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Question {idx + 1}</span>
                        <div className="flex items-center gap-2">
                          {grade && (
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              grade.correct ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                            }`}>
                              {grade.correct ? 'Correct' : 'Incorrect'}
                            </span>
                          )}
                          <span className="text-xs font-bold text-indigo-600">
                            {grade?.points || 0} / {q.points} Points
                          </span>
                        </div>
                      </div>
                      <p className="text-slate-900 font-medium mb-4">{q.text}</p>
                      <div className="bg-white p-4 rounded-lg border border-slate-200">
                        <div className="text-xs text-slate-400 mb-1 font-bold uppercase">Your Answer:</div>
                        <div className="text-slate-700 whitespace-pre-wrap">
                          {submission.answers[q.id] || <span className="italic text-slate-300">No answer provided</span>}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-8">
          <Card className="p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
              <CheckCircle size={20} className="text-emerald-500" />
              Performance Status
            </h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
                <span className="text-sm text-slate-600">Status</span>
                <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                  submission.result === 'pass' ? 'bg-emerald-100 text-emerald-700' : 
                  submission.result === 'fail' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                }`}>
                  {submission.result || 'pending'}
                </span>
              </div>
              <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
                <span className="text-sm text-slate-600">Integrity Score</span>
                <span className={`font-bold ${submission.tabSwitchCount > 2 ? 'text-red-500' : 'text-emerald-500'}`}>
                  {Math.max(0, 100 - submission.tabSwitchCount * 10)}%
                </span>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Settings size={20} className="text-indigo-600" />
              Teacher Remarks
            </h3>
            <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100 min-h-[100px]">
              {submission.remark ? (
                <p className="text-sm text-indigo-700 italic leading-relaxed">"{submission.remark}"</p>
              ) : (
                <p className="text-sm text-slate-400 italic">No remarks provided yet.</p>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function ExamRoom({ exam, profile, onFinish, showToast }: { exam: Exam, profile: UserProfile, onFinish: () => void, showToast: (m: string, t?: 'success' | 'error') => void }) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQIdx, setCurrentQIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [isStarted, setIsStarted] = useState(false);
  const [password, setPassword] = useState('');
  const [timeLeft, setTimeLeft] = useState(exam.duration * 60);
  const [fullscreenAlert, setFullscreenAlert] = useState(false);
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [snapshotInterval, setSnapshotInterval] = useState<NodeJS.Timeout | null>(null);
  
  const webcamRef = useRef<Webcam>(null);
  const faceMeshRef = useRef<FaceMesh | null>(null);

  useEffect(() => {
    const fetchQuestions = async () => {
      const qSnap = await getDocs(collection(db, 'exams', exam.id, 'questions'));
      setQuestions(qSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Question)));
    };
    fetchQuestions();
  }, [exam.id]);

  useEffect(() => {
    if (isStarted && timeLeft > 0) {
      const timer = setInterval(() => setTimeLeft(t => t - 1), 1000);
      return () => clearInterval(timer);
    } else if (isStarted && timeLeft === 0) {
      handleSubmit();
    }
  }, [isStarted, timeLeft]);

  useEffect(() => {
    if (isStarted && submission) {
      const interval = setInterval(() => {
        if (webcamRef.current) {
          const imageSrc = webcamRef.current.getScreenshot();
          if (imageSrc) {
            // Log as a snapshot type
            addDoc(collection(db, 'submissions', submission.id, 'logs'), {
              submissionId: submission.id,
              timestamp: new Date().toISOString(),
              type: 'snapshot',
              evidence: imageSrc
            }).catch(e => handleFirestoreError(e, OperationType.WRITE, `submissions/${submission.id}/logs`));
          }
        }
      }, 10000); // Every 10 seconds for smoother video replay
      setSnapshotInterval(interval);
      return () => clearInterval(interval);
    }
  }, [isStarted, submission]);
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.hidden && isStarted && submission) {
        setTabSwitchCount(c => c + 1);
        logProctoring('tab-switch', 'User switched tabs or minimized window');
        await updateDoc(doc(db, 'submissions', submission.id), {
          tabSwitchCount: tabSwitchCount + 1
        });
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isStarted, submission, tabSwitchCount]);

  const logProctoring = async (type: ProctoringLogType, evidence: string) => {
    if (!submission) return;
    await addDoc(collection(db, 'submissions', submission.id, 'logs'), {
      submissionId: submission.id,
      timestamp: new Date().toISOString(),
      type,
      evidence
    });
  };

  const handleStart = async () => {
    if (exam.password && password !== exam.password) return showToast('Incorrect password', 'error');
    
    // Check if within time
    const now = new Date();
    if (isBefore(now, new Date(exam.startTime))) return showToast('Exam hasn\'t started yet', 'error');
    if (isAfter(now, new Date(exam.endTime))) return showToast('Exam has ended', 'error');

    const subRef = await addDoc(collection(db, 'submissions'), {
      examId: exam.id,
      examTitle: exam.title,
      examDescription: exam.description,
      studentUid: auth.currentUser?.uid,
      studentName: profile.name,
      status: 'started',
      startTime: new Date().toISOString(),
      answers: {},
      marks: 0,
      tabSwitchCount: 0,
      result: 'pending'
    });
    
    setSubmission({ 
      id: subRef.id, 
      examId: exam.id, 
      examTitle: exam.title,
      examDescription: exam.description,
      studentUid: auth.currentUser!.uid, 
      studentName: profile.name, 
      status: 'started', 
      startTime: new Date().toISOString(), 
      answers: {}, 
      marks: 0, 
      tabSwitchCount: 0, 
      result: 'pending' 
    });
    setIsStarted(true);
    
    // Request fullscreen
    try {
      document.documentElement.requestFullscreen();
    } catch (e) {
      console.error('Fullscreen failed');
    }
  };

  const handleSubmit = async () => {
    if (!submission) return;
    await updateDoc(doc(db, 'submissions', submission.id), {
      status: 'submitted',
      submitTime: new Date().toISOString(),
      answers
    });
    if (document.fullscreenElement) document.exitFullscreen();
    showToast('Exam submitted successfully!');
    onFinish();
  };

  if (!isStarted) {
    return (
      <div className="max-w-md mx-auto py-12 space-y-8">
        <Card className="p-8 text-center space-y-6">
          <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto">
            <Shield size={32} />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-slate-900">{exam.title}</h2>
            <p className="text-slate-500">Please verify your details and enter the password to begin.</p>
          </div>
          
          <div className="bg-slate-50 p-4 rounded-lg text-left space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Duration</span>
              <span className="font-bold text-slate-700">{exam.duration} Minutes</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Questions</span>
              <span className="font-bold text-slate-700">{questions.length} Total</span>
            </div>
          </div>

          {exam.password && (
            <input 
              type="password" 
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              placeholder="Enter Exam Password" 
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-center"
            />
          )}

          <div className="space-y-4">
            <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 p-3 rounded-lg border border-amber-100">
              <AlertTriangle size={16} />
              <span>Webcam and Fullscreen are required for this exam.</span>
            </div>
            <Button className="w-full py-4" onClick={handleStart}>Start Assessment</Button>
          </div>
        </Card>
      </div>
    );
  }

  const currentQ = questions[currentQIdx];

  return (
    <div className="h-[calc(100vh-120px)] flex gap-6">
      {/* Left: Questions & Editor */}
      <div className="flex-1 flex flex-col gap-6 overflow-hidden">
        <Card className="p-6 flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <span className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-xs font-bold uppercase tracking-widest">
                Question {currentQIdx + 1} of {questions.length}
              </span>
              <span className="text-slate-400 text-sm font-medium">{currentQ?.points} Points</span>
            </div>
            <div className={`flex items-center gap-2 font-mono font-bold ${timeLeft < 300 ? 'text-red-500 animate-pulse' : 'text-slate-700'}`}>
              <Clock size={20} />
              {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto space-y-6 pr-2">
            <h3 className="text-2xl font-bold text-slate-900 leading-tight">{currentQ?.text}</h3>
            
            {currentQ?.type === 'mcq' && (
              <div className="grid grid-cols-1 gap-3">
                {currentQ.options?.map((opt, idx) => (
                  <button
                    key={idx}
                    onClick={() => setAnswers({ ...answers, [currentQ.id]: opt })}
                    className={`p-4 text-left rounded-xl border-2 transition-all flex items-center justify-between group ${
                      answers[currentQ.id] === opt 
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-700' 
                        : 'border-slate-100 hover:border-slate-200 text-slate-600'
                    }`}
                  >
                    <span className="font-medium">{opt}</span>
                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                      answers[currentQ.id] === opt ? 'border-indigo-600 bg-indigo-600' : 'border-slate-200'
                    }`}>
                      {answers[currentQ.id] === opt && <CheckCircle className="text-white" size={14} />}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {currentQ?.type === 'coding' && (
              <div className="space-y-4">
                <div className="h-[400px] border border-slate-200 rounded-xl overflow-hidden">
                  <Editor
                    height="100%"
                    defaultLanguage="javascript"
                    theme="vs-dark"
                    value={answers[currentQ.id] || '// Write your code here...'}
                    onChange={(val) => setAnswers({ ...answers, [currentQ.id]: val || '' })}
                    options={{
                      minimap: { enabled: false },
                      fontSize: 14,
                      padding: { top: 20 }
                    }}
                  />
                </div>
                <div className="flex gap-4">
                  <Button 
                    variant="secondary" 
                    className="bg-slate-800 text-white hover:bg-slate-700"
                    icon={Code}
                    onClick={async () => {
                      showToast('Executing code in sandbox...');
                      // Simulate execution
                      setTimeout(() => showToast('Output: Hello World! (Execution successful)'), 1000);
                    }}
                  >
                    Run Code
                  </Button>
                </div>
              </div>
            )}

            {currentQ?.type === 'subjective' && (
              <textarea
                value={answers[currentQ.id] || ''}
                onChange={(e) => setAnswers({ ...answers, [currentQ.id]: e.target.value })}
                className="w-full h-64 p-6 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none resize-none text-lg"
                placeholder="Type your answer here..."
              />
            )}
          </div>

          <div className="mt-6 pt-6 border-t border-slate-100 flex justify-between">
            <Button 
              variant="secondary" 
              disabled={currentQIdx === 0} 
              onClick={() => setCurrentQIdx(currentQIdx - 1)}
            >
              Previous
            </Button>
            {currentQIdx === questions.length - 1 ? (
              <Button variant="primary" className="bg-emerald-600 hover:bg-emerald-700" onClick={handleSubmit}>
                Submit Exam
              </Button>
            ) : (
              <Button onClick={() => setCurrentQIdx(currentQIdx + 1)}>
                Next Question
              </Button>
            )}
          </div>
        </Card>
      </div>

      {/* Right: Proctoring & Sidebar */}
      <div className="w-80 flex flex-col gap-6">
        <Card className="p-4 bg-slate-900 text-white border-none">
          <div className="flex items-center gap-2 mb-3 text-xs font-bold uppercase tracking-widest text-indigo-400">
            <Camera size={14} /> AI Proctoring Active
          </div>
          <div className="aspect-video bg-black rounded-lg overflow-hidden relative border border-white/10">
            <Webcam
              ref={webcamRef}
              audio={false}
              className="w-full h-full object-cover"
              screenshotFormat="image/jpeg"
              videoConstraints={{ facingMode: 'user' }}
              mirrored={true}
              onUserMediaError={(err) => console.error('Webcam error:', err)}
              onUserMedia={() => {}}
              screenshotQuality={0.8}
              imageSmoothing={true}
              forceScreenshotSourceSize={false}
              disablePictureInPicture={true}
            />
            <div className="absolute top-2 right-2 flex gap-1">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            </div>
          </div>
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-tighter text-slate-500">
              <span>Integrity Score</span>
              <span className={tabSwitchCount > 2 ? 'text-red-400' : 'text-emerald-400'}>
                {Math.max(0, 100 - tabSwitchCount * 10)}%
              </span>
            </div>
            <div className="h-1 bg-white/10 rounded-full overflow-hidden">
              <motion.div 
                className="h-full bg-indigo-500" 
                initial={{ width: '100%' }}
                animate={{ width: `${Math.max(0, 100 - tabSwitchCount * 10)}%` }}
              />
            </div>
          </div>
        </Card>

        <Card className="p-6 flex-1">
          <h4 className="text-sm font-bold text-slate-900 mb-4 uppercase tracking-wider">Question Navigator</h4>
          <div className="grid grid-cols-4 gap-2">
            {questions.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentQIdx(idx)}
                className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold transition-all ${
                  currentQIdx === idx 
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' 
                    : answers[questions[idx].id] 
                      ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' 
                      : 'bg-slate-50 text-slate-400 border border-slate-100 hover:bg-slate-100'
                }`}
              >
                {idx + 1}
              </button>
            ))}
          </div>

          <div className="mt-8 space-y-4">
            <div className="p-4 bg-amber-50 rounded-xl border border-amber-100 space-y-2">
              <div className="flex items-center gap-2 text-amber-700 font-bold text-xs uppercase tracking-wider">
                <AlertTriangle size={14} /> Warnings
              </div>
              <p className="text-[11px] text-amber-600 leading-relaxed">
                Tab switching detected: {tabSwitchCount} times. Multiple violations may lead to automatic disqualification.
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
