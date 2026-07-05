import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useScanStore } from '../store/scanStore';
import { useMarkStore } from '../store/markStore';
import { getFolderTree, getFolderMarks, setFolderMark, deleteFolderMark } from '../api';
import { ArrowLeft, Star, ChevronsDown, ChevronsUp, ChevronRight } from 'lucide-react';

// ---------- Helper: resolve inherited mark ----------
function getResolvedMark(path: string, marks: Record<string, string>): { mark: string | null; isExplicit: boolean } {
  // Check exact match first
  if (marks[path]) return { mark: marks[path], isExplicit: true };

  // Walk up parent paths
  const normalized = path.replace(/\/+$/, '');
  const parts = normalized.split('/').filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i--) {
    const parentPath = i === 0 ? '/' : '/' + parts.slice(0, i).join('/');
    if (marks[parentPath]) return { mark: marks[parentPath], isExplicit: false };
  }

  return { mark: null, isExplicit: false };
}

// ---------- Segmented Toggle (保留 / 删除) ----------
function MarkToggle({ value, onChange, isExplicit }: { value: string | null; onChange: (v: string | null) => void; isExplicit?: boolean }) {
  const showKeep = value === 'keep';
  const showDelete = value === 'delete';
  const inherited = isExplicit === false;

  return (
    <div style={{
      width: 100,
      borderRadius: 6,
      border: inherited ? '1px solid #E5E5EA' : '1px solid #D1D1D6',
      padding: 2,
      display: 'flex',
      alignItems: 'center',
      gap: 0,
      flexShrink: 0
    }}>
      <button
        onClick={() => onChange(value === 'keep' ? null : 'keep')}
        style={{
          width: 48,
          height: 22,
          borderRadius: 6,
          border: 'none',
          fontSize: 12,
          fontWeight: showKeep ? 600 : 'normal',
          cursor: 'pointer',
          backgroundColor: showKeep ? (inherited ? '#B3D9FF' : '#007AFF') : 'transparent',
          color: showKeep ? (inherited ? '#007AFF' : '#FFFFFF') : '#AEAEB2',
          transition: 'all 0.15s',
          padding: 0
        }}
      >
        保留
      </button>
      <button
        onClick={() => onChange(value === 'delete' ? null : 'delete')}
        style={{
          width: 48,
          height: 22,
          borderRadius: 6,
          border: 'none',
          fontSize: 12,
          fontWeight: showDelete ? 600 : 'normal',
          cursor: 'pointer',
          backgroundColor: showDelete ? (inherited ? '#FFC7C5' : '#FF3B30') : 'transparent',
          color: showDelete ? (inherited ? '#FF3B30' : '#FFFFFF') : '#AEAEB2',
          transition: 'all 0.15s',
          padding: 0
        }}
      >
        删除
      </button>
    </div>
  );
}

// ---------- Tree Node ----------
const TreeNode = ({ node, sessionId, level = 0, onMarkSaved }: { node: any; sessionId: string; level?: number; onMarkSaved?: () => void }) => {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<any[]>(node.children || []);
  const { marks, updateMark } = useMarkStore();

  const handleToggleExpand = async () => {
    if (!expanded && children.length === 0) {
      const res = await getFolderTree(sessionId, node.path);
      setChildren(res.data);
    }
    setExpanded(!expanded);
  };

  const resolved = getResolvedMark(node.path, marks);
  const currentMark = resolved.mark;

  const handleMark = useCallback(async (mark: string | null) => {
    if (mark) {
      await setFolderMark(sessionId, node.path, mark);
      updateMark(node.path, mark);
    } else {
      await deleteFolderMark(sessionId, node.path);
      updateMark(node.path, null);
    }
    onMarkSaved?.();
  }, [sessionId, node.path, updateMark, onMarkSaved]);

  const isRoot = level === 0;
  const nodeNameColor = isRoot ? '#007AFF' : '#007AFF';
  const nodeNameWeight: any = isRoot ? 600 : 'normal';
  const nodeNameSize = isRoot ? 14 : 13;
  const infoColor = isRoot ? '#8E8E93' : '#AEAEB2';
  const infoSize = isRoot ? 12 : 11;
  const paddingLeft = 12 + level * 24;
  const padV = isRoot ? 10 : 8;

  // Inherited state background tint
  let rowBg = '#FFFFFF';
  if (!resolved.isExplicit && resolved.mark === 'keep') rowBg = '#F0F7FF';
  if (!resolved.isExplicit && resolved.mark === 'delete') rowBg = '#FFF5F5';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: `${padV}px 12px ${padV}px ${paddingLeft}px`,
        borderRadius: 6,
        border: resolved.isExplicit ? '1px solid #D1D1D6' : '1px solid #E5E5EA',
        backgroundColor: rowBg
      }}>
        {/* Expand chevron */}
        <div
          onClick={handleToggleExpand}
          className="expand-chevron"
          data-expanded-node={expanded ? "true" : "false"}
          data-has-children={node.has_children ? "true" : "false"}
          data-node-level={level}
          style={{
            width: 16,
            height: 16,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: node.has_children ? (isRoot ? '#007AFF' : '#AEAEB2') : 'transparent',
            transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 0.15s',
            flexShrink: 0
          }}
        >
          {node.has_children && <ChevronRight size={isRoot ? 16 : 14} />}
        </div>

        {/* Node name */}
        <span style={{
          fontSize: nodeNameSize,
          fontWeight: nodeNameWeight,
          color: nodeNameColor,
          flexShrink: 0,
          maxWidth: '50%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}>
          {node.name}
        </span>

        {/* Info */}
        <span style={{
          color: infoColor,
          fontSize: infoSize,
          flexShrink: 0
        }}>
          {node.n_files} files, {node.n_groups} groups
        </span>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Toggle buttons */}
        <MarkToggle value={currentMark} onChange={handleMark} isExplicit={resolved.isExplicit || currentMark === null} />
      </div>

      {/* Children */}
      {expanded && children.map((c: any) => (
        <div key={c.path} style={{ paddingLeft: level === 0 ? 0 : 0 }}>
          <TreeNode node={c} sessionId={sessionId} level={level + 1} onMarkSaved={onMarkSaved} />
        </div>
      ))}
    </div>
  );
};

// ---------- Page ----------
export default function FolderMarking() {
  const navigate = useNavigate();
  const sessionId = useScanStore(state => state.sessionId);
  const { setMarks } = useMarkStore();
  const [roots, setRoots] = useState<any[]>([]);

  const loadData = useCallback(() => {
    if (!sessionId) return;
    getFolderMarks(sessionId).then(res => {
      setMarks(res.data || {});
    });
    getFolderTree(sessionId, 'roots').then(res => setRoots(res.data || []));
  }, [sessionId, setMarks]);

  useEffect(() => {
    if (!sessionId) {
      navigate('/');
      return;
    }
    loadData();
  }, [sessionId, navigate, loadData]);

  const handleGenerate = () => {
    navigate('/scheme-progress');
  };

  const expandAll = () => {
    const chevrons = document.querySelectorAll('.expand-chevron[data-expanded-node="false"][data-has-children="true"]');
    if (chevrons.length === 0) return;
    
    let minLevel = 99999;
    chevrons.forEach(c => {
      const level = parseInt(c.getAttribute('data-node-level') || '99999', 10);
      if (level < minLevel) minLevel = level;
    });

    if (minLevel < 99999) {
      const targets = document.querySelectorAll(`.expand-chevron[data-expanded-node="false"][data-has-children="true"][data-node-level="${minLevel}"]`);
      targets.forEach(c => {
        (c as HTMLElement).click();
      });
    }
  };

  const collapseAll = () => {
    const chevrons = document.querySelectorAll('.expand-chevron[data-expanded-node="true"]');
    if (chevrons.length === 0) return;
    
    let maxLevel = -1;
    chevrons.forEach(c => {
      const level = parseInt(c.getAttribute('data-node-level') || '-1', 10);
      if (level > maxLevel) maxLevel = level;
    });

    if (maxLevel >= 0) {
      const targets = document.querySelectorAll(`.expand-chevron[data-expanded-node="true"][data-node-level="${maxLevel}"]`);
      targets.forEach(c => {
        (c as HTMLElement).click();
      });
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
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

      {/* Body */}
      <main style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        padding: '24px 32px',
        gap: 16
      }}>
        {/* Title row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>标记文件夹已确定清理规则</h1>
            <span style={{ fontSize: 14, color: '#8E8E93' }}>
              给文件夹标记「保留」或「删除」，其下文件对应处理；未标记自动继承最近上级。
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <button
              className="btn-primary"
              onClick={handleGenerate}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                height: 40,
                padding: '0 24px',
                borderRadius: 6,
                fontWeight: 600
              }}
            >
              预览清理
              <Star size={16} fill="currentColor" />
            </button>
          </div>
        </div>

        {/* Tree container */}
        <div style={{
          flex: 1,
          backgroundColor: '#FFFFFF',
          borderRadius: 12,
          border: '1px solid #D1D1D6',
          display: 'flex',
          flexDirection: 'column',
          padding: 16,
          gap: 12,
          overflow: 'hidden'
        }}>
          {/* Tree header */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexShrink: 0
          }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>文件夹标记设置</span>
          </div>

          <div style={{ display: 'flex', gap: 16, paddingBottom: 8, alignItems: 'center' }}>
            <button
              onClick={expandAll}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 10px',
                borderRadius: 6,
                backgroundColor: '#F2F2F7',
                border: '1px solid #D1D1D6',
                color: '#007AFF',
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer'
              }}
            >
              <ChevronsDown size={12} />
              展开子目录
            </button>
            <button
              onClick={collapseAll}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 10px',
                borderRadius: 6,
                backgroundColor: '#F2F2F7',
                border: '1px solid #D1D1D6',
                color: '#007AFF',
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer'
              }}
            >
              <ChevronsUp size={12} />
              收起子目录
            </button>
          </div>

          {/* Tree content */}
          <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {roots.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: '#8E8E93' }}>正在加载目录...</div>
            ) : (
              roots.map(r => (
                <TreeNode key={r.path} node={r} sessionId={sessionId as string} level={0} />
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
