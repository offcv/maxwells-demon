import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useScanStore } from '../store/scanStore';
import { startScan } from '../api';
import { ArrowLeft, Play, ChevronRight, ChevronDown, Folder, Plus, X } from 'lucide-react';
import FolderPickerModal from '../components/FolderPickerModal';
import DialogModal from '../components/DialogModal';

type DialogConfig = {
  isOpen: boolean;
  type: 'alert' | 'confirm';
  title: string;
  message: string;
  onConfirm?: () => void;
};

export default function NewScan() {
  const navigate = useNavigate();
  const [includes, setIncludes] = useState<string[]>([]); 
  const [excludes, setExcludes] = useState<string[]>([]);
  const [excludesExpanded, setExcludesExpanded] = useState<boolean>(false);
  
  const [isIncludeModalOpen, setIsIncludeModalOpen] = useState(false);
  const [isExcludeModalOpen, setIsExcludeModalOpen] = useState(false);
  const [dialog, setDialog] = useState<DialogConfig>({ isOpen: false, type: 'alert', title: '', message: '' });
  
  const setScanPaths = useScanStore(state => state.setScanPaths);

  const closeDialog = () => setDialog(prev => ({ ...prev, isOpen: false }));
  
  const showAlert = (message: string) => {
    setDialog({ isOpen: true, type: 'alert', title: '提示', message });
  };

  const handleAddInclude = () => {
    setIsIncludeModalOpen(true);
  };

  const handleAddExclude = () => {
    setIsExcludeModalOpen(true);
  };

  const isSubPath = (parent: string, child: string) => {
    const p = parent.endsWith('/') ? parent : parent + '/';
    const c = child.endsWith('/') ? child : child + '/';
    return c.startsWith(p);
  };

  const handleIncludeSelect = (path: string) => {
    if (!path) return;
    const p = path.trim();
    
    // 场景 1: 已有包含它的外层文件夹
    if (includes.some(inc => inc === p || isSubPath(inc, p))) {
      showAlert('无需添加：您已经选了一个包含它的文件夹。');
      return;
    }
    
    // 场景 3: 所在目录已被排除
    if (excludes.some(ex => ex === p || isSubPath(ex, p))) {
      showAlert('无法添加：这个文件夹所在的目录已在排除文件夹中。请先在【排除文件夹】中删掉它。');
      return;
    }
    
    // 场景 2: 已有它里面的文件夹，询问是否替换
    const childrenToRemove = includes.filter(inc => isSubPath(p, inc));
    if (childrenToRemove.length > 0) {
      setDialog({
        isOpen: true,
        type: 'confirm',
        title: '替换文件夹',
        message: '您已经选了它里面的文件夹，是否替换为这个文件夹？确定后，已选的内部文件夹将被替换。',
        onConfirm: () => {
          setIncludes(includes.filter(inc => !childrenToRemove.includes(inc)).concat(p));
          closeDialog();
        }
      });
      return;
    }
    
    setIncludes([...includes, p]);
  };

  const handleExcludeSelect = (path: string) => {
    if (!path) return;
    const p = path.trim();
    
    // 场景 4: 已有包含它的外层文件夹
    if (excludes.some(ex => ex === p || isSubPath(ex, p))) {
      showAlert('无需添加：您已经选了一个包含它的文件夹。');
      return;
    }
    
    // 场景 6: 里面有正在扫描的文件夹
    if (includes.some(inc => inc === p || isSubPath(p, inc))) {
      showAlert('无法排除：这个文件夹里面有正在扫描的文件夹。请先在【扫描文件夹】中删掉它里面的文件夹。');
      return;
    }
    
    // 场景 5: 已有它里面的文件夹，询问是否替换
    const childrenToRemove = excludes.filter(ex => isSubPath(p, ex));
    if (childrenToRemove.length > 0) {
      setDialog({
        isOpen: true,
        type: 'confirm',
        title: '替换文件夹',
        message: '您已经选了它里面的文件夹，是否替换为这个文件夹？确定后，已选的内部文件夹将被替换。',
        onConfirm: () => {
          setExcludes(excludes.filter(ex => !childrenToRemove.includes(ex)).concat(p));
          closeDialog();
        }
      });
      return;
    }
    
    setExcludes([...excludes, p]);
  };

  const handleRemoveInclude = (pathToRemove: string) => {
    setIncludes(includes.filter(p => p !== pathToRemove));
  };

  const handleRemoveExclude = (pathToRemove: string) => {
    setExcludes(excludes.filter(p => p !== pathToRemove));
  };

  const handleStart = async () => {
    if (includes.length === 0) {
      showAlert("无法开始：请先添加要扫描的文件夹。");
      return;
    }
    
    // 检查 2: 兜底逻辑冲突检查 (扫描文件夹被排除规则覆盖)
    const hasConflict = includes.some(inc => 
      excludes.some(ex => inc === ex || isSubPath(ex, inc))
    );
    if (hasConflict) {
      showAlert("无法开始：部分扫描文件夹与排除规则冲突。请调整后重试。");
      return;
    }
    
    const paths = [
      ...includes.map(p => ({ path: p, is_exclude: false })),
      ...excludes.map(p => ({ path: p, is_exclude: true }))
    ];
    
    try {
      const res = await startScan(paths);
      // Put session_id in scanStore immediately so ScanProgress has it
      if (res.data?.session_id) {
        setScanPaths(paths);
        useScanStore.getState().setSessionId(res.data.session_id);
      }
      navigate('/scan-progress');
    } catch (e) {
      console.error(e);
      showAlert('无法启动扫描任务，请检查后端是否正常运行。');
    }
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
        gap: 24
      }}>
        {/* sPageHeader */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>新建扫描</h1>
            <span style={{ fontSize: 14, color: '#8E8E93' }}>选择要扫描的文件夹</span>
          </div>
          <button 
            className="btn-primary" 
            onClick={handleStart} 
            disabled={includes.length === 0}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: 8, 
              height: 40, 
              padding: '0 24px', 
              borderRadius: 6,
              fontSize: 14,
              fontWeight: 600
            }}
          >
            开始扫描
            <Play size={16} fill="currentColor" />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* sCard - Include Paths */}
          <div style={{ 
            backgroundColor: '#FFFFFF', 
            borderRadius: 12, 
            padding: 24, 
            border: '1px solid #D1D1D6',
            display: 'flex',
            flexDirection: 'column',
            gap: 12
          }}>
            {/* scanHdr */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Folder size={20} color="var(--primary)" fill="var(--primary)" />
              <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>扫描文件夹</h3>
            </div>
            
            {/* addPathBtn */}
            <button 
              onClick={handleAddInclude}
              style={{ 
                height: 36, 
                padding: '0 16px', 
                borderRadius: 6, 
                border: '1px solid #D1D1D6', 
                backgroundColor: 'transparent',
                color: '#8E8E93',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                alignSelf: 'flex-start',
                fontSize: 14,
                cursor: 'pointer'
              }}
            >
              <Plus size={16} />
              添加文件夹
            </button>
            
            {/* pathList */}
            {includes.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 4 }}>
                {includes.map((p, i) => (
                  <div key={i} style={{ 
                    backgroundColor: '#F2F2F7', 
                    borderRadius: 6, 
                    height: 44, 
                    padding: '0 16px', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between'
                  }}>
                    <span style={{ fontSize: 14, color: '#000000' }}>{p}</span>
                    <button 
                      onClick={() => handleRemoveInclude(p)}
                      style={{ background: 'transparent', padding: 4, display: 'flex', color: '#8E8E93', border: 'none', cursor: 'pointer' }}
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* exclSection - Exclude Paths */}
          <div style={{ 
            backgroundColor: '#FFFFFF', 
            borderRadius: 12, 
            padding: 16, 
            border: '1px solid #D1D1D6',
            display: 'flex',
            flexDirection: 'column'
          }}>
            <div 
              style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
              onClick={() => setExcludesExpanded(!excludesExpanded)}
            >
              {excludesExpanded ? <ChevronDown size={14} color="#8E8E93" /> : <ChevronRight size={14} color="#8E8E93" />}
              <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0, color: '#000000' }}>排除文件夹</h3>
              {excludes.length > 0 && (
                <div style={{ backgroundColor: '#F2F2F7', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, color: '#8E8E93' }}>
                  已排除 {excludes.length} 个路径
                </div>
              )}
            </div>

            {excludesExpanded && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16, paddingLeft: 22 }}>
                {/* addPathBtn (Same styling as above) */}
                <button 
                  onClick={(e) => { e.stopPropagation(); handleAddExclude(); }}
                  style={{ 
                    height: 36, 
                    padding: '0 16px', 
                    borderRadius: 6, 
                    border: '1px solid #D1D1D6', 
                    backgroundColor: 'transparent',
                    color: '#8E8E93',
                    alignSelf: 'flex-start',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: 14,
                    cursor: 'pointer'
                  }}
                >
                  <Plus size={16} />
                  添加文件夹
                </button>
                
                {excludes.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {excludes.map((p, i) => (
                      <div key={i} style={{ 
                        backgroundColor: '#F2F2F7', 
                        borderRadius: 6, 
                        height: 44, 
                        padding: '0 16px', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'space-between'
                      }}>
                        <span style={{ fontSize: 14, color: '#000000' }}>{p}</span>
                        <button 
                          onClick={() => handleRemoveExclude(p)}
                          style={{ background: 'transparent', padding: 4, display: 'flex', color: '#8E8E93', border: 'none', cursor: 'pointer' }}
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      <FolderPickerModal 
        isOpen={isIncludeModalOpen} 
        onClose={() => setIsIncludeModalOpen(false)} 
        onSelect={handleIncludeSelect} 
        title="选择扫描文件夹"
      />
      
      <FolderPickerModal 
        isOpen={isExcludeModalOpen} 
        onClose={() => setIsExcludeModalOpen(false)} 
        onSelect={handleExcludeSelect} 
        title="选择排除文件夹"
      />
      
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