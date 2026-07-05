import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useScanStore } from '../store/scanStore';
import { generateScheme, getSchemeCategories, getSchemeStatus, getSessionSummary } from '../api';
import { useSchemeStore } from '../store/schemeStore';
import { Loader2 } from 'lucide-react';
import DialogModal from '../components/DialogModal';

type DialogConfig = {
  isOpen: boolean;
  type: 'alert' | 'confirm';
  title: string;
  message: string;
  onConfirm?: () => void;
};

export default function SchemeProgress() {
  const navigate = useNavigate();
  const sessionId = useScanStore(state => state.sessionId);
  const setCategories = useSchemeStore(state => state.setCategories);
  const setLastSaved = useSchemeStore(state => state.setLastSaved);
  const setFinishedAt = useSchemeStore(state => state.setFinishedAt);
  const [processed, setProcessed] = useState(0);
  const [total, setTotal] = useState(0);
  const [percent, setPercent] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const startTimeRef = useRef(Date.now());
  const isNavigating = useRef(false);
  const [dialog, setDialog] = useState<DialogConfig>({ isOpen: false, type: 'alert', title: '', message: '' });

  const closeDialog = () => setDialog(prev => ({ ...prev, isOpen: false }));

  useEffect(() => {
    if (!sessionId) {
      navigate('/');
      return;
    }

    if (isNavigating.current) return;
    
    // CRITICAL FIX: Reset navigating flag on mount for React 18 StrictMode
    isNavigating.current = false;
    
    let ws: WebSocket;
    let timer: NodeJS.Timeout;
    let pollInterval: NodeJS.Timeout;
    startTimeRef.current = Date.now();

    const handleDone = () => {
      if (isNavigating.current) return;
      isNavigating.current = true;
      if (ws) ws.close();
      clearInterval(timer);
      if (pollInterval) clearInterval(pollInterval);
      
      // Refresh categories from API
      getSchemeCategories(sessionId!).then(res => {
          setCategories(res.data);
          const d = new Date();
          setLastSaved(`${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`);
          // Also fetch the scan session's finished_at for consistent time display
          getSessionSummary(sessionId!).then(s => {
            if (s.data?.finished_at) setFinishedAt(s.data.finished_at);
          }).catch(() => {});
          navigate('/scheme-category');
        }).catch(() => {
          navigate('/scheme-category');
        });
    };

    const handleError = () => {
      if (isNavigating.current) return;
      isNavigating.current = true;
      if (ws) ws.close();
      clearInterval(timer);
      if (pollInterval) clearInterval(pollInterval);
      setDialog({
        isOpen: true,
        type: 'alert',
        title: '提示',
        message: '方案生成出错',
        onConfirm: () => {
          closeDialog();
          navigate('/folder-marking');
        }
      });
    };

    const checkStatus = async () => {
      if (isNavigating.current) return;
      try {
        const res = await getSchemeStatus(sessionId);
        if (isNavigating.current) return; // Prevent queued poll responses from triggering alerts

        const { status, processed: p, total: t } = res.data;
        if (status === 'done') {
          setProcessed(t || 0);
          setTotal(t || 0);
          setPercent(100);
          handleDone();
        } else if (status === 'error') {
          handleError();
        } else if (status === 'running') {
          setProcessed(p || 0);
          setTotal(t || 0);
          setPercent(t > 0 ? (p / t) * 100 : 0);
        }
      } catch (e) {
        console.error("Failed to poll scheme status", e);
      }
    };

    // Start the scheme generation
    generateScheme(sessionId).catch(e => {
      console.error('Failed to start scheme generation', e);
      handleError();
    });

    const connectWs = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      ws = new WebSocket(`${protocol}//${host}/ws/scan/progress`);

      ws.onmessage = (e) => {
        if (isNavigating.current) return;
        const data = JSON.parse(e.data);
        
        if (data.type === 'scheme_progress') {
          setProcessed(data.processed || 0);
          setTotal(data.total || 0);
          setPercent(data.percent || 0);

          if (data.status === 'done') {
            handleDone();
          } else if (data.status === 'error') {
            handleError();
          }
        }
      };

      ws.onerror = () => {
        console.error('Scheme WS error');
      };
    };

    // Timer for elapsed time
    timer = setInterval(() => {
      setElapsedSec((Date.now() - startTimeRef.current) / 1000);
    }, 1000);

    // Poll status every 1 second as a fallback for fast completion
    pollInterval = setInterval(checkStatus, 1000);

    connectWs();
    // Also check status immediately in case it finished before WS connected
    checkStatus();

    return () => {
      ws?.close();
      clearInterval(timer);
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [sessionId, navigate, setCategories, setLastSaved]);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
  };

  const remainingSec = percent > 0 ? (elapsedSec / percent * (100 - percent)) : 0;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{ 
        height: 64, 
        backgroundColor: '#FFFFFF', 
        padding: '0 32px', 
        display: 'flex', 
        alignItems: 'center',
        borderBottom: '1px solid #D1D1D6',
        flexShrink: 0
      }}>
        <div style={{ fontSize: 20, fontWeight: 600 }}>麦克斯韦妖</div>
        <div style={{ flex: 1 }} />
      </header>

      <main style={{ 
        flex: 1, 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center',
        padding: '32px 48px',
        gap: 32
      }}>
        {/* Title */}
        <div style={{ fontSize: 24, fontWeight: 600, color: '#000000', textAlign: 'center' }}>
          清理方案生成中
        </div>

        {/* Progress card */}
        <div style={{ 
          width: '100%',
          maxWidth: 600,
          backgroundColor: '#FFFFFF',
          borderRadius: 12,
          border: '1px solid #D1D1D6',
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
          padding: 32
        }}>
          {/* Stage */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#8E8E93', fontSize: 14 }}>当前阶段</span>
            <span style={{ color: '#8E8E93', fontSize: 14, fontWeight: 600 }}>应用文件夹标记</span>
          </div>

          {/* Processed count */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#8E8E93', fontSize: 14 }}>已处理</span>
            <span style={{ color: '#8E8E93', fontSize: 14, fontWeight: 600 }}>
              {processed} / {total} 组
            </span>
          </div>

          {/* Progress bar */}
          <div style={{ width: '100%', height: 4, backgroundColor: '#D1D1D6', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ 
              width: `${percent}%`, 
              height: '100%', 
              backgroundColor: '#007AFF', 
              borderRadius: 4,
              transition: 'width 0.3s'
            }} />
          </div>

          {/* Percent */}
          <div style={{ fontSize: 20, fontWeight: 600, color: '#000000', textAlign: 'center' }}>
            {percent.toFixed(0)}%
          </div>

          {/* Remaining time */}
          <div style={{ fontSize: 14, color: '#8E8E93', textAlign: 'center' }}>
            预计剩余时间: {formatTime(remainingSec)}
          </div>
        </div>
      </main>

      <DialogModal
        isOpen={dialog.isOpen}
        onClose={closeDialog}
        onConfirm={dialog.onConfirm}
        title={dialog.title}
        message={dialog.message}
        type={dialog.type}
      />
    </div>
  );
}
