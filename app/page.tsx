'use client';

import React, { useState, useEffect } from 'react';
import { Trash2, CheckCircle, MessageSquare, Plus, Image as ImageIcon, Loader2, UploadCloud, X, AlertTriangle, Pencil, Save, CornerDownRight, ChevronDown, ChevronUp } from 'lucide-react';

// --- FIREBASE IMPORTS ---
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, onValue, push, set, remove, update } from 'firebase/database';

// --- KONFIGURASI FIREBASE ---
// ⚠️ PENTING: Ganti konfigurasi di bawah ini dengan milikmu sendiri dari Firebase Console
// Caranya: Buka Firebase Console -> Project Settings -> General -> Scroll ke bawah "Your apps" -> SDK Setup and Configuration
const firebaseConfig = {
  // Masukkan API Key kamu di sini (biasanya diawali AIza...)
  apiKey: "API_KEY_KAMU_DISINI", 
  authDomain: "pasifixc.firebaseapp.com",
  // ✅ Ini URL database yang kamu kirim:
  databaseURL: "https://pasifixc-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "pasifixc",
  storageBucket: "pasifixc.appspot.com",
  messagingSenderId: "SENDER_ID_KAMU",
  appId: "APP_ID_KAMU"
};

// Initialize Firebase (Cek agar tidak double init)
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// --- TIPE DATA ---
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
  imageUrl: string;
  isDone: boolean;
  comments: Comment[];
}

export default function InspirationBoard() {
  // --- STATE UTAMA ---
  const [items, setItems] = useState<InspirationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // --- STATE FORM INPUT ---
  const [newItemTitle, setNewItemTitle] = useState('');
  const [newItemDesc, setNewItemDesc] = useState('');
  const [newItemUrl, setNewItemUrl] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  
  // --- STATE MODAL EDIT ---
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [isUploadingEdit, setIsUploadingEdit] = useState(false);

  // --- STATE MODAL DELETE ---
  const [itemToDelete, setItemToDelete] = useState<InspirationItem | null>(null);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
  
  // --- STATE KOMENTAR & UI ---
  const [commentInputs, setCommentInputs] = useState<{ [key: string]: string }>({}); 
  const [userName, setUserName] = useState(''); 
  const [replyingTo, setReplyingTo] = useState<{ itemId: string, commentId: string } | null>(null);
  const [expandedComments, setExpandedComments] = useState<{ [itemId: string]: boolean }>({});

  // ----------------------------------------------------------------
  // 1. FIREBASE REALTIME LISTENER (PENGGANTI LOCALSTORAGE)
  // ----------------------------------------------------------------
  useEffect(() => {
    const inspirationsRef = ref(db, 'inspirations');
    
    // Fungsi ini akan jalan setiap ada perubahan di database (Realtime!)
    const unsubscribe = onValue(inspirationsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        // Konversi Object Firebase ke Array untuk React
        const parsedItems: InspirationItem[] = Object.keys(data).map((key) => ({
          id: key, // Firebase pakai key sebagai ID
          ...data[key],
          comments: data[key].comments || [] // Jaga-jaga kalau kosong
        })).reverse(); // Urutkan biar yang baru di atas
        setItems(parsedItems);
      } else {
        setItems([]);
      }
      setIsLoading(false);
    });

    // Load username dari local (ini gapapa local, kan preferensi user di device itu)
    const savedName = localStorage.getItem('inspiration-username');
    if (savedName) setUserName(savedName);

    // Cleanup listener saat pindah halaman
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    localStorage.setItem('inspiration-username', userName);
  }, [userName]);

  // ----------------------------------------------------------------
  // 2. FUNGSI UPLOAD CLOUDINARY (TETAP SAMA)
  // ----------------------------------------------------------------
  const uploadToCloudinary = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', 'ml_default'); 

    const res = await fetch('https://api.cloudinary.com/v1_1/dl2ijoilh/image/upload', {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();
    return data.secure_url;
  };

  const handleFileUploadNew = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const url = await uploadToCloudinary(file);
      if (url) setNewItemUrl(url);
    } catch (err) { alert('Gagal upload'); } 
    finally { setIsUploading(false); }
  };

  const handleFileUploadEdit = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingEdit(true);
    try {
      const url = await uploadToCloudinary(file);
      if (url) setEditUrl(url);
    } catch (err) { alert('Gagal upload edit'); } 
    finally { setIsUploadingEdit(false); }
  };

  // ----------------------------------------------------------------
  // 3. LOGIC CRUD (KE FIREBASE)
  // ----------------------------------------------------------------
  
  // CREATE
  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemTitle || !newItemUrl) return;

    const newItemRef = push(ref(db, 'inspirations')); // Minta ID baru dari Firebase
    await set(newItemRef, {
      title: newItemTitle,
      description: newItemDesc,
      imageUrl: newItemUrl,
      isDone: false,
      comments: []
    });

    setNewItemTitle(''); setNewItemDesc(''); setNewItemUrl('');
  };

  // EDIT
  const startEdit = (item: InspirationItem) => {
    setIsEditing(true); setEditId(item.id); setEditTitle(item.title); setEditDesc(item.description); setEditUrl(item.imageUrl);
  };

  const saveEdit = async () => {
    if (!editId) return;
    await update(ref(db, `inspirations/${editId}`), {
      title: editTitle,
      description: editDesc,
      imageUrl: editUrl
    });
    setIsEditing(false); setEditId(null);
  };

  // DELETE
  const confirmDelete = async () => {
    if (!itemToDelete) return;
    if (deleteConfirmationText === itemToDelete.title) {
      await remove(ref(db, `inspirations/${itemToDelete.id}`));
      setItemToDelete(null);
    }
  };

  // TOGGLE DONE
  const toggleCheck = async (item: InspirationItem) => {
    await update(ref(db, `inspirations/${item.id}`), {
      isDone: !item.isDone
    });
  };

  // ----------------------------------------------------------------
  // 4. LOGIC KOMENTAR (UPDATE KE FIREBASE)
  // ----------------------------------------------------------------
  // Helper: Update seluruh array comments di Firebase
  const updateCommentsInFirebase = async (itemId: string, newComments: Comment[]) => {
    await update(ref(db, `inspirations/${itemId}`), {
      comments: newComments
    });
  };

  const addReplyToComment = (comments: Comment[], targetId: string, newReply: Comment): Comment[] => {
    return comments.map(comment => {
      if (comment.id === targetId) return { ...comment, replies: [...(comment.replies || []), newReply] }; // Safety check for null replies
      else if (comment.replies && comment.replies.length > 0) return { ...comment, replies: addReplyToComment(comment.replies, targetId, newReply) };
      return comment;
    });
  };

  const deleteCommentRecursive = (comments: Comment[], targetId: string): Comment[] => {
    return comments
      .filter(c => c.id !== targetId)
      .map(c => ({ ...c, replies: c.replies ? deleteCommentRecursive(c.replies, targetId) : [] }));
  };

  const editCommentRecursive = (comments: Comment[], targetId: string, newText: string): Comment[] => {
    return comments.map(c => {
      if (c.id === targetId) return { ...c, text: newText };
      return { ...c, replies: c.replies ? editCommentRecursive(c.replies, targetId, newText) : [] };
    });
  };

  // ACTIONS
  const handleSendComment = (item: InspirationItem, parentCommentId: string | null = null) => {
    if (!userName.trim()) { alert("Mohon isi 'Nama Anda' terlebih dahulu."); return; }
    const text = commentInputs[item.id];
    if (!text) return;

    const newComment: Comment = {
      id: Date.now().toString(),
      sender: userName,
      text: text,
      createdAt: new Date().toLocaleDateString('id-ID'),
      replies: []
    };

    let updatedComments;
    if (parentCommentId) {
      updatedComments = addReplyToComment(item.comments, parentCommentId, newComment);
    } else {
      updatedComments = [...item.comments, newComment];
    }

    updateCommentsInFirebase(item.id, updatedComments);
    setCommentInputs({ ...commentInputs, [item.id]: '' });
    setReplyingTo(null);
  };

  const handleDeleteComment = (item: InspirationItem, commentId: string) => {
    if (!confirm('Hapus komentar ini?')) return;
    const updatedComments = deleteCommentRecursive(item.comments, commentId);
    updateCommentsInFirebase(item.id, updatedComments);
  };

  const handleEditComment = (item: InspirationItem, commentId: string, newText: string) => {
    const updatedComments = editCommentRecursive(item.comments, commentId, newText);
    updateCommentsInFirebase(item.id, updatedComments);
  };

  const toggleExpanded = (itemId: string) => {
    setExpandedComments(prev => ({ ...prev, [itemId]: !prev[itemId] }));
  };

  // --- COMPONENT KOMENTAR (TETAP SAMA) ---
  const CommentItem = ({ comment, item, depth = 0 }: { comment: Comment, item: InspirationItem, depth?: number }) => {
    const [isEditingComment, setIsEditingComment] = useState(false);
    const [editText, setEditText] = useState(comment.text);
    const isReplying = replyingTo?.itemId === item.id && replyingTo?.commentId === comment.id;
    
    let containerClass = "mt-3 relative";
    if (depth > 0) {
        if (depth < 3) containerClass += " ml-4 pl-3 border-l-2 border-red-100";
        else containerClass += " mt-2 pt-2 border-t border-dashed border-red-100";
    } else { containerClass += " mt-4"; }

    const saveEditComment = () => { handleEditComment(item, comment.id, editText); setIsEditingComment(false); };

    return (
      <div className={containerClass}>
        <div className={`p-3 rounded-xl transition-colors group relative ${depth >= 3 ? 'bg-[#FFF5F5]' : 'bg-white border border-gray-100 hover:border-red-200'}`}>
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-2">
               <span className="text-xs font-bold text-[#B91C1C]">{comment.sender}</span>
               {depth > 0 && <span className="text-[9px] bg-red-50 text-red-500 px-1.5 py-0.5 rounded-full font-bold">reply</span>}
            </div>
            <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-400">{comment.createdAt}</span>
                {!isEditingComment && (
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => setIsEditingComment(true)} className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-blue-500"><Pencil size={12} /></button>
                        <button onClick={() => handleDeleteComment(item, comment.id)} className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-red-500"><Trash2 size={12} /></button>
                    </div>
                )}
            </div>
          </div>
          
          {isEditingComment ? (
              <div className="mt-2">
                  <textarea className="w-full text-sm p-2 border border-blue-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-blue-50" value={editText} onChange={(e) => setEditText(e.target.value)} rows={2} />
                  <div className="flex gap-2 mt-2 justify-end">
                      <button onClick={() => setIsEditingComment(false)} className="text-xs text-gray-500 font-bold px-2 py-1 hover:bg-gray-100 rounded">Batal</button>
                      <button onClick={saveEditComment} className="text-xs bg-blue-600 text-white font-bold px-3 py-1 rounded hover:bg-blue-700">Simpan</button>
                  </div>
              </div>
          ) : (
            <>
                <p className="text-sm text-gray-700 mt-1 leading-relaxed break-words break-all whitespace-pre-wrap">{comment.text}</p>
                <button onClick={() => setReplyingTo({ itemId: item.id, commentId: comment.id })} className="text-[11px] text-red-500 font-bold mt-2 flex items-center gap-1 hover:underline opacity-0 group-hover:opacity-100 transition-opacity">
                    <CornerDownRight size={12} /> Balas
                </button>
            </>
          )}
        </div>
        {isReplying && (
          <div className="mt-2 ml-2 p-3 bg-white rounded-xl border border-red-200 shadow-lg shadow-red-100/50 z-10 relative animate-in fade-in zoom-in-95">
            <div className="flex justify-between items-center mb-2"><p className="text-xs text-red-600 font-bold">Membalas {comment.sender}...</p><button onClick={() => setReplyingTo(null)} className="text-gray-400 hover:text-red-500"><X size={14}/></button></div>
            <div className="flex gap-2">
              <input type="text" autoFocus placeholder="Tulis balasan..." className="flex-1 text-xs p-2 border border-red-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 bg-gray-50" value={commentInputs[item.id] || ''} onChange={(e) => setCommentInputs({ ...commentInputs, [item.id]: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && handleSendComment(item, comment.id)} />
              <button onClick={() => handleSendComment(item, comment.id)} className="bg-[#B91C1C] text-white text-xs px-4 rounded-lg font-bold hover:bg-red-800 transition-colors">Kirim</button>
            </div>
          </div>
        )}
        {(comment.replies || []).map(reply => ( <CommentItem key={reply.id} comment={reply} item={item} depth={depth + 1} /> ))}
      </div>
    );
  };

  // ----------------------------------------------------------------
  // 5. TAMPILAN UTAMA (PASIFIXC STYLE)
  // ----------------------------------------------------------------
  return (
    <div className="min-h-screen bg-[#FFF0F0] p-6 md:p-12 font-sans text-gray-800 relative selection:bg-red-200">
      
      {/* MODAL EDIT PROJECT */}
      {isEditing && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-8 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-2 bg-[#B91C1C]"></div>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-black text-[#B91C1C] flex items-center gap-2 tracking-tight">EDIT PROJECT.</h3>
              <button onClick={() => setIsEditing(false)} className="bg-gray-100 p-2 rounded-full hover:bg-red-100 hover:text-red-600 transition-all"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <div className="space-y-1"><label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Judul</label><input type="text" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="w-full p-3 border-2 border-gray-100 rounded-xl focus:outline-none focus:border-[#B91C1C] bg-white font-bold text-lg" /></div>
              <div className="space-y-1"><label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Deskripsi</label><textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} className="w-full p-3 border-2 border-gray-100 rounded-xl h-24 focus:outline-none focus:border-[#B91C1C] bg-white resize-none" /></div>
              <div className="flex gap-4 items-end bg-gray-50 p-3 rounded-xl border border-gray-100">
                {editUrl && <img src={editUrl} alt="Preview" className="w-16 h-16 object-cover rounded-lg border border-gray-200" />}
                <label className="flex-1 cursor-pointer"><span className="block text-xs font-bold text-gray-400 uppercase mb-1">Ganti Gambar</span><div className="px-4 py-2 bg-white border border-gray-200 text-gray-600 rounded-lg text-sm font-bold hover:border-red-400 hover:text-red-600 transition-all text-center">{isUploadingEdit ? 'Uploading...' : 'Pilih File Baru'}</div><input type="file" accept="image/*" onChange={handleFileUploadEdit} disabled={isUploadingEdit} className="hidden" /></label>
              </div>
              <button onClick={saveEdit} className="w-full bg-[#B91C1C] text-white py-4 rounded-xl font-black hover:bg-red-800 shadow-lg shadow-red-200 mt-2 flex justify-center gap-2 tracking-wide uppercase"><Save size={20} /> Simpan Perubahan</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL HAPUS PROJECT */}
      {itemToDelete && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 text-center relative overflow-hidden">
             <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 text-[#B91C1C]"><AlertTriangle size={40} /></div>
            <h3 className="text-2xl font-black text-gray-900 mb-2">Hapus Permanen?</h3>
            <p className="text-sm text-gray-500 mb-6">Ketik judul <strong className="text-[#B91C1C]">"{itemToDelete.title}"</strong> di bawah untuk konfirmasi.</p>
            <input type="text" className="w-full border-2 border-gray-200 p-3 rounded-xl mb-6 focus:border-[#B91C1C] outline-none font-bold text-center text-lg" placeholder={itemToDelete.title} value={deleteConfirmationText} onChange={(e) => setDeleteConfirmationText(e.target.value)} autoFocus />
            <div className="flex gap-3">
              <button onClick={() => setItemToDelete(null)} className="flex-1 py-3 text-gray-600 hover:bg-gray-100 rounded-xl font-bold bg-gray-50">Batal</button>
              <button onClick={confirmDelete} disabled={deleteConfirmationText !== itemToDelete.title} className="flex-1 py-3 bg-[#B91C1C] text-white rounded-xl hover:bg-red-800 disabled:opacity-50 disabled:cursor-not-allowed font-bold">Hapus</button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto">
        <div className="mb-12 text-center md:text-left">
            <h1 className="text-6xl font-black text-[#B91C1C] mb-2 tracking-tighter drop-shadow-sm">Pasifixc.</h1>
            <p className="text-gray-500 font-medium text-lg max-w-2xl">Creative Inspiration & Project Management.</p>
        </div>

        {/* INPUT FORM */}
        <div className="bg-white p-8 rounded-3xl shadow-xl shadow-red-100/40 border border-white mb-16 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-[#FFF0F0] rounded-bl-full -z-0 group-hover:scale-110 transition-transform duration-500" />
          <div className="relative z-10">
            <h2 className="text-xl font-bold mb-6 text-gray-900 flex items-center gap-2"><span className="w-2 h-8 bg-[#B91C1C] rounded-full"></span>Tambah Project Baru</h2>
            <form onSubmit={handleAddItem} className="space-y-5">
                <div className="flex flex-col md:flex-row gap-5">
                <div className="flex-1 space-y-2"><label className="text-xs font-bold text-gray-400 uppercase tracking-wider ml-1">Judul Project</label><input type="text" placeholder="Contoh: Motion Graphic 2025" className="w-full p-4 border-2 border-gray-100 bg-[#FAFAFA] rounded-2xl focus:outline-none focus:border-[#B91C1C] focus:bg-white transition-all font-bold text-gray-800 placeholder:font-normal" value={newItemTitle} onChange={(e) => setNewItemTitle(e.target.value)} required /></div>
                <div className="flex-1 space-y-2"><label className="text-xs font-bold text-gray-400 uppercase tracking-wider ml-1">Cover Image</label><div className="flex gap-2"><input type="text" placeholder="URL otomatis terisi..." className="flex-1 p-4 bg-gray-50 border-2 border-gray-100 rounded-2xl text-sm font-medium text-gray-500 focus:outline-none" value={newItemUrl} readOnly required /><label className={`cursor-pointer px-6 border-2 border-dashed border-red-200 rounded-2xl flex items-center justify-center font-bold text-[#B91C1C] transition-colors ${isUploading ? 'bg-red-50 opacity-50' : 'hover:bg-[#FFF0F0] hover:border-[#B91C1C]'}`}>{isUploading ? <Loader2 className="animate-spin" /> : <UploadCloud />}<input type="file" accept="image/*" onChange={handleFileUploadNew} disabled={isUploading} className="hidden" /></label></div></div>
                </div>
                <div className="space-y-2"><label className="text-xs font-bold text-gray-400 uppercase tracking-wider ml-1">Deskripsi Singkat</label><textarea placeholder="Detail project..." className="w-full p-4 border-2 border-gray-100 bg-[#FAFAFA] rounded-2xl h-24 focus:outline-none focus:border-[#B91C1C] focus:bg-white transition-all resize-none" value={newItemDesc} onChange={(e) => setNewItemDesc(e.target.value)} /></div>
                <button type="submit" disabled={isUploading || !newItemTitle || !newItemUrl} className="bg-[#B91C1C] hover:bg-red-800 disabled:bg-gray-300 text-white px-8 py-4 rounded-2xl font-black text-lg flex items-center justify-center gap-2 transition-all shadow-xl shadow-red-200 hover:shadow-red-300 transform hover:-translate-y-1 w-full md:w-auto"><Plus size={24} strokeWidth={3} /> CREATE PROJECT</button>
            </form>
          </div>
        </div>

        {/* LOADING STATE */}
        {isLoading && (
            <div className="flex flex-col items-center justify-center py-20">
                <Loader2 className="animate-spin text-[#B91C1C] mb-2" size={40} />
                <p className="text-gray-400 font-bold">Memuat data dari Firebase...</p>
            </div>
        )}

        {/* GRID LIST */}
        {!isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {items.map((item) => (
            <div key={item.id} className={`bg-white rounded-3xl shadow-sm border border-gray-100 flex flex-col transition-all duration-300 ${item.isDone ? 'opacity-60 grayscale-[0.8]' : 'hover:shadow-2xl hover:shadow-red-100/50 hover:-translate-y-2'}`}>
              
              <div className="relative h-64 bg-gray-100 w-full group overflow-hidden rounded-t-3xl">
                {item.imageUrl ? <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" /> : <div className="flex items-center justify-center h-full text-gray-300"><ImageIcon size={48} /></div>}
                {item.isDone && <div className="absolute inset-0 bg-white/40 flex items-center justify-center backdrop-blur-sm"><div className="bg-green-500 text-white px-4 py-2 rounded-full font-black shadow-lg flex items-center gap-2"><CheckCircle size={20} /> COMPLETED</div></div>}
                <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity translate-y-2 group-hover:translate-y-0">
                  <button onClick={() => startEdit(item)} className="bg-white text-gray-700 hover:text-[#B91C1C] p-3 rounded-full shadow-lg font-bold transition-all hover:scale-110"><Pencil size={18} /></button>
                  <button onClick={() => setItemToDelete(item)} className="bg-white text-gray-700 hover:text-red-600 p-3 rounded-full shadow-lg font-bold transition-all hover:scale-110"><Trash2 size={18} /></button>
                </div>
              </div>

              <div className="p-6 flex flex-col flex-1">
                <h3 className={`font-black text-2xl mb-3 leading-tight ${item.isDone ? 'line-through text-gray-400' : 'text-gray-900'}`}>{item.title}</h3>
                {item.description && <p className="text-gray-500 text-sm mb-6 leading-relaxed line-clamp-3">{item.description}</p>}
                
                <button onClick={() => toggleCheck(item)} className={`w-full mb-6 py-3 px-4 rounded-xl flex items-center justify-center gap-2 text-sm font-bold transition-all border-2 ${item.isDone ? 'bg-gray-100 text-gray-500 border-transparent' : 'bg-white text-[#B91C1C] border-red-100 hover:bg-[#FFF0F0] hover:border-[#B91C1C]'}`}>
                  {item.isDone ? 'Batalkan Selesai' : 'Tandai Selesai'}
                </button>

                <div className="mt-auto border-t-2 border-gray-50 pt-4">
                  <div className="flex items-center justify-between text-gray-400 mb-4">
                     <div className="flex items-center gap-2"><MessageSquare size={16} className="text-[#B91C1C]" /><span className="text-xs font-black uppercase tracking-wider text-gray-900">Diskusi Team</span></div>
                     <span className="text-xs font-bold bg-gray-100 px-2 py-1 rounded text-gray-500">{(item.comments || []).length}</span>
                  </div>

                  <div className="space-y-1 mb-4 overflow-hidden"> 
                    {(expandedComments[item.id] ? item.comments : (item.comments || []).slice(0, 3)).map((comment) => (
                      <CommentItem key={comment.id} comment={comment} item={item} />
                    ))}
                  </div>

                  {(item.comments || []).length > 3 && (
                    <button onClick={() => toggleExpanded(item.id)} className="text-xs text-gray-500 font-bold mb-4 flex items-center justify-center w-full gap-1 hover:text-[#B91C1C] py-2">
                      {expandedComments[item.id] ? <><ChevronUp size={14} /> Tutup Komentar</> : <><ChevronDown size={14} /> Lihat {(item.comments || []).length - 3} komentar lain</>}
                    </button>
                  )}

                  {!replyingTo && (
                    <div className="flex flex-col gap-3 bg-gray-50 p-4 rounded-2xl border border-gray-100">
                      <input type="text" placeholder="Nama Anda" className="text-xs font-bold p-2 bg-transparent border-b border-gray-200 w-full focus:outline-none focus:border-[#B91C1C] text-gray-900 placeholder:text-gray-400" value={userName} onChange={(e) => setUserName(e.target.value)} />
                      <div className="flex gap-2">
                        <input type="text" placeholder="Tulis komentar..." className="flex-1 bg-white border border-gray-200 p-3 rounded-xl text-xs focus:outline-none focus:border-[#B91C1C] font-medium" value={commentInputs[item.id] || ''} onChange={(e) => setCommentInputs({ ...commentInputs, [item.id]: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && handleSendComment(item)} />
                        <button onClick={() => handleSendComment(item)} className="bg-gray-900 text-white px-4 rounded-xl text-xs font-bold hover:bg-[#B91C1C] transition-colors">Kirim</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
        )}
      </div>
    </div>
  );
}