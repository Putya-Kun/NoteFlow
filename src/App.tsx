/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { 
  Plus, 
  Search, 
  Filter,
  Trash2, 
  MoreVertical, 
  PenSquare, 
  Menu,
  X,
  Pin,
  Clock,
  RotateCcw,
  Layout,
  Share,
  Settings,
  Palette,
  Pencil,
  AlertTriangle,
  Square,
  Triangle,
  Hexagon,
  MessageSquare,
  Shapes,
  Image as ImageIcon,
  Eraser,
  Undo2,
  Redo2,
  Download,
  MousePointer2,
  Highlighter,
  Type,
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  ChevronUp,
  ChevronDown,
  Moon,
  Sun,
  LogOut,
  LogIn,
  Loader2,
  Wrench,
  Eye,
  EyeOff
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Stage, Layer, Line, Rect, RegularPolygon, Image as KonvaImage, Text, Transformer } from 'react-konva';
import ReactQuill, { Quill } from 'react-quill-new';
import { useDrag } from '@use-gesture/react';

// Firebase
import { auth, db, googleProvider } from './firebase';
import { signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { 
  collection, 
  query, 
  onSnapshot, 
  doc, 
  setDoc, 
  deleteDoc, 
  orderBy, 
  serverTimestamp, 
  Timestamp,
  getDocFromServer
} from 'firebase/firestore';
import { useAuthState } from 'react-firebase-hooks/auth';

// --- Quill Font Size Configuration ---
const SizeStyle = Quill.import('attributors/style/size');
(SizeStyle as any).whitelist = Array.from({ length: 120 }, (_, i) => `${i + 8}px`);
Quill.register(SizeStyle as any, true);

// --- Types ---

const WELCOME_NOTE_ID = '1';

interface DrawingElement {
  id: string;
  type: 'line' | 'rect' | 'triangle' | 'pentagon' | 'bubble_sharp' | 'bubble_round' | 'image';
  points?: number[];
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  color: string;
  strokeWidth: number;
  opacity: number;
  imageObj?: HTMLImageElement; // Runtime only correctly matched with src
  src?: string; // For images
}

interface Note {
  id: string;
  title: string;
  content: string;
  updatedAt: number;
  pinned: boolean;
  color: string;
  isTrash: boolean;
  doodleData?: DrawingElement[];
  fontFamily?: string;
  fontSize?: number;
  isBold?: boolean;
  isItalic?: boolean;
  textAlign?: 'left' | 'center' | 'right';
}

type ViewMode = 'all' | 'trash';

const COLORS = [
  'bg-note-white',
  'bg-note-slate',
  'bg-note-blue',
  'bg-note-emerald',
  'bg-note-amber',
  'bg-note-rose',
  'bg-note-purple',
];

// --- Components ---

export default function App() {
  const [user, loadingAuth] = useAuthState(auth);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(true);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'none' | 'week' | 'month'>('none');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('all');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [showPinWarning, setShowPinWarning] = useState<string | null>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isDoodleMode, setIsDoodleMode] = useState(false);
  const [showTextSettings, setShowTextSettings] = useState(false);
  const [showEditorSettings, setShowEditorSettings] = useState(false);
  const [showWordCount, setShowWordCount] = useState(false);
  const [showLineCount, setShowLineCount] = useState(false);
  const [showDoodles, setShowDoodles] = useState(true);
  const [systemAlert, setSystemAlert] = useState<string | null>(null);

  // Connection Test
  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
        console.log("Firebase connection successful.");
      } catch (error: any) {
        if (error.message && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration or internet connection.");
        } else if (error.code === 'permission-denied') {
          console.error("Firestore permission denied on connection test path. Check security rules.");
        } else {
          console.error("Firestore connectivity issue:", error);
        }
      }
    }
    testConnection();
  }, []);
  
  // Performance: Stable Canvas Sizes
  const [stageSize, setStageSize] = useState({ 
    width: typeof window !== 'undefined' ? window.innerWidth : 1200, 
    height: typeof window !== 'undefined' ? window.innerHeight : 800 
  });
  
  // Doodle Toolbar States
  const [tool, setTool] = useState<'marker' | 'highlighter' | 'pencil' | 'eraser' | 'shape' | 'select'>('marker');
  const [shapeType, setShapeType] = useState<DrawingElement['type']>('rect');
  const [brushColor, setBrushColor] = useState('#0078d4');
  const [brushWidth, setBrushWidth] = useState(4);
  const [elements, setElements] = useState<DrawingElement[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [history, setHistory] = useState<DrawingElement[][]>([]);
  const [historyStep, setHistoryStep] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const transformerRef = useRef<any>(null);
  const stageRef = useRef<any>(null);
  const quillRef = useRef<any>(null);

  const [currentFormats, setCurrentFormats] = useState<any>({});
  const [currentSize, setCurrentSize] = useState(16);
  const [textColor, setTextColor] = useState('#1c1c1c');

  const toggleTool = (target: 'color' | 'doodle' | 'text' | 'editor-settings') => {
    if (target === 'color') {
      setShowColorPicker(!showColorPicker);
      setIsDoodleMode(false);
      setShowTextSettings(false);
      setShowEditorSettings(false);
    } else if (target === 'doodle') {
      setIsDoodleMode(!isDoodleMode);
      setShowColorPicker(false);
      setShowTextSettings(false);
      setShowEditorSettings(false);
    } else if (target === 'text') {
      setShowTextSettings(!showTextSettings);
      setShowColorPicker(false);
      setIsDoodleMode(false);
      setShowEditorSettings(false);
    } else if (target === 'editor-settings') {
      setShowEditorSettings(!showEditorSettings);
      setShowColorPicker(false);
      setIsDoodleMode(false);
      setShowTextSettings(false);
    }
  };

  // Pre-load images for Konva to prevent re-renders in the loop
  const doodleElements = useMemo(() => {
    return elements.map(el => {
      if (el.type === 'image' && el.src && !el.imageObj) {
        const img = new window.Image();
        img.src = el.src;
        // Basic error handling for images
        img.onerror = () => {
          console.error("Failed to load image");
        };
        return { ...el, imageObj: img };
      }
      return el;
    });
  }, [elements]);

  const undo = () => {
    if (historyStep > 0) {
      const prev = history[historyStep - 1];
      setElements(prev);
      setHistoryStep(historyStep - 1);
      saveDoodle(prev);
    }
  };

  const redo = () => {
    if (historyStep < history.length - 1) {
      const next = history[historyStep + 1];
      setElements(next);
      setHistoryStep(historyStep + 1);
      saveDoodle(next);
    }
  };

  const addToHistory = (newElements: DrawingElement[]) => {
    const newHistory = history.slice(0, historyStep + 1);
    newHistory.push(newElements);
    setHistory(newHistory);
    setHistoryStep(newHistory.length - 1);
  };

  // Sync doodle data with active note
  useEffect(() => {
    if (activeNote) {
      setElements(activeNote.doodleData || []);
    } else {
      setElements([]);
    }
    
    // Close tool panels when switching notes
    setShowColorPicker(false);
    setIsDoodleMode(false);
    setShowTextSettings(false);
  }, [selectedNoteId]);

  const saveDoodle = (newElements: DrawingElement[]) => {
    if (activeNote) {
      updateNote(activeNote.id, { doodleData: newElements });
    }
  };

  // Load and Save (Theme Only)
  useEffect(() => {
    const savedTheme = localStorage.getItem('noteflow_theme');
    if (savedTheme === 'dark') {
      setIsDarkMode(true);
      document.documentElement.classList.add('dark');
    }

    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
      setStageSize({
        width: window.innerWidth > 768 ? window.innerWidth - 320 : window.innerWidth,
        height: Math.max(1000, window.innerHeight)
      });
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Swipe Gesture Implementation
  const bind = useDrag(({ swipe: [swipeX], initial: [initialX] }) => {
    // Only trigger if starting near the left edge (e.g., first 40px)
    if (isMobile && !isSidebarOpen && swipeX === 1 && initialX < 40) {
      setIsSidebarOpen(true);
    }
  }, {
    axis: 'x',
    filterTaps: true
  });

  // Sync Notes from Firestore
  useEffect(() => {
    if (!user) {
      setNotes([]);
      setLoadingNotes(false);
      return;
    }

    setLoadingNotes(true);
    const notesRef = collection(db, 'users', user.uid, 'notes');
    const q = query(notesRef, orderBy('updatedAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      let cloudNotes: Note[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }) as Note);

      // Ensure Welcome note exists
      const hasWelcome = cloudNotes.some(n => n.id === WELCOME_NOTE_ID);
      const welcomeNote: Note = {
        id: WELCOME_NOTE_ID,
        title: 'ようこそ NoteFlow へ',
        content: '<p>Windows と iOS の両方に最適化されたメモアプリです。</p><p><br></p><p>- クラウド保存対応 (Firebase)</p><p>- どのデバイスからでもアクセス可能</p><p>- 自動保存機能搭載</p>',
        updatedAt: Date.now(),
        pinned: false,
        color: 'bg-note-white',
        isTrash: false,
      };

      if (!hasWelcome) {
        // Prepend locally and save to cloud
        cloudNotes = [welcomeNote, ...cloudNotes];
        setDoc(doc(db, 'users', user.uid, 'notes', WELCOME_NOTE_ID), {
          ...welcomeNote,
          userId: user.uid
        }).catch(err => console.error("Sync Welcome Note Error:", err));
      }

      setNotes(cloudNotes);
      setLoadingNotes(false);
    }, (err) => {
      console.error("Firestore Error:", err);
      setSystemAlert("同期中にエラーが発生しました。");
      setLoadingNotes(false);
    });

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('noteflow_theme', 'dark');
      setBrushColor('#ff9500'); // Orange accent for dark mode
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('noteflow_theme', 'light');
      setBrushColor('#0078d4'); // Blue accent for light mode
    }
  }, [isDarkMode]);

  useEffect(() => {
    if (notes.length > 0) {
      try {
        localStorage.setItem('noteflow_notes_v2', JSON.stringify(notes));
      } catch (err) {
        console.error("Storage limit exceeded or quota error:", err);
        setSystemAlert("データ保存容量を超えました。一部のノートや画像を削除してください。");
      }
    }
  }, [notes]);

  const activeNote = useMemo(() => notes.find(n => n.id === selectedNoteId), [notes, selectedNoteId]);

  const createNote = async () => {
    if (!user) return;
    const noteId = crypto.randomUUID();
    const newNote = {
      userId: user.uid,
      title: '',
      content: '',
      updatedAt: Date.now(),
      pinned: false,
      color: 'bg-note-white',
      isTrash: false,
    };
    
    try {
      await setDoc(doc(db, 'users', user.uid, 'notes', noteId), newNote);
      setSelectedNoteId(noteId);
      setViewMode('all');
      if (isMobile) setIsSidebarOpen(false);
    } catch (err) {
      console.error("Failed to create note", err);
    }
  };

  const updateNote = async (id: string, updates: Partial<Note>) => {
    if (!user) return;
    // Optimistic UI update
    setNotes(prev => prev.map(n => n.id === id ? { ...n, ...updates, updatedAt: Date.now() } : n));
    
    try {
      const noteRef = doc(db, 'users', user.uid, 'notes', id);
      await setDoc(noteRef, { ...updates, updatedAt: Date.now() }, { merge: true });
    } catch (err) {
      console.error("Failed to update note", err);
    }
  };

  const moveToTrash = (id: string) => {
    if (id === WELCOME_NOTE_ID || id === '1') {
      setSystemAlert('このノートは削除できません。');
      return;
    }
    const note = notes.find(n => n.id === id);
    if (note?.pinned) {
      setShowPinWarning(id);
      return;
    }
    confirmMoveToTrash(id);
  };

  const confirmMoveToTrash = (id: string) => {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, isTrash: true, pinned: false } : n));
    if (selectedNoteId === id) setSelectedNoteId(null);
    setShowPinWarning(null);
  };

  const restoreNote = (id: string) => {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, isTrash: false } : n));
    if (selectedNoteId === id) setSelectedNoteId(null);
  };

  const permanentlyDeleteNote = async (id: string) => {
    if (id === WELCOME_NOTE_ID || id === '1') {
      setSystemAlert('このノートは削除できません。');
      return;
    }
    if (!user) return;

    try {
      await deleteDoc(doc(db, 'users', user.uid, 'notes', id));
      if (selectedNoteId === id) setSelectedNoteId(null);
      setShowDeleteConfirm(null);
    } catch (err) {
      console.error("Failed to delete note", err);
    }
  };

  const togglePin = (id: string) => {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, pinned: !n.pinned } : n));
  };

  const filteredNotes = useMemo(() => {
    const now = new Date();
    const startOfThisWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay()).getTime();
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    return notes
      .filter(n => n.isTrash === (viewMode === 'trash'))
      .filter(n => 
        n.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
        n.content.toLowerCase().includes(searchQuery.toLowerCase())
      )
      .filter(n => {
        if (filterType === 'week') return n.updatedAt >= startOfThisWeek;
        if (filterType === 'month') return n.updatedAt >= startOfThisMonth;
        return true;
      })
      .sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return b.updatedAt - a.updatedAt;
      });
  }, [notes, viewMode, searchQuery]);

  const formatDate = (ts: number) => {
    const date = new Date(ts);
    return date.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const stripHtml = useCallback((html: string) => {
    if (!html) return '';
    // Remove tags and replace common entities
    return html
      .replace(/<[^>]*>?/gm, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .substring(0, 100);
  }, []);

  const shareNote = (note: Note) => {
    if (navigator.share) {
      navigator.share({
        title: note.title || '無題のメモ',
        text: note.content,
      }).catch(console.error);
    } else {
      // Fallback: Copy to clipboard
      navigator.clipboard.writeText(`${note.title}\n\n${note.content}`)
        .then(() => alert('クリップボードにコピーしました'))
        .catch(console.error);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && activeNote) {
      // Check size (2MB limit for localStorage safety)
      if (file.size > 2 * 1024 * 1024) {
        setSystemAlert("画像サイズが大きすぎます。2MB以下の画像を選択してください。");
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        const imgElement = new Image();
        imgElement.onload = () => {
          // Scale down image if it's too large
          const MAX_WIDTH = 800;
          const MAX_HEIGHT = 800;
          let width = imgElement.width;
          let height = imgElement.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(imgElement, 0, 0, width, height);
          
          const compressedSrc = canvas.toDataURL('image/jpeg', 0.7);

          const newImg: DrawingElement = {
            id: crypto.randomUUID(),
            type: 'image',
            src: compressedSrc,
            x: 50,
            y: 50,
            width: width / 2, // Default size on canvas
            height: height / 2,
            color: '',
            strokeWidth: 0,
            opacity: 1
          };
          const updated = [...elements, newImg];
          setElements(updated);
          saveDoodle(updated);
          addToHistory(updated);
        };
        imgElement.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  const checkDeselect = (e: any) => {
    // Stage or Background click only
    const target = e.target;
    const clickedOnEmpty = target === target.getStage() || target.name() === 'background';
    if (clickedOnEmpty) {
      setSelectedId(null);
      if (transformerRef.current) transformerRef.current.nodes([]);
      return true; 
    }
    return false;
  };

  const handleMouseDown = (e: any) => {
    if (isDoodleMode) {
      e.evt.stopPropagation();
    }
    
    if (tool === 'select') {
      const deselected = checkDeselect(e);
      if (!deselected) {
        // If clicked on an element, Konva Transformer handles selection logic usually,
        // but let's ensure immediate selection state here for consistency.
        const id = e.target.id();
        if (id && id !== 'background') {
          setSelectedId(id);
        }
      }
      return;
    }
    setIsDrawing(true);
    const stage = e.target.getStage();
    const pos = stage.getPointerPosition();
    
    if (tool === 'shape') {
      const newShape: DrawingElement = {
        id: crypto.randomUUID(),
        type: shapeType,
        x: pos.x,
        y: pos.y,
        width: 1,
        height: 1,
        color: brushColor,
        strokeWidth: brushWidth,
        opacity: 1
      };
      setElements(prev => [...prev, newShape]);
    } else {
      const newLine: DrawingElement = {
        id: crypto.randomUUID(),
        type: 'line',
        points: [pos.x, pos.y],
        color: tool === 'eraser' ? '#ffffff' : (tool === 'highlighter' ? brushColor + '44' : brushColor),
        strokeWidth: tool === 'highlighter' ? brushWidth * 3 : brushWidth,
        opacity: tool === 'highlighter' ? 0.5 : 1,
      };
      setElements(prev => [...prev, newLine]);
    }
  };

  const handleMouseMove = (e: any) => {
    if (!isDrawing || tool === 'select') return;
    const stage = e.target.getStage();
    const point = stage.getPointerPosition();
    
    setElements(prev => {
      if (prev.length === 0) return prev;
      const newElements = [...prev];
      const lastElement = { ...newElements[newElements.length - 1] };
      
      if (tool === 'shape') {
        lastElement.width = point.x - lastElement.x!;
        lastElement.height = point.y - lastElement.y!;
      } else {
        lastElement.points = lastElement.points!.concat([point.x, point.y]);
      }
      
      newElements[newElements.length - 1] = lastElement;
      return newElements;
    });
  };

  const handleMouseUp = () => {
    if (isDrawing) {
      setIsDrawing(false);
      setElements(prev => {
        saveDoodle(prev);
        addToHistory(prev);
        return prev;
      });
    }
  };

  const handleElementTransform = (id: string, updates: Partial<DrawingElement>) => {
    const updated = elements.map(el => el.id === id ? { ...el, ...updates } : el);
    setElements(updated);
    saveDoodle(updated);
  };

  useEffect(() => {
    if (selectedId && transformerRef.current && tool === 'select') {
      const selectedNode = stageRef.current.findOne('#' + selectedId);
      if (selectedNode) {
        transformerRef.current.nodes([selectedNode]);
        transformerRef.current.getLayer().batchDraw();
      }
    }
  }, [selectedId, tool]);

  const deleteSelected = () => {
    if (selectedId) {
      // Create empty transformer node list before state update to avoid rendering issues
      if (transformerRef.current) {
        transformerRef.current.nodes([]);
      }
      setSelectedId(null); // Immediate deselection
      setElements(prev => {
        const updated = prev.filter(el => el.id !== selectedId);
        saveDoodle(updated);
        addToHistory(updated);
        return updated;
      });
    }
  };

  const applyFormat = (name: string, value: any) => {
    if (quillRef.current) {
      const editor = quillRef.current.getEditor();
      
      // We apply the format. If the editor is focused, this works as expected.
      // If it's not focused, we apply the format but DO NOT call editor.focus(),
      // which prevents the keyboard from popping up on mobile.
      editor.format(name, value);
      
      // Slight delay to ensure formats are updated in UI
      setTimeout(() => {
        if (quillRef.current) {
          setCurrentFormats(quillRef.current.getEditor().getFormat());
        }
      }, 50);
    }
  };

  const toggleFormat = (name: string) => {
    if (quillRef.current) {
      const editor = quillRef.current.getEditor();
      const formats = editor.getFormat();
      const newValue = !formats[name];
      editor.format(name, newValue);
      
      setTimeout(() => {
        if (quillRef.current) {
          setCurrentFormats(quillRef.current.getEditor().getFormat());
        }
      }, 50);
    }
  };

  const getFormat = (name: string) => {
    if (quillRef.current) {
      const editor = quillRef.current.getEditor();
      return editor.getFormat()[name];
    }
    return null;
  };

  const FONTS = [
    { name: '標準', value: 'sans-serif' },
    { name: '明朝', value: 'serif' },
    { name: '等幅', value: 'monospace' },
  ];

  // Auth/Loading Screen
  if (loadingAuth) {
    return (
      <div className="fixed inset-0 bg-geo-bg flex flex-col items-center justify-center gap-4 transition-colors">
        <Loader2 className="text-win-accent animate-spin" size={32} />
        <p className="text-xs font-black uppercase tracking-[0.2em] text-geo-text-sub">Connecting to NoteFlow...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="fixed inset-0 bg-geo-bg flex items-center justify-center p-6 transition-colors">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full text-center space-y-8"
        >
          <div className="w-24 h-24 bg-win-accent rounded-[2rem] flex items-center justify-center mx-auto shadow-2xl shadow-win-accent/30 -rotate-3">
             <PenSquare size={44} className="text-white" />
          </div>
          <div>
            <h1 className="text-4xl font-black tracking-tighter text-geo-text-main mb-3 leading-none">NoteFlow Geometric</h1>
            <p className="text-geo-text-sub font-medium leading-relaxed opacity-80 text-sm">
               あなたの全てのメモをクラウドで安全に同期。<br />
               どのデバイスからでも、安定した書き心地を。
            </p>
          </div>
          <button 
            onClick={() => signInWithPopup(auth, googleProvider)}
            className="w-full flex items-center justify-center gap-4 h-16 bg-win-accent text-white rounded-2xl shadow-2xl shadow-win-accent/40 font-black text-xs uppercase tracking-[0.2em] hover:scale-[1.02] active:scale-95 transition-all"
          >
            <LogIn size={20} />
            Googleでログイン
          </button>
          <p className="text-[10px] text-geo-text-sub uppercase tracking-widest font-bold">
             Secure geometric synchronization powered by Google
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div 
      {...bind()}
      className={`flex h-screen w-full bg-geo-bg text-geo-text-main font-sans selection:bg-[#eef7ff] overflow-hidden ${isDarkMode ? 'dark' : ''} touch-pan-y`}
    >
      
      {/* Mobile Backdrop */}
      <AnimatePresence>
        {isMobile && isSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-black/40 z-30"
          />
        )}
      </AnimatePresence>

      {/* Sidebar - Geometric Windows Style */}
      <motion.aside 
        initial={false}
        animate={{ 
          x: isMobile ? (isSidebarOpen ? 0 : -280) : 0,
          width: isMobile ? 280 : (isSidebarOpen ? 320 : 0),
          opacity: !isMobile && !isSidebarOpen ? 0 : 1
        }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        style={{ willChange: 'transform, width' }}
        className={`
        fixed inset-y-0 left-0 md:relative z-40 h-full flex flex-col border-r border-geo-border bg-geo-bg transition-colors duration-300 overflow-hidden
        ${!isMobile && !isSidebarOpen ? 'border-none' : ''}
      `}>
        {/* Header content... */}
        <div className="flex flex-col h-full w-[280px] md:w-[320px]">
          {/* Header */}
          <div className="p-4 md:p-6 flex items-center justify-between border-b border-geo-border bg-geo-bg md:bg-transparent flex-shrink-0 transition-colors duration-300">
            <h1 
              onClick={() => {
                setSelectedNoteId(WELCOME_NOTE_ID);
                setViewMode('all');
                if (isMobile) setIsSidebarOpen(false);
              }}
              className="text-lg md:text-xl font-black tracking-tighter text-geo-text-main flex items-center gap-2 cursor-pointer active:scale-95 transition-transform"
            >
              <span className="p-1.5 rounded-lg text-white bg-win-accent shadow-win-accent/20 shadow-md">
                <PenSquare size={18} />
              </span>
              NoteFlow
            </h1>
            {isMobile && (
              <button 
                onClick={() => setIsSidebarOpen(false)} 
                className="p-2 hover:bg-slate-200/50 rounded-full text-geo-text-sub transition-colors"
                aria-label="Close menu"
              >
                <X size={20} />
              </button>
            )}
          </div>

        {/* View Switcher/List Wrap */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* View Switcher */}
          <nav className="flex px-4 pt-4 gap-1 flex-shrink-0">
            <button 
              onClick={() => {
                setViewMode('all');
                setShowSettings(false);
              }}
              className={`flex-1 flex flex-col items-center py-2 rounded-lg transition-all text-[10px] font-bold uppercase tracking-wider
                ${(viewMode === 'all' && !showSettings) ? 'bg-geo-bg shadow-sm ring-1 ring-geo-border text-win-accent' : 'text-geo-text-sub hover:bg-geo-border/50'}
              `}
            >
              <Layout size={16} className="mb-1" />
              すべて
            </button>
            <button 
              onClick={() => {
                setViewMode('trash');
                setShowSettings(false);
              }}
              className={`flex-1 flex flex-col items-center py-2 rounded-lg transition-all text-[10px] font-bold uppercase tracking-wider
                ${(viewMode === 'trash' && !showSettings) ? 'bg-geo-bg shadow-sm ring-1 ring-geo-border text-win-accent' : 'text-geo-text-sub hover:bg-geo-border/50'}
              `}
            >
              <Trash2 size={16} className="mb-1" />
              ゴミ箱
            </button>
            <button 
              className={`flex-1 flex flex-col items-center py-2 rounded-lg transition-all text-[10px] font-bold uppercase tracking-wider ${showSettings ? 'bg-geo-bg shadow-sm ring-1 ring-geo-border text-win-accent' : 'text-geo-text-sub hover:bg-geo-border/50'}`}
              onClick={() => setShowSettings(!showSettings)}
            >
              <Settings size={16} className="mb-1" />
              設定
            </button>
          </nav>

          {/* Search & Filter */}
          <div className="p-4 flex-shrink-0 space-y-2">
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 transition-colors text-slate-400 group-focus-within:text-win-accent" size={16} />
              <input 
                type="text" 
                placeholder={`${viewMode === 'trash' ? 'ゴミ箱を検索...' : 'ノートを検索...'}`} 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 h-10 bg-geo-bg border border-geo-border rounded-lg text-sm outline-none transition-all shadow-sm focus:ring-1 focus:ring-win-accent placeholder:text-geo-text-sub text-geo-text-main"
              />
            </div>
            
                <div className="flex gap-1">
                  <button
                    onClick={() => setFilterType('none')}
                    className={`flex-1 py-1.5 rounded-md text-[10px] font-bold border transition-all ${(filterType === 'none' && !showSettings) ? 'bg-win-accent text-white border-win-accent shadow-sm' : 'bg-geo-bg text-geo-text-sub border-geo-border hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                  >
                    すべて
                  </button>
                  <button
                    onClick={() => setFilterType('week')}
                    className={`flex-1 py-1.5 rounded-md text-[10px] font-bold border transition-all ${(filterType === 'week' && !showSettings) ? 'bg-win-accent text-white border-win-accent shadow-sm' : 'bg-geo-bg text-geo-text-sub border-geo-border hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                  >
                    今週
                  </button>
                  <button
                    onClick={() => setFilterType('month')}
                    className={`flex-1 py-1.5 rounded-md text-[10px] font-bold border transition-all ${(filterType === 'month' && !showSettings) ? 'bg-win-accent text-white border-win-accent shadow-sm' : 'bg-geo-bg text-geo-text-sub border-geo-border hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                  >
                    今月
                  </button>
                </div>
          </div>

          {/* List or Settings */}
          <div className="flex-1 overflow-y-auto min-h-0 flex flex-col">
            <AnimatePresence mode="wait">
              {showSettings ? (
                <motion.div 
                  key="settings"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="p-4 space-y-6 flex-1"
                >
                  <div>
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-geo-text-sub mb-4">外観設定</h4>
                    <div className="bg-geo-bg border border-geo-border rounded-xl p-4 flex items-center justify-between shadow-sm">
                      <div className="flex items-center gap-3 text-geo-text-main">
                        {isDarkMode ? <Moon size={20} className="text-win-accent" /> : <Sun size={20} className="text-win-accent" />}
                        <div>
                          <span className="text-sm font-bold block">ダークモード</span>
                          <span className="text-[10px] text-geo-text-sub">目に優しい配色に切り替えます</span>
                        </div>
                      </div>
                      <button 
                        onClick={() => setIsDarkMode(!isDarkMode)}
                        className={`w-12 h-6 rounded-full relative transition-colors duration-300 ${isDarkMode ? 'bg-win-accent' : 'bg-slate-300'}`}
                        aria-label="ダークモード切り替え"
                      >
                        <motion.div 
                          animate={{ x: isDarkMode ? 24 : 2 }}
                          initial={false}
                          className="absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow-sm"
                        />
                      </button>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-geo-text-sub mb-4">アプリについて</h4>
                    <div className="bg-geo-bg border border-geo-border rounded-xl p-4 space-y-3 shadow-sm">
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-geo-text-sub">バージョン</span>
                        <span className="font-bold text-geo-text-main">2.1.0</span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-geo-text-sub">テーマ</span>
                        <span className="font-bold text-win-accent">Simple Note</span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-8 border-t border-geo-border">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        {user?.photoURL ? (
                          <img src={user.photoURL} className="w-10 h-10 rounded-full border border-geo-border" alt="" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-win-accent flex items-center justify-center text-white font-black text-sm">
                            {user?.displayName?.[0] || 'U'}
                          </div>
                        )}
                        <div>
                          <p className="text-xs font-black text-geo-text-main leading-none">{user?.displayName}</p>
                          <p className="text-[10px] text-geo-text-sub mt-1">クラウド同期中</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => signOut(auth)}
                        className="p-2 hover:bg-rose-50 dark:hover:bg-rose-900/20 text-rose-500 rounded-lg transition-colors"
                        title="ログアウト"
                      >
                        <LogOut size={18} />
                      </button>
                    </div>
                  </div>

                  <button 
                    onClick={() => setShowSettings(false)}
                    className="w-full py-3 bg-geo-text-main text-geo-bg rounded-xl font-bold text-xs uppercase tracking-widest hover:opacity-90 transition-all active:scale-[0.98] shadow-lg"
                  >
                    リストに戻る
                  </button>
                </motion.div>
              ) : (
                <motion.div 
                  key={`list-${viewMode}`}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="flex-1 overflow-y-auto px-2 md:px-3 space-y-1.5 pb-20 md:pb-4 scroll-smooth"
                >
                  <AnimatePresence initial={false}>
                    {filteredNotes.map(note => (
                      <motion.button
                        key={note.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.1 }}
                        onClick={() => {
                          setSelectedNoteId(note.id);
                          if (isMobile) {
                            setTimeout(() => setIsSidebarOpen(false), 50);
                          }
                        }}
                        className={`
                          w-full text-left p-3.5 rounded-lg transition-all relative group border
                          ${selectedNoteId === note.id 
                            ? 'bg-geo-bg border-win-accent shadow-md md:translate-x-1' 
                            : 'bg-geo-bg border-geo-border/50 dark:border-geo-border/40 shadow-sm hover:border-geo-border group-hover:scale-[1.01]'}
                        `}
                      >
                        {selectedNoteId === note.id && !isMobile && (
                          <div className="absolute left-0 top-0 bottom-0 w-1 bg-win-accent rounded-l-lg"></div>
                        )}
                      <div className="flex justify-between items-start gap-2">
                        <h3 className={`font-bold text-sm truncate leading-tight ${selectedNoteId === note.id ? 'text-win-accent' : 'text-geo-text-main'}`}>
                          {note.title || (
                            <span className="text-geo-text-sub font-normal italic">
                              無題のメモ {notes.filter(n => !n.title).reverse().findIndex(n => n.id === note.id) + 1}
                            </span>
                          )}
                        </h3>
                        {note.pinned && <Pin size={12} className="text-win-accent fill-win-accent mt-1 flex-shrink-0" />}
                      </div>
                      <p className="text-[11px] text-geo-text-sub line-clamp-2 mt-1.5 leading-relaxed">
                        {stripHtml(note.content) || '内容はありません'}
                      </p>
                      <div className="mt-2.5 flex items-center justify-between">
                        <span className="text-[9px] font-bold text-geo-text-sub/60 uppercase tracking-tighter">
                          {formatDate(note.updatedAt)}
                        </span>
                        <div className={`w-2 h-2 rounded-sm border border-black/5 ${note.color}`}></div>
                      </div>
                    </motion.button>
                  ))}
                </AnimatePresence>
                
                {filteredNotes.length === 0 && (
                  <div className="text-center py-20 px-6 space-y-3">
                    <div className="w-12 h-12 bg-geo-border/30 rounded-full flex items-center justify-center mx-auto text-geo-text-sub/40 text-geo-text-main">
                      {viewMode === 'trash' ? <Trash2 size={24} /> : <Search size={24} />}
                    </div>
                    <p className="text-xs font-medium text-geo-text-sub/60 text-geo-text-main">
                      {viewMode === 'trash' ? 'ゴミ箱は空です' : 'ノートが見つかりません'}
                    </p>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
          </div>

        {/* Action Button - Only in All Notes */}
        {viewMode === 'all' && (
          <div className="p-4 border-t border-geo-border bg-geo-bg md:bg-transparent flex-shrink-0">
            <button 
              onClick={createNote}
              className="w-full h-11 flex items-center justify-center gap-2 bg-win-accent text-white rounded-lg shadow-lg shadow-win-accent/20 transition-all hover:bg-win-accent/90 active:scale-[0.98] font-bold text-sm"
            >
              <Plus size={18} strokeWidth={3} />
              新しいメモ
            </button>
          </div>
        )}
        </div>
        </div>
      </motion.aside>

      {/* Main Content */}
      <motion.main 
        layout
        className={`flex-1 flex flex-col h-full relative z-0 transition-colors duration-500 ${activeNote ? activeNote.color : 'bg-geo-bg'}`}
        onClick={() => {
          if (showTextSettings) setShowTextSettings(false);
          if (showColorPicker) setShowColorPicker(false);
        }}
      >
        <AnimatePresence>
          {activeNote ? (
            <motion.div 
              key={activeNote.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex flex-col h-full"
            >
              {/* Toolbar */}
              <header 
                className={`px-4 md:px-8 min-h-[64px] border-b border-geo-border flex items-center justify-between sticky top-0 ${activeNote.color} z-30 transition-colors duration-500`}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center gap-3">
                  {(!isSidebarOpen || isMobile) && (
                    <button 
                      onClick={() => setIsSidebarOpen(true)}
                      className="p-2 text-geo-text-sub hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg active:scale-90 transition-transform"
                      aria-label="Open sidebar"
                    >
                      <Menu size={20} />
                    </button>
                  )}
                  <div className="hidden sm:flex items-center gap-2 text-[10px] font-bold text-geo-text-sub/70 bg-geo-bg/80 px-2.5 py-1.5 rounded uppercase tracking-widest border border-geo-border/30">
                    <Clock size={12} className="text-win-accent" />
                    {formatDate(activeNote.updatedAt)}
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  {!activeNote.isTrash && (
                    <button 
                      onClick={() => shareNote(activeNote)}
                      className="p-2 text-geo-text-sub hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg transition-all"
                      title="共有"
                    >
                      <Share size={20} />
                    </button>
                  )}
                  {!activeNote.isTrash ? (
                    <>
                      <button 
                        onClick={() => togglePin(activeNote.id)}
                        className={`p-2 rounded-lg transition-all ${activeNote.pinned 
                          ? 'text-win-accent bg-win-accent/10 border border-win-accent/20' 
                          : 'text-geo-text-sub hover:bg-slate-100 dark:hover:bg-white/10'}`}
                        title="ピン留め"
                      >
                        <Pin size={20} className={activeNote.pinned ? 'fill-current' : ''} />
                      </button>
                      <button 
                        onClick={() => moveToTrash(activeNote.id)}
                        className="p-2 text-geo-text-sub hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg transition-all"
                        title="ゴミ箱へ"
                      >
                        <Trash2 size={20} />
                      </button>
                    </>
                  ) : (
                    <>
                      <button 
                        onClick={() => restoreNote(activeNote.id)}
                        className="p-2 text-win-accent hover:bg-win-accent/10 rounded-lg transition-all flex items-center gap-2 text-xs font-bold"
                        title="元に戻す"
                      >
                        <RotateCcw size={18} />
                        元に戻す
                      </button>
                      <button 
                        onClick={() => setShowDeleteConfirm(activeNote.id)}
                        className="p-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg transition-all flex items-center gap-2 text-xs font-bold border border-rose-100 dark:border-rose-500/20"
                        title="完全に削除"
                      >
                        <Trash2 size={18} />
                        削除
                      </button>
                    </>
                  )}
                </div>
              </header>

              {/* Editor */}
              <div className={`flex-1 overflow-y-auto ${isMobile ? 'px-6 py-8' : 'p-12'} ${activeNote.color} transition-colors duration-500`}>
                <div className="max-w-3xl mx-auto space-y-6 relative min-h-[500px]">
                  {isMobile && !activeNote.isTrash && (
                    <div className="text-win-accent text-xs font-black uppercase tracking-widest text-right mb-4 opacity-60">
                      EDITING
                    </div>
                  )}

                  <div className="relative mb-12">
                    <input 
                      type="text" 
                      placeholder="無題"
                      value={activeNote.title}
                      onChange={(e) => updateNote(activeNote.id, { title: e.target.value })}
                      className="w-full text-4xl md:text-5xl font-black bg-transparent outline-none placeholder:text-geo-text-main/70 text-geo-text-main transition-all mb-4"
                    />
                    <div className="w-24 h-1.5 bg-[#A5D1F3] rounded-full"></div>
                  </div>

                  {/* Doodle Canvas Overlay - Covers entire area */}
                  <div 
                    className={`absolute inset-0 z-40 touch-none ${isDoodleMode ? 'pointer-events-auto cursor-crosshair' : 'pointer-events-none'}`}
                    style={{ minHeight: '1000px' }}
                  >
                  <Stage
                    ref={stageRef}
                    width={stageSize.width}
                    height={stageSize.height}
                    onMouseDown={handleMouseDown}
                    onMousemove={handleMouseMove}
                    onMouseup={handleMouseUp}
                    onTouchStart={handleMouseDown}
                    onTouchMove={handleMouseMove}
                    onTouchEnd={handleMouseUp}
                    perfectDrawEnabled={false} // Performance optimization
                    listening={isDoodleMode}    // Only listen for events when active
                  >
                    <Layer visible={showDoodles}>
                      {/* Background Rect to catch clicks for deselection */}
                      <Rect
                        name="background"
                        x={0}
                        y={0}
                        width={window.innerWidth}
                        height={5000}
                        fill="transparent" 
                        onClick={checkDeselect}
                        onTap={checkDeselect}
                      />
                      {doodleElements.map((el) => {
                          const isSelected = selectedId === el.id;
                          if (el.type === 'line') {
                            return <Line key={el.id} id={el.id} points={el.points} stroke={el.color} strokeWidth={el.strokeWidth} tension={0.5} lineCap="round" globalCompositeOperation={el.color === '#ffffff' ? 'destination-out' : 'source-over'} opacity={el.opacity || 1} onClick={(e) => { e.cancelBubble = true; if(tool === 'select') setSelectedId(el.id); }} onTap={(e) => { e.cancelBubble = true; if(tool === 'select') setSelectedId(el.id); }} />;
                          }
                          if (el.type === 'rect') {
                            return <Rect key={el.id} id={el.id} x={el.x} y={el.y} width={el.width} height={el.height} stroke={el.color} strokeWidth={el.strokeWidth} onClick={(e) => { e.cancelBubble = true; if(tool === 'select') setSelectedId(el.id); }} onTap={(e) => { e.cancelBubble = true; if(tool === 'select') setSelectedId(el.id); }} draggable={tool === 'select' && isSelected} onDragEnd={(e) => handleElementTransform(el.id, { x: e.target.x(), y: e.target.y() })} onTransformEnd={(e) => {
                              const node = e.target;
                              handleElementTransform(el.id, { x: node.x(), y: node.y(), width: node.width() * node.scaleX(), height: node.height() * node.scaleY() });
                              node.scaleX(1); node.scaleY(1);
                            }} />;
                          }
                          if (el.type === 'triangle') {
                            return <RegularPolygon key={el.id} id={el.id} x={el.x! + (el.width!/2)} y={el.y! + (el.height!/2)} sides={3} radius={Math.abs(el.width!)/2} stroke={el.color} strokeWidth={el.strokeWidth} onClick={(e) => { e.cancelBubble = true; if(tool === 'select') setSelectedId(el.id); }} onTap={(e) => { e.cancelBubble = true; if(tool === 'select') setSelectedId(el.id); }} draggable={tool === 'select' && isSelected} onDragEnd={(e) => handleElementTransform(el.id, { x: e.target.x() - el.width!/2, y: e.target.y() - el.height!/2 })} />;
                          }
                          if (el.type === 'pentagon') {
                            return <RegularPolygon key={el.id} id={el.id} x={el.x! + (el.width!/2)} y={el.y! + (el.height!/2)} sides={5} radius={Math.abs(el.width!)/2} stroke={el.color} strokeWidth={el.strokeWidth} onClick={(e) => { e.cancelBubble = true; if(tool === 'select') setSelectedId(el.id); }} onTap={(e) => { e.cancelBubble = true; if(tool === 'select') setSelectedId(el.id); }} draggable={tool === 'select' && isSelected} onDragEnd={(e) => handleElementTransform(el.id, { x: e.target.x() - el.width!/2, y: e.target.y() - el.height!/2 })} />;
                          }
                          if (el.type === 'image' && el.src) {
                            return <KonvaImage key={el.id} id={el.id} image={el.imageObj} x={el.x} y={el.y} width={el.width} height={el.height} onClick={(e) => { e.cancelBubble = true; if(tool === 'select') setSelectedId(el.id); }} onTap={(e) => { e.cancelBubble = true; if(tool === 'select') setSelectedId(el.id); }} draggable={tool === 'select' && isSelected} onDragEnd={(e) => handleElementTransform(el.id, { x: e.target.x(), y: e.target.y() })} onTransformEnd={(e) => {
                              const node = e.target;
                              handleElementTransform(el.id, { x: node.x(), y: node.y(), width: node.width() * node.scaleX(), height: node.height() * node.scaleY() });
                              node.scaleX(1); node.scaleY(1);
                            }} />;
                          }
                          if (el.type.startsWith('bubble')) {
                             return <Text key={el.id} id={el.id} text={el.type === 'bubble_round' ? "Note" : "Idea"} x={el.x} y={el.y} fontSize={Math.abs(el.width!) || 40} fontStyle="bold" fill={el.color} onClick={(e) => { e.cancelBubble = true; if(tool === 'select') setSelectedId(el.id); }} onTap={(e) => { e.cancelBubble = true; if(tool === 'select') setSelectedId(el.id); }} draggable={tool === 'select' && isSelected} />;
                          }
                          return null;
                        })}
                        {tool === 'select' && isDoodleMode && <Transformer ref={transformerRef} borderDash={[6, 2]} />}
                      </Layer>
                    </Stage>
                  </div>

                  <div className={`relative ${activeNote.isTrash ? 'opacity-50' : ''} z-30`}>
                    <ReactQuill
                      ref={quillRef}
                      readOnly={activeNote.isTrash}
                      value={activeNote.content}
                      onChange={(val) => updateNote(activeNote.id, { content: val })}
                      onChangeSelection={(range) => {
                        if (range && quillRef.current) {
                          const editor = quillRef.current.getEditor();
                          const formats = editor.getFormat(range);
                          setCurrentFormats(formats);
                          // Get font size from format or default
                          const size = formats.size;
                          if (typeof size === 'string' && size.includes('px')) {
                            setCurrentSize(parseInt(size));
                          } else if (size === 'small') setCurrentSize(13);
                          else if (size === 'large') setCurrentSize(20);
                          else if (size === 'huge') setCurrentSize(32);
                          else setCurrentSize(16);
                        }
                      }}
                      placeholder="ここにアイデアを書き留めましょう..."
                      theme="snow"
                      modules={{ toolbar: false }}
                      formats={[
                        'header', 'font', 'size',
                        'bold', 'italic', 'underline', 'strike', 'blockquote',
                        'list', 'bullet', 'indent',
                        'link', 'image', 'color', 'background', 'align'
                      ]}
                      className="note-quill-editor"
                    />
                  </div>
                  {(showWordCount || showLineCount) && (
                    <div className="flex flex-col items-end gap-1 opacity-40 hover:opacity-100 transition-opacity absolute bottom-0 right-0 py-4 px-2 select-none pointer-events-none sm:pointer-events-auto">
                      {showLineCount && (
                        <div className="bg-geo-text-main/10 backdrop-blur-md px-2 py-1 rounded text-[9px] font-black text-geo-text-main uppercase tracking-tighter">
                          LINE: {activeNote.content.split(/<\/p>|<br>|<div>/).length - 1 || 1}
                        </div>
                      )}
                      {showWordCount && (
                        <div className="bg-geo-text-main/10 backdrop-blur-md px-2 py-1 rounded text-[9px] font-black text-geo-text-main uppercase tracking-tighter">
                          CHARS: {stripHtml(activeNote.content).length}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Toolbar - Only if not in trash */}
              {!activeNote.isTrash && (
                <footer 
                  className={`p-4 ${activeNote.color} border-t border-geo-border flex flex-wrap items-center justify-center gap-2 md:gap-4 sticky bottom-0 z-50 transition-colors duration-500`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <button 
                    onClick={() => toggleTool('text')}
                    className={`p-3 rounded-xl border transition-all flex items-center gap-2 font-bold text-xs uppercase tracking-widest ${showTextSettings ? 'bg-win-accent text-white border-win-accent shadow-lg' : 'bg-geo-bg text-geo-text-sub border-geo-border hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                  >
                    <Type size={18} />
                    <span className="hidden sm:inline">フォント</span>
                  </button>

                  <div className="relative">
                    <button 
                      onClick={() => toggleTool('color')}
                      className={`p-3 rounded-xl border transition-all flex items-center gap-2 font-bold text-xs uppercase tracking-widest ${showColorPicker ? 'bg-win-accent text-white border-win-accent shadow-lg' : 'bg-geo-bg text-geo-text-sub border-geo-border hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                    >
                      <Palette size={18} />
                      <span className="hidden sm:inline">背景色</span>
                    </button>
                    
                    <AnimatePresence>
                      {showColorPicker && (
                        <>
                          <div className="fixed inset-0 z-50" onClick={() => setShowColorPicker(false)}></div>
                          <motion.div
                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                            onClick={(e) => e.stopPropagation()}
                            className="absolute bottom-full mb-4 left-1/2 -translate-x-1/2 bg-geo-bg border border-geo-border rounded-2xl p-3 shadow-2xl z-[60] flex gap-2"
                          >
                            {COLORS.map(color => (
                              <button
                                key={color}
                                onPointerDown={(e) => e.preventDefault()}
                                onClick={() => {
                                  updateNote(activeNote.id, { color });
                                  setShowColorPicker(false);
                                }}
                                className={`w-8 h-8 rounded-full border-2 transition-all hover:scale-110 active:scale-90 ${color} ${activeNote.color === color ? 'border-win-accent scale-110 shadow-md' : 'border-geo-border'}`}
                              />
                            ))}
                          </motion.div>
                        </>
                      )}
                    </AnimatePresence>
                  </div>

                  <button 
                    onClick={() => toggleTool('doodle')}
                    className={`p-3 rounded-xl border transition-all flex items-center gap-2 font-bold text-xs uppercase tracking-widest ${isDoodleMode ? 'bg-win-accent text-white border-win-accent shadow-lg' : 'bg-geo-bg text-geo-text-sub border-geo-border hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                  >
                    <Pencil size={18} />
                    <span className="hidden sm:inline">{isDoodleMode ? '閉じる' : '落書き'}</span>
                  </button>

                  <label className="p-3 bg-geo-bg text-geo-text-sub border border-geo-border rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-all flex items-center gap-2 font-bold text-xs uppercase tracking-widest cursor-pointer active:scale-95">
                    <ImageIcon size={18} />
                    <span className="hidden sm:inline">画像</span>
                    <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                  </label>

                  <div className="relative">
                    <button 
                      onClick={() => toggleTool('editor-settings')}
                      className={`p-3 rounded-xl border transition-all flex items-center gap-2 font-bold text-xs uppercase tracking-widest ${showEditorSettings ? 'bg-win-accent text-white border-win-accent shadow-lg' : 'bg-geo-bg text-geo-text-sub border-geo-border hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                    >
                      <Wrench size={18} />
                    </button>
                    
                    <AnimatePresence>
                      {showEditorSettings && (
                        <>
                          <div className="fixed inset-0 z-50" onClick={() => setShowEditorSettings(false)}></div>
                          <motion.div
                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                            onClick={(e) => e.stopPropagation()}
                            className="absolute bottom-full mb-4 right-0 bg-geo-bg border border-geo-border rounded-2xl p-4 shadow-2xl z-[60] min-w-[200px] flex flex-col gap-3"
                          >
                            <h4 className="text-[10px] font-black uppercase tracking-widest text-geo-text-sub border-b border-geo-border pb-2 mb-1">エディタ設定</h4>
                            
                            <div className="flex items-center justify-between gap-4">
                              <span className="text-xs font-bold text-geo-text-main">文字数を表示</span>
                              <button 
                                onClick={() => setShowWordCount(!showWordCount)}
                                className={`w-10 h-5 rounded-full relative transition-colors ${showWordCount ? 'bg-win-accent' : 'bg-slate-300'}`}
                              >
                                <motion.div 
                                  animate={{ x: showWordCount ? 22 : 2 }}
                                  className="absolute top-1 left-1 w-3 h-3 bg-white rounded-full shadow-sm"
                                />
                              </button>
                            </div>

                            <div className="flex items-center justify-between gap-4">
                              <span className="text-xs font-bold text-geo-text-main">行数を表示</span>
                              <button 
                                onClick={() => setShowLineCount(!showLineCount)}
                                className={`w-10 h-5 rounded-full relative transition-colors ${showLineCount ? 'bg-win-accent' : 'bg-slate-300'}`}
                              >
                                <motion.div 
                                  animate={{ x: showLineCount ? 22 : 2 }}
                                  className="absolute top-1 left-1 w-3 h-3 bg-white rounded-full shadow-sm"
                                />
                              </button>
                            </div>
                          </motion.div>
                        </>
                      )}
                    </AnimatePresence>
                  </div>

                  <AnimatePresence>
                    {isDoodleMode && (
                      <motion.div 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        onClick={(e) => e.stopPropagation()}
                        className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-geo-bg/95 backdrop-blur-xl border border-geo-border rounded-2xl shadow-2xl p-3 flex flex-wrap items-center gap-3 z-[60] max-w-[90vw]"
                      >
                        <div className="flex bg-slate-100 dark:bg-white/10 p-1 rounded-xl">
                          <button onClick={() => setTool('marker')} title="マーカー" className={`p-2 rounded-lg transition-colors ${tool === 'marker' ? 'bg-white dark:bg-white/20 shadow-sm text-win-accent' : 'text-geo-text-sub'}`}><Pencil size={16} /></button>
                          <button onClick={() => setTool('highlighter')} title="蛍光ペン" className={`p-2 rounded-lg transition-colors ${tool === 'highlighter' ? 'bg-white dark:bg-white/20 shadow-sm text-win-accent' : 'text-geo-text-sub'}`}><Highlighter size={16} /></button>
                          <button onClick={() => setTool('eraser')} title="消しゴム" className={`p-2 rounded-lg transition-colors ${tool === 'eraser' ? 'bg-white dark:bg-white/20 shadow-sm text-win-accent' : 'text-geo-text-sub'}`}><Eraser size={16} /></button>
                          <button onClick={() => setTool('shape')} title="図形" className={`p-2 rounded-lg transition-colors ${tool === 'shape' ? 'bg-white dark:bg-white/20 shadow-sm text-win-accent' : 'text-geo-text-sub'}`}><Shapes size={16} /></button>
                          <button onClick={() => setTool('select')} title="選択・サイズ変更" className={`p-2 rounded-lg transition-colors ${tool === 'select' ? 'bg-white dark:bg-white/20 shadow-sm text-win-accent' : 'text-geo-text-sub'}`}><MousePointer2 size={16} /></button>
                        </div>

                        <div className="flex items-center gap-2 border-l pl-2">
                           <input type="color" value={brushColor} onChange={(e) => setBrushColor(e.target.value)} className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0" title="描画色" />
                        </div>

                        {tool === 'shape' && (
                          <div className="flex gap-1 border-l pl-3">
                            <button onClick={() => setShapeType('rect')} className={`p-2 ${shapeType === 'rect' ? 'text-win-accent' : ''}`}><Square size={16} /></button>
                            <button onClick={() => setShapeType('triangle')} className={`p-2 ${shapeType === 'triangle' ? 'text-win-accent' : ''}`}><Triangle size={16} /></button>
                            <button onClick={() => setShapeType('pentagon')} className={`p-2 ${shapeType === 'pentagon' ? 'text-win-accent' : ''}`}><Hexagon size={16} /></button>
                            <button onClick={() => setShapeType('bubble_round')} className={`p-2 ${shapeType === 'bubble_round' ? 'text-win-accent' : ''}`}><MessageSquare size={16} /></button>
                          </div>
                        )}

                        <div className="flex items-center gap-2 border-l pl-3">
                          <input type="range" min="1" max="50" value={brushWidth} onChange={(e) => setBrushWidth(Number(e.target.value))} className="w-24 accent-win-accent" />
                        </div>

                        {tool === 'select' && selectedId && (
                          <div className="flex items-center gap-2 border-l pl-3">
                             <button onClick={deleteSelected} className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg" title="削除"><Trash2 size={16} /></button>
                          </div>
                        )}

                        <div className="flex items-center gap-1 border-l pl-3">
                          <button onClick={() => setShowDoodles(!showDoodles)} className={`p-2 rounded-lg transition-colors ${!showDoodles ? 'text-win-accent bg-win-accent/10' : 'text-geo-text-sub hover:bg-slate-100'}`} title={showDoodles ? "非表示にする" : "表示する"}>
                            {showDoodles ? <Eye size={16} /> : <EyeOff size={16} />}
                          </button>
                          <button onClick={undo} disabled={historyStep <= 0} className={`p-2 rounded-lg hover:bg-slate-100 ${historyStep <= 0 ? 'opacity-30 cursor-not-allowed' : ''}`} title="戻る"><Undo2 size={16} /></button>
                          <button onClick={redo} disabled={historyStep >= history.length - 1} className={`p-2 rounded-lg hover:bg-slate-100 ${historyStep >= history.length - 1 ? 'opacity-30 cursor-not-allowed' : ''}`} title="進む"><Redo2 size={16} /></button>
                          <button onClick={() => { setElements([]); saveDoodle([]); addToHistory([]); }} className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg" title="すべて消去"><RotateCcw size={16} /></button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <AnimatePresence>
                    {showTextSettings && (
                      <motion.div 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        onClick={(e) => e.stopPropagation()}
                        className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-geo-bg/95 backdrop-blur-xl border border-geo-border rounded-2xl shadow-2xl p-3 flex flex-wrap items-center gap-3 z-[60] max-w-[95vw]"
                      >
                        {/* 1. Font Switch */}
                        <div className="flex gap-1 bg-geo-border p-1 rounded-xl">
                          {FONTS.map(font => (
                            <button
                              key={font.value}
                              onPointerDown={(e) => e.preventDefault()}
                              onClick={() => applyFormat('font', font.value)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${((currentFormats.font === font.value) || (!currentFormats.font && font.value === 'sans-serif')) ? 'bg-win-accent text-white shadow-lg' : 'text-geo-text-sub hover:opacity-80'}`}
                            >
                              {font.name}
                            </button>
                          ))}
                        </div>

                        {/* 2. Font Size (2px steps) */}
                        <div className="flex items-center gap-1 border-l border-geo-border pl-3">
                          <button 
                            onPointerDown={(e) => e.preventDefault()}
                            onClick={() => {
                              const newSize = Math.max(8, currentSize - 2);
                              setCurrentSize(newSize);
                              applyFormat('size', `${newSize}px`);
                            }} 
                            className="p-2 hover:bg-geo-border/50 rounded-lg text-geo-text-sub"
                            title="小さく"
                          >
                            <ChevronDown size={14} />
                          </button>
                          <span className="text-[11px] font-black min-w-[5ch] text-center bg-geo-border px-2 py-1 rounded select-none text-geo-text-main">{currentSize}px</span>
                          <button 
                            onPointerDown={(e) => e.preventDefault()}
                            onClick={() => {
                              const newSize = Math.min(100, currentSize + 2);
                              setCurrentSize(newSize);
                              applyFormat('size', `${newSize}px`);
                            }} 
                            className="p-2 hover:bg-geo-border/50 rounded-lg text-geo-text-sub"
                            title="大きく"
                          >
                            <ChevronUp size={14} />
                          </button>
                        </div>

                        {/* 3. Bold, 4. Underline, 5. Italic */}
                        <div className="flex gap-1 border-l border-geo-border pl-3">
                          <button 
                            onPointerDown={(e) => e.preventDefault()}
                            onClick={() => toggleFormat('bold')} 
                            className={`p-2 rounded-lg transition-all ${currentFormats.bold ? 'bg-win-accent text-white shadow-md' : 'hover:bg-geo-border/50 text-geo-text-sub'}`}
                          >
                            <Bold size={16} />
                          </button>
                          <button 
                            onPointerDown={(e) => e.preventDefault()}
                            onClick={() => toggleFormat('underline')} 
                            className={`p-2 rounded-lg transition-all ${currentFormats.underline ? 'bg-win-accent text-white shadow-md' : 'hover:bg-geo-border/50 text-geo-text-sub'}`}
                          >
                            <Underline size={16} />
                          </button>
                          <button 
                            onPointerDown={(e) => e.preventDefault()}
                            onClick={() => toggleFormat('italic')} 
                            className={`p-2 rounded-lg transition-all ${currentFormats.italic ? 'bg-win-accent text-white shadow-md' : 'hover:bg-geo-border/50 text-geo-text-sub'}`}
                          >
                            <Italic size={16} />
                          </button>
                        </div>

                        {/* 6. Align Left, 7. Align Center, 8. Align Right */}
                        <div className="flex gap-1 border-l border-geo-border pl-3">
                          <button 
                            onPointerDown={(e) => e.preventDefault()}
                            onClick={() => applyFormat('align', '')} 
                            className={`p-2 rounded-lg transition-all ${!currentFormats.align ? 'bg-win-accent text-white shadow-md' : 'hover:bg-geo-border/50 text-geo-text-sub'}`}
                          >
                            <AlignLeft size={16} />
                          </button>
                          <button 
                            onPointerDown={(e) => e.preventDefault()}
                            onClick={() => applyFormat('align', 'center')} 
                            className={`p-2 rounded-lg transition-all ${currentFormats.align === 'center' ? 'bg-win-accent text-white shadow-md' : 'hover:bg-geo-border/50 text-geo-text-sub'}`}
                          >
                            <AlignCenter size={16} />
                          </button>
                          <button 
                            onPointerDown={(e) => e.preventDefault()}
                            onClick={() => applyFormat('align', 'right')} 
                            className={`p-2 rounded-lg transition-all ${currentFormats.align === 'right' ? 'bg-win-accent text-white shadow-md' : 'hover:bg-geo-border/50 text-geo-text-sub'}`}
                          >
                            <AlignRight size={16} />
                          </button>
                        </div>

                        {/* 9. Text Color */}
                        <div className="flex items-center gap-2 border-l border-geo-border pl-3">
                          <input 
                            type="color" 
                            value={currentFormats.color || (isDarkMode ? '#f0f2f5' : '#1c1c1c')} 
                            onChange={(e) => {
                              const color = e.target.value;
                              setTextColor(color);
                              applyFormat('color', color);
                            }}
                            className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0" 
                            title="文字色" 
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </footer>
              )}
            </motion.div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-10 text-center bg-geo-bg transition-all animate-in fade-in duration-700">
              <div className="w-28 h-28 rounded-[2rem] bg-win-accent flex items-center justify-center mb-10 shadow-2xl shadow-win-accent/30 -rotate-3">
                <PenSquare size={48} strokeWidth={1.5} className="text-white" />
              </div>
              <h2 className="text-3xl font-black text-geo-text-main mb-4 tracking-tighter leading-none">NoteFlow Geometric</h2>
              <p className="text-geo-text-sub max-w-sm text-sm font-medium leading-relaxed mb-12 px-6">
                {viewMode === 'trash' 
                  ? '削除したメモはここに入ります。\n元に戻したり、完全に削除したりできます。'
                  : '幾何学的な安定感、OSを問わない使い心地。\nあなたのひらめきを今すぐ形に。'}
              </p>
              {isMobile && (
                <button 
                  onClick={() => setIsSidebarOpen(true)}
                  className="h-14 px-10 bg-win-accent text-white rounded-2xl shadow-2xl shadow-win-accent/40 font-black text-xs uppercase tracking-widest active:scale-95 transition-all"
                >
                  メモ一覧を表示
                </button>
              )}
            </div>
          )}
        </AnimatePresence>

        {/* FAB for mobile - Desktop Blue everywhere */}
        {isMobile && !activeNote && viewMode === 'all' && (
          <button 
            onClick={createNote}
            className="fixed bottom-10 right-8 w-16 h-16 bg-win-accent text-white rounded-full shadow-2xl flex items-center justify-center active:scale-90 transition-transform z-50 border-4 border-white dark:border-geo-border"
          >
            <Plus size={32} strokeWidth={3} />
          </button>
        )}
      </motion.main>

      {/* Pin Deletion Warning Modal */}
      <AnimatePresence>
        {showPinWarning && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-geo-bg rounded-2xl p-6 max-w-xs w-full shadow-2xl border border-geo-border text-center transition-colors"
            >
              <div className="w-16 h-16 bg-amber-500/10 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle size={32} />
              </div>
              <h3 className="text-lg font-black text-geo-text-main mb-2">ピン留めされています</h3>
              <p className="text-sm text-geo-text-sub mb-6 leading-relaxed">
                このメモはピン留めされていますが、本当にゴミ箱へ移動しますか？
              </p>
              <div className="flex flex-col gap-2">
                <button 
                  onClick={() => confirmMoveToTrash(showPinWarning)}
                  className="w-full py-3 px-4 rounded-xl font-black text-xs bg-amber-600 text-white hover:bg-amber-700 shadow-lg shadow-amber-200 uppercase tracking-widest"
                >
                  はい、移動します
                </button>
                <button 
                  onClick={() => setShowPinWarning(null)}
                  className="w-full py-3 px-4 rounded-xl font-black text-xs bg-slate-100 text-geo-text-sub hover:bg-slate-200 uppercase tracking-widest"
                >
                  キャンセル
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* System Alert Modal */}
      <AnimatePresence>
        {systemAlert && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] bg-black/40 backdrop-blur-sm flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-geo-bg rounded-2xl p-6 max-w-xs w-full shadow-2xl border border-geo-border text-center transition-colors"
            >
              <div className="w-16 h-16 bg-win-accent/10 text-win-accent rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle size={32} />
              </div>
              <h3 className="text-lg font-black text-geo-text-main mb-2">システム通知</h3>
              <p className="text-sm text-geo-text-sub mb-6 leading-relaxed">
                {systemAlert}
              </p>
              <button 
                onClick={() => setSystemAlert(null)}
                className="w-full py-3 px-4 rounded-xl font-black text-xs bg-win-accent text-white hover:bg-win-accent/90 shadow-lg shadow-win-accent/20 uppercase tracking-widest"
              >
                確認
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-geo-bg rounded-2xl p-6 max-w-xs w-full shadow-2xl border border-geo-border text-center transition-colors"
            >
              <div className="w-16 h-16 bg-rose-500/10 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 size={32} />
              </div>
              <h3 className="text-lg font-black text-geo-text-main mb-2">本当によろしいですか？</h3>
              <p className="text-sm text-geo-text-sub mb-6 leading-relaxed">
                このメモは完全に削除され、元に戻すことはできません。
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowDeleteConfirm(null)}
                  className="flex-1 py-3 px-4 rounded-xl font-bold text-xs bg-slate-100 text-geo-text-sub hover:bg-slate-200"
                >
                  キャンセル
                </button>
                <button 
                  onClick={() => permanentlyDeleteNote(showDeleteConfirm)}
                  className="flex-1 py-3 px-4 rounded-xl font-bold text-xs bg-rose-600 text-white hover:bg-rose-700 shadow-lg shadow-rose-200"
                >
                  完全に削除
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* OS Decorator */}
      {!isMobile && (
        <div className="fixed top-0 left-0 w-full h-[2px] bg-win-accent/40 z-50 pointer-events-none"></div>
      )}

    </div>
  );
}
