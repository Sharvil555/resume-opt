
import React, { useState, useEffect } from 'react';
import { AnalysisResult, FileData, AppView, OptimizationHistory } from './types';
import { analyzeResume } from './services/gemini';
import { supabase } from './services/supabase';
import ScoreGauge from './components/ScoreGauge';

const App: React.FC = () => {
  const [view, setView] = useState<AppView>('login');
  const [user, setUser] = useState<any>(null);
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isSigningUp, setIsSigningUp] = useState(false);
  
  const [resumeText, setResumeText] = useState('');
  const [resumeFile, setResumeFile] = useState<FileData | null>(null);
  const [jobDescription, setJobDescription] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStep, setAnalysisStep] = useState(0);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<OptimizationHistory[]>([]);

  const loadingSteps = [
    "Initializing Gemini Pro engine...",
    "Parsing resume structure...",
    "Analyzing job description keywords...",
    "Calculating ATS match compatibility...",
    "Engineering custom bullet points...",
    "Drafting high-impact cover letter..."
  ];

  useEffect(() => {
    let interval: any;
    if (isAnalyzing) {
      setAnalysisStep(0);
      interval = setInterval(() => {
        setAnalysisStep((prev) => (prev < loadingSteps.length - 1 ? prev + 1 : prev));
      }, 3500);
    }
    return () => clearInterval(interval);
  }, [isAnalyzing]);

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setUser(session.user);
        setView('dashboard');
        fetchHistory(session.user.id);
        updateLastLogin(session.user.id);
      }
    };
    checkSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setUser(session.user);
        setView('dashboard');
        fetchHistory(session.user.id);
      } else {
        setUser(null);
        setView('login');
        setHistory([]);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const updateLastLogin = async (userId: string) => {
    await supabase.from('profiles').upsert({ 
      id: userId, 
      last_login: new Date().toISOString() 
    });
  };

  const fetchHistory = async (userId: string) => {
    const { data, error } = await supabase
      .from('optimizations')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (!error && data) {
      const formatted: OptimizationHistory[] = data.map(item => ({
        id: item.id,
        jobTitle: item.job_title,
        company: item.company,
        date: new Date(item.created_at).toLocaleDateString(),
        score: item.score
      }));
      setHistory(formatted);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setError(null);

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: loginForm.email,
      password: loginForm.password,
    });

    if (authError) {
      setError(authError.message);
      setIsLoggingIn(false);
    } else if (data.user) {
      updateLastLogin(data.user.id);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setError(null);

    const { data, error: authError } = await supabase.auth.signUp({
      email: loginForm.email,
      password: loginForm.password,
    });

    if (authError) {
      setError(authError.message);
      setIsLoggingIn(false);
    } else if (data.user) {
      await supabase.from('profiles').insert({ 
        id: data.user.id, 
        email: data.user.email 
      });
      setError("Success! Check your email for verification.");
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const resultStr = event.target?.result as string;
      const base64 = resultStr.split(',')[1];
      setResumeFile({
        data: base64,
        mimeType: file.type,
        name: file.name
      });
      setResumeText('');
    };

    if (file.type === 'text/plain') {
      const textReader = new FileReader();
      textReader.onload = (event) => {
        setResumeText(event.target?.result as string);
        setResumeFile(null);
      };
      textReader.readAsText(file);
    } else {
      reader.readAsDataURL(file);
    }
  };

  const handleAnalyze = async () => {
    if ((!resumeText && !resumeFile) || !jobDescription) {
      setError('Missing assets. Please upload a resume and paste the job description.');
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    try {
      const data = await analyzeResume({ 
        resumeText: resumeText || undefined, 
        resumeFile: resumeFile || undefined,
        jobDescription 
      });
      setResult(data);
      setView('results');
      
      if (user) {
        const firstLine = jobDescription.split('\n')[0].substring(0, 50).trim();
        await supabase.from('optimizations').insert({
          user_id: user.id,
          job_title: firstLine || 'New Analysis',
          company: 'Target Application',
          score: data.matchScore,
          result_json: data
        });
        fetchHistory(user.id);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Optimization failed. Try a different file format.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const downloadAsTxt = (content: string, filename: string) => {
    const element = document.createElement("a");
    const file = new Blob([content], {type: 'text/plain'});
    element.href = URL.createObjectURL(file);
    element.download = `${filename}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  if (view === 'login') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center relative overflow-hidden p-6">
        <div className="absolute top-0 left-0 w-full h-full opacity-20 bg-[radial-gradient(circle_at_50%_50%,#3b82f6,transparent_60%)]"></div>
        
        <div className="relative z-10 w-full max-w-md bg-white/5 backdrop-blur-3xl border border-white/10 p-8 md:p-12 rounded-[3rem] shadow-2xl animate-in fade-in zoom-in duration-500">
          <div className="flex flex-col items-center mb-10">
            <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-indigo-700 rounded-3xl flex items-center justify-center shadow-2xl shadow-blue-500/40 mb-6 transform rotate-3">
              <span className="text-white text-4xl font-black">E</span>
            </div>
            <h1 className="text-4xl font-bold text-white tracking-tight">ElevateAI</h1>
            <p className="text-slate-400 mt-2 text-center text-sm font-medium tracking-wide uppercase opacity-75">
              Professional Resume Optimizer
            </p>
          </div>

          <form onSubmit={isSigningUp ? handleSignUp : handleLogin} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Email Identity</label>
              <input 
                type="email" 
                required
                value={loginForm.email}
                onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                placeholder="you@example.com"
                className="w-full px-6 py-4 bg-white/5 border border-white/10 rounded-2xl text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all placeholder:text-slate-700"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Secure Key</label>
              <input 
                type="password" 
                required
                value={loginForm.password}
                onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                placeholder="••••••••"
                className="w-full px-6 py-4 bg-white/5 border border-white/10 rounded-2xl text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all placeholder:text-slate-700"
              />
            </div>
            
            {error && (
              <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 animate-shake">
                <p className="text-rose-400 text-xs font-bold text-center leading-relaxed">{error}</p>
              </div>
            )}

            <button 
              type="submit"
              disabled={isLoggingIn}
              className="w-full py-5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-black rounded-2xl transition-all shadow-xl shadow-blue-600/20 flex items-center justify-center gap-3 active:scale-95"
            >
              {isLoggingIn ? (
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>Processing...</span>
                </div>
              ) : (
                <span>{isSigningUp ? 'Initialize Account' : 'Access Dashboard'}</span>
              )}
            </button>
          </form>
          
          <div className="mt-10 pt-8 border-t border-white/5 text-center">
            <button 
              onClick={() => { setIsSigningUp(!isSigningUp); setError(null); }}
              className="text-slate-500 text-sm font-semibold hover:text-white transition-colors"
            >
              {isSigningUp ? 'Already have an account? Sign In' : "Don't have an account? Create one"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-inter">
      {/* Navigation */}
      <nav className="bg-white/80 backdrop-blur-lg border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-10">
            <div className="flex items-center gap-3 cursor-pointer group" onClick={() => setView('dashboard')}>
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center group-hover:rotate-6 transition-transform">
                <span className="text-white font-black text-xl">E</span>
              </div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">ElevateAI</h1>
            </div>
            <div className="hidden md:flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
              <button 
                onClick={() => setView('dashboard')}
                className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${view === 'dashboard' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-900'}`}
              >
                Dashboard
              </button>
              <button 
                onClick={() => { setView('input'); setResult(null); }}
                className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${view === 'input' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-900'}`}
              >
                New Analysis
              </button>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex flex-col items-end">
              <p className="text-sm font-black text-slate-900">{user?.email?.split('@')[0]}</p>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">Pro Tier Account</p>
            </div>
            <button 
              onClick={handleLogout}
              className="p-3 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-2xl transition-all"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto px-6 py-10 w-full">
        {isAnalyzing ? (
          <div className="flex flex-col items-center justify-center min-h-[60vh] animate-in fade-in duration-500">
            <div className="relative mb-12">
              <div className="w-32 h-32 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center animate-pulse">
                   <span className="text-white font-black text-2xl">E</span>
                </div>
              </div>
            </div>
            <h2 className="text-3xl font-black text-slate-900 mb-2">Analyzing your potential...</h2>
            <p className="text-slate-500 font-medium text-lg animate-pulse">{loadingSteps[analysisStep]}</p>
          </div>
        ) : (
          <>
            {view === 'dashboard' && (
              <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div>
                    <h2 className="text-4xl font-black text-slate-900 tracking-tight">Career Command Center</h2>
                    <p className="text-slate-500 mt-2 text-lg font-medium">Elevating your professional profile with Gemini Pro.</p>
                  </div>
                  <button 
                    onClick={() => setView('input')}
                    className="bg-slate-900 hover:bg-black text-white px-10 py-5 rounded-2xl font-black shadow-2xl transition-all flex items-center gap-3 active:scale-95"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4" />
                    </svg>
                    New Optimization
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  <div className="bg-white p-10 rounded-[2.5rem] shadow-sm border border-slate-200 group hover:border-blue-200 transition-colors">
                    <p className="text-slate-400 text-xs font-black uppercase tracking-widest mb-4">Saved Analyses</p>
                    <div className="flex items-baseline gap-2">
                      <span className="text-6xl font-black text-slate-900">{history.length}</span>
                      <span className="text-slate-400 font-bold">Files</span>
                    </div>
                  </div>
                  <div className="bg-white p-10 rounded-[2.5rem] shadow-sm border border-slate-200 group hover:border-emerald-200 transition-colors">
                    <p className="text-slate-400 text-xs font-black uppercase tracking-widest mb-4">Average Match</p>
                    <div className="flex items-baseline gap-2">
                      <span className="text-6xl font-black text-emerald-600">
                        {history.length > 0 ? Math.round(history.reduce((a, b) => a + b.score, 0) / history.length) : 0}%
                      </span>
                    </div>
                  </div>
                  <div className="bg-white p-10 rounded-[2.5rem] shadow-sm border border-slate-200 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 -mr-16 -mt-16 rounded-full"></div>
                    <p className="text-slate-400 text-xs font-black uppercase tracking-widest mb-4">System Status</p>
                    <div className="flex items-center gap-3 text-emerald-600 font-black text-2xl">
                      <div className="w-4 h-4 bg-emerald-500 rounded-full animate-ping"></div>
                      Operational
                    </div>
                  </div>
                </div>

                <section className="bg-white rounded-[3rem] shadow-sm border border-slate-200 overflow-hidden">
                  <div className="px-10 py-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <h3 className="font-black text-slate-900 text-xl tracking-tight">Optimization Vault</h3>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {history.length === 0 ? (
                      <div className="py-24 text-center">
                        <div className="w-20 h-20 bg-slate-100 rounded-3xl flex items-center justify-center mx-auto mb-6">
                           <svg className="w-10 h-10 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                           </svg>
                        </div>
                        <p className="text-slate-400 font-bold text-lg">No history found. Start your first analysis!</p>
                      </div>
                    ) : (
                      history.map((item) => (
                        <div key={item.id} className="px-10 py-8 flex items-center justify-between hover:bg-slate-50 transition-all cursor-pointer group">
                          <div className="flex items-center gap-8">
                            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center border-2 font-black text-xl ${item.score >= 80 ? 'bg-emerald-50 border-emerald-100 text-emerald-600' : 'bg-amber-50 border-amber-100 text-amber-600'}`}>
                              {item.score}%
                            </div>
                            <div>
                              <p className="text-xl font-black text-slate-900 group-hover:text-blue-600 transition-colors">{item.jobTitle}</p>
                              <p className="text-xs font-bold text-slate-400 mt-1 uppercase tracking-widest">{item.company} • {item.date}</p>
                            </div>
                          </div>
                          <button className="p-4 bg-white border border-slate-200 rounded-2xl opacity-0 group-hover:opacity-100 transition-all hover:bg-blue-600 hover:text-white hover:border-blue-600">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                            </svg>
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </section>
              </div>
            )}

            {view === 'input' && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                 <div className="mb-12 flex items-center gap-6">
                   <button onClick={() => setView('dashboard')} className="p-4 bg-white border border-slate-200 hover:bg-slate-100 rounded-[1.5rem] transition-all shadow-sm">
                      <svg className="w-6 h-6 text-slate-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                      </svg>
                   </button>
                   <div>
                    <h2 className="text-4xl font-black text-slate-900 tracking-tight">Workspace</h2>
                    <p className="text-slate-500 font-medium text-lg">Input your professional assets for ATS tailoring.</p>
                   </div>
                 </div>
                 
                 <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                    <section className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-200 flex flex-col h-full">
                      <div className="flex items-center justify-between mb-8">
                        <h3 className="text-2xl font-black text-slate-900 flex items-center gap-4">
                          <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                            <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                          </div>
                          Your Resume
                        </h3>
                        <div className="flex gap-2">
                           {resumeFile && (
                            <button 
                              onClick={() => setResumeFile(null)}
                              className="px-4 py-2 text-xs font-black text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                            >
                              Clear
                            </button>
                          )}
                          <label className="px-6 py-2 text-xs font-black text-white bg-slate-900 hover:bg-black rounded-xl cursor-pointer transition-all uppercase tracking-widest">
                            {resumeFile ? 'Change File' : 'Upload File'}
                            <input type="file" accept=".txt,.pdf,.png,.jpg,.jpeg" onChange={handleFileUpload} className="hidden" />
                          </label>
                        </div>
                      </div>
                      
                      {resumeFile ? (
                        <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 border-2 border-dashed border-slate-200 rounded-[2rem] p-10 space-y-6">
                           <div className="w-24 h-24 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center shadow-inner">
                              <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                           </div>
                           <div className="text-center">
                              <p className="text-xl font-black text-slate-900">{resumeFile.name}</p>
                              <p className="text-slate-400 font-bold uppercase tracking-widest text-xs mt-2">Locked for Analysis</p>
                           </div>
                        </div>
                      ) : (
                        <textarea
                          value={resumeText}
                          onChange={(e) => setResumeText(e.target.value)}
                          placeholder="Paste your existing resume content here if you don't have a file..."
                          className="flex-1 w-full min-h-[350px] p-8 rounded-[2rem] border border-slate-200 bg-slate-50 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium text-slate-700 placeholder:text-slate-300 resize-none leading-relaxed"
                        />
                      )}
                    </section>

                    <section className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-200 flex flex-col h-full">
                      <h3 className="text-2xl font-black text-slate-900 flex items-center gap-4 mb-8">
                        <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center">
                          <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                        </div>
                        Job Description
                      </h3>
                      <textarea
                        value={jobDescription}
                        onChange={(e) => setJobDescription(e.target.value)}
                        placeholder="Paste the full JD requirements here to optimize against..."
                        className="flex-1 w-full min-h-[350px] p-8 rounded-[2rem] border border-slate-200 bg-slate-50 focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-medium text-slate-700 placeholder:text-slate-300 resize-none leading-relaxed"
                      />
                    </section>

                    <div className="lg:col-span-2 flex flex-col items-center py-10">
                      {error && (
                        <div className="mb-8 p-5 bg-rose-50 text-rose-600 rounded-2xl border border-rose-100 flex items-center gap-3 font-bold animate-bounce">
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                          {error}
                        </div>
                      )}
                      <button
                        onClick={handleAnalyze}
                        disabled={isAnalyzing}
                        className="group relative px-24 py-6 bg-slate-900 text-white rounded-[2.5rem] font-black text-xl tracking-tight shadow-2xl hover:shadow-blue-500/20 hover:scale-105 active:scale-95 transition-all flex items-center gap-4 disabled:opacity-50"
                      >
                        Launch AI Optimization
                        <svg className="w-6 h-6 text-blue-400 group-hover:translate-x-2 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                        </svg>
                      </button>
                    </div>
                 </div>
              </div>
            )}

            {view === 'results' && result && (
              <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
                <div className="flex items-center justify-between">
                   <button onClick={() => setView('dashboard')} className="flex items-center gap-4 text-slate-500 hover:text-slate-900 font-black transition-all group">
                      <div className="p-4 bg-white border border-slate-200 rounded-2xl group-hover:bg-slate-100 transition-all">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                      </div>
                      Exit to Dashboard
                   </button>
                   <div className="flex gap-4">
                     <button onClick={() => downloadAsTxt(result.coverLetter, 'Cover_Letter_Draft')} className="px-6 py-4 bg-white border border-slate-200 rounded-2xl text-sm font-black hover:bg-slate-50 transition-all shadow-sm">
                        Export Results
                     </button>
                   </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                  <div className="lg:col-span-1 bg-white p-12 rounded-[3.5rem] shadow-sm border border-slate-200 flex flex-col items-center text-center">
                    <ScoreGauge score={result.matchScore} />
                    <h4 className="mt-10 text-2xl font-black text-slate-900">Compatibility Verdict</h4>
                    <p className="mt-4 text-slate-500 font-medium leading-relaxed italic text-lg px-4">
                      "{result.matchReasoning}"
                    </p>
                  </div>

                  <div className="lg:col-span-2 space-y-10">
                    <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-200 h-full">
                      <h3 className="text-2xl font-black mb-8 flex items-center gap-4 text-slate-900">
                        <span className="w-4 h-10 bg-rose-500 rounded-full"></span>
                        Skill Gap Analysis
                      </h3>
                      <div className="flex flex-wrap gap-4">
                        {result.missingSkills.map((gap, i) => (
                          <div 
                            key={i} 
                            className={`px-8 py-4 rounded-2xl font-black border-2 transition-all hover:scale-105 ${
                              gap.importance === 'High' 
                                ? 'bg-rose-50 text-rose-700 border-rose-100' 
                                : 'bg-amber-50 text-amber-700 border-amber-100'
                            }`}
                          >
                            {gap.skill}
                            <span className="block text-[10px] uppercase opacity-50 tracking-widest mt-1">Priority: {gap.importance}</span>
                          </div>
                        ))}
                      </div>
                      
                      <div className="mt-12 pt-10 border-t border-slate-100">
                        <h3 className="text-xl font-black mb-6 flex items-center gap-4 text-slate-900">
                          <span className="w-4 h-8 bg-emerald-500 rounded-full"></span>
                          Recommended Additions
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {result.suggestedAdditions.map((item, i) => (
                            <div key={i} className="flex gap-4 p-5 bg-slate-50 rounded-[1.5rem] border border-slate-100 group hover:bg-white hover:shadow-md transition-all">
                              <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                                <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                                </svg>
                              </div>
                              <p className="text-slate-700 font-bold text-base">{item}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white p-12 rounded-[4rem] shadow-sm border border-slate-200">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
                    <h3 className="text-3xl font-black flex items-center gap-6 text-slate-900">
                      <div className="p-5 bg-blue-50 rounded-[2rem]">
                        <svg className="w-10 h-10 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                      </div>
                      ATS-Optimized Achievements
                    </h3>
                  </div>
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-10">
                    {result.optimizedBullets.map((bullet, i) => (
                      <div key={i} className="group p-10 rounded-[3rem] bg-slate-50 border border-slate-100 hover:border-blue-200 hover:bg-white transition-all shadow-sm hover:shadow-2xl">
                        <div className="mb-6 opacity-40 group-hover:opacity-100 transition-opacity">
                          <span className="text-[10px] uppercase tracking-widest font-black text-slate-500">Original Formulation</span>
                          <p className="text-slate-600 italic text-sm mt-3 leading-relaxed">{bullet.original}</p>
                        </div>
                        <div className="mb-8">
                          <span className="text-[10px] uppercase tracking-widest font-black text-blue-600">Gemini Enhancement</span>
                          <div className="flex items-start gap-6 mt-3">
                            <p className="text-slate-900 font-black text-xl leading-relaxed flex-1">{bullet.optimized}</p>
                            <button 
                              onClick={() => copyToClipboard(bullet.optimized)}
                              className="p-4 bg-white border border-slate-200 rounded-2xl hover:bg-blue-600 hover:text-white transition-all shadow-sm group-hover:scale-110"
                            >
                              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                              </svg>
                            </button>
                          </div>
                        </div>
                        <div className="pt-8 border-t border-slate-100">
                           <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Strategy & Context</p>
                           <p className="text-sm text-slate-500 font-medium leading-relaxed">{bullet.explanation}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-slate-900 p-12 rounded-[4rem] shadow-2xl text-white relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-600/10 blur-[120px] rounded-full -mr-64 -mt-64"></div>
                  <div className="relative z-10">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 mb-12">
                      <h3 className="text-4xl font-black flex items-center gap-6">
                        <div className="p-5 bg-white/10 backdrop-blur-md rounded-[2rem] border border-white/10">
                          <svg className="w-10 h-10 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 19v-8.93a2 2 0 01.89-1.664l7-4.666a2 2 0 012.22 0l7 4.666A2 2 0 0121 10.07V19M3 19a2 2 0 002 2h14a2 2 0 002-2M3 19l6.75-4.5M21 19l-6.75-4.5M3 10l6.75 4.5M21 10l-6.75 4.5m0 0l-1.14.76a2 2 0 01-2.22 0l-1.14-.76" />
                          </svg>
                        </div>
                        Engineered Pitch
                      </h3>
                      <div className="flex gap-4">
                        <button 
                          onClick={() => copyToClipboard(result.coverLetter)}
                          className="px-10 py-5 bg-white text-slate-900 hover:bg-blue-50 rounded-2xl text-base font-black transition-all flex items-center gap-3 active:scale-95 shadow-xl"
                        >
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                          </svg>
                          Copy Letter
                        </button>
                      </div>
                    </div>
                    <div className="bg-white/5 p-12 rounded-[3rem] border border-white/10 backdrop-blur-md">
                      <div className="whitespace-pre-wrap font-serif text-2xl leading-[1.8] text-slate-200 selection:bg-blue-500/30">
                        {result.coverLetter}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      <footer className="py-12 text-center border-t border-slate-200 bg-white">
        <p className="text-slate-400 text-xs font-black uppercase tracking-[0.4em]">
          © {new Date().getFullYear()} ElevateAI Platform • Enterprise Intelligence Driven
        </p>
      </footer>
    </div>
  );
};

export default App;
