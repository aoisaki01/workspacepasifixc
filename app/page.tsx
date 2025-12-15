'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Trash2, CheckCircle, MessageSquare, Plus, Image as ImageIcon, Loader2, UploadCloud, X, AlertTriangle, Pencil, Save, CornerDownRight, ChevronDown, ChevronUp, Play, Film, FileImage, FileText, Download, Paperclip, Search, Filter, TrendingUp, Calendar } from 'lucide-react';

// --- FIREBASE IMPORTS ---
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, onValue, push, set, remove, update } from 'firebase/database';

// --- KONFIGURASI FIREBASE ---
const firebaseConfig = {
  // ⚠️ GANTI DENGAN API KEY KAMU SENDIRI
  apiKey: "API_KEY_KAMU_DISINI", 
  authDomain: "pasifixc.firebaseapp.com",
  databaseURL: "https://pasifixc-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "pasifixc",
  storageBucket: "pasifixc.appspot.com",
  messagingSenderId: "SENDER_ID_KAMU",
  appId: "APP_ID_KAMU"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// --- TIPE DATA ---
interface Attachment {
  id: string;
  type: 'image' | 'video' | 'file';
  url: string;
  fileName?: string;
}

interface Comment {
  id: string;
  sender: string;
  text: string;
  createdAt: string; 
  replies: Comment[];
}

interface InspirationItem {
  id: string;
  title: string;
  description: string;
  attachments: Attachment[];
  isDone: boolean;
  comments: Comment[];
  createdAt: string; 
}

export default function InspirationBoard() {
  // --- STATE UTAMA ---
  const [items, setItems] = useState<InspirationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // --- STATE FILTER & SORT ---
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'az' | 'za'>('newest');

  // --- STATE FORM INPUT ---
  const [newItemTitle, setNewItemTitle] = useState('');
  const [newItemDesc, setNewItemDesc] = useState('');
  const [newItemAttachments, setNewItemAttachments] = useState<Attachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  
  // --- STATE MODAL EDIT ---
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editAttachments, setEditAttachments] = useState<Attachment[]>([]);
  const [isUploadingEdit, setIsUploadingEdit] = useState(false);

  // --- STATE LAINNYA ---
  const [itemToDelete, setItemToDelete] = useState<InspirationItem | null>(null);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
  const [commentInputs, setCommentInputs] = useState<{ [key: string]: string }>({}); 
  const [userName, setUserName] = useState(''); 
  const [replyingTo, setReplyingTo] = useState<{ itemId: string, commentId: string } | null>(null);
  const [expandedComments, setExpandedComments] = useState<{ [itemId: string]: boolean }>({});

  // ----------------------------------------------------------------
  // 1. FIREBASE LISTENER
  // ----------------------------------------------------------------
  useEffect(() => {
    const inspirationsRef = ref(db, 'inspirations');
    const unsubscribe = onValue(inspirationsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const parsedItems: InspirationItem[] = Object.keys(data).map((key) => {
          let atts: Attachment[] = data[key].attachments || [];
          if (!data[key].attachments && data[key].imageUrl) {
            atts = [{ id: 'legacy', type: 'image', url: data[key].imageUrl, fileName: 'Legacy Image' }];
          }
          return {
            id: key,
            ...data[key],
            attachments: sortAttachments(atts),
            comments: data[key].comments || [],
            createdAt: data[key].createdAt || new Date().toISOString() 
          };
        });
        setItems(parsedItems);
      } else {
        setItems([]);
      }
      setIsLoading(false);
    });

    const savedName = localStorage.getItem('inspiration-username');
    if (savedName) setUserName(savedName);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    localStorage.setItem('inspiration-username', userName);
  }, [userName]);

  // ----------------------------------------------------------------
  // 2. HELPER: SORTING & FILTERING
  // ----------------------------------------------------------------
  const sortAttachments = (atts: Attachment[]) => {
    const typeOrder = { 'image': 1, 'video': 2, 'file': 3 };
    return [...atts].sort((a, b) => typeOrder[a.type] - typeOrder[b.type]);
  };

  const filteredItems = useMemo(() => {
    let result = [...items];
    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      result = result.filter(item => 
        item.title.toLowerCase().includes(lowerQuery) || 
        item.description.toLowerCase().includes(lowerQuery)
      );
    }
    result.sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      switch (sortBy) {
        case 'newest': return dateB - dateA;
        case 'oldest': return dateA - dateB;
        case 'az': return a.title.localeCompare(b.title);
        case 'za': return b.title.localeCompare(a.title);
        default: return 0;
      }
    });
    return result;
  }, [items, searchQuery, sortBy]);

  // ----------------------------------------------------------------
  // 3. FUNGSI UPLOAD
  // ----------------------------------------------------------------
  const uploadToCloudinary = async (file: File): Promise<string | null> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', 'ml_default'); 
    try {
      const res = await fetch('https://api.cloudinary.com/v1_1/dl2ijoilh/auto/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      return data.secure_url;
    } catch (error) { return null; }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, isEditMode: boolean = false) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    if (isEditMode) setIsUploadingEdit(true); else setIsUploading(true);

    const newUploaded: Attachment[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const url = await uploadToCloudinary(file);
      if (url) {
        let type: 'image' | 'video' | 'file' = 'file';
        if (file.type.startsWith('image/')) type = 'image';
        else if (file.type.startsWith('video/')) type = 'video';
        newUploaded.push({ id: Date.now() + Math.random().toString(), type, url, fileName: file.name });
      }
    }

    if (isEditMode) {
      setEditAttachments(prev => sortAttachments([...prev, ...newUploaded]));
      setIsUploadingEdit(false);
    } else {
      setNewItemAttachments(prev => sortAttachments([...prev, ...newUploaded]));
      setIsUploading(false);
    }
  };

  const removeAttachment = (id: string, isEditMode: boolean) => {
    if (isEditMode) setEditAttachments(prev => prev.filter(a => a.id !== id));
    else setNewItemAttachments(prev => prev.filter(a => a.id !== id));
  };

  // ----------------------------------------------------------------
  // 4. LOGIC CRUD
  // ----------------------------------------------------------------
  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemTitle || newItemAttachments.length === 0) return;

    const newItemRef = push(ref(db, 'inspirations'));
    await set(newItemRef, {
      title: newItemTitle,
      description: newItemDesc,
      attachments: newItemAttachments,
      isDone: false,
      comments: [],
      createdAt: new Date().toISOString() 
    });

    setNewItemTitle(''); setNewItemDesc(''); setNewItemAttachments([]);
  };

  const startEdit = (item: InspirationItem) => {
    setIsEditing(true); setEditId(item.id); setEditTitle(item.title); setEditDesc(item.description); setEditAttachments(item.attachments);
  };
  const saveEdit = async () => {
    if (!editId) return;
    await update(ref(db, `inspirations/${editId}`), { title: editTitle, description: editDesc, attachments: editAttachments });
    setIsEditing(false); setEditId(null);
  };
  const confirmDelete = async () => {
    if (!itemToDelete) return;
    if (deleteConfirmationText === itemToDelete.title) { await remove(ref(db, `inspirations/${itemToDelete.id}`)); setItemToDelete(null); }
  };
  const toggleCheck = async (item: InspirationItem) => { await update(ref(db, `inspirations/${item.id}`), { isDone: !item.isDone }); };

  // ----------------------------------------------------------------
  // 5. LOGIC KOMENTAR
  // ----------------------------------------------------------------
  const updateCommentsInFirebase = async (itemId: string, newComments: Comment[]) => { await update(ref(db, `inspirations/${itemId}`), { comments: newComments }); };
  const addReplyToComment = (comments: Comment[], targetId: string, newReply: Comment): Comment[] => {
    return comments.map(c => c.id === targetId ? { ...c, replies: [...(c.replies || []), newReply] } : { ...c, replies: c.replies ? addReplyToComment(c.replies, targetId, newReply) : [] });
  };
  const deleteCommentRecursive = (comments: Comment[], targetId: string): Comment[] => comments.filter(c => c.id !== targetId).map(c => ({ ...c, replies: c.replies ? deleteCommentRecursive(c.replies, targetId) : [] }));
  const editCommentRecursive = (comments: Comment[], targetId: string, newText: string): Comment[] => comments.map(c => c.id === targetId ? { ...c, text: newText } : { ...c, replies: c.replies ? editCommentRecursive(c.replies, targetId, newText) : [] });

  const handleSendComment = (item: InspirationItem, parentCommentId: string | null = null) => {
    if (!userName.trim()) { alert("Isi Nama dulu!"); return; }
    if (!commentInputs[item.id]) return;
    const newComment: Comment = { id: Date.now().toString(), sender: userName, text: commentInputs[item.id], createdAt: new Date().toISOString(), replies: [] };
    const updated = parentCommentId ? addReplyToComment(item.comments, parentCommentId, newComment) : [...item.comments, newComment];
    updateCommentsInFirebase(item.id, updated);
    setCommentInputs({ ...commentInputs, [item.id]: '' }); setReplyingTo(null);
  };
  const handleDeleteComment = (item: InspirationItem, cid: string) => { if (confirm('Hapus?')) updateCommentsInFirebase(item.id, deleteCommentRecursive(item.comments, cid)); };
  const handleEditComment = (item: InspirationItem, cid: string, txt: string) => updateCommentsInFirebase(item.id, editCommentRecursive(item.comments, cid, txt));

  // ----------------------------------------------------------------
  // 6. UI COMPONENT: STOCK-LIKE CHART (SVG)
  // ----------------------------------------------------------------
  const StockActivityChart = ({ items }: { items: InspirationItem[] }) => {
    // 1. Process Data: Group by Date (Last 30 Days)
    const daysToShow = 30;
    const dataPoints: { date: string, count: number, label: string }[] = [];
    const today = new Date();
    
    // Inisialisasi array 30 hari terakhir
    for (let i = daysToShow - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(today.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const label = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
      dataPoints.push({ date: dateStr, count: 0, label });
    }

    // Hitung Aktivitas
    const processDate = (isoString: string) => {
      try { return new Date(isoString).toISOString().split('T')[0]; } 
      catch { return new Date().toISOString().split('T')[0]; }
    };

    items.forEach(item => {
      const pDate = processDate(item.createdAt);
      const idx = dataPoints.findIndex(d => d.date === pDate);
      if (idx !== -1) dataPoints[idx].count += 3; // Project baru = bobot 3

      const countComments = (comments: Comment[]) => {
        comments.forEach(c => {
          const cDate = processDate(c.createdAt);
          const cIdx = dataPoints.findIndex(d => d.date === cDate);
          if (cIdx !== -1) dataPoints[cIdx].count += 1; // Komen = bobot 1
          if (c.replies) countComments(c.replies);
        });
      };
      countComments(item.comments);
    });

    // 2. SVG Calculation
    const width = 1000;
    const height = 300;
    const padding = 20;
    const maxCount = Math.max(...dataPoints.map(d => d.count), 5); // Min scale 5

    // Buat koordinat Polyline
    const points = dataPoints.map((point, index) => {
      const x = (index / (daysToShow - 1)) * width;
      const y = height - (point.count / maxCount) * height; // Invert Y (SVG 0 is top)
      return `${x},${y}`;
    }).join(' ');

    // Area Path (Untuk fill warna di bawah garis)
    const areaPath = `${points} ${width},${height} 0,${height}`;

    return (
      <div className="w-full bg-white p-6 md:p-8 rounded-3xl border border-gray-100 shadow-xl shadow-red-50 mt-16 relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-4 opacity-10">
          <TrendingUp size={120} className="text-red-500" />
        </div>

        <div className="flex items-center justify-between mb-8 relative z-10">
          <div>
            <h3 className="text-2xl font-black text-gray-900 flex items-center gap-2">
              <span className="w-2 h-8 bg-[#B91C1C] rounded-full"></span>
              ACTIVITY 
            </h3>
            <p className="text-gray-400 text-sm font-medium mt-1">Statistik keaktifan tim 30 hari terakhir</p>
          </div>
          <div className="text-right">
             <div className="text-3xl font-black text-[#B91C1C]">{dataPoints.reduce((a,b) => a + b.count, 0)}</div>
             <div className="text-xs font-bold text-gray-400 uppercase">Total Actions</div>
          </div>
        </div>
        
        {/* CHART CONTAINER */}
        <div className="relative w-full h-64">
           {/* Grid Lines Horizontal */}
           <div className="absolute inset-0 flex flex-col justify-between text-xs text-gray-300 pointer-events-none">
              <div className="border-b border-gray-100 w-full h-0"></div>
              <div className="border-b border-gray-100 w-full h-0"></div>
              <div className="border-b border-gray-100 w-full h-0"></div>
              <div className="border-b border-gray-100 w-full h-0"></div>
              <div className="border-b border-gray-100 w-full h-0"></div>
           </div>

           {/* SVG CHART */}
           <svg viewBox={`0 -10 ${width} ${height + 20}`} className="w-full h-full overflow-visible">
              {/* Defs for Gradient */}
              <defs>
                <linearGradient id="gradientRed" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#B91C1C" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#B91C1C" stopOpacity="0" />
                </linearGradient>
              </defs>

              {/* Area Fill */}
              <polygon points={areaPath} fill="url(#gradientRed)" />

              {/* Line Stroke */}
              <polyline 
                fill="none" 
                stroke="#B91C1C" 
                strokeWidth="4" 
                points={points} 
                strokeLinecap="round" 
                strokeLinejoin="round"
                className="drop-shadow-lg"
              />

              {/* Data Points (Dots on Hover) */}
              {dataPoints.map((point, index) => {
                 const x = (index / (daysToShow - 1)) * width;
                 const y = height - (point.count / maxCount) * height;
                 return (
                   <g key={index} className="group/point cursor-pointer">
                     <circle cx={x} cy={y} r="6" fill="#B91C1C" className="opacity-0 group-hover/point:opacity-100 transition-opacity" />
                     {/* Tooltip SVG */}
                     <g className="opacity-0 group-hover/point:opacity-100 transition-opacity pointer-events-none">
                        <rect x={x - 40} y={y - 50} width="80" height="35" rx="8" fill="#1f2937" />
                        <text x={x} y={y - 30} textAnchor="middle" fill="white" fontSize="12" fontWeight="bold">{point.count} Acts</text>
                        <text x={x} y={y - 18} textAnchor="middle" fill="#9ca3af" fontSize="10">{point.label}</text>
                     </g>
                   </g>
                 );
              })}
           </svg>
        </div>
      </div>
    );
  };

  const MediaGallery = ({ attachments }: { attachments: Attachment[] }) => {
    if (!attachments || attachments.length === 0) return <div className="flex items-center justify-center h-64 text-gray-300 bg-gray-100"><ImageIcon size={48} /></div>;
    return (
      <div className="relative w-full h-72 bg-gray-900 group">
        <div className="flex overflow-x-auto snap-x snap-mandatory w-full h-full scrollbar-hide">
          {attachments.map((att, index) => (
            <div key={index} className="w-full flex-shrink-0 snap-center h-full relative flex items-center justify-center bg-gray-100">
              {att.type === 'video' ? <video src={att.url} controls className="h-full max-w-full object-contain bg-black" /> : 
               att.type === 'file' ? (
                <div className="flex flex-col items-center justify-center p-6 text-center h-full w-full bg-slate-100 text-slate-600">
                  <div className="bg-white p-4 rounded-full shadow-md mb-3"><FileText size={32} className="text-[#B91C1C]" /></div>
                  <span className="text-sm font-bold text-gray-800 line-clamp-1 max-w-[80%] mb-4 px-2">{att.fileName || 'Dokumen'}</span>
                  <a href={att.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 bg-[#B91C1C] text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-red-800"><Download size={14} /> Download</a>
                </div>
               ) : <img src={att.url} alt="Attachment" className="w-full h-full object-cover" />}
              <div className="absolute top-3 left-3 bg-black/60 text-white px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1 backdrop-blur-md">
                {att.type === 'video' ? <Film size={10} /> : att.type === 'file' ? <Paperclip size={10} /> : <FileImage size={10} />}
                {index + 1}/{attachments.length}
              </div>
            </div>
          ))}
        </div>
        {attachments.length > 1 && <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1 z-10 pointer-events-none">{attachments.map((_, i) => <div key={i} className="w-1.5 h-1.5 rounded-full bg-white/50 shadow-sm" />)}</div>}
      </div>
    );
  };

  const CommentItem = ({ comment, item, depth = 0 }: { comment: Comment, item: InspirationItem, depth?: number }) => {
    const [isEditingC, setIsEditingC] = useState(false); const [editTxt, setEditTxt] = useState(comment.text);
    const isReplying = replyingTo?.itemId === item.id && replyingTo?.commentId === comment.id;
    let cls = "mt-3 relative"; if (depth > 0) cls += depth < 3 ? " ml-4 pl-3 border-l-2 border-red-100" : " mt-2 pt-2 border-t border-dashed border-red-100"; else cls += " mt-4";
    const dateDisplay = (() => { try { if (comment.createdAt.includes('T')) return new Date(comment.createdAt).toLocaleDateString('id-ID'); return comment.createdAt; } catch { return comment.createdAt; } })();

    return (
      <div className={cls}>
        <div className={`p-3 rounded-xl transition-colors group relative ${depth >= 3 ? 'bg-[#FFF5F5]' : 'bg-white border border-gray-100'}`}>
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-2"><span className="text-xs font-bold text-[#B91C1C]">{comment.sender}</span>{depth > 0 && <span className="text-[9px] bg-red-50 text-red-500 px-1.5 py-0.5 rounded-full font-bold">reply</span>}</div>
            <div className="flex items-center gap-2"><span className="text-[10px] text-gray-400">{dateDisplay}</span>{!isEditingC && (<div className="flex gap-1"><button onClick={() => setIsEditingC(true)} className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-blue-500"><Pencil size={12} /></button><button onClick={() => handleDeleteComment(item, comment.id)} className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-red-500"><Trash2 size={12} /></button></div>)}</div>
          </div>
          {isEditingC ? (<div className="mt-2"><textarea className="w-full text-sm p-2 border border-blue-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-blue-50" value={editTxt} onChange={(e) => setEditTxt(e.target.value)} rows={2} /><div className="flex gap-2 mt-2 justify-end"><button onClick={() => setIsEditingC(false)} className="text-xs text-gray-500 font-bold px-2 py-1 hover:bg-gray-100 rounded">Batal</button><button onClick={() => { handleEditComment(item, comment.id, editTxt); setIsEditingC(false); }} className="text-xs bg-blue-600 text-white font-bold px-3 py-1 rounded hover:bg-blue-700">Simpan</button></div></div>) : (<><p className="text-sm text-gray-700 mt-1 leading-relaxed break-words break-all whitespace-pre-wrap">{comment.text}</p><button onClick={() => setReplyingTo({ itemId: item.id, commentId: comment.id })} className="text-[11px] text-red-500 font-bold mt-2 flex items-center gap-1 hover:underline"><CornerDownRight size={12} /> Balas</button></>)}
        </div>
        {isReplying && (<div className="mt-2 ml-2 p-3 bg-white rounded-xl border border-red-200 shadow-lg shadow-red-100/50 z-10 relative animate-in fade-in zoom-in-95"><div className="flex justify-between items-center mb-2"><p className="text-xs text-red-600 font-bold">Membalas {comment.sender}...</p><button onClick={() => setReplyingTo(null)} className="text-gray-400 hover:text-red-500"><X size={14}/></button></div><div className="flex gap-2"><input type="text" autoFocus placeholder="Tulis balasan..." className="flex-1 text-xs p-2 border border-red-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 bg-gray-50" value={commentInputs[item.id] || ''} onChange={(e) => setCommentInputs({ ...commentInputs, [item.id]: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && handleSendComment(item, comment.id)} /><button onClick={() => handleSendComment(item, comment.id)} className="bg-[#B91C1C] text-white text-xs px-4 rounded-lg font-bold hover:bg-red-800 transition-colors">Kirim</button></div></div>)}
        {(comment.replies || []).map(r => <CommentItem key={r.id} comment={r} item={item} depth={depth + 1} />)}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#FFF0F0] p-6 md:p-12 font-sans text-gray-800 relative selection:bg-red-200">
      
      {isEditing && ( <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm"><div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-8 relative overflow-hidden flex flex-col max-h-[90vh]"><div className="absolute top-0 left-0 w-full h-2 bg-[#B91C1C]"></div><div className="flex justify-between items-center mb-6"><h3 className="text-2xl font-black text-[#B91C1C] flex items-center gap-2">EDIT PROJECT.</h3><button onClick={() => setIsEditing(false)}><X size={20} className="text-gray-400 hover:text-red-600" /></button></div><div className="space-y-4 overflow-y-auto pr-2 custom-scrollbar"><input type="text" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="w-full p-3 border-2 border-gray-100 rounded-xl font-bold text-lg focus:border-[#B91C1C] outline-none" /><textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} className="w-full p-3 border-2 border-gray-100 rounded-xl h-24 resize-none focus:border-[#B91C1C] outline-none" /><div><label className="text-xs font-bold text-gray-400 uppercase">File ({editAttachments.length})</label><div className="flex gap-2 overflow-x-auto py-2">{editAttachments.map((att) => (<div key={att.id} className="relative w-20 h-20 flex-shrink-0 group bg-gray-100 rounded-lg flex items-center justify-center border border-gray-200">{att.type === 'video' ? <Film className="text-gray-400" /> : att.type === 'file' ? <div className="text-center p-1"><FileText className="text-gray-400 mx-auto" size={20} /><span className="text-[8px] block truncate w-16">{att.fileName}</span></div> : <img src={att.url} className="w-full h-full object-cover rounded-lg" />}<button onClick={() => removeAttachment(att.id, true)} className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5"><X size={12} /></button></div>))}<label className="w-20 h-20 border-2 border-dashed border-red-200 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:bg-red-50">{isUploadingEdit ? <Loader2 className="animate-spin text-red-500" /> : <Plus className="text-red-400" />}<input type="file" multiple onChange={(e) => handleFileUpload(e, true)} disabled={isUploadingEdit} className="hidden" /></label></div></div><button onClick={saveEdit} className="w-full bg-[#B91C1C] text-white py-4 rounded-xl font-black hover:bg-red-800 shadow-lg mt-2 uppercase tracking-wide">Simpan Perubahan</button></div></div></div> )}
      {itemToDelete && ( <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm"><div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 text-center relative"><div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 text-[#B91C1C]"><AlertTriangle size={40} /></div><h3 className="text-2xl font-black text-gray-900 mb-2">Hapus Permanen?</h3><p className="text-sm text-gray-500 mb-6">Ketik judul <strong className="text-[#B91C1C]">"{itemToDelete.title}"</strong> untuk konfirmasi.</p><input type="text" className="w-full border-2 border-gray-200 p-3 rounded-xl mb-6 font-bold text-center text-lg focus:border-[#B91C1C] outline-none" value={deleteConfirmationText} onChange={(e) => setDeleteConfirmationText(e.target.value)} autoFocus /><div className="flex gap-3"><button onClick={() => setItemToDelete(null)} className="flex-1 py-3 text-gray-600 bg-gray-100 rounded-xl font-bold">Batal</button><button onClick={confirmDelete} disabled={deleteConfirmationText !== itemToDelete.title} className="flex-1 py-3 bg-[#B91C1C] text-white rounded-xl font-bold hover:bg-red-800 disabled:opacity-50">Hapus</button></div></div></div> )}

      <div className="max-w-7xl mx-auto">
        <div className="mb-8 text-center md:text-left">
            <h1 className="text-6xl font-black text-[#B91C1C] mb-2 tracking-tighter drop-shadow-sm">Pasifixc.</h1>
            <p className="text-gray-500 font-medium text-lg max-w-2xl">Creative Inspiration & Project Management.</p>
        </div>

        {/* SEARCH & SORT BAR */}
        <div className="flex flex-col md:flex-row gap-4 mb-8">
            <div className="flex-1 relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                <input type="text" placeholder="Cari project..." className="w-full pl-12 pr-4 py-3 rounded-2xl border border-gray-200 shadow-sm focus:outline-none focus:border-[#B91C1C] focus:ring-1 focus:ring-[#B91C1C]" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>
            <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-2xl border border-gray-200 shadow-sm">
                <Filter size={20} className="text-gray-400" />
                <select className="bg-transparent font-bold text-gray-700 outline-none cursor-pointer" value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}>
                    <option value="newest">Terbaru</option>
                    <option value="oldest">Terlama</option>
                    <option value="az">Judul (A-Z)</option>
                    <option value="za">Judul (Z-A)</option>
                </select>
            </div>
        </div>

        {/* INPUT FORM */}
        {!searchQuery && (
        <div className="bg-white p-8 rounded-3xl shadow-xl shadow-red-100/40 border border-white mb-12 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-[#FFF0F0] rounded-bl-full -z-0 group-hover:scale-110 transition-transform duration-500" />
          <div className="relative z-10">
            <h2 className="text-xl font-bold mb-6 text-gray-900 flex items-center gap-2"><span className="w-2 h-8 bg-[#B91C1C] rounded-full"></span>Tambah Project Baru</h2>
            <form onSubmit={handleAddItem} className="space-y-5">
                <div className="flex flex-col md:flex-row gap-5">
                  <div className="flex-1 space-y-2"><label className="text-xs font-bold text-gray-400 uppercase tracking-wider ml-1">Judul Project</label><input type="text" placeholder="Contoh: Motion Graphic 2025" className="w-full p-4 border-2 border-gray-100 bg-[#FAFAFA] rounded-2xl focus:outline-none focus:border-[#B91C1C] focus:bg-white transition-all font-bold text-gray-800 placeholder:font-normal" value={newItemTitle} onChange={(e) => setNewItemTitle(e.target.value)} required /></div>
                  <div className="flex-1 space-y-2">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider ml-1">Lampiran</label>
                    <div className="flex flex-col gap-3">
                      <label className={`cursor-pointer w-full p-4 border-2 border-dashed border-red-200 rounded-2xl flex items-center justify-center font-bold text-[#B91C1C] transition-colors ${isUploading ? 'bg-red-50 opacity-50' : 'hover:bg-[#FFF0F0] hover:border-[#B91C1C]'}`}>
                          {isUploading ? <Loader2 className="animate-spin mr-2" /> : <UploadCloud className="mr-2" />}
                          {isUploading ? 'Mengupload...' : 'Pilih File (Bebas Tipe)'}
                          <input type="file" multiple onChange={(e) => handleFileUpload(e, false)} disabled={isUploading} className="hidden" />
                      </label>
                      {newItemAttachments.length > 0 && <div className="flex gap-2 overflow-x-auto pb-2">{newItemAttachments.map(att => (<div key={att.id} className="relative w-16 h-16 flex-shrink-0 bg-gray-100 rounded-lg flex items-center justify-center border border-gray-200">{att.type === 'video' ? <Film className="text-gray-500" size={20}/> : att.type === 'file' ? <FileText className="text-gray-500" size={20}/> : <img src={att.url} className="w-full h-full object-cover rounded-lg" />}<button type="button" onClick={() => removeAttachment(att.id, false)} className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5"><X size={10} /></button></div>))}</div>}
                    </div>
                  </div>
                </div>
                <div className="space-y-2"><label className="text-xs font-bold text-gray-400 uppercase tracking-wider ml-1">Deskripsi Singkat</label><textarea placeholder="Detail project..." className="w-full p-4 border-2 border-gray-100 bg-[#FAFAFA] rounded-2xl h-24 focus:outline-none focus:border-[#B91C1C] focus:bg-white transition-all resize-none" value={newItemDesc} onChange={(e) => setNewItemDesc(e.target.value)} /></div>
                <button type="submit" disabled={isUploading || !newItemTitle || newItemAttachments.length === 0} className="bg-[#B91C1C] hover:bg-red-800 disabled:bg-gray-300 text-white px-8 py-4 rounded-2xl font-black text-lg flex items-center justify-center gap-2 transition-all shadow-xl w-full md:w-auto"><Plus size={24} strokeWidth={3} /> CREATE PROJECT</button>
            </form>
          </div>
        </div>
        )}

        {/* LOADING STATE */}
        {isLoading && <div className="flex flex-col items-center justify-center py-20"><Loader2 className="animate-spin text-[#B91C1C] mb-2" size={40} /><p className="text-gray-400 font-bold">Memuat data dari Firebase...</p></div>}

        {/* GRID LIST */}
        {!isLoading && filteredItems.length === 0 && <div className="text-center py-20 text-gray-400"><p className="font-bold">Tidak ada project yang ditemukan.</p></div>}
        
        {!isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredItems.map((item) => (
            <div key={item.id} className={`bg-white rounded-3xl shadow-sm border border-gray-100 flex flex-col transition-all duration-300 ${item.isDone ? 'opacity-60 grayscale-[0.8]' : 'hover:shadow-2xl hover:shadow-red-100/50 hover:-translate-y-2'}`}>
              <div className="rounded-t-3xl overflow-hidden relative">
                 <MediaGallery attachments={item.attachments} />
                 {item.isDone && <div className="absolute inset-0 bg-white/40 flex items-center justify-center backdrop-blur-sm z-10"><div className="bg-green-500 text-white px-4 py-2 rounded-full font-black shadow-lg flex items-center gap-2"><CheckCircle size={20} /> COMPLETED</div></div>}
                 <div className="absolute top-4 right-4 flex gap-2 z-20"><button onClick={() => startEdit(item)} className="bg-white text-gray-700 hover:text-[#B91C1C] p-3 rounded-full shadow-lg font-bold transition-all"><Pencil size={18} /></button><button onClick={() => setItemToDelete(item)} className="bg-white text-gray-700 hover:text-red-600 p-3 rounded-full shadow-lg font-bold transition-all"><Trash2 size={18} /></button></div>
              </div>
              <div className="p-6 flex flex-col flex-1">
                <h3 className={`font-black text-2xl mb-3 leading-tight ${item.isDone ? 'line-through text-gray-400' : 'text-gray-900'}`}>{item.title}</h3>
                {item.description && <p className="text-gray-500 text-sm mb-6 leading-relaxed line-clamp-3">{item.description}</p>}
                <button onClick={() => toggleCheck(item)} className={`w-full mb-6 py-3 px-4 rounded-xl flex items-center justify-center gap-2 text-sm font-bold transition-all border-2 ${item.isDone ? 'bg-gray-100 text-gray-500 border-transparent' : 'bg-white text-[#B91C1C] border-red-100 hover:bg-[#FFF0F0] hover:border-[#B91C1C]'}`}>{item.isDone ? 'Batalkan Selesai' : 'Tandai Selesai'}</button>
                <div className="mt-auto border-t-2 border-gray-50 pt-4">
                  <div className="flex items-center justify-between text-gray-400 mb-4"><div className="flex items-center gap-2"><MessageSquare size={16} className="text-[#B91C1C]" /><span className="text-xs font-black uppercase tracking-wider text-gray-900">Diskusi Team</span></div><span className="text-xs font-bold bg-gray-100 px-2 py-1 rounded text-gray-500">{(item.comments || []).length}</span></div>
                  <div className="space-y-1 mb-4 overflow-hidden">{(expandedComments[item.id] ? item.comments : (item.comments || []).slice(0, 3)).map((comment) => (<CommentItem key={comment.id} comment={comment} item={item} />))}</div>
                  {(item.comments || []).length > 3 && (<button onClick={() => setExpandedComments(prev => ({ ...prev, [item.id]: !prev[item.id] }))} className="text-xs text-gray-500 font-bold mb-4 flex items-center justify-center w-full gap-1 hover:text-[#B91C1C] py-2">{expandedComments[item.id] ? <><ChevronUp size={14} /> Tutup Komentar</> : <><ChevronDown size={14} /> Lihat {(item.comments || []).length - 3} komentar lain</>}</button>)}
                  {!replyingTo && (<div className="flex flex-col gap-3 bg-gray-50 p-4 rounded-2xl border border-gray-100"><input type="text" placeholder="Nama Anda" className="text-xs font-bold p-2 bg-transparent border-b border-gray-200 w-full focus:outline-none focus:border-[#B91C1C] text-gray-900 placeholder:text-gray-400" value={userName} onChange={(e) => setUserName(e.target.value)} /><div className="flex gap-2"><input type="text" placeholder="Tulis komentar..." className="flex-1 bg-white border border-gray-200 p-3 rounded-xl text-xs focus:outline-none focus:border-[#B91C1C] font-medium" value={commentInputs[item.id] || ''} onChange={(e) => setCommentInputs({ ...commentInputs, [item.id]: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && handleSendComment(item)} /><button onClick={() => handleSendComment(item)} className="bg-gray-900 text-white px-4 rounded-xl text-xs font-bold hover:bg-[#B91C1C] transition-colors">Kirim</button></div></div>)}
                </div>
              </div>
            </div>
          ))}
        </div>
        )}

        {/* --- STOCK ACTIVITY CHART --- */}
        {!isLoading && <StockActivityChart items={items} />}

      </div>
    </div>
  );
}
