import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

// =====================================================================
// SUPABASE FRONTEND INITIALIZATION
// =====================================================================
const supabaseUrl = "https://cvpvzokzjnacssqpvpui.supabase.co"; 
const supabaseAnonKey = "sb_publishable_a-eV7sQphAO09CbmENi6iQ_aF1rMKlu"; 

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// =====================================================================
// DYNAMIC LOCALHOST / PRODUCTION ENVIRONMENT SWITCH
// =====================================================================
const IS_LOCAL = true; // Set to false when you deploy live to PythonAnywhere

const BACKEND_URL = IS_LOCAL 
  ? "http://127.0.0.1:5000" 
  : "https://ahmadsubhani.pythonanywhere.com"; 

const PRODUCTION_SITE_URL = "https://ahmadsubhani.pythonanywhere.com";

function App() {
  // Auth & Session States
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  // Navigation State ('workspace' | 'history')
  const [currentView, setCurrentView] = useState('workspace');

  // Summarizer States
  const [url, setUrl] = useState('');
  const [summaryMode, setSummaryMode] = useState(null); 
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState('');
  const [summarizerError, setSummarizerError] = useState('');

  // Conversational Chat States
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);
  const messagesEndRef = useRef(null);

  // History States
  const [historyItems, setHistoryItems] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // ==========================================
  // FIX: Track active database log ID
  // ==========================================
  const [currentHistoryId, setCurrentHistoryId] = useState(null);

  // Stripe Context Billing Notification Banners
  const [stripeNotification, setStripeNotification] = useState({ message: '', type: '' });

  // Auto-scroll chat box down when new text streams arrive
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (chatMessages.length > 0) {
      scrollToBottom();
    }
  }, [chatMessages]);

  // Token synchronization utility used by auth state monitors
  const sendTokenToBackend = async (accessToken) => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: accessToken }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Backend system authentication verification failed.');
      }
    } catch (err) {
      console.error("Background token sync failed:", err.message);
      setLoginError("Session verification paused. Retrying background sync...");
    }
  };

  // Fetch History from Backend
  const fetchHistory = async () => {
    if (!session?.access_token) return;
    setHistoryLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/history?uid=${user?.id}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      });
      const data = await response.json();
      if (response.ok) {
        setHistoryItems(data.history || []);
      } else {
        console.error("Failed to fetch history:", data.error);
      }
    } catch (err) {
      console.error("Error fetching history:", err);
    } finally {
      setHistoryLoading(false);
    }
  };

  // Fetch history whenever user toggles onto the history page view
  useEffect(() => {
    if (currentView === 'history' && user) {
      fetchHistory();
    }
  }, [currentView]);

  // Track Session Events & Monitor Stripe Redirection Callbacks
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setAuthLoading(false);
      
      if (session?.access_token) {
        sendTokenToBackend(session.access_token);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setAuthLoading(false);

      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session) {
        sendTokenToBackend(session.access_token);
      }
    });

    const queryParams = new URLSearchParams(window.location.search);
    const subscriptionStatus = queryParams.get('subscription');
    
    if (subscriptionStatus === 'success') {
      setStripeNotification({
        message: 'Subscription initialized! Welcome to Mini AI Premium.',
        type: 'success'
      });
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (subscriptionStatus === 'cancel') {
      setStripeNotification({
        message: 'Upgrade transaction cancelled. No modifications were recorded.',
        type: 'error'
      });
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    return () => subscription.unsubscribe();
  }, []);

  const handleUpgradeToPremium = async () => {
    if (!user) {
      setLoginError("Please sign in or enter your credentials above to upgrade to premium.");
      return;
    }

    try {
      const response = await fetch(`${BACKEND_URL}/api/create-checkout-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: user.id,
          email: user.email
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to initialize payment gateway.');
      }

      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      setSummarizerError(`Stripe Integration Error: ${err.message}`);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      
      if (error && (error.message.includes("Invalid login credentials") || error.status === 400)) {
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({ email, password });
        
        if (signUpError) throw signUpError;
        
        if (!signUpData?.session) {
          alert("Account created successfully! Please check your email inbox (and spam folder) for the verification link before logging in.");
          setPassword('');
        }
        return;
      }

      if (error) throw error;
    } catch (err) {
      setLoginError(err.message || 'Authentication operation failed.');
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setLoginError('Please enter your email address first in the input field below.');
      return;
    }
    setLoginError('');
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: PRODUCTION_SITE_URL,
      });
      if (error) throw error;
      alert('A security password reset link has been dispatched to your email address via Supabase.');
    } catch (err) {
      setLoginError(err.message);
    }
  };

  const handleSocialLogin = async (providerName) => {
    setLoginError('');
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: providerName,
        options: {
          redirectTo: PRODUCTION_SITE_URL,
        }
      });
      if (error) throw error;
    } catch (err) {
      setLoginError(err.message);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setEmail('');
    setPassword('');
    setSummary('');
    setUrl('');
    setChatMessages([]);
    setChatInput('');
    setLoginError('');
    setSummarizerError('');
    setCurrentView('workspace');
    setCurrentHistoryId(null);
    setStripeNotification({ message: '', type: '' });
  };

  const handleOptionClick = (mode) => {
    if (summaryMode === mode) {
      setSummaryMode(null); 
    } else {
      setSummaryMode(mode); 
    }
  };

  // --- Click Handler for Historic Card Selection ---
  const handleSelectHistoryItem = (item) => {
    setSummary(item.summary_text);
    setUrl(item.url);
    setChatMessages([]);
    setCurrentHistoryId(item.id); // Captures historic row ID context
    setCurrentView('workspace'); // Send user back to workspace containing chat engine
  };

  const handleSummarize = async (e) => {
    e.preventDefault();
    setLoading(true);
    setSummarizerError('');
    setSummary('');
    setChatMessages([]); 
    setCurrentHistoryId(null); 

    try {
      const currentToken = session?.access_token;
      const uid = user?.id; 

      const response = await fetch(`${BACKEND_URL}/api/summarize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentToken}`
        },
        body: JSON.stringify({ 
          url: url,
          uid: uid,
          mode: summaryMode 
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Server error processing page request.');
      }

      setSummary(data.summary);
      // ==========================================
      // FIX: Save backend log row tracking ID
      // ==========================================
      setCurrentHistoryId(data.id); 
    } catch (err) {
      setSummarizerError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Conversational API Request Pipeline
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!chatInput.trim() || chatLoading) return;

    // Guard verifying valid active record tracker exists
    if (!currentHistoryId) {
      setSummarizerError("Chat Link Error: No log target available. Please run summary initialization first.");
      return;
    }

    const userMessageText = chatInput.trim();
    setChatInput('');

    // Append user message local bubble state
    const currentThread = [...chatMessages, { role: 'user', content: userMessageText }];
    setChatMessages(currentThread);
    setChatLoading(true);

    try {
      const response = await fetch(`${BACKEND_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        // ==========================================
        // FIX: Match payload variables to backend keys
        // ==========================================
        body: JSON.stringify({
          history_id: currentHistoryId, 
          question: userMessageText     
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to generate dynamic chat insight response.");
      }

      // ==========================================
      // FIX: Read data.answer from backend response
      // ==========================================
      setChatMessages([...currentThread, { role: 'model', content: data.answer }]);
    } catch (err) {
      setSummarizerError(`Chat Link Error: ${err.message}`);
    } finally {
      setChatLoading(false);
    }
  };

  // =====================================================================
  // COMPLETE INTERFACE AND STYLE MARKUP
  // =====================================================================
  if (authLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#030712', color: '#9CA3AF' }}>
        <p style={{ fontFamily: 'system-ui, sans-serif', fontSize: '16px', letterSpacing: '0.5px' }}>Loading Secure Session...</p>
      </div>
    );
  }

  return (
    <div style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      flexDirection: 'column',
      alignItems: 'center', 
      backgroundColor: '#020205', 
      backgroundImage: 'radial-gradient(rgba(255, 255, 255, 0.04) 1px, transparent 1px)',
      backgroundSize: '24px 24px',
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      color: '#F3F4F6',
      margin: 0,
      padding: '0 20px 60px 20px',
      boxSizing: 'border-box',
      overflowX: 'hidden',
      position: 'relative'
    }}>
      
      {/* Dynamic Background Effects */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '100%', minHeight: '800px', pointerEvents: 'none', zIndex: 1 }}>
        <div style={{
          position: 'absolute',
          top: '12%',
          left: '-15%',
          width: '55vw',
          height: '450px',
          background: 'linear-gradient(135deg, #06B6D4 0%, #3B82F6 100%)',
          borderRadius: '50%',
          filter: 'blur(130px)',
          opacity: 0.18,
          transform: 'rotate(-10deg)'
        }} />
        
        <div style={{
          position: 'absolute',
          top: '18%',
          right: '-20%',
          width: '65vw',
          height: '500px',
          background: 'linear-gradient(135deg, #8B5CF6 0%, #EC4899 100%)',
          borderRadius: '40% 60% 60% 40%',
          filter: 'blur(150px)',
          opacity: 0.20,
          transform: 'rotate(15deg)'
        }} />
      </div>
      
      {/* Top Navbar Header */}
      <header style={{ width: '100%', maxWidth: '1100px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '24px 0', marginBottom: '40px', zIndex: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }} onClick={() => user && setCurrentView('workspace')}>
          <span style={{ fontSize: '22px', fontWeight: '800', letterSpacing: '-0.5px', color: '#FFF' }}>Mini AI</span>
          <span style={{ fontSize: '11px', background: 'rgba(255, 255, 255, 0.08)', border: '1px solid rgba(255, 255, 255, 0.1)', padding: '2px 8px', borderRadius: '20px', color: '#A78BFA', fontWeight: '600', textTransform: 'uppercase' }}>
            {IS_LOCAL ? 'Local' : 'Beta'}
          </span>
        </div>
        
        {/* Actions Layout */}
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button 
            onClick={handleUpgradeToPremium}
            style={{
              padding: '8px 16px',
              background: 'linear-gradient(135deg, #8B5CF6 0%, #6366F1 100%)',
              color: '#fff',
              border: 'none',
              borderRadius: '20px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: '600',
              boxShadow: '0 4px 15px rgba(139, 92, 246, 0.25)'
            }}
          >
            Upgrade to Premium ✨
          </button>
          {user && (
            <button onClick={handleLogout} style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.05)', color: '#D1D5DB', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '20px', cursor: 'pointer', fontSize: '13px', fontWeight: '500', transition: 'all 0.2s' }}>
              Logout
            </button>
          )}
        </div>
      </header>

      {/* Hero Typography Section */}
      <div style={{ textAlign: 'center', maxWidth: '750px', marginBottom: '45px', marginTop: '10px', zIndex: 2 }}>
        <h1 style={{ fontSize: 'clamp(36px, 5vw, 56px)', fontWeight: '800', letterSpacing: '-1.5px', margin: '0 0 16px 0', color: '#FFF', lineHeight: '1.1' }}>
          {currentView === 'history' ? 'Your Intelligence' : 'Summarize at the'} <br />
          <span style={{ background: 'linear-gradient(135deg, #A78BFA 0%, #6366F1 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            {currentView === 'history' ? 'Archive History' : 'speed of AI'}
          </span>
        </h1>
        <p style={{ color: '#9CA3AF', fontSize: 'clamp(15px, 2vw, 18px)', margin: 0, fontWeight: '400', lineHeight: '1.5', maxWidth: '520px', marginLeft: 'auto', marginRight: 'auto' }}>
          {currentView === 'history' ? 'Browse through your previously analyzed web pipelines and generated records.' : 'Transform complex web content into refined insights, then ask contextual questions directly.'}
        </p>
      </div>

      {/* Main Container Core */}
      <div style={{ width: '100%', maxWidth: currentView === 'history' ? '800px' : '640px', zIndex: 2 }}>
        
        {!user ? (
          /* Glassmorphism Auth Panel */
          <div style={{ 
            padding: '40px 35px', 
            borderRadius: '24px', 
            background: 'rgba(10, 11, 18, 0.75)', 
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.08)', 
            boxShadow: '0 20px 50px -12px rgba(0, 0, 0, 0.6)' 
          }}>
            <h2 style={{ margin: '0 0 6px 0', color: '#fff', fontWeight: '700', fontSize: '24px', letterSpacing: '-0.5px' }}>Welcome Portal</h2>
            <p style={{ color: '#9CA3AF', fontSize: '14px', margin: '0 0 28px 0' }}>Sign in or register directly below to access</p>
            
            {loginError && (
              <div style={{ color: '#F87171', padding: '12px 16px', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.15)', borderRadius: '10px', marginBottom: '20px', fontSize: '13px', lineHeight: '1.4' }}>
                {loginError}
              </div>
            )}

            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '500', color: '#9CA3AF' }}>Email Address</label>
                <input
                  type="email"
                  placeholder="name@domain.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  style={{ padding: '13px 16px', borderRadius: '10px', background: 'rgba(31, 41, 55, 0.4)', border: '1px solid rgba(255, 255, 255, 0.08)', color: '#fff', outline: 'none', fontSize: '14px' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: '13px', fontWeight: '500', color: '#9CA3AF' }}>Password</label>
                  <span 
                    onClick={handleForgotPassword}
                    style={{ fontSize: '12px', color: '#A78BFA', cursor: 'pointer', fontWeight: '500' }}
                  >
                    Forgot Password?
                  </span>
                </div>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  style={{ padding: '13px 16px', borderRadius: '10px', background: 'rgba(31, 41, 55, 0.4)', border: '1px solid rgba(255, 255, 255, 0.08)', color: '#fff', outline: 'none', fontSize: '14px' }}
                />
              </div>

              <button type="submit" style={{ 
                padding: '14px', 
                background: '#FFF', 
                color: '#030712', 
                border: 'none', 
                borderRadius: '10px', 
                cursor: 'pointer', 
                fontWeight: '600',
                fontSize: '15px',
                marginTop: '8px',
                boxShadow: '0 4px 12px rgba(255, 255, 255, 0.1)'
              }}>
                Sign In / Sign Up
              </button>
            </form>

            <div style={{ display: 'flex', alignItems: 'center', margin: '24px 0' }}>
              <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.06)' }}></div>
              <span style={{ padding: '0 12px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', color: '#4B5563', fontWeight: '600' }}>Implicit Sync</span>
              <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.06)' }}></div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button onClick={() => handleSocialLogin('google')} style={{ 
                padding: '13px', 
                background: 'rgba(255, 255, 255, 0.08)', 
                color: '#FFF', 
                border: '1px solid rgba(255, 255, 255, 0.14)', 
                borderRadius: '10px', 
                cursor: 'pointer', 
                fontWeight: '600', 
                fontSize: '14px', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                gap: '10px',
                transition: 'background 0.2s, border 0.2s',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12.24 10.285V13.4h6.887c-.275 1.565-1.88 4.604-6.887 4.604-4.33 0-7.866-3.577-7.866-8s3.536-8 7.866-8c2.46 0 4.105 1.025 5.047 1.926l2.427-2.334C17.955 2.192 15.34 1 12.24 1c-6.075 0-11 4.925-11 11s4.925 11 11 11c6.34 0 10.56-4.44 10.56-10.75 0-.725-.075-1.275-.165-1.665H12.24z"/></svg>
                Continue with Google
              </button>
            </div>
          </div>
        ) : (
          /* Logged In Modules Dynamic View Switch */
          <div style={{ 
            padding: '35px', 
            borderRadius: '24px', 
            background: 'rgba(10, 11, 20, 0.75)', 
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            border: '1px solid rgba(255, 255, 255, 0.06)', 
            boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.6)' 
          }}>
            
            {stripeNotification.message && (
              <div style={{ 
                color: stripeNotification.type === 'success' ? '#34D399' : '#F87171', 
                padding: '12px 16px', 
                background: stripeNotification.type === 'success' ? 'rgba(52, 211, 153, 0.08)' : 'rgba(239, 68, 68, 0.08)', 
                border: stripeNotification.type === 'success' ? '1px solid rgba(52, 211, 153, 0.15)' : '1px solid rgba(239, 68, 68, 0.15)', 
                borderRadius: '10px', 
                marginBottom: '24px', 
                fontSize: '13px',
                textAlign: 'center',
                fontWeight: '500'
              }}>
                {stripeNotification.message}
              </div>
            )}

            {/* Profile Bar with Navigational Tabs */}
            <div style={{ display: 'flex', justifyBetween: 'space-between', alignItems: 'center', marginBottom: '30px', background: 'rgba(255,255,255,0.02)', padding: '12px 20px', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.04)' }}>
              <div>
                <p style={{ margin: 0, fontSize: '11px', color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: '600' }}>Active Workspace</p>
                <p style={{ margin: '2px 0 0 0', fontSize: '13px', color: '#E5E7EB', fontWeight: '500' }}>{user.email}</p>
              </div>
              
              {/* Main View Controller Button Switch */}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button 
                  onClick={() => setCurrentView('workspace')} 
                  style={{
                    padding: '8px 14px',
                    fontSize: '12px',
                    fontWeight: '600',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    border: 'none',
                    background: currentView === 'workspace' ? '#FFF' : 'transparent',
                    color: currentView === 'workspace' ? '#020205' : '#9CA3AF',
                    transition: 'all 0.2s'
                  }}
                >
                  🚀 Summarizer
                </button>
                <button 
                  onClick={() => setCurrentView('history')} 
                  style={{
                    padding: '8px 14px',
                    fontSize: '12px',
                    fontWeight: '600',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    border: 'none',
                    background: currentView === 'history' ? '#FFF' : 'transparent',
                    color: currentView === 'history' ? '#020205' : '#9CA3AF',
                    transition: 'all 0.2s'
                  }}
                >
                  ⏳ History Logs
                </button>
              </div>
            </div>

            {/* VIEW A: SUMMARIZER WORKSPACE */}
            {currentView === 'workspace' && (
              <>
                <form onSubmit={handleSummarize} style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '25px' }}>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="url"
                      placeholder="Paste context link (https://...)"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      required
                      style={{ 
                        width: '100%',
                        padding: '16px 18px', 
                        borderRadius: '12px', 
                        background: 'rgba(15, 23, 42, 0.6)', 
                        border: '1px solid rgba(255, 255, 255, 0.08)', 
                        color: '#fff', 
                        outline: 'none', 
                        fontSize: '14px',
                        boxSizing: 'border-box',
                        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)'
                      }}
                    />
                  </div>

                  {/* Mode Selection Options Panel */}
                  <div style={{ display: 'flex', gap: '8px', background: 'rgba(0, 0, 0, 0.2)', padding: '5px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.03)' }}>
                    <button
                      type="button"
                      onClick={() => handleOptionClick('bullets')}
                      style={{
                        flex: 1,
                        padding: '10px 4px',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: '600',
                        cursor: 'pointer',
                        border: 'none',
                        background: summaryMode === 'bullets' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                        color: summaryMode === 'bullets' ? '#C084FC' : '#9CA3AF',
                        boxShadow: summaryMode === 'bullets' ? '0 2px 8px rgba(0,0,0,0.2)' : 'none',
                        transition: 'all 0.2s'
                      }}
                    >
                      📌 Bullets
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOptionClick('detailed')}
                      style={{
                        flex: 1,
                        padding: '10px 4px',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: '600',
                        cursor: 'pointer',
                        border: 'none',
                        background: summaryMode === 'detailed' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                        color: summaryMode === 'detailed' ? '#C084FC' : '#9CA3AF',
                        boxShadow: summaryMode === 'detailed' ? '0 2px 8px rgba(0,0,0,0.2)' : 'none',
                        transition: 'all 0.2s'
                      }}
                    >
                      📝 Essay
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOptionClick('key_takeaways')}
                      style={{
                        flex: 1,
                        padding: '10px 4px',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: '600',
                        cursor: 'pointer',
                        border: 'none',
                        background: summaryMode === 'key_takeaways' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                        color: summaryMode === 'key_takeaways' ? '#C084FC' : '#9CA3AF',
                        boxShadow: summaryMode === 'key_takeaways' ? '0 2px 8px rgba(0,0,0,0.2)' : 'none',
                        transition: 'all 0.2s'
                      }}
                    >
                      ✨ Key Takeaways
                    </button>
                  </div>

                  <button type="submit" disabled={loading} style={{ 
                    padding: '15px', 
                    cursor: loading ? 'not-allowed' : 'pointer', 
                    background: loading ? 'rgba(255,255,255,0.03)' : '#FFF', 
                    color: loading ? '#6B7280' : '#030712', 
                    border: loading ? '1px solid rgba(255,255,255,0.05)' : 'none', 
                    borderRadius: '12px',
                    fontWeight: '600',
                    fontSize: '15px',
                    boxShadow: loading ? 'none' : '0 4px 20px rgba(255, 255, 255, 0.08)'
                  }}>
                    {loading ? 'Analyzing Content Pipeline...' : 'Generate Summary Intelligence'}
                  </button>
                </form>

                {summarizerError && (
                  <div style={{ color: '#F87171', padding: '12px 16px', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.15)', borderRadius: '10px', marginBottom: '20px', fontSize: '13px' }}>
                    {summarizerError}
                  </div>
                )}

                {/* Combined Summary Result & Interactive Chat Panel */}
                {summary && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', marginTop: '10px' }}>
                    
                    {/* Summary Card */}
                    <div style={{ 
                      padding: '24px', 
                      background: 'rgba(255, 255, 255, 0.02)', 
                      border: '1px solid rgba(255, 255, 255, 0.05)',
                      borderRadius: '14px', 
                      whiteSpace: 'pre-line' 
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '14px' }}>
                        <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#A78BFA' }}></div>
                        <h4 style={{ margin: 0, color: '#A78BFA', fontWeight: '600', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>AI Stream Results</h4>
                      </div>
                      <p style={{ margin: 0, color: '#E5E7EB', lineHeight: '1.6', fontSize: '14px' }}>{summary}</p>
                    </div>

                    {/* INTERACTIVE LINK CHAT COMPONENT */}
                    <div style={{ 
                      border: '1px solid rgba(255, 255, 255, 0.06)', 
                      borderRadius: '16px', 
                      background: 'rgba(0, 0, 0, 0.25)',
                      overflow: 'hidden'
                    }}>
                      {/* Chat Box Header */}
                      <div style={{ padding: '14px 20px', background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '14px' }}>💬</span>
                        <h4 style={{ margin: 0, fontSize: '13px', fontWeight: '600', color: '#FFF', letterSpacing: '0.3px' }}>Discuss This Context Page</h4>
                      </div>

                      {/* Chat Messages Scrolling Thread Container */}
                      <div style={{ 
                        padding: '20px', 
                        maxHeight: '300px', 
                        overflowY: 'auto', 
                        display: 'flex', 
                        flexDirection: 'column', 
                        gap: '14px',
                        background: 'rgba(0,0,0,0.1)'
                      }}>
                        {chatMessages.length === 0 && (
                          <p style={{ color: '#4B5563', fontSize: '13px', margin: 0, textAlign: 'center', padding: '10px 0' }}>
                            Ask anything about the page text or target domain insights above.
                          </p>
                        )}
                        
                        {chatMessages.map((msg, index) => (
                          <div 
                            key={index} 
                            style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}
                          >
                            <div style={{
                              maxWidth: '80%',
                              padding: '10px 14px',
                              borderRadius: '12px',
                              fontSize: '14px',
                              lineHeight: '1.4',
                              color: msg.role === 'user' ? '#000' : '#FFF',
                              background: msg.role === 'user' ? '#FFF' : 'rgba(255,255,255,0.06)',
                              border: msg.role === 'user' ? 'none' : '1px solid rgba(255,255,255,0.04)'
                            }}>
                              {msg.content}
                            </div>
                          </div>
                        ))}
                        <div ref={messagesEndRef} />
                      </div>

                      {/* Input Actions Tray */}
                      <form onSubmit={handleSendMessage} style={{ padding: '12px 16px', background: 'rgba(0,0,0,0.2)', borderTop: '1px solid rgba(255,255,255,0.04)', display: 'flex', gap: '10px' }}>
                        <input 
                          type="text"
                          value={chatInput}
                          onChange={(e) => setChatInput(e.target.value)}
                          placeholder={chatLoading ? "Agent thinking..." : "Ask context parameters..."}
                          disabled={chatLoading}
                          style={{ flex: 1, padding: '10px 14px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px', color: '#fff', outline: 'none', fontSize: '13px' }}
                        />
                        <button type="submit" disabled={chatLoading || !chatInput.trim()} style={{ padding: '0 16px', background: '#FFF', color: '#000', border: 'none', borderRadius: '10px', fontWeight: '600', fontSize: '13px', cursor: 'pointer', opacity: chatInput.trim() ? 1 : 0.5 }}>
                          Send
                        </button>
                      </form>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* VIEW B: HISTORICAL RECORDS ARCHIVE */}
            {currentView === 'history' && (
              <div>
                <h3 style={{ margin: '0 0 20px 0', fontSize: '18px', fontWeight: '700' }}>Logged Analysis Tracks</h3>
                {historyLoading ? (
                  <p style={{ color: '#9CA3AF', fontSize: '14px' }}>Loading historical databases...</p>
                ) : historyItems.length === 0 ? (
                  <p style={{ color: '#6B7280', fontSize: '14px' }}>No analysis history entries detected in this user timeline context.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {historyItems.map((item) => (
                      <div 
                        key={item.id}
                        onClick={() => handleSelectHistoryItem(item)}
                        style={{
                          padding: '16px 20px',
                          background: 'rgba(255,255,255,0.02)',
                          border: '1px solid rgba(255,255,255,0.05)',
                          borderRadius: '12px',
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                          <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: '#FFF' }}>
                            {item.title || "Untitled Summary Pipeline"}
                          </h4>
                          <span style={{ fontSize: '11px', color: '#6B7280' }}>
                            {item.created_at ? new Date(item.created_at).toLocaleDateString() : ''}
                          </span>
                        </div>
                        <p style={{ margin: '0 0 10px 0', fontSize: '12px', color: '#9CA3AF', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                          {item.url}
                        </p>
                        <p style={{ margin: 0, fontSize: '13px', color: '#D1D5DB', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: '1.4' }}>
                          {item.summary_text}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;