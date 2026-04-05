/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  User, 
  Users, 
  BookOpen, 
  Megaphone, 
  MessageSquare, 
  Plus, 
  ChevronRight, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Send, 
  Calendar,
  LogOut,
  Search,
  Filter,
  ArrowRight,
  ShieldCheck,
  Heart,
  Info,
  Copy,
  Sparkles,
  Globe,
  Facebook,
  Palette,
  Video
} from 'lucide-react';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut, 
  User as FirebaseUser 
} from 'firebase/auth';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc, 
  Timestamp,
  getDocs
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { cn } from './lib/utils';
import { format } from 'date-fns';
import { GoogleGenAI } from "@google/genai";
import Markdown from 'react-markdown';
import { motion, AnimatePresence } from 'motion/react';

// --- Types ---

type SalesStep = 'Lead Capture' | 'Nurture' | 'Pitch' | 'Objection Handling' | 'Closed Won' | 'Closed Lost';

interface Lead {
  id: string;
  name: string;
  contact: string;
  status: SalesStep;
  notes: string;
  assignedAgentId: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

interface Plan {
  id: string;
  name: string;
  type: 'Traditional' | 'Cremation';
  price: number;
  monthlyInstallment: number;
  benefits: string[];
  description: string;
}

// --- Constants ---

const ST_PETER_PLANS: Plan[] = [
  {
    id: 'st-anne',
    name: 'St. Anne',
    type: 'Traditional',
    price: 55000,
    monthlyInstallment: 950,
    benefits: ['Metal Casket', '4-Day Viewing', 'Embalming', 'Hearse Service'],
    description: 'Our most popular traditional plan for a dignified farewell.'
  },
  {
    id: 'st-bernadette',
    name: 'St. Bernadette',
    type: 'Traditional',
    price: 45000,
    monthlyInstallment: 780,
    benefits: ['Wood Casket', '3-Day Viewing', 'Embalming', 'Hearse Service'],
    description: 'Affordable traditional plan with essential services.'
  },
  {
    id: 'st-jude',
    name: 'St. Jude',
    type: 'Cremation',
    price: 65000,
    monthlyInstallment: 1100,
    benefits: ['Cremation Service', 'Marble Urn', 'Viewing (Optional)', 'Transport'],
    description: 'Modern cremation service with premium urn inclusions.'
  }
];

const WORKFLOW_STEPS: SalesStep[] = ['Lead Capture', 'Nurture', 'Pitch', 'Objection Handling', 'Closed Won'];

// --- Components ---

const Button = ({ 
  children, 
  className, 
  variant = 'primary', 
  ...props 
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }) => {
  const variants = {
    primary: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm',
    secondary: 'bg-white text-emerald-900 border border-emerald-200 hover:bg-emerald-50',
    ghost: 'bg-transparent text-emerald-700 hover:bg-emerald-50',
    danger: 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-100'
  };

  return (
    <button 
      className={cn(
        'px-4 py-2 rounded-lg font-medium transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2',
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
};

const Card = ({ children, className }: { children: React.ReactNode, className?: string }) => (
  <div className={cn('bg-white rounded-xl border border-emerald-100 shadow-sm overflow-hidden', className)}>
    {children}
  </div>
);

const Badge = ({ children, variant = 'default' }: { children: React.ReactNode, variant?: 'default' | 'success' | 'warning' | 'info' }) => {
  const variants = {
    default: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    success: 'bg-green-50 text-green-700 border-green-100',
    warning: 'bg-amber-50 text-amber-700 border-amber-100',
    info: 'bg-blue-50 text-blue-700 border-blue-100'
  };
  return (
    <span className={cn('px-2 py-0.5 rounded-full text-xs font-semibold border', variants[variant])}>
      {children}
    </span>
  );
};

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'crm' | 'knowledge' | 'marketing' | 'strategist' | 'integrations'>('crm');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddingLead, setIsAddingLead] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);

  // AI State
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'leads'),
      where('assignedAgentId', '==', user.uid),
      orderBy('updatedAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const leadData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Lead[];
      setLeads(leadData);
    }, (error) => {
      console.error("Firestore Error:", error);
    });

    return unsubscribe;
  }, [user]);

  const handleLogin = async () => {
    setLoginError(null);
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      console.error("Login Error:", error);
      if (error.code === 'auth/popup-closed-by-user') {
        setLoginError("The login popup was closed before completion. Please try again and keep the window open.");
      } else if (error.code === 'auth/popup-blocked') {
        setLoginError("The login popup was blocked by your browser. Please allow popups for this site.");
      } else if (error.code === 'auth/cancelled-popup-request') {
        // Ignore, another popup was opened
      } else {
        setLoginError("An unexpected error occurred during login. Please try again.");
      }
    }
  };

  const handleLogout = () => signOut(auth);

  const filteredLeads = useMemo(() => {
    return leads.filter(l => 
      l.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.contact.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [leads, searchQuery]);

  const addLead = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;

    const formData = new FormData(e.currentTarget);
    const newLead = {
      name: formData.get('name') as string,
      contact: formData.get('contact') as string,
      status: 'Lead Capture' as SalesStep,
      notes: formData.get('notes') as string || '',
      assignedAgentId: user.uid,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    };

    try {
      await addDoc(collection(db, 'leads'), newLead);
      setIsAddingLead(false);
    } catch (error) {
      console.error("Add Lead Error:", error);
    }
  };

  const updateLeadStatus = async (leadId: string, newStatus: SalesStep) => {
    try {
      await updateDoc(doc(db, 'leads', leadId), {
        status: newStatus,
        updatedAt: Timestamp.now()
      });
    } catch (error) {
      console.error("Update Status Error:", error);
    }
  };

  const generateMarketingCaption = async (topic: string) => {
    setAiLoading(true);
    setAiResponse(null);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Generate 3 emotionally resonant Facebook/Viber captions in Taglish for St. Peter Life Plan agents. 
        Topic: ${topic}. 
        Tone: Confident, empathetic, respectful, and dignified. 
        Focus: "Gift of Love" and "Peace of Mind". 
        Avoid scare tactics. 
        Include relevant emojis.`,
      });
      setAiResponse(response.text || "No response generated.");
    } catch (error) {
      console.error("AI Error:", error);
      setAiResponse("Error generating content. Please try again.");
    } finally {
      setAiLoading(false);
    }
  };

  const getSalesTip = async (objection: string) => {
    setAiLoading(true);
    setAiResponse(null);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `You are a top-earning St. Peter Life Plan Sales Strategist. 
        Provide a respectful, empathetic, and effective rebuttal for this objection: "${objection}". 
        Use the "Malasakit" tradition. Focus on budget constraints or death taboos. 
        Provide a script in Taglish.`,
      });
      setAiResponse(response.text || "No response generated.");
    } catch (error) {
      console.error("AI Error:", error);
      setAiResponse("Error generating content. Please try again.");
    } finally {
      setAiLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-emerald-50">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-emerald-800 font-medium">Initializing Digital Briefcase...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-emerald-50 flex flex-col items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full text-center"
        >
          <div className="bg-white p-8 rounded-2xl shadow-xl border border-emerald-100">
            <div className="w-20 h-20 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <ShieldCheck className="w-10 h-10 text-emerald-600" />
            </div>
            <h1 className="text-3xl font-bold text-emerald-900 mb-2">St. Peter</h1>
            <p className="text-emerald-600 font-medium mb-6">Digital Briefcase Platform OS</p>
            <p className="text-gray-600 mb-8">
              Empowering agents with the "Malasakit" tradition. Manage leads, access knowledge, and close sales with dignity.
            </p>
            
            {loginError && (
              <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3 text-left">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{loginError}</p>
              </div>
            )}

            <Button onClick={handleLogin} className="w-full py-4 text-lg">
              <User className="w-5 h-5" />
              Agent Login with Google
            </Button>
          </div>
          <p className="mt-8 text-emerald-700/60 text-sm">
            "Ang huling handog na puno ng pagmamahal."
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
      {/* Sidebar */}
      <aside className="w-full lg:w-64 bg-emerald-900 text-white lg:min-h-screen flex flex-col sticky top-0 z-50">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-emerald-600 rounded-lg flex items-center justify-center">
              <ShieldCheck className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-lg leading-tight">St. Peter</h1>
              <p className="text-emerald-400 text-xs font-medium uppercase tracking-wider">Digital Briefcase</p>
            </div>
          </div>

          <nav className="space-y-1">
            <button 
              onClick={() => setActiveTab('crm')}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all",
                activeTab === 'crm' ? "bg-emerald-800 text-white shadow-inner" : "text-emerald-300 hover:bg-emerald-800/50 hover:text-white"
              )}
            >
              <Users className="w-5 h-5" />
              <span className="font-medium">CRM Workflow</span>
            </button>
            <button 
              onClick={() => setActiveTab('knowledge')}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all",
                activeTab === 'knowledge' ? "bg-emerald-800 text-white shadow-inner" : "text-emerald-300 hover:bg-emerald-800/50 hover:text-white"
              )}
            >
              <BookOpen className="w-5 h-5" />
              <span className="font-medium">Knowledge Base</span>
            </button>
            <button 
              onClick={() => setActiveTab('marketing')}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all",
                activeTab === 'marketing' ? "bg-emerald-800 text-white shadow-inner" : "text-emerald-300 hover:bg-emerald-800/50 hover:text-white"
              )}
            >
              <Megaphone className="w-5 h-5" />
              <span className="font-medium">Marketing Copilot</span>
            </button>
            <button 
              onClick={() => setActiveTab('strategist')}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all",
                activeTab === 'strategist' ? "bg-emerald-800 text-white shadow-inner" : "text-emerald-300 hover:bg-emerald-800/50 hover:text-white"
              )}
            >
              <MessageSquare className="w-5 h-5" />
              <span className="font-medium">Sales Strategist</span>
            </button>
            <button 
              onClick={() => setActiveTab('integrations')}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all",
                activeTab === 'integrations' ? "bg-emerald-800 text-white shadow-inner" : "text-emerald-300 hover:bg-emerald-800/50 hover:text-white"
              )}
            >
              <Plus className="w-5 h-5" />
              <span className="font-medium">Apps & Links</span>
            </button>
          </nav>
        </div>

        <div className="mt-auto p-6 border-t border-emerald-800">
          <div className="flex items-center gap-3 mb-4">
            <img src={user.photoURL || ''} alt={user.displayName || ''} className="w-10 h-10 rounded-full border-2 border-emerald-700" />
            <div className="overflow-hidden">
              <p className="font-medium text-sm truncate">{user.displayName}</p>
              <p className="text-emerald-400 text-xs truncate">Verified Agent</p>
            </div>
          </div>
          <Button variant="ghost" onClick={handleLogout} className="w-full justify-start text-emerald-400 hover:text-white hover:bg-emerald-800">
            <LogOut className="w-4 h-4" />
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-4 lg:p-8 overflow-y-auto">
        <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">
              {activeTab === 'crm' && 'Lead Management Workflow'}
              {activeTab === 'knowledge' && 'St. Peter Knowledge Base'}
              {activeTab === 'marketing' && 'Marketing Copilot'}
              {activeTab === 'integrations' && 'Apps & Official Links'}
            </h2>
            <p className="text-slate-500">
              {activeTab === 'crm' && 'Track your journey from Lead Capture to Closed Won.'}
              {activeTab === 'knowledge' && 'Access plan details and pricing instantly.'}
              {activeTab === 'marketing' && 'Generate emotionally resonant Taglish captions.'}
              {activeTab === 'strategist' && 'Get expert rebuttals for tough objections.'}
              {activeTab === 'integrations' && 'Connect your favorite tools and access official St. Peter resources.'}
            </p>
          </div>
          
          {activeTab === 'crm' && (
            <Button onClick={() => setIsAddingLead(true)}>
              <Plus className="w-5 h-5" />
              New Lead Capture
            </Button>
          )}
        </header>

        <AnimatePresence mode="wait">
          {activeTab === 'crm' && (
            <motion.div 
              key="crm"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              {/* Search and Filter */}
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input 
                    type="text" 
                    placeholder="Search leads by name or contact..."
                    className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" className="sm:w-auto w-full">
                    <Filter className="w-4 h-4" />
                    Filter
                  </Button>
                </div>
              </div>

              {/* Lead Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {filteredLeads.length > 0 ? (
                  filteredLeads.map((lead) => (
                    <Card key={lead.id} className="group hover:border-emerald-300 transition-all">
                      <div className="p-5">
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <h3 className="font-bold text-lg text-slate-800">{lead.name}</h3>
                            <p className="text-slate-500 text-sm flex items-center gap-1">
                              <Megaphone className="w-3 h-3" />
                              {lead.contact}
                            </p>
                          </div>
                          <Badge variant={lead.status === 'Closed Won' ? 'success' : lead.status === 'Closed Lost' ? 'warning' : 'default'}>
                            {lead.status}
                          </Badge>
                        </div>

                        <div className="space-y-3 mb-6">
                          <div className="flex items-center gap-2 text-xs text-slate-400">
                            <Clock className="w-3 h-3" />
                            Updated {format(lead.updatedAt.toDate(), 'MMM d, h:mm a')}
                          </div>
                          {lead.notes && (
                            <p className="text-sm text-slate-600 line-clamp-2 italic">
                              "{lead.notes}"
                            </p>
                          )}
                        </div>

                        <div className="flex flex-col gap-2">
                          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Next Step</p>
                          <div className="flex gap-2">
                            {lead.status !== 'Closed Won' && lead.status !== 'Closed Lost' && (
                              <Button 
                                variant="primary" 
                                className="flex-1 text-xs py-2"
                                onClick={() => {
                                  const currentIndex = WORKFLOW_STEPS.indexOf(lead.status);
                                  if (currentIndex < WORKFLOW_STEPS.length - 1) {
                                    updateLeadStatus(lead.id, WORKFLOW_STEPS[currentIndex + 1]);
                                  }
                                }}
                              >
                                Advance to {WORKFLOW_STEPS[WORKFLOW_STEPS.indexOf(lead.status) + 1]}
                                <ChevronRight className="w-4 h-4" />
                              </Button>
                            )}
                            <Button variant="secondary" className="text-xs py-2" onClick={() => setSelectedLead(lead)}>
                              Details
                            </Button>
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))
                ) : (
                  <div className="col-span-full py-20 text-center">
                    <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Users className="w-10 h-10 text-slate-300" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-800 mb-2">No leads found</h3>
                    <p className="text-slate-500">Start your 5-Step Sales Workflow by capturing a new lead.</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'knowledge' && (
            <motion.div 
              key="knowledge"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {ST_PETER_PLANS.map((plan) => (
                  <Card key={plan.id} className="flex flex-col border-emerald-200">
                    <div className="p-6 bg-emerald-50 border-b border-emerald-100">
                      <Badge variant="info">{plan.type}</Badge>
                      <h3 className="text-2xl font-bold text-emerald-900 mt-2">{plan.name}</h3>
                      <p className="text-emerald-700 text-sm mt-1">{plan.description}</p>
                    </div>
                    <div className="p-6 flex-1 space-y-6">
                      <div>
                        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-1">Total Contract Price</p>
                        <p className="text-3xl font-bold text-slate-800">₱{plan.price.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-1">Monthly (5 Years)</p>
                        <p className="text-xl font-bold text-emerald-600">₱{plan.monthlyInstallment.toLocaleString()}</p>
                      </div>
                      <div className="space-y-2">
                        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Plan Benefits</p>
                        <ul className="space-y-2">
                          {plan.benefits.map((benefit, i) => (
                            <li key={i} className="flex items-center gap-2 text-sm text-slate-600">
                              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                              {benefit}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                    <div className="p-6 bg-slate-50 border-t border-slate-100">
                      <Button variant="primary" className="w-full">
                        Generate Quote PDF
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>

              <Card className="bg-emerald-900 text-white p-8">
                <div className="flex flex-col md:flex-row items-center gap-8">
                  <div className="flex-1">
                    <h3 className="text-2xl font-bold mb-4">Need a Custom Comparison?</h3>
                    <p className="text-emerald-200 mb-6">
                      Generate a side-by-side comparison for your client to help them choose the best "Gift of Love" for their family.
                    </p>
                    <Button variant="secondary" className="bg-white text-emerald-900 border-none">
                      Compare All Plans
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="w-full md:w-64 h-40 bg-emerald-800 rounded-xl flex items-center justify-center border border-emerald-700">
                    <BookOpen className="w-16 h-16 text-emerald-600 opacity-50" />
                  </div>
                </div>
              </Card>
            </motion.div>
          )}

          {activeTab === 'marketing' && (
            <motion.div 
              key="marketing"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="max-w-4xl mx-auto space-y-8"
            >
              <Card className="p-8">
                <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
                  <Sparkles className="w-6 h-6 text-amber-500" />
                  AI Caption Generator
                </h3>
                <div className="space-y-4">
                  <p className="text-slate-600">What is the focus of your marketing post today?</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {['Peace of Mind', 'Family Love', 'Financial Planning', 'Gift of Love'].map((topic) => (
                      <button 
                        key={topic}
                        onClick={() => generateMarketingCaption(topic)}
                        className="px-4 py-3 rounded-xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50 text-slate-700 font-medium transition-all text-sm text-center"
                      >
                        {topic}
                      </button>
                    ))}
                  </div>
                  <div className="relative">
                    <input 
                      type="text" 
                      placeholder="Or type a custom topic (e.g., Mother's Day special)..."
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') generateMarketingCaption(e.currentTarget.value);
                      }}
                    />
                    <Button 
                      className="absolute right-2 top-1/2 -translate-y-1/2 py-1.5 px-3"
                      onClick={(e) => {
                        const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                        generateMarketingCaption(input.value);
                      }}
                    >
                      Generate
                    </Button>
                  </div>
                </div>
              </Card>

              {aiLoading && (
                <div className="py-12 text-center">
                  <div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                  <p className="text-emerald-700 font-medium">Crafting emotionally resonant captions...</p>
                </div>
              )}

              {aiResponse && !aiLoading && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                  <Card className="p-8 bg-emerald-50 border-emerald-200">
                    <div className="flex justify-between items-center mb-6">
                      <h4 className="font-bold text-emerald-900 flex items-center gap-2">
                        <Megaphone className="w-5 h-5" />
                        Generated Captions (Taglish)
                      </h4>
                      <Button variant="ghost" onClick={() => {
                        navigator.clipboard.writeText(aiResponse || '');
                      }}>
                        <Copy className="w-4 h-4" />
                        Copy All
                      </Button>
                    </div>
                    <div className="prose prose-emerald max-w-none text-emerald-900">
                      <Markdown>{aiResponse}</Markdown>
                    </div>
                  </Card>
                </motion.div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="p-6">
                  <div className="w-full aspect-video bg-slate-100 rounded-lg mb-4 flex items-center justify-center">
                    <Heart className="w-12 h-12 text-slate-300" />
                  </div>
                  <h4 className="font-bold mb-2">Template: Peace of Mind</h4>
                  <p className="text-sm text-slate-500 mb-4">Visual of a happy family at a park. Focus on security.</p>
                  <Button variant="secondary" className="w-full">Download Asset</Button>
                </Card>
                <Card className="p-6">
                  <div className="w-full aspect-video bg-slate-100 rounded-lg mb-4 flex items-center justify-center">
                    <ShieldCheck className="w-12 h-12 text-slate-300" />
                  </div>
                  <h4 className="font-bold mb-2">Template: Financial Planning</h4>
                  <p className="text-sm text-slate-500 mb-4">Clean graphic showing monthly savings vs plan cost.</p>
                  <Button variant="secondary" className="w-full">Download Asset</Button>
                </Card>
              </div>
            </motion.div>
          )}

          {activeTab === 'strategist' && (
            <motion.div 
              key="strategist"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="max-w-4xl mx-auto space-y-8"
            >
              <Card className="p-8 border-l-4 border-l-amber-500">
                <div className="flex gap-6">
                  <div className="hidden md:flex w-16 h-16 bg-amber-100 rounded-full items-center justify-center flex-shrink-0">
                    <MessageSquare className="w-8 h-8 text-amber-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-slate-800 mb-2">Objection Handling Coach</h3>
                    <p className="text-slate-600 mb-6">
                      Encountered a tough client? Tell me their objection, and I'll give you a respectful, "Malasakit"-focused rebuttal used by top earners.
                    </p>
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {[
                          "Bata pa naman ako, hindi ko pa kailangan.",
                          "Wala kaming budget ngayon.",
                          "Malas pag-usapan ang kamatayan.",
                          "Pag-iisipan ko muna."
                        ].map((obj) => (
                          <button 
                            key={obj}
                            onClick={() => getSalesTip(obj)}
                            className="text-left px-4 py-3 rounded-xl border border-slate-200 hover:border-amber-500 hover:bg-amber-50 text-slate-700 text-sm transition-all"
                          >
                            "{obj}"
                          </button>
                        ))}
                      </div>
                      <div className="relative">
                        <textarea 
                          placeholder="Type a specific objection here..."
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-amber-500 outline-none min-h-[100px]"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              getSalesTip(e.currentTarget.value);
                            }
                          }}
                        />
                        <Button 
                          className="absolute right-3 bottom-3 bg-amber-600 hover:bg-amber-700"
                          onClick={(e) => {
                            const textarea = e.currentTarget.previousElementSibling as HTMLTextAreaElement;
                            getSalesTip(textarea.value);
                          }}
                        >
                          Ask Coach
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>

              {aiLoading && (
                <div className="py-12 text-center">
                  <div className="w-12 h-12 border-4 border-amber-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                  <p className="text-amber-700 font-medium">Consulting top-earner strategies...</p>
                </div>
              )}

              {aiResponse && !aiLoading && (
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
                  <Card className="p-8 bg-amber-50 border-amber-200 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-10">
                      <MessageSquare className="w-24 h-24 text-amber-900" />
                    </div>
                    <h4 className="font-bold text-amber-900 mb-4 flex items-center gap-2">
                      <ShieldCheck className="w-5 h-5" />
                      Recommended Rebuttal (Taglish)
                    </h4>
                    <div className="prose prose-amber max-w-none text-amber-900 relative z-10">
                      <Markdown>{aiResponse}</Markdown>
                    </div>
                    <div className="mt-8 pt-6 border-t border-amber-200 flex items-center gap-4 text-sm text-amber-800 italic">
                      <Info className="w-4 h-4 flex-shrink-0" />
                      Remember: Always maintain eye contact and a gentle tone. This is about their family's peace of mind.
                    </div>
                  </Card>
                </motion.div>
              )}
            </motion.div>
          )}

          {activeTab === 'integrations' && (
            <motion.div 
              key="integrations"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Official Resources */}
                <div className="space-y-4">
                  <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-emerald-600" />
                    Official St. Peter Resources
                  </h3>
                  <div className="grid grid-cols-1 gap-3">
                    <a 
                      href="https://stpeter.com.ph" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center justify-between p-4 bg-white rounded-xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50 transition-all group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
                          <Globe className="w-5 h-5 text-emerald-600" />
                        </div>
                        <div>
                          <p className="font-bold text-slate-800">Official Website</p>
                          <p className="text-xs text-slate-500">stpeter.com.ph</p>
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-emerald-500 transition-all" />
                    </a>
                    <a 
                      href="https://facebook.com/stpeterlifeplanandchapels" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center justify-between p-4 bg-white rounded-xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50 transition-all group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                          <Facebook className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                          <p className="font-bold text-slate-800">Facebook Page</p>
                          <p className="text-xs text-slate-500">Official Updates & Community</p>
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-emerald-500 transition-all" />
                    </a>
                  </div>
                </div>

                {/* Agent Toolbox */}
                <div className="space-y-4">
                  <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-amber-500" />
                    Agent Creative Toolbox
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <a 
                      href="https://canva.com" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex flex-col items-center p-4 bg-white rounded-xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50 transition-all text-center"
                    >
                      <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center mb-3">
                        <Palette className="w-6 h-6 text-purple-600" />
                      </div>
                      <p className="font-bold text-slate-800 text-sm">Canva</p>
                      <p className="text-[10px] text-slate-500">Design Posters</p>
                    </a>
                    <a 
                      href="https://capcut.com" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex flex-col items-center p-4 bg-white rounded-xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50 transition-all text-center"
                    >
                      <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center mb-3">
                        <Video className="w-6 h-6 text-slate-800" />
                      </div>
                      <p className="font-bold text-slate-800 text-sm">CapCut</p>
                      <p className="text-[10px] text-slate-500">Edit Reels/Videos</p>
                    </a>
                    <a 
                      href="https://chat.openai.com" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex flex-col items-center p-4 bg-white rounded-xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50 transition-all text-center"
                    >
                      <div className="w-12 h-12 bg-teal-100 rounded-xl flex items-center justify-center mb-3">
                        <MessageSquare className="w-6 h-6 text-teal-600" />
                      </div>
                      <p className="font-bold text-slate-800 text-sm">ChatGPT</p>
                      <p className="text-[10px] text-slate-500">AI Assistant</p>
                    </a>
                    <a 
                      href="https://gemini.google.com" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex flex-col items-center p-4 bg-white rounded-xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50 transition-all text-center"
                    >
                      <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mb-3">
                        <Sparkles className="w-6 h-6 text-blue-600" />
                      </div>
                      <p className="font-bold text-slate-800 text-sm">Gemini</p>
                      <p className="text-[10px] text-slate-500">Google AI</p>
                    </a>
                  </div>
                </div>
              </div>

              <Card className="p-8 bg-slate-900 text-white">
                <div className="flex items-center gap-6">
                  <div className="w-16 h-16 bg-emerald-600 rounded-2xl flex items-center justify-center flex-shrink-0">
                    <Info className="w-8 h-8 text-white" />
                  </div>
                  <div>
                    <h4 className="text-xl font-bold mb-2">Integration Tip</h4>
                    <p className="text-slate-400 text-sm">
                      Use **Canva** to customize the marketing templates from the "Marketing Copilot" tab. You can then share them directly to the **St. Peter Facebook** community to engage with more families.
                    </p>
                  </div>
                </div>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Modals */}
      <AnimatePresence>
        {isAddingLead && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
            >
              <div className="p-6 bg-emerald-900 text-white flex justify-between items-center">
                <h3 className="text-xl font-bold">Step 1: Lead Capture</h3>
                <button onClick={() => setIsAddingLead(false)} className="text-emerald-300 hover:text-white transition-colors">
                  <Plus className="w-6 h-6 rotate-45" />
                </button>
              </div>
              <form onSubmit={addLead} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Client Full Name</label>
                  <input 
                    name="name" 
                    required 
                    type="text" 
                    placeholder="e.g., Juan Dela Cruz"
                    className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Contact Info (Phone/FB)</label>
                  <input 
                    name="contact" 
                    required 
                    type="text" 
                    placeholder="e.g., 0917-XXX-XXXX or FB Messenger"
                    className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Initial Notes</label>
                  <textarea 
                    name="notes" 
                    placeholder="What did you talk about? Any specific plan interest?"
                    className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none min-h-[100px]"
                  />
                </div>
                <div className="pt-4 flex gap-3">
                  <Button type="button" variant="secondary" className="flex-1" onClick={() => setIsAddingLead(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" className="flex-1">
                    Record Lead
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {selectedLead && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden"
            >
              <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-bold">{selectedLead.name}</h3>
                  <p className="text-slate-400 text-sm">Lead Details & History</p>
                </div>
                <button onClick={() => setSelectedLead(null)} className="text-slate-400 hover:text-white transition-colors">
                  <Plus className="w-6 h-6 rotate-45" />
                </button>
              </div>
              <div className="p-6 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <p className="text-xs font-bold text-slate-400 uppercase mb-1">Current Status</p>
                    <Badge variant={selectedLead.status === 'Closed Won' ? 'success' : 'default'}>{selectedLead.status}</Badge>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <p className="text-xs font-bold text-slate-400 uppercase mb-1">Captured On</p>
                    <p className="font-medium text-slate-700">{format(selectedLead.createdAt.toDate(), 'MMMM d, yyyy')}</p>
                  </div>
                </div>

                <div>
                  <h4 className="font-bold text-slate-800 mb-2 flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    Sales Journey
                  </h4>
                  <div className="flex items-center justify-between relative">
                    <div className="absolute top-1/2 left-0 w-full h-0.5 bg-slate-100 -translate-y-1/2 z-0"></div>
                    {WORKFLOW_STEPS.map((step, i) => {
                      const isCompleted = WORKFLOW_STEPS.indexOf(selectedLead.status) >= i;
                      const isCurrent = selectedLead.status === step;
                      return (
                        <div key={step} className="relative z-10 flex flex-col items-center">
                          <div className={cn(
                            "w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all",
                            isCompleted ? "bg-emerald-600 border-emerald-600 text-white" : "bg-white border-slate-200 text-slate-300",
                            isCurrent && "ring-4 ring-emerald-100"
                          )}>
                            {isCompleted ? <CheckCircle2 className="w-5 h-5" /> : <span className="text-xs font-bold">{i + 1}</span>}
                          </div>
                          <span className={cn("text-[10px] mt-2 font-bold text-center max-w-[60px]", isCurrent ? "text-emerald-700" : "text-slate-400")}>
                            {step}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <h4 className="font-bold text-slate-800 mb-2">Notes & Activity</h4>
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 min-h-[100px]">
                    <p className="text-slate-600 whitespace-pre-wrap">{selectedLead.notes || 'No notes recorded yet.'}</p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button variant="secondary" className="flex-1" onClick={() => {
                    setActiveTab('marketing');
                    setSelectedLead(null);
                  }}>
                    <Megaphone className="w-4 h-4" />
                    Nurture Lead
                  </Button>
                  <Button variant="primary" className="flex-1" onClick={() => {
                    setActiveTab('knowledge');
                    setSelectedLead(null);
                  }}>
                    <BookOpen className="w-4 h-4" />
                    Pitch Plan
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
