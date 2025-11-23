import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Database, Plus, Trash2, Play, Terminal, Table as TableIcon, 
  RefreshCw, Cpu, AlertCircle, ChevronRight, ChevronDown, 
  LayoutGrid, MessageSquare, X, GripHorizontal, Link as LinkIcon
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
const CARD_WIDTH = 288; // w-72 = 18rem = 288px
const HEADER_HEIGHT = 57; // Approximate header height with padding/border
const ROW_HEIGHT = 40; // h-10 = 2.5rem = 40px

// --- COMPONENTS ---

// 1. Sidebar (Explorer)
const TableExplorer = ({ schema, onRefresh }) => {
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
            <button 
              onClick={() => toggleTable(table.name)}
              className="w-full flex items-center gap-2 px-2 py-1.5 text-neutral-400 hover:bg-white/10 hover:text-white rounded-sm text-xs transition-colors group"
            >
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
                    {col.fk && <LinkIcon className="w-2 h-2 text-cyan-500" />}
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
};

// 2. Draggable Schema Node
const SchemaNode = ({ table, position, onMove, onRefresh, onError }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [newColType, setNewColType] = useState('VARCHAR(255)');
  const [isBusy, setIsBusy] = useState(false);
  
  const nodeRef = useRef(null);
  
  const handleMouseDown = (e) => {
    if (e.target.closest('button') || e.target.closest('input') || e.target.closest('select')) return;
    
    e.preventDefault();
    const startX = e.clientX - position.x;
    const startY = e.clientY - position.y;

    const handleMouseMove = (moveEvent) => {
      onMove(table.id, {
        x: moveEvent.clientX - startX,
        y: moveEvent.clientY - startY
      });
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleAddColumn = async () => {
    if (!newColName) return;
    setIsBusy(true);
    try {
      await api.sendDDL({ action: 'add_column', table_name: table.name, column_name: newColName, column_type: newColType });
      setNewColName(''); setIsEditing(false); onRefresh(); 
    } catch (e) { onError(e.message); } finally { setIsBusy(false); }
  };

  const handleDeleteTable = async () => {
    if(!window.confirm(`Delete table ${table.name}?`)) return;
    setIsBusy(true);
    try { await api.sendDDL({ action: 'drop_table', table_name: table.name }); onRefresh(); } 
    catch (e) { onError(e.message); } finally { setIsBusy(false); }
  };

  return (
    <div 
      ref={nodeRef}
      style={{ transform: `translate(${position.x}px, ${position.y}px)`, position: 'absolute', width: CARD_WIDTH }}
      className={`bg-black border ${isBusy ? 'border-white animate-pulse' : 'border-white/20'} flex flex-col shadow-2xl shadow-black/80 z-10`}
    >
      <div 
        onMouseDown={handleMouseDown}
        className="bg-neutral-900/80 p-3 border-b border-white/10 flex justify-between items-center cursor-grab active:cursor-grabbing select-none group h-[56px]"
      >
        <div className="flex items-center gap-2">
          <GripHorizontal className="w-4 h-4 text-neutral-600 group-hover:text-white transition-colors" />
          <span className="font-bold text-white font-mono tracking-tight">{table.name}</span>
        </div>
        <button onClick={handleDeleteTable} className="text-neutral-600 hover:text-white transition-colors">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      
      {/* Columns Container */}
      <div className="bg-black/90 backdrop-blur">
        {table.columns.map((col, idx) => (
          <div key={idx} className="flex justify-between items-center px-3 hover:bg-white/10 group text-sm border-b border-white/5 transition-colors h-10">
            <div className="flex items-center gap-2 overflow-hidden w-full">
              {col.isPk && <div className="text-[8px] font-bold bg-white text-black px-1 rounded-[2px] shrink-0">PK</div>}
              {col.fk && <LinkIcon className="w-3 h-3 text-cyan-400 shrink-0" />}
              <span className={`font-mono text-xs truncate ${col.fk ? 'text-cyan-100' : 'text-neutral-300'}`}>{col.name}</span>
            </div>
            <span className="text-neutral-600 text-[9px] uppercase font-bold tracking-wider shrink-0 ml-2">{col.type}</span>
          </div>
        ))}
      </div>

      {isEditing ? (
        <div className="p-3 border-t border-white/10 space-y-2 bg-neutral-900/50">
          <input className="w-full bg-black border border-white/20 p-2 text-xs text-white focus:border-white outline-none font-mono" placeholder="col_name" value={newColName} onChange={e=>setNewColName(e.target.value)} autoFocus />
          <select className="w-full bg-black border border-white/20 p-2 text-xs text-white outline-none font-mono" value={newColType} onChange={e=>setNewColType(e.target.value)}>
            <option value="VARCHAR(255)">VARCHAR</option>
            <option value="INTEGER">INTEGER</option>
            <option value="BOOLEAN">BOOLEAN</option>
            <option value="TIMESTAMP">TIMESTAMP</option>
          </select>
          <div className="flex gap-2">
            <button onClick={handleAddColumn} className="flex-1 bg-white hover:bg-neutral-200 text-black text-xs font-bold py-1.5 uppercase">Save</button>
            <button onClick={()=>setIsEditing(false)} className="flex-1 border border-white/20 text-white text-xs py-1.5 uppercase">Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={()=>setIsEditing(true)} className="p-2 border-t border-white/10 text-neutral-500 text-xs hover:text-white hover:bg-white/5 transition-colors flex justify-center items-center gap-2 uppercase tracking-widest font-bold h-10">
          <Plus className="w-3 h-3" /> Add Column
        </button>
      )}
    </div>
  );
};

// 3. SVG Connection Layer - UPDATED FOR PRECISION AND VISIBILITY
const ConnectionsLayer = ({ schema, positions }) => {
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none z-0 overflow-visible">
      <defs>
        {/* High visibility marker */}
        <marker id="arrowhead-cyan" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill="#06b6d4" />
        </marker>
        {/* Glow effect */}
        <filter id="glow">
          <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      
      {schema.map(table => 
        table.columns.filter(col => col.fk).map((col, idx) => {
          const startPos = positions[table.id];
          const targetTable = schema.find(t => t.name === col.fk.table);
          if (!targetTable) return null;
          
          const endPos = positions[targetTable.id];
          if (!startPos || !endPos) return null;

          // Find the index of the column to calculate precise Y-offset
          const sourceColIndex = table.columns.findIndex(c => c.name === col.name);
          const targetColIndex = targetTable.columns.findIndex(c => c.name === col.fk.col);

          // Calculate precise Y coordinates based on fixed row heights
          // Y = Card Y + Header Height + (Row Index * Row Height) + (Row Height / 2 for center)
          const startY = startPos.y + HEADER_HEIGHT + (sourceColIndex * ROW_HEIGHT) + (ROW_HEIGHT / 2);
          const endY = endPos.y + HEADER_HEIGHT + (targetColIndex !== -1 ? targetColIndex : 0) * ROW_HEIGHT + (ROW_HEIGHT / 2);

          // Calculate X coordinates
          // Start from Right edge of Source, End at Left edge of Target
          const startX = startPos.x + CARD_WIDTH;
          const endX = endPos.x;

          // Curve logic
          const dist = Math.abs(endX - startX);
          const controlOffset = Math.max(dist * 0.5, 50); // Minimum curve
          
          const pathData = `
            M ${startX} ${startY} 
            C ${startX + controlOffset} ${startY}, 
              ${endX - controlOffset} ${endY}, 
              ${endX} ${endY}
          `;

          return (
            <g key={`${table.id}-${col.name}-${idx}`} className="transition-opacity duration-300">
              {/* Outer Glow Stroke */}
              <path 
                d={pathData} 
                stroke="#06b6d4" 
                strokeWidth="4" 
                fill="none" 
                opacity="0.2"
                filter="url(#glow)"
              />
              {/* Main Line */}
              <path 
                d={pathData} 
                stroke="#06b6d4" // Cyan 500
                strokeWidth="2" 
                fill="none" 
                markerEnd="url(#arrowhead-cyan)" 
              />
              {/* Start Anchor */}
              <circle cx={startX} cy={startY} r="4" fill="#06b6d4" stroke="#000" strokeWidth="1" />
              {/* End Anchor */}
              <circle cx={endX} cy={endY} r="4" fill="#06b6d4" stroke="#000" strokeWidth="1" />
            </g>
          );
        })
      )}
    </svg>
  );
};

// 4. Modal (Create Table)
const CreateTableModal = ({ isOpen, onClose, onSubmit }) => {
  const [tableName, setTableName] = useState('');
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
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
  const [messages, setMessages] = useState([{ id: 1, role: 'system', content: 'SYSTEM READY. WAITING FOR INPUT.' }]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [globalError, setGlobalError] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    const saved = localStorage.getItem('db_positions');
    if (saved) setPositions(JSON.parse(saved));
    fetchSchema();
  }, []);

  useEffect(() => {
    if (Object.keys(positions).length > 0) {
      localStorage.setItem('db_positions', JSON.stringify(positions));
    }
  }, [positions]);

  const fetchSchema = async () => {
    try {
      const data = await api.getSchema();
      setSchema(data);
      setGlobalError(null);
      
      setPositions(prev => {
        const newPositions = { ...prev };
        data.forEach((table, index) => {
          if (!newPositions[table.id]) {
            newPositions[table.id] = { x: 50 + (index * 40), y: 50 + (index * 40) };
          }
        });
        return newPositions;
      });
    } catch (e) {
      setGlobalError(`CONNECTION ERROR: ${e.message}`);
    }
  };

  const handleMoveNode = (id, newPos) => {
    setPositions(prev => ({ ...prev, [id]: newPos }));
  };

  const handleCreateTable = async (name) => {
    try {
      await api.sendDDL({ action: 'create_table', table_name: name.toLowerCase().replace(/\s+/g, '_') });
      fetchSchema(); setIsModalOpen(false);
    } catch(e) { setGlobalError(e.message); }
  };

  const handleChat = async () => {
    if(!input.trim()) return;
    const userMsg = { id: Date.now(), role: 'user', content: input };
    setMessages(p=>[...p, userMsg]); setInput(''); setIsProcessing(true);
    try {
      const res = await api.chat(userMsg.content);
      // Backend returns data in different formats (Array for rows, Object for status messages)
      setMessages(p=>[...p, { id: Date.now()+1, role: 'system', content: res.response, sql: res.sql, data: res.data }]);
    } catch(e) { setMessages(p=>[...p, { id: Date.now()+1, role: 'system', content: `ERROR: ${e.message}` }]); } 
    finally { setIsProcessing(false); }
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
          <div className="flex border border-white/20 p-1 gap-1 bg-black">
            <button onClick={()=>setActiveTab('schema')} className={`flex items-center gap-2 px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition-all ${activeTab==='schema'?'bg-white text-black':'text-neutral-500 hover:text-white'}`}><LayoutGrid className="w-3 h-3"/> Design</button>
            <button onClick={()=>setActiveTab('agent')} className={`flex items-center gap-2 px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition-all ${activeTab==='agent'?'bg-white text-black':'text-neutral-500 hover:text-white'}`}><MessageSquare className="w-3 h-3"/> Agent</button>
          </div>
        </header>

        {globalError && <div className="bg-white text-black p-2 text-center text-xs font-bold flex justify-center items-center gap-2 uppercase tracking-widest border-b-4 border-black"><AlertCircle className="w-4 h-4" />{globalError}</div>}

        <main className="flex-1 overflow-hidden relative w-full bg-[#383838]">
          {activeTab === 'schema' && (
            <div className="relative w-full h-full overflow-hidden bg-[radial-gradient(#4a4a4a_1px,transparent_1px)] [background-size:20px_20px]">
              <div className="absolute top-6 right-6 z-30">
                <button onClick={()=>setIsModalOpen(true)} className="bg-white hover:bg-neutral-200 text-black px-5 py-3 flex items-center gap-2 font-bold uppercase text-xs tracking-widest shadow-xl">
                  <Plus className="w-4 h-4" /> New Table
                </button>
              </div>
              
              <div className="absolute inset-0 w-[2000px] h-[2000px]">
                <ConnectionsLayer schema={schema} positions={positions} />
                {schema.map(table => (
                   positions[table.id] && (
                    <SchemaNode 
                      key={table.id} 
                      table={table} 
                      position={positions[table.id]}
                      onMove={handleMoveNode}
                      onRefresh={fetchSchema}
                      onError={setGlobalError}
                    />
                   )
                ))}
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
                         
                         {msg.sql && (
                           <div className="mt-4 border border-white/20 bg-[#383838]">
                             <div className="bg-black/50 px-3 py-1 text-[10px] text-neutral-300 font-bold uppercase border-b border-white/10">SQL</div>
                             <pre className="p-4 text-xs font-mono overflow-x-auto">{msg.sql}</pre>
                           </div>
                         )}

                         {msg.data && Array.isArray(msg.data) && msg.data.length > 0 && (
                           <div className="mt-4 border border-white/20">
                             <div className="bg-black/50 px-3 py-1 text-[10px] text-neutral-300 font-bold uppercase border-b border-white/10">Result</div>
                             <div className="overflow-x-auto bg-black">
                               <table className="w-full text-xs text-left font-mono">
                                 <thead className="bg-[#383838] text-white border-b border-white/20">
                                   <tr>{Object.keys(msg.data[0]||{}).map(k=><th key={k} className="px-4 py-3 border-r border-white/10 whitespace-nowrap">{k}</th>)}</tr>
                                 </thead>
                                 <tbody>
                                   {msg.data.map((r,j)=>
                                     <tr key={j} className="border-b border-white/10 hover:bg-white/5">
                                       {Object.values(r).map((v,k)=><td key={k} className="px-4 py-2 text-neutral-300 border-r border-white/10 whitespace-nowrap">{String(v)}</td>)}
                                     </tr>
                                   )}
                                 </tbody>
                               </table>
                             </div>
                           </div>
                         )}

                         {msg.data && !Array.isArray(msg.data) && (
                            <div className="mt-4 border border-white/20 bg-neutral-900/50 p-3 text-xs text-neutral-300 font-mono">
                               {JSON.stringify(msg.data, null, 2)}
                            </div>
                         )}

                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
                <div className="p-6 border-t border-white/20 bg-black z-20 shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
                   <div className="relative group">
                     <Terminal className="absolute top-4 left-4 h-5 w-5 text-neutral-500" />
                     <input type="text" className="block w-full pl-12 pr-14 py-4 bg-black border border-white/30 text-white focus:border-white outline-none font-mono text-sm" placeholder="QUERY DATABASE..." value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleChat()} />
                     <button onClick={handleChat} disabled={isProcessing} className="absolute top-2 right-2 px-4 py-2 bg-white text-black flex items-center justify-center"><Play className="w-4 h-4 fill-current" /></button>
                   </div>
                </div>
             </div>
          )}
        </main>
        <CreateTableModal isOpen={isModalOpen} onClose={()=>setIsModalOpen(false)} onSubmit={handleCreateTable} />
      </div>
    </div>
  );
}