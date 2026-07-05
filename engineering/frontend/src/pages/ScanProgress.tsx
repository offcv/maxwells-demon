import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useScanStore } from '../store/scanStore';
import { cancelScan, getScanStatus } from '../api';
import { Loader2, X } from 'lucide-react';
import DialogModal from '../components/DialogModal';

type DialogConfig = {
  isOpen: boolean;
  type: 'alert' | 'confirm';
  title: string;
  message: string;
  onConfirm?: () => void;
};

export default function ScanProgress() {
  const navigate = useNavigate();
  // Using useRef to prevent re-renders from changing state, and to hold mutable values
  const { setSessionId, updateProgress, status, phase1, phase2, elapsedSec, remainingSec } = useScanStore();
  const isNavigating = useRef(false);
  const [cancelling, setCancelling] = useState(false);
  const [dialog, setDialog] = useState<DialogConfig>({ isOpen: false, type: 'alert', title: '', message: '' });

  const closeDialog = () => setDialog(prev => ({ ...prev, isOpen: false }));


  useEffect(() => {
    console.log('ScanProgress: Component mounted.');
    // CRITICAL FIX: Reset navigating flag on mount.
    // React 18 StrictMode double-mounts in dev: the cleanup of the first mount
    // sets isNavigating.current=true, which would poison the ref for the second mount.
    isNavigating.current = false;
    // Reset stale phase1/phase2 data from a previous scan session
    useScanStore.getState().reset();
    let ws: WebSocket;
    let pollInterval: NodeJS.Timeout;

    const checkStatus = async () => {
      if (isNavigating.current) return;
      try {
        const res = await getScanStatus();
        if (isNavigating.current) return; // Prevent queued poll responses from triggering alerts

        const currentStatus = res.data.status;
        const currentSessionId = res.data.session_id;

        console.log(`ScanProgress: Poll response - Status: ${currentStatus}, SessionID: ${currentSessionId}`);
        
        if (currentSessionId) {
          setSessionId(currentSessionId);
        }

        if (currentStatus === 'done') {
          console.log('ScanProgress: Status is done, navigating to results.');
          isNavigating.current = true;
          if (ws) ws.close();
          if (pollInterval) clearInterval(pollInterval);
          navigate('/scan-results');
        } else if (currentStatus === 'error' || currentStatus === 'cancelled') {
          console.log(`ScanProgress: Status is ${currentStatus}, navigating to home.`);
          isNavigating.current = true;
          if (ws) ws.close();
          if (pollInterval) clearInterval(pollInterval);
          navigate('/');
        }
      } catch (e) {
        console.error("Failed to poll status", e);
      }
    };

    const connectWs = () => {
      console.log('ScanProgress: Connecting WebSocket...');
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      ws = new WebSocket(`${protocol}//${host}/ws/scan/progress`);

      ws.onopen = () => {
        console.log('ScanProgress: WebSocket connected.');
      };
      
      ws.onmessage = (e) => {
        if (isNavigating.current) return;
        const data = JSON.parse(e.data);
        console.log('ScanProgress: WebSocket message received:', data);
        
        if(data.session_id) {
          setSessionId(data.session_id);
        }

        updateProgress(data);

        if (data.status === 'done') {
          console.log('ScanProgress: WS status is done, navigating to results.');
          isNavigating.current = true;
          ws.close();
          if (pollInterval) clearInterval(pollInterval);
          navigate('/scan-results');
        } else if (data.status === 'error' || data.status === 'cancelled') {
          console.log(`ScanProgress: WS status is ${data.status}, navigating to home.`);
          isNavigating.current = true;
          ws.close();
          if (pollInterval) clearInterval(pollInterval);
          navigate('/');
        }
      };

      ws.onclose = () => {
        console.log('ScanProgress: WebSocket closed.');
      };

      ws.onerror = (err) => {
        console.error('ScanProgress: WebSocket error:', err);
      };
    };

    connectWs();
    pollInterval = setInterval(checkStatus, 1000);

    return () => {
      console.log('ScanProgress: Component unmounting, cleaning up.');
      isNavigating.current = true; // Prevent any outstanding async operations from navigating
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [navigate, setSessionId, updateProgress]);

  const handleCancel = async () => {
    if (cancelling) return;
    setDialog({
      isOpen: true,
      type: 'confirm',
      title: '取消扫描',
      message: '确定要取消扫描吗？',
      onConfirm: async () => {
        closeDialog();
        setCancelling(true);
        await cancelScan();
      }
    });
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{ 
        height: 64, 
        backgroundColor: '#FFFFFF', 
        padding: '0 32px', 
        display: 'flex', 
        alignItems: 'center',
        borderBottom: '1px solid #D1D1D6' 
      }}>
        <div style={{ fontSize: 20, fontWeight: 600 }}>麦克斯韦妖</div>
        <div style={{ flex: 1 }} />
        <div 
          onClick={cancelling ? undefined : handleCancel}
          style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: cancelling ? 'default' : 'pointer', color: '#8E8E93', opacity: cancelling ? 0.5 : 1 }}
        >
          <Loader2 size={16} style={{ animation: cancelling ? 'spin 1s linear infinite' : 'none' }} />
          <span style={{ fontSize: 14 }}>{cancelling ? '正在取消...' : '取消扫描'}</span>
        </div>
      </header>

      <main style={{ 
        flex: 1, 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        justifyContent: 'center',
        padding: '32px 48px',
        gap: 32 
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <Loader2 
            size={48} 
            color="var(--primary)" 
            style={{ animation: 'spin 2s linear infinite' }} 
          />
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>正在扫描文件...</h1>
        </div>

        <div style={{ 
          width: '100%', 
          maxWidth: 600, 
          backgroundColor: '#FFFFFF',
          borderRadius: 12,
          padding: 32,
          border: '1px solid #D1D1D6',
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
        }}>
          {/* Phase 1 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, opacity: status === 'idle' ? 0.5 : 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#8E8E93', fontSize: 14 }}>阶段 1/2</span>
              <span style={{ color: '#8E8E93', fontSize: 14, fontWeight: 600 }}>快速初筛 (xxHash64)</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#8E8E93', fontSize: 14 }}>已发现文件</span>
              <span style={{ fontSize: 14, fontWeight: 600 }}>
                {phase1 ? phase1.scanned.toLocaleString() : 0}
                {status === 'phase2' || status === 'done' ? ' (已完成)' : ''}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#8E8E93', fontSize: 14, whiteSpace: 'nowrap' }}>当前文件</span>
              <span style={{ color: '#8E8E93', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 400 }} title={phase1?.current_file || ''}>
                {phase1 ? (phase1.current_file?.split('/').pop() || phase1.current_file) : '-'}
              </span>
            </div>
          </div>

          <div style={{ width: '100%', height: 1, backgroundColor: '#E5E5EA', margin: '4px 0' }} />

          {/* Phase 2 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, opacity: status === 'idle' || status === 'phase1' ? 0.5 : 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#8E8E93', fontSize: 14 }}>阶段 2/2</span>
              <span style={{ color: '#8E8E93', fontSize: 14, fontWeight: 600 }}>精确确认 (SHA-256)</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#8E8E93', fontSize: 14 }}>已处理候选</span>
              <span style={{ fontSize: 14, fontWeight: 600 }}>
                {phase2 ? `${phase2.computed.toLocaleString()} / ${phase2.total_candidates.toLocaleString()} (${phase2.percent.toFixed(1)}%)` : '等待中...'}
              </span>
            </div>
            <div style={{ width: '100%', height: 4, backgroundColor: '#D1D1D6', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ width: `${phase2 ? phase2.percent : 0}%`, height: '100%', backgroundColor: '#007AFF', borderRadius: 4, transition: 'width 0.3s' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#8E8E93', fontSize: 14, whiteSpace: 'nowrap' }}>当前文件</span>
              <span style={{ color: '#8E8E93', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 400 }} title={phase2?.current_file || ''}>
                {phase2 ? (phase2.current_file?.split('/').pop() || phase2.current_file) : '-'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#8E8E93', fontSize: 14 }}>预计剩余</span>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{phase2 ? `${Math.round(remainingSec)} 秒` : '-'}</span>
            </div>
          </div>
          
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8 }}>
            <span style={{ color: '#8E8E93', fontSize: 13 }}>已用时间: {Math.round(elapsedSec)}s</span>
          </div>
        </div>
      </main>
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
      
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
