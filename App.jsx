import React, { useState, useMemo, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, collection, doc, setDoc, onSnapshot, 
  deleteDoc, updateDoc, query, orderBy
} from 'firebase/firestore';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { 
  XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area
} from 'recharts';
import { 
  Trash2, Upload, Clock, PanelsTopLeft, AlertCircle,
  Database, Globe, RotateCcw, Wrench, Loader2, Search,
  CheckCircle2, XCircle, Menu, X, ChevronRight, Download
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// --- Configuration & Helpers ---
const firebaseConfig = {
  apiKey: "AIzaSyA0QWdvnA4ubJ42OAHxnDDJQUHkIFasu3w",
  authDomain: "data-5c343.firebaseapp.com",
  projectId: "data-5c343",
  storageBucket: "data-5c343.firebasestorage.app",
  messagingSenderId: "555799172632",
  appId: "1:555799172632:web:ced0d5f789362a9228156d"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const GLOBAL_APP_ID = typeof __app_id !== 'undefined' ? __app_id : 'datagraphic-pro-v1';

const COLORS = ['#fbbf24', '#f59e0b', '#d97706', '#b45309', '#78350f', '#451a03'];

const getTimeBucket = (timeStr) => {
  if (!timeStr) return "08:00";
  const parts = timeStr.split(':');
  return `${parts[0].padStart(2, '0')}:${parseInt(parts[1] || 0) < 30 ? '00' : '30'}`;
};

const App = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isPapaLoaded, setIsPapaLoaded] = useState(false);
  const [authError, setAuthError] = useState(null);

  // Data States
  const [orders, setOrders] = useState([]);
  const [redoOrders, setRedoOrders] = useState([]); 
  const [fixOrders, setFixOrders] = useState([]);   
  const [issues, setIssues] = useState([]);

  // 1. Auth Lifecycle (Fixed Rule 3 & Token Mismatch)
  useEffect(() => {
    let isMounted = true;

    const initAuth = async () => {
      try {
        // เช็คว่ามี custom token และ token นั้นดูสมเหตุสมผลหรือไม่
        const customToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
        
        if (customToken && customToken.length > 10) {
          try {
            await signInWithCustomToken(auth, customToken);
          } catch (tokenErr) {
            // หาก Token ผิดพลาด (Mismatch) ให้ถอยกลับไปใช้ Anonymous แทนเพื่อไม่ให้แอปค้าง
            console.warn("Custom token failed, falling back to anonymous:", tokenErr.message);
            await signInAnonymously(auth);
          }
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        if (isMounted) setAuthError(err.message);
        console.error("Authentication fatal error:", err);
      }
    };

    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (isMounted) {
        setUser(u);
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  // 2. Real-time Listeners (Rule 1 & 2 compliant)
  useEffect(() => {
    if (!user) return;

    const setupListener = (collectionName, setter) => {
      const q = collection(db, 'artifacts', GLOBAL_APP_ID, 'public', 'data', collectionName);
      return onSnapshot(q, (snapshot) => {
        const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        setter(data.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
      }, (err) => {
        console.error(`Error fetching ${collectionName}:`, err);
      });
    };

    const unsub1 = setupListener('orders', setOrders);
    const unsub2 = setupListener('redo_orders', setRedoOrders);
    const unsub3 = setupListener('fix_orders', setFixOrders);
    const unsub4 = setupListener('issues', setIssues);

    return () => { unsub1(); unsub2(); unsub3(); unsub4(); };
  }, [user]);

  // 3. PapaParse Loader
  useEffect(() => {
    const script = document.createElement('script');
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.3.2/papaparse.min.js";
    script.async = true;
    script.onload = () => setIsPapaLoaded(true);
    document.body.appendChild(script);
  }, []);

  // 4. Analytics & Filtering
  const stats = useMemo(() => {
    const all = [...orders, ...redoOrders, ...fixOrders];
    const pending = all.filter(i => String(i.status).toLowerCase() !== 'true').length;
    
    const deptMap = all.reduce((acc, i) => { 
      const dept = i.dept || 'ไม่ระบุ';
      acc[dept] = (acc[dept] || 0) + (Number(i.amount) || 0); 
      return acc; 
    }, {});
    const pie = Object.entries(deptMap).map(([name, value]) => ({ name, value }));

    const timeMap = all.reduce((acc, i) => { 
      const b = getTimeBucket(i.time); 
      acc[b] = (acc[b] || 0) + (Number(i.amount) || 0); 
      return acc; 
    }, {});
    const area = Object.entries(timeMap)
      .map(([time, value]) => ({ time, value }))
      .sort((a,b) => a.time.localeCompare(b.time));

    return { pending, pie, area, total: all.length };
  }, [orders, redoOrders, fixOrders]);

  const filteredData = useMemo(() => {
    const currentList = activeTab === 'daily' ? orders : 
                        activeTab === 'redo' ? redoOrders : 
                        activeTab === 'fix' ? fixOrders : issues;
    if (!searchTerm) return currentList;
    return currentList.filter(item => 
      String(item.jobNo || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(item.dept || '').toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [activeTab, orders, redoOrders, fixOrders, issues, searchTerm]);

  // 5. Handlers
  const handleFileUpload = (e, targetCollection) => {
    const file = e.target.files[0];
    if (!file || !isPapaLoaded) return;

    window.Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        let lastDate = new Date().toLocaleDateString('th-TH');
        let lastTime = "08:00";
        let lastColor = "-";

        for (const [index, row] of results.data.entries()) {
          if (row['วันที่']) lastDate = row['วันที่'];
          if (row['เวลาที่รับงาน']) lastTime = row['เวลาที่รับงาน'];
          if (row['สีของงาน']) lastColor = row['สีของงาน'];
          
          if (row['งานที่']) {
            const docId = `${targetCollection}-${Date.now()}-${index}`;
            const docRef = doc(db, 'artifacts', GLOBAL_APP_ID, 'public', 'data', targetCollection, docId);
            
            await setDoc(docRef, {
              id: docId,
              date: lastDate,
              time: lastTime,
              jobNo: row['งานที่'],
              amount: parseInt(row['จำนวน']) || 0,
              dept: row['แผนก'] || "ไม่ระบุ",
              color: lastColor,
              status: row['สถานะ'] === 'True' || row['สถานะ'] === 'สำเร็จ' ? 'True' : 'False',
              createdAt: Date.now() + index
            });
          }
        }
        e.target.value = null;
      }
    });
  };

  const toggleStatus = async (item, collectionName) => {
    if (!user) return;
    const newStatus = item.status === 'True' ? 'False' : 'True';
    try {
      const docRef = doc(db, 'artifacts', GLOBAL_APP_ID, 'public', 'data', collectionName, item.id);
      await updateDoc(docRef, { status: newStatus });
    } catch (err) {
      console.error("Update failed:", err);
    }
  };

  const deleteItem = async (id, collectionName) => {
    if (!user) return;
    const docRef = doc(db, 'artifacts', GLOBAL_APP_ID, 'public', 'data', collectionName, id);
    await deleteDoc(docRef);
  };

  if (loading) return (
    <div className="h-screen bg-[#050505] flex flex-col items-center justify-center space-y-4">
      <Loader2 className="text-amber-500 animate-spin" size={48} />
      <span className="text-zinc-500 font-mono text-xs animate-pulse tracking-widest">ESTABLISHING SECURE CONNECTION...</span>
    </div>
  );

  if (authError) return (
    <div className="h-screen bg-[#050505] flex flex-col items-center justify-center p-6 text-center">
      <XCircle className="text-rose-500 mb-4" size={64} />
      <h2 className="text-xl font-bold mb-2">Authentication Failed</h2>
      <p className="text-zinc-500 text-sm max-w-md mb-6">{authError}</p>
      <button onClick={() => window.location.reload()} className="bg-zinc-800 hover:bg-zinc-700 px-6 py-2 rounded-xl text-sm font-bold transition-all">
        Try Again
      </button>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-[#070707] text-zinc-100 font-sans selection:bg-amber-500/30">
      <style dangerouslySetInnerHTML={{ __html: `
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #27272a; border-radius: 10px; }
        ::-webkit-scrollbar-thumb:hover { background: #3f3f46; }
        .glass-panel { background: rgba(18, 18, 18, 0.7); backdrop-filter: blur(12px); }
      `}} />

      {/* Sidebar */}
      <aside className={`${isSidebarOpen ? 'w-64' : 'w-20'} glass-panel border-r border-zinc-800/50 transition-all duration-500 flex flex-col z-50`}>
        <div className="p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-amber-500 p-2 rounded-xl text-black shadow-lg shadow-amber-500/20">
              <Globe size={20} strokeWidth={2.5}/>
            </div>
            {isSidebarOpen && (
              <motion.span initial={{opacity:0}} animate={{opacity:1}} className="font-black text-lg tracking-tighter">
                DATA<span className="text-amber-500">PRO</span>
              </motion.span>
            )}
          </div>
          <button onClick={() => setSidebarOpen(!isSidebarOpen)} className="text-zinc-500 hover:text-white transition-colors">
            {isSidebarOpen ? <X size={18}/> : <Menu size={18}/>}
          </button>
        </div>

        <nav className="flex-1 px-3 space-y-1 mt-4">
          {[
            { id: 'dashboard', icon: PanelsTopLeft, label: 'แดชบอร์ด' },
            { id: 'daily', icon: Database, label: 'รายการผลิต', col: 'orders' },
            { id: 'redo', icon: RotateCcw, label: 'งานแก้ใหม่', col: 'redo_orders' },
            { id: 'fix', icon: Wrench, label: 'งานแก้ไข', col: 'fix_orders' },
            { id: 'issues', icon: AlertCircle, label: 'แจ้งปัญหา', col: 'issues' }
          ].map(m => (
            <button
              key={m.id}
              onClick={() => setActiveTab(m.id)}
              className={`w-full flex items-center gap-4 p-3.5 rounded-2xl transition-all duration-200 group ${activeTab === m.id ? 'bg-amber-500 text-black font-bold' : 'text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-200'}`}
            >
              <m.icon size={20} className={activeTab === m.id ? 'text-black' : 'group-hover:scale-110 transition-transform'}/>
              {isSidebarOpen && <span className="text-sm tracking-tight">{m.label}</span>}
              {activeTab === m.id && isSidebarOpen && <ChevronRight size={14} className="ml-auto opacity-50"/>}
            </button>
          ))}
        </nav>

        {isSidebarOpen && (
          <div className="p-6 border-t border-zinc-800/50">
            <div className="flex items-center gap-3 p-3 bg-zinc-900/50 rounded-2xl border border-zinc-800/50">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-amber-500 to-orange-400 flex items-center justify-center text-[10px] font-black text-black">OP</div>
              <div className="overflow-hidden">
                <p className="text-[10px] font-bold text-zinc-300 truncate">Operator Active</p>
                <p className="text-[8px] text-zinc-600 truncate">{user?.uid}</p>
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto relative">
        <header className="sticky top-0 z-40 glass-panel border-b border-zinc-800/50 px-8 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-sm font-black text-zinc-500 uppercase tracking-[0.2em]">{activeTab} View</h1>
            <p className="text-[10px] text-zinc-600 font-mono">{new Date().toLocaleDateString('th-TH', { dateStyle: 'full' })}</p>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-amber-500 transition-colors" size={16}/>
              <input 
                type="text" 
                placeholder="ค้นหาเลขงาน / แผนก..." 
                className="bg-zinc-900/80 border border-zinc-800 rounded-xl py-2 pl-10 pr-4 text-xs focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50 transition-all w-full md:w-64"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="hidden lg:flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 px-4 py-2 rounded-xl text-[10px] font-bold text-amber-500">
              <Clock size={14}/> งานค้าง: {stats.pending}
            </div>
          </div>
        </header>

        <div className="p-8 max-w-7xl mx-auto space-y-8">
          <AnimatePresence mode="wait">
            {activeTab === 'dashboard' ? (
              <motion.div initial={{opacity:0, y:20}} animate={{opacity:1, y:0}} exit={{opacity:0, scale:0.95}} className="space-y-8">
                {/* Stats Grid */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {[
                    { l: 'การผลิตรวม', v: orders.length, c: 'text-amber-500', icon: Database },
                    { l: 'งานแก้ใหม่', v: redoOrders.length, c: 'text-orange-500', icon: RotateCcw },
                    { l: 'งานแก้ไข', v: fixOrders.length, c: 'text-sky-500', icon: Wrench },
                    { l: 'ปัญหาที่พบ', v: issues.length, c: 'text-rose-500', icon: AlertCircle }
                  ].map((s, i) => (
                    <div key={i} className="bg-zinc-900/40 p-6 rounded-[2rem] border border-zinc-800/50 hover:bg-zinc-900/60 transition-all group overflow-hidden relative">
                      <s.icon className={`absolute -right-4 -bottom-4 size-24 opacity-5 group-hover:scale-110 group-hover:opacity-10 transition-all ${s.c}`} />
                      <p className="text-zinc-500 text-[10px] font-black uppercase mb-2 tracking-widest">{s.l}</p>
                      <h2 className={`text-4xl font-black tabular-nums ${s.c}`}>{s.v}</h2>
                      <div className="mt-4 flex items-center gap-2 text-[10px] text-zinc-600 font-bold">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Live Monitoring
                      </div>
                    </div>
                  ))}
                </div>

                {/* Charts Section */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2 bg-[#111] p-8 rounded-[2.5rem] border border-zinc-800/50 flex flex-col h-[450px]">
                    <div className="flex justify-between items-center mb-8">
                      <h3 className="text-xs font-black uppercase text-zinc-500 tracking-widest">ปริมาณงานตามช่วงเวลา (Jobs vs Time)</h3>
                      <Download size={16} className="text-zinc-700 cursor-pointer hover:text-zinc-400"/>
                    </div>
                    <div className="flex-1 w-full overflow-hidden">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={stats.area} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                          <defs>
                            <linearGradient id="gradientArea" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#fbbf24" stopOpacity={0.4}/>
                              <stop offset="95%" stopColor="#fbbf24" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1f1f23" />
                          <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{fill: '#52525b', fontSize: 10, fontWeight: 700}} />
                          <YAxis axisLine={false} tickLine={false} tick={{fill: '#52525b', fontSize: 10, fontWeight: 700}} />
                          <RechartsTooltip 
                            contentStyle={{background:'#09090b', border:'1px solid #27272a', borderRadius:'16px', fontSize: '10px'}}
                            itemStyle={{color: '#fbbf24', fontWeight: 900}}
                          />
                          <Area type="monotone" dataKey="value" stroke="#fbbf24" fill="url(#gradientArea)" strokeWidth={4} strokeLinecap="round" isAnimationActive={true} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="bg-[#111] p-8 rounded-[2.5rem] border border-zinc-800/50 flex flex-col h-[450px]">
                    <h3 className="text-xs font-black uppercase text-zinc-500 mb-8 tracking-widest text-center">สัดส่วนตามแผนก (Dept Ratio)</h3>
                    <div className="flex-1 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie 
                            data={stats.pie.length > 0 ? stats.pie : [{name: 'No Data', value: 1}]} 
                            innerRadius={70} 
                            outerRadius={100} 
                            paddingAngle={8} 
                            dataKey="value"
                            stroke="none"
                          >
                            {stats.pie.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} className="hover:opacity-80 transition-opacity cursor-pointer focus:outline-none" />)}
                            {stats.pie.length === 0 && <Cell fill="#1f1f23" />}
                          </Pie>
                          <RechartsTooltip contentStyle={{background:'#000', border:'none', borderRadius:'12px', fontSize: '10px'}}/>
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      {stats.pie.slice(0, 4).map((p, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{background: COLORS[i % COLORS.length]}}></div>
                          <span className="text-[9px] text-zinc-500 font-bold truncate">{p.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="bg-zinc-900/30 rounded-[2.5rem] border border-zinc-800/50 overflow-hidden shadow-2xl backdrop-blur-md">
                <div className="p-8 border-b border-zinc-800/50 flex flex-col sm:flex-row justify-between items-center bg-zinc-900/20 gap-4">
                  <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-2xl ${activeTab === 'daily' ? 'bg-amber-500/20 text-amber-500' : activeTab === 'redo' ? 'bg-orange-500/20 text-orange-500' : 'bg-sky-500/20 text-sky-500'}`}>
                      {activeTab === 'daily' ? <Database size={24}/> : activeTab === 'redo' ? <RotateCcw size={24}/> : <Wrench size={24}/>}
                    </div>
                    <div>
                      <h2 className="font-black text-xl uppercase tracking-tight">{activeTab} List</h2>
                      <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">{filteredData.length} records found</p>
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <input 
                      type="file" 
                      id="fileInput" 
                      className="hidden" 
                      accept=".csv"
                      onChange={(e) => handleFileUpload(e, activeTab === 'daily' ? 'orders' : activeTab === 'redo' ? 'redo_orders' : 'fix_orders')} 
                    />
                    <label htmlFor="fileInput" className={`${isPapaLoaded ? 'bg-white hover:bg-zinc-200 active:scale-95' : 'bg-zinc-800 cursor-not-allowed'} text-black px-6 py-3 rounded-2xl text-[10px] font-black cursor-pointer transition-all flex items-center gap-2 shadow-xl shadow-white/5`}>
                      {isPapaLoaded ? <><Upload size={14} strokeWidth={3}/> IMPORT CSV</> : <><Loader2 size={14} className="animate-spin"/> LOADING...</>}
                    </label>
                  </div>
                </div>

                <div className="overflow-x-auto min-h-[400px]">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-zinc-900/80 text-zinc-500 text-[9px] font-black uppercase tracking-[0.2em] sticky top-0">
                      <tr>
                        <th className="p-6 border-b border-zinc-800/50">TIMESTAMP</th>
                        <th className="p-6 border-b border-zinc-800/50">JOB IDENTIFIER</th>
                        <th className="p-6 border-b border-zinc-800/50">DEPARTMENT / COLOR</th>
                        <th className="p-6 border-b border-zinc-800/50 text-center">STATUS</th>
                        <th className="p-6 border-b border-zinc-800/50 text-right">QUANTITY</th>
                        <th className="p-6 border-b border-zinc-800/50"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/20">
                      {filteredData.map((item, idx) => (
                        <motion.tr 
                          initial={{opacity:0}} 
                          animate={{opacity:1}}
                          transition={{delay: Math.min(idx * 0.05, 1)}}
                          key={item.id} 
                          className="hover:bg-zinc-800/20 transition-all group"
                        >
                          <td className="p-6">
                            <div className="flex flex-col">
                              <span className="text-zinc-200 text-xs font-bold">{item.date}</span>
                              <span className="text-[9px] text-zinc-600 font-mono mt-1">{item.time}</span>
                            </div>
                          </td>
                          <td className="p-6">
                            <span className="font-black text-amber-500 text-lg tracking-tight">{item.jobNo}</span>
                          </td>
                          <td className="p-6">
                            <div className="flex flex-col">
                              <span className="font-bold text-zinc-400 text-xs">{item.dept}</span>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="w-2 h-2 rounded-full bg-zinc-700"></span>
                                <span className="text-[9px] text-zinc-600 uppercase font-black tracking-wider">{item.color}</span>
                              </div>
                            </div>
                          </td>
                          <td className="p-6 text-center">
                            <button 
                              onClick={() => toggleStatus(item, activeTab === 'daily' ? 'orders' : activeTab === 'redo' ? 'redo_orders' : 'fix_orders')}
                              className={`px-4 py-2 rounded-xl text-[9px] font-black transition-all border flex items-center gap-2 mx-auto ${item.status === 'True' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-lg shadow-emerald-500/5' : 'bg-amber-500/10 text-amber-500 border-amber-500/20 shadow-lg shadow-amber-500/5'}`}
                            >
                              {item.status === 'True' ? <><CheckCircle2 size={12}/> COMPLETED</> : <><Loader2 size={12} className="animate-spin"/> PROCESSING</>}
                            </button>
                          </td>
                          <td className="p-6 text-right">
                            <span className="font-black text-white text-base tabular-nums">{item.amount.toLocaleString()}</span>
                          </td>
                          <td className="p-6 text-right">
                            <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button 
                                onClick={() => deleteItem(item.id, activeTab === 'daily' ? 'orders' : activeTab === 'redo' ? 'redo_orders' : 'fix_orders')}
                                className="p-2 text-zinc-700 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-all"
                              >
                                <Trash2 size={16}/>
                              </button>
                            </div>
                          </td>
                        </motion.tr>
                      ))}
                      {filteredData.length === 0 && (
                        <tr>
                          <td colSpan="6" className="p-20 text-center">
                            <div className="flex flex-col items-center gap-3 text-zinc-700">
                              <Search size={48} className="opacity-20"/>
                              <p className="text-sm font-bold">ไม่พบข้อมูลที่ค้นหา</p>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
};

export default App;