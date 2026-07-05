import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSessions, getScanStatus } from '../api';
import { useScanStore } from '../store/scanStore';
import { Search, FolderPlus, History } from 'lucide-react';

export default function Home() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const setSessionId = useScanStore(state => state.setSessionId);

  useEffect(() => {
    getSessions().then(res => setSessions(res.data)).catch(console.error);
    getScanStatus().then(res => {
      if (['phase1', 'phase2'].includes(res.data.status)) {
        setSessionId(res.data.session_id);
        navigate('/scan-progress');
      }
    }).catch(console.error);
  }, []);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#F2F2F7' }}>
      {/* Nav */}
      <header style={{ 
        height: 64, 
        backgroundColor: '#FFFFFF', 
        padding: '0 32px', 
        display: 'flex', 
        alignItems: 'center',
        borderBottom: '1px solid #D1D1D6',
        flexShrink: 0
      }}>
        <div style={{ fontSize: 20, fontWeight: 600, color: '#000000' }}>麦克斯韦妖</div>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 14, color: '#AEAEB2' }}>v1.0</div>
      </header>

      <main style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 48,
        padding: '40px 48px'
      }}>
        {/* Hero section */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <Search size={48} color="#007AFF" />
          <h1 style={{ fontSize: 32, fontWeight: 600, color: '#000000', margin: 0, textAlign: 'center' }}>
            重复文件清理工具
          </h1>
          <p style={{ fontSize: 18, color: '#8E8E93', margin: 0, textAlign: 'center' }}>
            理顺清理预期，让重复文件安全告别
          </p>
        </div>

        {/* Cards row */}
        <div style={{ display: 'flex', gap: 32, justifyContent: 'center' }}>
          {/* Card 1: New Scan */}
          <div style={{
            width: 280,
            height: 262,
            backgroundColor: '#FFFFFF',
            borderRadius: 12,
            border: '1px solid #D1D1D6',
            padding: 32,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 20
          }}>
            <FolderPlus size={48} color="#007AFF" />
            <div style={{ fontSize: 20, fontWeight: 600, color: '#000000', textAlign: 'center' }}>新建扫描</div>
            <div style={{ fontSize: 14, color: '#8E8E93', textAlign: 'center' }}>
              选择文件夹开始扫描重复文件
            </div>
            <button
              onClick={() => navigate('/new-scan')}
              style={{
                width: '100%',
                height: 40,
                borderRadius: 6,
                backgroundColor: '#007AFF',
                color: '#FFFFFF',
                border: 'none',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                marginTop: 'auto'
              }}
            >
              开始扫描
            </button>
          </div>

          {/* Card 2: Load Results */}
          <div style={{
            width: 280,
            height: 262,
            backgroundColor: '#FFFFFF',
            borderRadius: 12,
            border: '1px solid #D1D1D6',
            padding: 32,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 20
          }}>
            <History size={48} color="#007AFF" />
            <div style={{ fontSize: 20, fontWeight: 600, color: '#000000', textAlign: 'center' }}>历史扫描</div>
            <div style={{ fontSize: 14, color: '#8E8E93', textAlign: 'center' }}>
              查看已保存的扫描结果
            </div>
            <button
              onClick={() => navigate('/saved-results')}
              style={{
                width: '100%',
                height: 40,
                borderRadius: 6,
                backgroundColor: '#007AFF',
                color: '#FFFFFF',
                border: 'none',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                marginTop: 'auto'
              }}
            >
              查看历史
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
