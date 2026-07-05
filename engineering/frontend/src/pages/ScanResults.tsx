import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useScanStore } from '../store/scanStore';
import { getSessionSummary, getSessionGroups, revealFile } from '../api';
import { ArrowLeft, ArrowRight, Layers, Files, HardDrive, Timer, FolderOpen } from 'lucide-react';

export default function ScanResults() {
  const navigate = useNavigate();
  const sessionId = useScanStore(state => state.sessionId);
  const [summary, setSummary] = useState<any>(null);
  const [groups, setGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredPath, setHoveredPath] = useState<string | null>(null);

  const handleReveal = async (path: string) => {
    try {
      await revealFile(path);
    } catch (e) {
      console.error('revealFile failed', e);
    }
  };

  useEffect(() => {
    console.log('ScanResults: Component mounted. Session ID from store:', sessionId);
    if (!sessionId) {
      console.error('ScanResults: No session ID found, navigating to home.');
      navigate('/');
      return;
    }
    
    console.log(`ScanResults: Fetching data for session ${sessionId}...`);
    Promise.all([
      getSessionSummary(sessionId),
      getSessionGroups(sessionId, 1)
    ])
      .then(([summaryRes, groupsRes]) => {
        console.log('ScanResults: Fetched summary:', summaryRes.data);
        console.log('ScanResults: Fetched groups:', groupsRes.data);
        setSummary(summaryRes.data);
        if (groupsRes.data && Array.isArray(groupsRes.data.data)) {
          setGroups(groupsRes.data.data);
        } else {
          setGroups([]);
        }
      })
      .catch(e => {
        console.error("ScanResults: Failed to fetch session data, navigating home:", e);
        navigate('/');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [sessionId, navigate]);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
  };

  const formatDate = (timestamp: number) => {
    const d = new Date(timestamp * 1000);
    return `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>加载中...</div>;
  if (!summary) return <div style={{ padding: 40, textAlign: 'center' }}>未能加载到扫描结果。</div>;

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
        <div 
          onClick={() => navigate('/')}
          style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: '#8E8E93' }}
        >
          <ArrowLeft size={16} />
          <span style={{ fontSize: 14 }}>返回首页</span>
        </div>
      </header>

      <main style={{ 
        flex: 1, 
        display: 'flex', 
        flexDirection: 'column',
        padding: '24px 32px',
        gap: 20
      }}>
        {/* Title and Next Button */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>扫描结果</h1>
            <span style={{ fontSize: 14, color: '#8E8E93' }}>
              {summary.group_count > 0
                ? '已发现以下重复文件，请点击下一步按钮确定清理规则'
                : '未发现重复文件，无需进行清理'}
            </span>
          </div>
          <button 
            className="btn-primary" 
            onClick={() => summary.group_count > 0 ? navigate('/folder-marking') : undefined}
            disabled={!summary.group_count}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: 8, 
              height: 40, 
              padding: '0 24px', 
              borderRadius: 6 
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 600 }}>下一步</span>
            <ArrowRight size={16} />
          </button>
        </div>

        {/* Stats Row — 4 columns matching design */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          <div style={{ backgroundColor: '#FFFFFF', borderRadius: 12, padding: 20, border: '1px solid #D1D1D6', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Layers size={20} color="var(--primary)" />
            <div style={{ fontSize: 13, color: '#8E8E93' }}>相同文件</div>
            <div style={{ fontSize: 28, fontWeight: 600 }}>{summary.group_count || 0} 组</div>
          </div>
          <div style={{ backgroundColor: '#FFFFFF', borderRadius: 12, padding: 20, border: '1px solid #D1D1D6', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Files size={20} color="var(--primary)" />
            <div style={{ fontSize: 13, color: '#8E8E93' }}>多余文件</div>
            <div style={{ fontSize: 28, fontWeight: 600 }}>{Math.max(0, (summary.file_count || 0) - (summary.group_count || 0))} 个</div>
          </div>
          <div style={{ backgroundColor: '#FFFFFF', borderRadius: 12, padding: 20, border: '1px solid #D1D1D6', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <HardDrive size={20} color="var(--primary)" />
            <div style={{ fontSize: 13, color: '#8E8E93' }}>可释放空间</div>
            <div style={{ fontSize: 28, fontWeight: 600 }}>{formatSize(summary.reclaimable_size || 0)}</div>
          </div>
          <div style={{ backgroundColor: '#FFFFFF', borderRadius: 12, padding: 20, border: '1px solid #D1D1D6', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Timer size={20} color="var(--primary)" />
            <div style={{ fontSize: 13, color: '#8E8E93' }}>扫描耗时</div>
            <div style={{ fontSize: 28, fontWeight: 600 }}>{formatTime(summary.scan_duration_sec || 0)}</div>
          </div>
        </div>

        {/* File List */}
        <div style={{ 
          backgroundColor: '#FFFFFF', 
          borderRadius: 12, 
          border: '1px solid #D1D1D6',
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          overflow: 'hidden'
        }}>
          {/* Header */}
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            height: 32, 
            backgroundColor: '#F2F2F7', 
            padding: '0 12px',
            borderBottom: '1px solid #D1D1D6',
            fontSize: 13,
            fontWeight: 600,
            color: '#8E8E93'
          }}>
            <div style={{ width: 60 }}>组号</div>
            <div style={{ width: 200 }}>文件名</div>
            <div style={{ width: 80 }}>大小</div>
            <div style={{ width: 160 }}>创建时间</div>
            <div style={{ width: 160 }}>修改时间</div>
            <div style={{ flex: 1 }}>路径</div>
            <div style={{ width: 40, textAlign: 'center' }}>打开</div>
          </div>

          {/* Rows */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {groups.length === 0 ? (
               <div style={{ padding: 40, textAlign: 'center', color: '#8E8E93' }}>没有发现重复文件</div>
            ) : (
              groups.map((g, groupIndex) => (
                <div key={g.group_id} style={{ display: 'flex', flexDirection: 'column' }}>
                  {g.files.map((f: any, fileIndex: number) => {
                    const isFirst = fileIndex === 0;
                    return (
                      <div key={f.id} style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        minHeight: 28, 
                        padding: '4px 12px',
                        backgroundColor: isFirst ? '#F2F2F7' : '#FFFFFF',
                        borderBottom: '1px solid #E5E5EA',
                        fontSize: 13
                      }}>
                        <div style={{ width: 60, fontWeight: isFirst ? 600 : 'normal' }}>
                          {isFirst ? `[${g.group_id}]` : ''}
                        </div>
                        <div style={{ width: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {f.path.split('/').pop()}
                        </div>
                        <div style={{ width: 80, color: '#8E8E93' }}>{formatSize(f.size)}</div>
                        <div style={{ width: 160, color: '#8E8E93' }}>{formatDate(f.created_time)}</div>
                        <div style={{ width: 160, color: '#8E8E93' }}>{formatDate(f.modified_time)}</div>
                        <div 
                          style={{ 
                            flex: 1, 
                            color: 'var(--primary)', 
                            overflow: 'hidden', 
                            textOverflow: 'ellipsis', 
                            whiteSpace: 'nowrap',
                            cursor: 'pointer',
                            borderRadius: 4,
                            padding: '2px 4px',
                            margin: '-2px -4px',
                            backgroundColor: hoveredPath === f.path ? 'rgba(0, 122, 255, 0.08)' : 'transparent'
                          }}
                          onClick={() => handleReveal(f.path)}
                          onMouseEnter={() => setHoveredPath(f.path)}
                          onMouseLeave={() => setHoveredPath(null)}
                          title={f.path}
                        >
                          {f.path}
                        </div>
                        <div style={{ width: 40, display: 'flex', justifyContent: 'center' }}>
                          <FolderOpen 
                            size={16} 
                            color="var(--primary)" 
                            style={{ 
                              cursor: 'pointer',
                              opacity: hoveredPath === f.path ? 1 : 0.6,
                              transition: 'opacity 0.15s'
                            }}
                            onClick={() => handleReveal(f.path)}
                            onMouseEnter={() => setHoveredPath(f.path)}
                            onMouseLeave={() => setHoveredPath(null)}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
