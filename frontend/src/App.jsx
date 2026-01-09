import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { 
  Database, Plus, Trash2, Play, Terminal, Table as TableIcon, 
  RefreshCw, Cpu, AlertCircle, ChevronRight, ChevronDown, 
  LayoutGrid, MessageSquare, X, GripHorizontal, Link as LinkIcon,
  ZoomIn, ZoomOut, Maximize, Move, Pencil, Check, Unlink, AlertTriangle,
  Mic, MicOff, LayoutTemplate
} from 'lucide-react';

// --- API CONFIGURATION ---
const API_BASE = 'http://localhost:8000';

const api = {
  getSchema: async () => {
    const res = await fetch(`${API_BASE}/schema`);
    if (!res.ok) throw new Error('Failed to fetch schema');
    return res.json();
  },
  sendDDL: async (payload) => {
    const res = await fetch(`${API_BASE}/ddl`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'DDL Error');
    }
    return res.json();
  },
  chat: async (message) => {
    const res = await fetch(`${API_BASE}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    });
    if (!res.ok) throw new Error('Chat Error');
    return res.json();
  }
};

// --- CONSTANTS FOR LAYOUT ---
const CARD_WIDTH = 288; 
const HEADER_HEIGHT = 56; 
const ROW_HEIGHT = 40; 
const FOOTER_HEIGHT = 42; 
const GRID_GAP_X = 50;
const GRID_GAP_Y = 50;
const START_X = 50;
const START_Y = 50;

const getCardHeight = (table) => {
  const rowsHeight = table.columns.length * ROW_HEIGHT;
  return HEADER_HEIGHT + rowsHeight + FOOTER_HEIGHT;
};

// --- COMPONENTS ---

const ConfirmModal = ({ isOpen, message, onConfirm, onCancel }) => {
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-black border border-white/20 shadow-2xl w-full max-w-sm animate-in zoom-in-95 duration-200 border-t-4 border-t-white">
        <div className="p-6 flex flex-col items-center text-center">
           <div className="w-12 h-12 rounded-full bg-neutral-900 flex items-center justify-center mb-4 border border-white/10">
             <AlertTriangle className="w-6 h-6 text-white" />
           </div>
           <h3 className="text-lg font-black text-white uppercase tracking-tighter mb-2">Confirm Action</h3>
           <p className="text-neutral-400 text-sm mb-6 font-mono">{message}</p>
           
           <div className="flex gap-3 w-full">
             <button onClick={onCancel} className="flex-1 px-4 py-3 text-xs font-bold uppercase tracking-widest text-white border border-white/20 hover:bg-white/10 transition-colors">Cancel</button>
             <button onClick={onConfirm} className="flex-1 px-4 py-3 text-xs font-bold uppercase tracking-widest text-black bg-white hover:bg-neutral-200 transition-colors">Confirm</button>
           </div>
        </div>
      </div>
    </div>
  );
};

const TableExplorer = React.memo(({ schema, onRefresh }) => {
  const [expandedTables, setExpandedTables] = useState({});
  const toggleTable = (tableName) => {
    setExpandedTables(prev => ({...prev, [tableName]: !prev[tableName]}));
  };

  return (
    <aside className="w-64 bg-black border-r border-white/20 flex flex-col shrink-0 h-full overflow-hidden z-30 shadow-2xl">
      <div className="h-16 shrink-0 border-b border-white/20 flex items-center px-6 gap-2 bg-black">
        <Database className="w-4 h-4 text-white" />
        <span className="text-sm font-bold text-white tracking-wider uppercase">Explorer</span>
      </div>
      <div className="flex-1 overflow-y-auto p-2 scrollbar-thin">
        <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-2 px-2 mt-2">Tables</div>
        {schema.map(table => (
          <div key={table.id} className="mb-1">
            <button onClick={() => toggleTable(table.name)} className="w-full flex items-center gap-2 px-2 py-1.5 text-neutral-400 hover:bg-white/10 hover:text-white rounded-sm text-xs transition-colors group">
              {expandedTables[table.name] ? <ChevronDown className="w-3 h-3 text-white" /> : <ChevronRight className="w-3 h-3 text-neutral-600 group-hover:text-white" />}
              <TableIcon className="w-3 h-3" />
              <span className="truncate font-medium">{table.name}</span>
            </button>
            {expandedTables[table.name] && (
              <div className="ml-2 border-l border-white/10 pl-4 mt-1 space-y-1">
                {table.columns.map((col, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-[10px] text-neutral-500 py-0.5 font-mono">
                    <div className={`w-1 h-1 rounded-full ${col.isPk ? 'bg-white' : 'bg-neutral-800'}`}></div>
                    <span className="truncate">{col.name}</span>
                    {col.fk && <LinkIcon className="w-2 h-2 text-neutral-600" />}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="p-4 border-t border-white/20">
         <button onClick={onRefresh} className="w-full flex items-center justify-center gap-2 border border-white/20 hover:bg-white hover:text-black text-white text-xs py-2 px-3 rounded-sm transition-all uppercase tracking-wide font-bold">
           <RefreshCw className="w-3 h-3" /> Refresh
         </button>
      </div>
    </aside>
  );
});

// MEMOIZED SCHEMA NODE FOR PERFORMANCE
const SchemaNode = React.memo(({ 
    table, position, zoom, 
    onMove, onRefresh, onError, 
    onStartLinking, linkingState,
    requestConfirm, isHighlighted
}) => {
  const [isAddingCol, setIsAddingCol] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [newColType, setNewColType] = useState('VARCHAR(255)');
  const [isBusy, setIsBusy] = useState(false);
  
  const [editingTableName, setEditingTableName] = useState(false);
  const [tempTableName, setTempTableName] = useState(table.name);
  const [editingCol, setEditingCol] = useState(null); 
  const [tempColName, setTempColName] = useState('');
  const [tempColType, setTempColType] = useState('');

  // Use refs for drag calculation to avoid closure staleness during rapid events
  const dragRef = useRef({ startX: 0, startY: 0, nodeStartX: 0, nodeStartY: 0 });
  const animationFrameRef = useRef(null);

  const stopProp = (e) => e.stopPropagation();

  const handleMouseDown = (e) => {
    e.preventDefault();
    e.stopPropagation(); 
    
    dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        nodeStartX: position.x,
        nodeStartY: position.y
    };
    
    const handleMouseMove = (moveEvent) => {
        if (animationFrameRef.current) return; // Throttle to frame rate

        animationFrameRef.current = requestAnimationFrame(() => {
            const deltaX = (moveEvent.clientX - dragRef.current.startX) / zoom;
            const deltaY = (moveEvent.clientY - dragRef.current.startY) / zoom;
            onMove(table.id, { 
                x: dragRef.current.nodeStartX + deltaX, 
                y: dragRef.current.nodeStartY + deltaY 
            });
            animationFrameRef.current = null;
        });
    };
    
    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleRenameTable = async () => {
    if (!tempTableName || tempTableName === table.name) { setEditingTableName(false); return; }
    setIsBusy(true);
    try { await api.sendDDL({ action: 'rename_table', table_name: table.name, new_table_name: tempTableName }); onRefresh(); } 
    catch(e) { onError(e.message); } finally { setIsBusy(false); setEditingTableName(false); }
  };

  const handleAddColumn = async () => {
    if (!newColName) return;
    setIsBusy(true);
    try { await api.sendDDL({ action: 'add_column', table_name: table.name, column_name: newColName, column_type: newColType }); setNewColName(''); setIsAddingCol(false); onRefresh(); } 
    catch (e) { onError(e.message); } finally { setIsBusy(false); }
  };

  const handleDeleteTable = () => {
    requestConfirm(`Delete table '${table.name}'?`, async () => {
        setIsBusy(true);
        try { await api.sendDDL({ action: 'drop_table', table_name: table.name }); onRefresh(); } 
        catch (e) { onError(e.message); } finally { setIsBusy(false); }
    });
  };

  const handleDeleteColumn = (colName) => {
    requestConfirm(`Delete column '${colName}'?`, async () => {
        setIsBusy(true);
        try { await api.sendDDL({ action: 'drop_column', table_name: table.name, column_name: colName }); onRefresh(); } 
        catch (e) { onError(e.message); } finally { setIsBusy(false); }
    });
  };

  const handleSaveColumnEdit = async (originalCol) => {
      if (tempColName !== originalCol.name) {
          try { await api.sendDDL({ action: 'rename_column', table_name: table.name, column_name: originalCol.name, new_column_name: tempColName }); } catch (e) { onError(e.message); return; }
      }
      if (tempColType !== originalCol.type) {
          try { await api.sendDDL({ action: 'alter_column_type', table_name: table.name, column_name: tempColName, column_type: tempColType }); } catch (e) { onError(e.message); return; }
      }
      setEditingCol(null); onRefresh();
  };

  const startEditingCol = (col) => { setEditingCol(col.name); setTempColName(col.name); setTempColType(col.type); };

  return (
    <div 
      onMouseDown={stopProp} 
      style={{ transform: `translate(${position.x}px, ${position.y}px)`, position: 'absolute', width: CARD_WIDTH, height: getCardHeight(table) }}
      className={`
        flex flex-col shadow-2xl z-10 transition-all duration-75 ease-linear will-change-transform
        ${isBusy ? 'border-white animate-pulse' : 'border-white/20'}
        ${isHighlighted ? 'border-2 border-white shadow-[0_0_20px_rgba(255,255,255,0.3)] bg-neutral-900' : 'bg-black border hover:shadow-white/5'}
      `}
    >
      <div className={`p-3 border-b flex justify-between items-center group h-[56px] ${isHighlighted ? 'bg-white/10 border-white/30' : 'bg-neutral-900/80 border-white/10'}`}>
        <div className="flex items-center gap-2 flex-1">
          <div onMouseDown={handleMouseDown} className="cursor-grab active:cursor-grabbing p-1 hover:bg-white/10 rounded transition-colors" title="Drag to move">
            <GripHorizontal className={`w-4 h-4 ${isHighlighted ? 'text-white' : 'text-neutral-600 group-hover:text-white'}`} />
          </div>
          {editingTableName ? (
              <div className="flex items-center gap-1 w-full mr-2">
                  <input className="bg-black border border-white/20 text-white text-xs px-1 py-0.5 w-full font-mono focus:border-white outline-none" value={tempTableName} onChange={(e) => setTempTableName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleRenameTable()} autoFocus />
                  <button onClick={handleRenameTable} className="text-green-500 hover:text-green-400"><Check className="w-3 h-3"/></button>
                  <button onClick={() => setEditingTableName(false)} className="text-red-500 hover:text-red-400"><X className="w-3 h-3"/></button>
              </div>
          ) : (
              <div className="flex items-center gap-2 group/title w-full">
                  <span className="font-bold text-white font-mono tracking-tight truncate cursor-text select-text" title={table.name}>{table.name}</span>
                  <button onClick={() => { setEditingTableName(true); setTempTableName(table.name); }} className="opacity-0 group-hover/title:opacity-100 text-neutral-500 hover:text-white transition-opacity"><Pencil className="w-3 h-3" /></button>
              </div>
          )}
        </div>
        <button onClick={handleDeleteTable} className="text-neutral-600 hover:text-white transition-colors shrink-0 ml-2"><Trash2 className="w-4 h-4" /></button>
      </div>
      
      <div className="bg-black/90 backdrop-blur flex-1">
        {table.columns.map((col, idx) => (
          <div key={idx} className="flex justify-between items-center px-3 hover:bg-white/10 group text-sm border-b border-white/5 transition-colors h-10">
            {editingCol === col.name ? (
                <div className="flex items-center gap-1 w-full">
                    <input className="bg-black border border-white/20 text-white text-[10px] px-1 py-0.5 w-24 font-mono focus:border-white outline-none" value={tempColName} onChange={(e) => setTempColName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSaveColumnEdit(col)} />
                    <select className="bg-black border border-white/20 text-white text-[10px] w-20 outline-none" value={tempColType} onChange={(e) => setTempColType(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSaveColumnEdit(col)}>
                        <option value="VARCHAR(255)">VARCHAR</option><option value="INTEGER">INT</option><option value="BOOLEAN">BOOL</option><option value="TIMESTAMP">TIME</option><option value="DECIMAL(10,2)">DECIMAL</option>
                    </select>
                    <button onClick={() => handleSaveColumnEdit(col)} className="text-green-500 ml-auto"><Check className="w-3 h-3"/></button>
                    <button onClick={() => setEditingCol(null)} className="text-red-500"><X className="w-3 h-3"/></button>
                </div>
            ) : (
                <>
                    <div className="flex items-center gap-2 overflow-hidden w-full">
                        {col.isPk && <div className="text-[8px] font-bold bg-white text-black px-1 rounded-[2px] shrink-0">PK</div>}
                        {col.fk && <LinkIcon className={`w-3 h-3 shrink-0 ${table.name === col.fk.table ? 'text-emerald-400' : 'text-cyan-400'}`} />}
                        <span className={`font-mono text-xs truncate ${col.fk ? (table.name === col.fk.table ? 'text-emerald-200' : 'text-cyan-100') : 'text-neutral-300'}`}>{col.name}</span>
                        <div className="flex items-center gap-2 ml-auto">
                            <button onClick={() => onStartLinking(table.name, col.name)} className={`p-1 rounded hover:bg-white/10 transition-colors ${linkingState?.sourceCol === col.name && linkingState?.sourceTable === table.name ? 'text-cyan-400 animate-pulse bg-cyan-900/30' : 'text-neutral-600 hover:text-cyan-400'}`} title="Link">
                                <LinkIcon className="w-3 h-3" />
                            </button>
                            <button onClick={() => startEditingCol(col)} className="p-1 rounded hover:bg-white/10 text-neutral-600 hover:text-white"><Pencil className="w-3 h-3" /></button>
                            <button onClick={() => handleDeleteColumn(col.name)} className="p-1 rounded hover:bg-white/10 text-neutral-600 hover:text-red-400"><Trash2 className="w-3 h-3" /></button>
                        </div>
                    </div>
                    <span className="text-neutral-600 text-[9px] uppercase font-bold tracking-wider shrink-0 ml-2 w-12 text-right">{col.type}</span>
                </>
            )}
          </div>
        ))}
      </div>

      {isAddingCol ? (
        <div className="p-3 border-t border-white/10 space-y-2 bg-neutral-900/50">
          <input className="w-full bg-black border border-white/20 p-2 text-xs text-white focus:border-white outline-none font-mono" placeholder="col_name" value={newColName} onChange={e=>setNewColName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAddColumn()} autoFocus />
          <select className="w-full bg-black border border-white/20 p-2 text-xs text-white outline-none font-mono" value={newColType} onChange={e=>setNewColType(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAddColumn()}>
            <option value="VARCHAR(255)">VARCHAR</option><option value="INTEGER">INTEGER</option><option value="BOOLEAN">BOOLEAN</option><option value="TIMESTAMP">TIMESTAMP</option>
          </select>
          <div className="flex gap-2">
            <button onClick={handleAddColumn} className="flex-1 bg-white hover:bg-neutral-200 text-black text-xs font-bold py-1.5 uppercase">Save</button>
            <button onClick={()=>setIsAddingCol(false)} className="flex-1 border border-white/20 text-white text-xs py-1.5 uppercase">Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={()=>setIsAddingCol(true)} className="p-2 border-t border-white/10 text-neutral-500 text-xs hover:text-white hover:bg-white/5 transition-colors flex justify-center items-center gap-2 uppercase tracking-widest font-bold h-[42px]">
          <Plus className="w-3 h-3" /> Add Column
        </button>
      )}
    </div>
  );
}, (prev, next) => {
    // Only re-render if essential props change
    return prev.table === next.table && 
           prev.position.x === next.position.x && 
           prev.position.y === next.position.y &&
           prev.zoom === next.zoom && 
           prev.linkingState === next.linkingState &&
           prev.isHighlighted === next.isHighlighted;
});

// MEMOIZED CONNECTIONS LAYER
const ConnectionsLayer = React.memo(({ schema, positions, requestConfirm, onDeleteConnection, onConnectionClick }) => {
  const handleDeleteClick = (tableName, constraintName) => {
      requestConfirm(`Remove relationship? This drops constraint '${constraintName}'.`, () => {
          onDeleteConnection(tableName, constraintName);
      });
  };

  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none z-0 overflow-visible">
      <defs>
        <marker id="arrowhead-cyan" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill="#06b6d4" />
        </marker>
        <marker id="arrowhead-emerald" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill="#34d399" />
        </marker>
      </defs>
      {schema.map(table => 
        table.columns.filter(col => col.fk).map((col, idx) => {
          const startPos = positions[table.id];
          const targetTable = schema.find(t => t.name === col.fk.table);
          if (!targetTable || !startPos || !positions[targetTable.id]) return null;
          
          const endPos = positions[targetTable.id];
          const sourceColIndex = table.columns.findIndex(c => c.name === col.name);
          const targetColIndex = targetTable.columns.findIndex(c => c.name === col.fk.col);

          const startY = startPos.y + HEADER_HEIGHT + (sourceColIndex * ROW_HEIGHT) + (ROW_HEIGHT / 2);
          const endY = endPos.y + HEADER_HEIGHT + (targetColIndex !== -1 ? targetColIndex : 0) * ROW_HEIGHT + (ROW_HEIGHT / 2);
          
          const isSourceLeft = startPos.x < endPos.x;
          const isSelfLink = table.name === col.fk.table;
          
          const linkColor = isSelfLink ? "#34d399" : "#06b6d4";
          const markerId = isSelfLink ? "url(#arrowhead-emerald)" : "url(#arrowhead-cyan)";

          let startX, endX;
          let controlStartX, controlEndX;
          
          if (isSourceLeft) {
              startX = startPos.x + CARD_WIDTH;
              endX = endPos.x;
              const dist = Math.abs(endX - startX);
              const controlOffset = Math.max(dist * 0.5, 50);
              controlStartX = startX + controlOffset;
              controlEndX = endX - controlOffset;
          } else {
              startX = startPos.x;
              endX = endPos.x + CARD_WIDTH;
              const dist = Math.abs(startX - endX);
              const controlOffset = Math.max(dist * 0.5, 50);
              controlStartX = startX - controlOffset;
              controlEndX = endX + controlOffset;
          }

          const pathData = `M ${startX} ${startY} C ${controlStartX} ${startY}, ${controlEndX} ${endY}, ${endX} ${endY}`;
          const midX = (startX + endX) / 2;
          const midY = (startY + endY) / 2; 

          return (
            <g 
                key={`${table.id}-${col.name}-${idx}`} 
                className="group pointer-events-auto cursor-pointer"
                onClick={(e) => {
                    e.stopPropagation(); // Prevent clearing selection on canvas
                    onConnectionClick(table.id, targetTable.id);
                }}
            >
              <path d={pathData} stroke={linkColor} strokeWidth="12" fill="none" opacity="0" className="hover:opacity-10 transition-opacity" />
              <path d={pathData} stroke={linkColor} strokeWidth="2" fill="none" markerEnd={markerId} />
              <circle cx={startX} cy={startY} r="4" fill={linkColor} stroke="#000" strokeWidth="1" />
              <circle cx={endX} cy={endY} r="4" fill={linkColor} stroke="#000" strokeWidth="1" />
              
              <foreignObject x={midX - 12} y={midY - 12} width="24" height="24" className="opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onMouseDown={(e) => e.stopPropagation()} onClick={() => handleDeleteClick(table.name, col.fk.constraint)} className="w-6 h-6 bg-red-600 rounded-full flex items-center justify-center text-white hover:bg-red-500 shadow-lg cursor-pointer border border-black" title="Delete">
                      <Unlink className="w-3 h-3" />
                  </button>
              </foreignObject>
            </g>
          );
        })
      )}
    </svg>
  );
});

const CreateTableModal = ({ isOpen, onClose, onSubmit }) => {
  const [tableName, setTableName] = useState('');
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-black border border-white/20 shadow-2xl w-full max-w-md animate-in zoom-in-95">
        <div className="p-4 border-b border-white/10 flex justify-between items-center bg-neutral-900/50">
           <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2"><TableIcon className="w-4 h-4" /> New Entity</h3>
           <button onClick={onClose}><X className="w-4 h-4 text-neutral-500 hover:text-white" /></button>
        </div>
        <form onSubmit={(e)=>{e.preventDefault(); if(tableName.trim()) onSubmit(tableName); setTableName('');}} className="p-6 space-y-4">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Table Name</label>
            <input autoFocus type="text" className="w-full bg-neutral-900/50 border border-white/20 p-3 text-sm text-white focus:border-white outline-none font-mono" placeholder="e.g. customer_orders" value={tableName} onChange={e=>setTableName(e.target.value)} />
          </div>
          <div className="flex gap-3 pt-2">
             <button type="button" onClick={onClose} className="flex-1 px-4 py-3 text-xs font-bold uppercase tracking-widest text-white border border-white/20 hover:bg-white/10">Cancel</button>
             <button type="submit" disabled={!tableName.trim()} className="flex-1 px-4 py-3 text-xs font-bold uppercase tracking-widest text-black bg-white hover:bg-neutral-200 disabled:opacity-50">Create</button>
          </div>
        </form>
      </div>
    </div>
  );
};

// --- MAIN APP ---

export default function App() {
  const [activeTab, setActiveTab] = useState('schema'); 
  const [schema, setSchema] = useState([]);
  const [positions, setPositions] = useState({});
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const containerRef = useRef(null);
  const [messages, setMessages] = useState([{ id: 1, role: 'system', content: 'SYSTEM READY. WAITING FOR INPUT.' }]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [globalError, setGlobalError] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [confirmState, setConfirmState] = useState({ isOpen: false, message: '', onConfirm: null });
  const [linkingState, setLinkingState] = useState(null);
  const [highlightedTableIds, setHighlightedTableIds] = useState([]); 
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    const saved = localStorage.getItem('db_positions');
    if (saved) setPositions(JSON.parse(saved));
    fetchSchema();
    return () => { if (recognitionRef.current) recognitionRef.current.stop(); };
  }, []);

  useEffect(() => {
    if (Object.keys(positions).length > 0) {
      localStorage.setItem('db_positions', JSON.stringify(positions));
    }
  }, [positions]);

  const showError = useCallback((msg) => {
      setGlobalError(msg);
      setTimeout(() => { setGlobalError(prev => (prev === msg ? null : prev)); }, 15000);
  }, []);

  // --- MASONRY LAYOUT & COLLISION AVOIDANCE ---
  
  const applyAutoLayout = (currentSchema = schema) => {
    const COLUMNS = 3;
    const colHeights = new Array(COLUMNS).fill(START_Y);
    const newPositions = {};

    currentSchema.forEach(table => {
       const minColIndex = colHeights.indexOf(Math.min(...colHeights));
       const x = START_X + (minColIndex * (CARD_WIDTH + GRID_GAP_X));
       const y = colHeights[minColIndex];
       newPositions[table.id] = { x, y };
       colHeights[minColIndex] += getCardHeight(table) + GRID_GAP_Y;
    });
    
    setPositions(newPositions);
    handleFitToScreen();
  };

  const findSafePosition = (existingPositions, table) => {
     let x = START_X;
     let y = START_Y;
     let attempts = 0;
     const MAX_ATTEMPTS = 100;
     const GRID_W = CARD_WIDTH + GRID_GAP_X;
     const GRID_H = 100; 
     
     while (attempts < MAX_ATTEMPTS) {
        const testRect = { x, y, w: CARD_WIDTH, h: getCardHeight(table) };
        let collision = false;
        
        for (const pid in existingPositions) {
           const pos = existingPositions[pid];
           if (
              testRect.x < pos.x + CARD_WIDTH + 20 &&
              testRect.x + testRect.w + 20 > pos.x &&
              testRect.y < pos.y + 300 && 
              testRect.y + testRect.h + 20 > pos.y
           ) {
              collision = true;
              break;
           }
        }
        
        if (!collision) return { x, y };
        
        x += GRID_W;
        if (x > 1500) { 
            x = START_X;
            y += GRID_H;
        }
        attempts++;
     }
     return { x: START_X, y: START_Y }; 
  };

  const fetchSchema = useCallback(async () => {
    try {
      const data = await api.getSchema();
      setSchema(data);
      setGlobalError(null);
      
      setPositions(prev => {
        if (Object.keys(prev).length === 0 && data.length > 0) {
            const COLUMNS = 4;
            const colHeights = new Array(COLUMNS).fill(START_Y);
            const initialPositions = {};
            data.forEach(table => {
                const minColIndex = colHeights.indexOf(Math.min(...colHeights));
                const x = START_X + (minColIndex * (CARD_WIDTH + GRID_GAP_X));
                const y = colHeights[minColIndex];
                initialPositions[table.id] = { x, y };
                colHeights[minColIndex] += getCardHeight(table) + GRID_GAP_Y;
            });
            return initialPositions;
        }

        const newPositions = { ...prev };
        let hasChanges = false;
        
        data.forEach(table => {
            if (!newPositions[table.id]) {
                const safePos = findSafePosition(newPositions, table);
                newPositions[table.id] = safePos;
                hasChanges = true;
            }
        });
        
        return hasChanges ? newPositions : prev;
      });
    } catch (e) { showError(`CONNECTION ERROR: ${e.message}`); }
  }, [showError]);

  const requestConfirm = useCallback((message, onConfirmAction) => {
      setConfirmState({ isOpen: true, message, onConfirm: () => { onConfirmAction(); setConfirmState({ isOpen: false, message: '', onConfirm: null }); } });
  }, []);

  const handleStartLinking = useCallback((table, col) => {
      if (linkingState) {
          if (linkingState.sourceTable === table && linkingState.sourceCol === col) { setLinkingState(null); } 
          else { handleCreateConnection(linkingState.sourceTable, linkingState.sourceCol, table, col); setLinkingState(null); }
      } else { setLinkingState({ sourceTable: table, sourceCol: col }); }
  }, [linkingState]);

  const handleCreateConnection = (sourceTable, sourceCol, targetTable, targetCol) => {
      requestConfirm(`Link ${sourceTable}.${sourceCol} -> ${targetTable}.${targetCol}?`, async () => {
          try { await api.sendDDL({ action: 'add_foreign_key', table_name: sourceTable, column_name: sourceCol, fk_table: targetTable, fk_column: targetCol }); fetchSchema(); } 
          catch(e) { showError(`LINK FAILED: ${e.message} (Check data types match!)`); }
      });
  };

  const handleDeleteConnection = useCallback(async (tableName, constraintName) => {
      try { await api.sendDDL({ action: 'drop_foreign_key', table_name: tableName, constraint_name: constraintName }); fetchSchema(); } catch(e) { showError(e.message); }
  }, [fetchSchema, showError]);

  const handleConnectionClick = useCallback((sourceId, targetId) => {
      setHighlightedTableIds([sourceId, targetId]);
  }, []);

  const handleWheel = (e) => {
    if (activeTab !== 'schema') return;
    e.preventDefault();
    const scaleAmount = -e.deltaY * 0.001;
    const newZoom = Math.min(Math.max(zoom + scaleAmount, 0.1), 2);
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const worldX = (mouseX - pan.x) / zoom;
    const worldY = (mouseY - pan.y) / zoom;
    const newPanX = mouseX - (worldX * newZoom);
    const newPanY = mouseY - (worldY * newZoom);
    setZoom(newZoom); setPan({ x: newPanX, y: newPanY });
  };

  const handleCanvasMouseDown = (e) => {
    if (activeTab !== 'schema') return;
    setLinkingState(null);
    setHighlightedTableIds([]); 
    const startX = e.clientX;
    const startY = e.clientY;
    const startPanX = pan.x;
    const startPanY = pan.y;
    setIsPanning(true);
    const onMouseMove = (moveEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      setPan({ x: startPanX + dx, y: startPanY + dy });
    };
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      setIsPanning(false);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  // --- OPTIMIZED MOVE HANDLER ---
  const handleMoveNode = useCallback((id, newPos) => {
    // Direct state update - removed the heavy collision check from the critical rendering path
    setPositions(prev => ({ ...prev, [id]: newPos }));
  }, []);

  const handleFitToScreen = () => {
    if (!containerRef.current || schema.length === 0) { setZoom(1); setPan({x: 0, y: 0}); return; }
    const containerW = containerRef.current.clientWidth;
    const containerH = containerRef.current.clientHeight;
    const PADDING = 50;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    schema.forEach(table => {
      const pos = positions[table.id];
      if (pos) {
        const h = getCardHeight(table);
        minX = Math.min(minX, pos.x); maxX = Math.max(maxX, pos.x + CARD_WIDTH);
        minY = Math.min(minY, pos.y); maxY = Math.max(maxY, pos.y + h);
      }
    });
    if (minX === Infinity) { setZoom(1); setPan({x: 0, y: 0}); return; }
    const contentW = maxX - minX;
    const contentH = maxY - minY;
    const scaleX = (containerW - PADDING * 2) / contentW;
    const scaleY = (containerH - PADDING * 2) / contentH;
    const newZoom = Math.min(Math.max(Math.min(scaleX, scaleY), 0.1), 1);
    const contentCenterX = minX + (contentW / 2);
    const contentCenterY = minY + (contentH / 2);
    const newPanX = (containerW / 2) - (contentCenterX * newZoom);
    const newPanY = (containerH / 2) - (contentCenterY * newZoom);
    setZoom(newZoom); setPan({ x: newPanX, y: newPanY });
  };

  const handleCreateTable = async (name) => {
    try { await api.sendDDL({ action: 'create_table', table_name: name.toLowerCase().replace(/\s+/g, '_') }); fetchSchema(); setIsModalOpen(false); } catch(e) { showError(e.message); }
  };

  const handleChat = async () => {
    if(!input.trim()) return;
    const userMsg = { id: Date.now(), role: 'user', content: input };
    setMessages(p=>[...p, userMsg]); setInput(''); setIsProcessing(true);
    try {
      const res = await api.chat(userMsg.content);
      setMessages(p=>[...p, { id: Date.now()+1, role: 'system', content: res.response, sql: res.sql, data: res.data }]);
    } catch(e) { setMessages(p=>[...p, { id: Date.now()+1, role: 'system', content: `ERROR: ${e.message}` }]); } 
    finally { setIsProcessing(false); }
  };
  
  const toggleVoice = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        showError("Browser doesn't support Speech Recognition. Use Chrome/Edge/Safari.");
        return;
      }
      
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event) => {
        const transcript = Array.from(event.results)
          .map(result => result[0].transcript)
          .join('');
        setInput(transcript);
      };

      recognition.onerror = (event) => {
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    }
  };

  return (
    <div className="flex w-full h-screen bg-[#383838] text-white font-sans overflow-hidden">
      <TableExplorer schema={schema} onRefresh={fetchSchema} />
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        <header className="h-16 shrink-0 border-b border-white/20 bg-black flex items-center justify-between px-6 z-20 shadow-md">
          <div className="flex flex-col">
            <h1 className="text-lg font-black text-white tracking-tighter uppercase flex items-center gap-3">
              Agentic<span className="text-neutral-500">DBMS</span>
              <span className={`text-[10px] border px-1.5 py-0.5 font-mono ${globalError ? 'bg-red-600 border-white' : 'border-white/30 text-neutral-400'}`}>{globalError?'OFFLINE':'ONLINE'}</span>
            </h1>
          </div>
          {activeTab === 'schema' && linkingState && (
              <div className="text-xs text-cyan-400 font-mono animate-pulse border border-cyan-500/50 px-3 py-1 rounded-full bg-cyan-900/20">
                  LINKING: Select Target Column...
              </div>
          )}
          <div className="flex border border-white/20 p-1 gap-1 bg-black">
            <button onClick={()=>setActiveTab('schema')} className={`flex items-center gap-2 px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition-all ${activeTab==='schema'?'bg-white text-black':'text-neutral-500 hover:text-white'}`}><LayoutGrid className="w-3 h-3"/> Design</button>
            <button onClick={()=>setActiveTab('agent')} className={`flex items-center gap-2 px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition-all ${activeTab==='agent'?'bg-white text-black':'text-neutral-500 hover:text-white'}`}><MessageSquare className="w-3 h-3"/> Agent</button>
          </div>
        </header>
        {globalError && <div className="bg-white text-black p-2 text-center text-xs font-bold flex justify-center items-center gap-2 uppercase tracking-widest border-b-4 border-black animate-in fade-in slide-in-from-top-2"><AlertCircle className="w-4 h-4" />{globalError}</div>}
        <main className="flex-1 overflow-hidden relative w-full bg-[#383838]">
          {activeTab === 'schema' && (
            <div ref={containerRef} className={`relative w-full h-full overflow-hidden bg-[radial-gradient(#4a4a4a_1px,transparent_1px)] [background-size:20px_20px] ${isPanning ? 'cursor-grabbing' : 'cursor-default'}`} onWheel={handleWheel} onMouseDown={handleCanvasMouseDown}>
              <div className="absolute top-6 right-6 z-30 flex gap-4" onMouseDown={e => e.stopPropagation()}>
                <div className="flex border border-white/20 bg-black">
                  <button onClick={() => setZoom(z => Math.max(z - 0.1, 0.1))} className="p-3 hover:bg-white/10 text-white"><ZoomOut className="w-4 h-4"/></button>
                  <button onClick={handleFitToScreen} className="p-3 hover:bg-white/10 text-white border-x border-white/20"><Maximize className="w-4 h-4"/></button>
                  <button onClick={() => setZoom(z => Math.min(z + 0.1, 2))} className="p-3 hover:bg-white/10 text-white"><ZoomIn className="w-4 h-4"/></button>
                </div>
                 {/* Auto Layout Button */}
                <button onClick={() => applyAutoLayout()} className="bg-black border border-white/20 text-white hover:bg-white hover:text-black px-4 py-3 flex items-center gap-2 font-bold uppercase text-xs tracking-widest transition-colors"><LayoutTemplate className="w-4 h-4" /> Auto Layout</button>
                <button onClick={()=>setIsModalOpen(true)} className="bg-white hover:bg-neutral-200 text-black px-5 py-3 flex items-center gap-2 font-bold uppercase text-xs tracking-widest shadow-xl"><Plus className="w-4 h-4" /> New Table</button>
              </div>
              <div className="origin-top-left transition-transform duration-75 ease-linear w-full h-full" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
                <div className="absolute inset-0 w-[10000px] h-[10000px]">
                  <ConnectionsLayer 
                    schema={schema} 
                    positions={positions} 
                    requestConfirm={requestConfirm} 
                    onDeleteConnection={handleDeleteConnection} 
                    onConnectionClick={handleConnectionClick} 
                  />
                  {schema.map(table => (
                     positions[table.id] && (
                      <SchemaNode 
                        key={table.id} 
                        table={table} 
                        position={positions[table.id]} 
                        zoom={zoom} 
                        onMove={handleMoveNode} 
                        onRefresh={fetchSchema} 
                        onError={showError} 
                        onStartLinking={handleStartLinking} 
                        linkingState={linkingState} 
                        requestConfirm={requestConfirm} 
                        isHighlighted={highlightedTableIds.includes(table.id)}
                      />
                     )
                  ))}
                </div>
              </div>
            </div>
          )}
          {activeTab === 'agent' && (
             <div className="h-full w-full flex flex-col max-w-5xl mx-auto bg-[#383838] border-x border-white/5">
                <div className="flex-1 overflow-y-auto p-8 scrollbar-hide">
                  {messages.map((msg, i) => (
                    <div key={i} className={`flex w-full ${msg.role==='user'?'justify-end':'justify-start'} mb-6`}>
                      <div className={`max-w-[85%] p-5 shadow-lg ${msg.role==='user'?'bg-white text-black':'bg-black border border-white/20 text-white'}`}>
                         <div className="text-xs font-black uppercase tracking-widest mb-2 opacity-50">{msg.role==='user'?'You':'Agent'}</div>
                         <div className="text-sm font-mono whitespace-pre-wrap">{msg.content}</div>
                         {msg.sql && (<div className="mt-4 border border-white/20 bg-[#383838]"><div className="bg-black/50 px-3 py-1 text-[10px] text-neutral-300 font-bold uppercase border-b border-white/10">SQL</div><pre className="p-4 text-xs font-mono overflow-x-auto">{msg.sql}</pre></div>)}
                         {msg.data && Array.isArray(msg.data) && msg.data.length > 0 && (<div className="mt-4 border border-white/20"><div className="bg-black/50 px-3 py-1 text-[10px] text-neutral-300 font-bold uppercase border-b border-white/10">Result</div><div className="overflow-x-auto bg-black"><table className="w-full text-xs text-left font-mono"><thead className="bg-[#383838] text-white border-b border-white/20"><tr>{Object.keys(msg.data[0]||{}).map(k=><th key={k} className="px-4 py-3 border-r border-white/10 whitespace-nowrap">{k}</th>)}</tr></thead><tbody>{msg.data.map((r,j)=><tr key={j} className="border-b border-white/10 hover:bg-white/5">{Object.values(r).map((v,k)=><td key={k} className="px-4 py-2 text-neutral-300 border-r border-white/10 whitespace-nowrap">{String(v)}</td>)}</tr>)}</tbody></table></div></div>)}
                         {msg.data && !Array.isArray(msg.data) && (<div className="mt-4 border border-white/20 bg-neutral-900/50 p-3 text-xs text-neutral-300 font-mono">{JSON.stringify(msg.data, null, 2)}</div>)}
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
                <div className="p-6 border-t border-white/20 bg-black z-20 shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
                   <div className="relative group">
                     <Terminal className="absolute top-4 left-4 h-5 w-5 text-neutral-500" />
                     <input type="text" className="block w-full pl-12 pr-28 py-4 bg-black border border-white/30 text-white focus:border-white outline-none font-mono text-sm" placeholder="QUERY DATABASE..." value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleChat()} />
                     <div className="absolute top-2 right-2 flex gap-1">
                        <button 
                            onClick={toggleVoice} 
                            className={`w-10 h-10 flex items-center justify-center transition-all duration-300 ${isListening ? 'bg-red-600 text-white animate-pulse shadow-[0_0_15px_rgba(220,38,38,0.7)]' : 'bg-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-700'}`}
                        >
                            {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                        </button>
                        <button onClick={handleChat} disabled={isProcessing} className="w-10 h-10 bg-white text-black flex items-center justify-center hover:bg-neutral-200 transition-colors">
                            <Play className="w-4 h-4 fill-current" />
                        </button>
                     </div>
                   </div>
                   {isListening && <div className="mt-2 text-[10px] text-red-500 font-mono uppercase tracking-widest animate-pulse flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-red-500"></div> Live Listening...</div>}
                </div>
             </div>
          )}
        </main>
        <ConfirmModal isOpen={confirmState.isOpen} message={confirmState.message} onConfirm={confirmState.onConfirm} onCancel={() => setConfirmState({ isOpen: false, message: '', onConfirm: null })} />
        <CreateTableModal isOpen={isModalOpen} onClose={()=>setIsModalOpen(false)} onSubmit={handleCreateTable} />
      </div>
    </div>
  );
}