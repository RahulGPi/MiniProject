import React, { useState, useEffect, useRef } from 'react';
import { 
  Database, 
  Plus, 
  Trash2, 
  Play, 
  Terminal, 
  Table as TableIcon, 
  RefreshCw,
  Cpu,
  AlertCircle,
  ChevronRight,
  ChevronDown,
  LayoutGrid,
  MessageSquare,
  X
} from 'lucide-react';

// --- API CONFIGURATION ---
const API_BASE = 'http://localhost:8000';

// --- API HELPERS ---
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

// --- COMPONENTS ---

// 1. Sidebar: Black
const TableExplorer = ({ schema, onRefresh }) => {
  const [expandedTables, setExpandedTables] = useState({});

  const toggleTable = (tableName) => {
    setExpandedTables(prev => ({
      ...prev,
      [tableName]: !prev[tableName]
    }));
  };

  return (
    <aside className="w-64 bg-black border-r border-white/20 flex flex-col shrink-0 h-full overflow-hidden">
      <div className="h-16 shrink-0 border-b border-white/20 flex items-center px-6 gap-2 bg-black">
        <Database className="w-4 h-4 text-white" />
        <span className="text-sm font-bold text-white tracking-wider uppercase">Explorer</span>
      </div>
      
      <div className="flex-1 overflow-y-auto p-2">
        <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-2 px-2 mt-2">
          Public Schema
        </div>
        
        {schema.map(table => (
          <div key={table.id} className="mb-1">
            <button 
              onClick={() => toggleTable(table.name)}
              className="w-full flex items-center gap-2 px-2 py-1.5 text-neutral-400 hover:bg-white/10 hover:text-white rounded-sm text-xs transition-colors group"
            >
              {expandedTables[table.name] ? 
                <ChevronDown className="w-3 h-3 text-white" /> : 
                <ChevronRight className="w-3 h-3 text-neutral-600 group-hover:text-white" />
              }
              <TableIcon className="w-3 h-3" />
              <span className="truncate font-medium">{table.name}</span>
            </button>

            {expandedTables[table.name] && (
              <div className="ml-2 border-l border-white/10 pl-4 mt-1 space-y-1">
                {table.columns.map((col, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-[10px] text-neutral-500 py-0.5 font-mono">
                    <div className={`w-1 h-1 rounded-full ${col.isPk ? 'bg-white' : 'bg-neutral-800'}`}></div>
                    <span className="truncate">{col.name}</span>
                    <span className="text-neutral-600 ml-auto">{col.type}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {schema.length === 0 && (
          <div className="px-4 py-8 text-center text-xs text-neutral-600 font-mono">
            -- No tables --
          </div>
        )}
      </div>
      
      <div className="p-4 border-t border-white/20">
         <button 
           onClick={onRefresh}
           className="w-full flex items-center justify-center gap-2 border border-white/20 hover:bg-white hover:text-black text-white text-xs py-2 px-3 rounded-sm transition-all uppercase tracking-wide font-bold"
         >
           <RefreshCw className="w-3 h-3" /> Refresh
         </button>
      </div>
    </aside>
  );
};

// 2. Schema Node: Sharp Black Card floating on Gray Background
const SchemaNode = ({ table, onRefresh, onError }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [newColType, setNewColType] = useState('VARCHAR(255)');
  const [isBusy, setIsBusy] = useState(false);

  const handleAddColumn = async () => {
    if (!newColName) return;
    setIsBusy(true);
    try {
      await api.sendDDL({
        action: 'add_column',
        table_name: table.name,
        column_name: newColName,
        column_type: newColType
      });
      setNewColName('');
      setIsEditing(false);
      onRefresh(); 
    } catch (e) {
      onError(e.message);
    } finally {
      setIsBusy(false);
    }
  };

  const handleRemoveColumn = async (colName) => {
    if(!window.confirm(`Delete column ${colName}?`)) return;
    setIsBusy(true);
    try {
      await api.sendDDL({
        action: 'drop_column',
        table_name: table.name,
        column_name: colName
      });
      onRefresh();
    } catch (e) {
      onError(e.message);
    } finally {
      setIsBusy(false);
    }
  };

  const handleDeleteTable = async () => {
    if(!window.confirm(`Delete table ${table.name}? This cannot be undone.`)) return;
    setIsBusy(true);
    try {
        await api.sendDDL({
            action: 'drop_table',
            table_name: table.name
        });
        onRefresh();
    } catch (e) {
        onError(e.message);
    } finally {
        setIsBusy(false);
    }
  };

  return (
    <div className={`bg-black border ${isBusy ? 'border-white animate-pulse' : 'border-white/20'} w-72 flex flex-col overflow-hidden hover:border-white transition-colors duration-300 shadow-xl shadow-black/50`}>
      <div className="bg-neutral-900/50 p-3 border-b border-white/10 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <TableIcon className="w-4 h-4 text-white" />
          <span className="font-bold text-white font-mono tracking-tight">{table.name}</span>
        </div>
        <button onClick={handleDeleteTable} disabled={isBusy} className="text-neutral-500 hover:text-white disabled:opacity-50 transition-colors">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      
      <div className="p-2 space-y-0.5">
        {table.columns.map((col, idx) => (
          <div key={idx} className="flex justify-between items-center p-2 hover:bg-white/10 group text-sm border border-transparent hover:border-white/5 transition-colors">
            <div className="flex items-center gap-2">
              {col.isPk && (
                <div className="text-[10px] font-bold bg-white text-black px-1 rounded-sm">PK</div>
              )}
              <span className="text-neutral-300 font-mono text-xs">{col.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-neutral-500 text-[10px] uppercase font-bold tracking-wider">{col.type}</span>
              {!col.isPk && (
                <button onClick={() => handleRemoveColumn(col.name)} disabled={isBusy} className="opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-white transition-all">
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {isEditing ? (
        <div className="p-3 border-t border-white/10 space-y-2 bg-neutral-900/30">
          <input 
            className="w-full bg-black border border-white/20 p-2 text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-white transition-colors font-mono" 
            placeholder="column_name"
            value={newColName}
            onChange={(e) => setNewColName(e.target.value)}
            autoFocus
          />
          <select 
            className="w-full bg-black border border-white/20 p-2 text-xs text-white focus:outline-none focus:border-white transition-colors font-mono appearance-none"
            value={newColType}
            onChange={(e) => setNewColType(e.target.value)}
          >
            <option value="VARCHAR(255)">VARCHAR</option>
            <option value="INTEGER">INTEGER</option>
            <option value="BOOLEAN">BOOLEAN</option>
            <option value="TIMESTAMP">TIMESTAMP</option>
            <option value="DECIMAL(10,2)">DECIMAL</option>
          </select>
          <div className="flex gap-2 pt-1">
            <button onClick={handleAddColumn} disabled={isBusy} className="flex-1 bg-white hover:bg-neutral-200 text-black text-xs font-bold py-1.5 uppercase tracking-wider">
                {isBusy ? '...' : 'Save'}
            </button>
            <button onClick={() => setIsEditing(false)} className="flex-1 border border-white/20 hover:bg-white/10 text-white text-xs py-1.5 uppercase tracking-wider">Cancel</button>
          </div>
        </div>
      ) : (
        <button 
          onClick={() => setIsEditing(true)}
          className="p-3 m-2 mt-1 border border-dashed border-white/20 text-neutral-500 text-xs hover:text-white hover:border-white transition-colors flex justify-center items-center gap-2 uppercase tracking-widest font-bold"
        >
          <Plus className="w-3 h-3" /> Add Column
        </button>
      )}
    </div>
  );
};

// 3. Chat: Bubbles float on Gray, Input is anchored Black
const ChatMessage = ({ msg }) => {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'} mb-6 animate-in slide-in-from-bottom-2`}>
      <div className={`max-w-[85%] p-5 shadow-lg shadow-black/20 ${isUser ? 'bg-white text-black' : 'bg-black border border-white/20 text-white'}`}>
        <div className="flex items-center gap-2 mb-2 opacity-100">
          {isUser ? 
            <div className="text-xs font-black uppercase tracking-widest">You</div> : 
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-neutral-400"><Cpu className="w-3 h-3" /> Qwen Agent</div>
          }
        </div>
        <div className="text-sm whitespace-pre-wrap leading-relaxed font-mono">{msg.content}</div>
        
        {msg.sql && (
          <div className="mt-4 border border-white/20 bg-[#383838]">
            <div className="bg-black/50 px-3 py-1.5 text-[10px] text-neutral-300 flex items-center gap-2 border-b border-white/10 uppercase tracking-widest font-bold">
              <Terminal className="w-3 h-3" /> Generated SQL
            </div>
            <pre className="p-4 text-xs font-mono text-white overflow-x-auto">
              {msg.sql}
            </pre>
          </div>
        )}

        {msg.data && msg.data.length > 0 && (
          <div className="mt-4 border border-white/20">
             <div className="bg-black/50 px-3 py-1.5 text-[10px] text-neutral-300 flex items-center gap-2 border-b border-white/10 uppercase tracking-widest font-bold">
              <TableIcon className="w-3 h-3" /> Result Set
            </div>
            <div className="overflow-x-auto max-h-60 bg-black">
              <table className="w-full text-xs text-left font-mono">
                <thead className="bg-[#383838] text-white border-b border-white/20 sticky top-0">
                  <tr>
                    {Object.keys(msg.data[0] || {}).map(k => (
                      <th key={k} className="px-4 py-3 font-bold border-r border-white/10 last:border-0 whitespace-nowrap">{k}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {msg.data.map((row, i) => (
                    <tr key={i} className="border-b border-white/10 last:border-0 hover:bg-white/10 transition-colors">
                      {Object.values(row).map((val, j) => (
                        <td key={j} className="px-4 py-2 text-neutral-300 border-r border-white/10 last:border-0 whitespace-nowrap">{String(val)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        
        {msg.data && msg.data.length === 0 && !isUser && (
             <div className="mt-3 text-xs text-neutral-500 font-mono border-l-2 border-neutral-700 pl-3 py-1">Query returned 0 rows.</div>
        )}
      </div>
    </div>
  );
};

// 4. Create Table Modal (Custom UI)
const CreateTableModal = ({ isOpen, onClose, onSubmit }) => {
  const [tableName, setTableName] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!tableName.trim()) return;
    onSubmit(tableName);
    setTableName('');
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-black border border-white/20 shadow-2xl w-full max-w-md animate-in zoom-in-95 duration-200">
        <div className="p-4 border-b border-white/10 flex justify-between items-center bg-neutral-900/50">
           <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
             <TableIcon className="w-4 h-4" /> New Entity
           </h3>
           <button onClick={onClose} className="text-neutral-500 hover:text-white transition-colors">
             <X className="w-4 h-4" />
           </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Table Name</label>
            <input 
              autoFocus
              type="text" 
              className="w-full bg-neutral-900/50 border border-white/20 p-3 text-sm text-white focus:border-white focus:outline-none transition-colors font-mono placeholder-neutral-700"
              placeholder="e.g. customer_orders"
              value={tableName}
              onChange={(e) => setTableName(e.target.value)}
            />
            <p className="text-[10px] text-neutral-600 font-mono">
              Recommendation: Use snake_case format.
            </p>
          </div>

          <div className="flex gap-3 pt-2">
             <button 
               type="button" 
               onClick={onClose}
               className="flex-1 px-4 py-3 text-xs font-bold uppercase tracking-widest text-white border border-white/20 hover:bg-white/10 transition-colors"
             >
               Cancel
             </button>
             <button 
               type="submit"
               disabled={!tableName.trim()}
               className="flex-1 px-4 py-3 text-xs font-bold uppercase tracking-widest text-black bg-white hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
             >
               Create
             </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// --- MAIN APPLICATION ---

export default function App() {
  const [activeTab, setActiveTab] = useState('schema'); 
  const [schema, setSchema] = useState([]);
  const [messages, setMessages] = useState([
    { id: 1, role: 'system', content: 'SYSTEM READY. WAITING FOR INPUT.' }
  ]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [globalError, setGlobalError] = useState(null);
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  const messagesEndRef = useRef(null);

  // Initial Data Fetch
  useEffect(() => {
    fetchSchema();
  }, []);

  // Auto-scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchSchema = async () => {
    try {
      const data = await api.getSchema();
      setSchema(data);
      setGlobalError(null);
    } catch (e) {
      setGlobalError(`CONNECTION ERROR: ${e.message}`);
    }
  };

  const handleConfirmCreateTable = async (tableName) => {
    try {
        await api.sendDDL({
            action: 'create_table',
            table_name: tableName.toLowerCase().replace(/\s+/g, '_')
        });
        fetchSchema();
        setIsModalOpen(false);
    } catch (e) {
        setGlobalError(e.message);
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim()) return;

    const userMsg = { id: Date.now(), role: 'user', content: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsProcessing(true);

    try {
        const response = await api.chat(userMsg.content);
        
        const agentMsg = {
            id: Date.now() + 1,
            role: 'system',
            content: response.response,
            sql: response.sql,
            data: response.data
        };
        setMessages(prev => [...prev, agentMsg]);
    } catch (e) {
        const errorMsg = {
            id: Date.now() + 1,
            role: 'system',
            content: `ERROR: ${e.message}`
        };
        setMessages(prev => [...prev, errorMsg]);
    } finally {
        setIsProcessing(false);
    }
  };

  return (
    <div className="flex w-full h-screen bg-[#383838] text-white font-sans selection:bg-white selection:text-black overflow-hidden">
      
      {/* 1. SIDEBAR: Black */}
      <TableExplorer schema={schema} onRefresh={fetchSchema} />

      {/* 2. MAIN CONTENT: Gray Background */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative w-full">
        
        {/* Header: Black */}
        <header className="h-16 shrink-0 border-b border-white/20 bg-black flex items-center justify-between px-6 z-20 w-full shadow-md shadow-black/30">
          <div className="flex flex-col">
            <h1 className="text-lg font-black text-white tracking-tighter uppercase flex items-center gap-3">
              Agentic<span className="text-neutral-500">DBMS</span>
              <span className={`text-[10px] border px-1.5 py-0.5 font-mono ${globalError ? 'border-white text-white bg-red-600' : 'border-white/30 text-neutral-400'}`}>
                 {globalError ? 'OFFLINE' : 'ONLINE'}
              </span>
            </h1>
            <p className="text-[10px] text-neutral-600 font-mono tracking-widest mt-0.5">LOCALHOST:5432 • QWEN-CODER-1.5B</p>
          </div>

          {/* Tabs: Black Background */}
          <div className="flex border border-white/20 p-1 gap-1 bg-black">
            <button
              onClick={() => setActiveTab('schema')}
              className={`flex items-center gap-2 px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition-all duration-200 ${
                activeTab === 'schema' 
                  ? 'bg-white text-black' 
                  : 'text-neutral-500 hover:text-white'
              }`}
            >
              <LayoutGrid className="w-3 h-3" />
              Design
            </button>
            <button
              onClick={() => setActiveTab('agent')}
              className={`flex items-center gap-2 px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition-all duration-200 ${
                activeTab === 'agent' 
                  ? 'bg-white text-black' 
                  : 'text-neutral-500 hover:text-white'
              }`}
            >
              <MessageSquare className="w-3 h-3" />
              Agent
            </button>
          </div>
        </header>

        {/* Global Error Banner */}
        {globalError && (
            <div className="bg-white text-black p-2 text-center text-xs font-bold flex justify-center items-center gap-2 w-full uppercase tracking-widest border-b-4 border-black">
                <AlertCircle className="w-4 h-4" />
                {globalError}
            </div>
        )}

        {/* View Container: Gray Background */}
        <main className="flex-1 overflow-hidden relative w-full bg-[#383838]">
          
          {/* VIEW 1: NO-CODE SCHEMA DESIGNER */}
          {activeTab === 'schema' && (
            <div className="h-full w-full overflow-y-auto p-8 bg-[radial-gradient(#4a4a4a_1px,transparent_1px)] [background-size:20px_20px]">
              <div className="flex justify-between items-end mb-8 max-w-7xl mx-auto border-b border-white/10 pb-4">
                <div>
                  <h2 className="text-3xl font-black text-white mb-1 tracking-tighter uppercase">Schema Designer</h2>
                  <p className="text-neutral-400 text-xs font-mono max-w-lg">
                    // VISUAL MODE // CHANGES COMMIT INSTANTLY
                  </p>
                </div>
                <button 
                  onClick={() => setIsModalOpen(true)}
                  className="bg-white hover:bg-neutral-200 text-black px-5 py-2 flex items-center gap-2 font-bold uppercase text-xs tracking-widest transition-transform active:scale-95 shadow-lg shadow-black/20"
                >
                  <Plus className="w-4 h-4" /> New Table
                </button>
              </div>

              <div className="flex flex-wrap gap-6 items-start content-start pb-20 max-w-7xl mx-auto">
                {schema.map(table => (
                  <SchemaNode 
                    key={table.id} 
                    table={table} 
                    onRefresh={fetchSchema}
                    onError={setGlobalError}
                  />
                ))}
                
                {schema.length === 0 && !globalError && (
                  <div className="w-full h-64 border border-dashed border-neutral-600 flex flex-col items-center justify-center text-neutral-500 bg-black/10">
                    <Database className="w-12 h-12 mb-4 opacity-20" />
                    <p className="text-sm font-mono uppercase tracking-widest">Database Empty</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* VIEW 2: AGENT CHAT */}
          {activeTab === 'agent' && (
            <div className="h-full w-full flex flex-col max-w-5xl mx-auto bg-[#383838] border-x border-white/5">
               <div className="flex-1 overflow-y-auto p-8 scrollbar-hide w-full">
                 {/* Empty State */}
                 {messages.length === 1 && (
                    <div className="flex flex-col items-center justify-center h-60 opacity-30 mb-8 border border-white/10 m-8 bg-black/20">
                       <Cpu className="w-16 h-16 text-white mb-4" />
                       <p className="text-xs font-mono uppercase tracking-[0.2em] text-center">Neural Interface Ready<br/>Waiting for natural language query</p>
                    </div>
                 )}

                 {messages.map(msg => (
                   <ChatMessage key={msg.id} msg={msg} />
                 ))}
                 
                 {isProcessing && (
                   <div className="flex justify-start mb-4">
                     <div className="bg-black border border-white/20 p-4 flex items-center gap-4 shadow-lg shadow-black/10">
                       <div className="w-2 h-2 bg-white animate-ping"></div>
                       <span className="text-xs font-mono text-white uppercase tracking-widest">Processing...</span>
                     </div>
                   </div>
                 )}
                 <div ref={messagesEndRef} />
               </div>

               {/* Chat Input: Black Background anchored at bottom */}
               <div className="p-6 border-t border-white/20 bg-black z-20 w-full shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
                 <div className="relative group">
                   <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                     <Terminal className="h-5 w-5 text-neutral-500 group-focus-within:text-white transition-colors" />
                   </div>
                   <input
                     type="text"
                     className="block w-full pl-12 pr-14 py-4 bg-black border border-white/30 text-white placeholder-neutral-600 focus:outline-none focus:border-white focus:ring-1 focus:ring-white transition-all font-mono text-sm"
                     placeholder="QUERY DATABASE..."
                     value={input}
                     onChange={(e) => setInput(e.target.value)}
                     onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                   />
                   <button 
                    onClick={handleSendMessage}
                    disabled={!input.trim() || isProcessing}
                    className="absolute inset-y-2 right-2 px-4 bg-white hover:bg-neutral-200 disabled:bg-neutral-900 disabled:text-neutral-700 text-black flex items-center justify-center transition-colors"
                   >
                     <Play className="w-4 h-4 fill-current" />
                   </button>
                 </div>
               </div>
            </div>
          )}

        </main>

        {/* Create Table Modal */}
        <CreateTableModal 
            isOpen={isModalOpen} 
            onClose={() => setIsModalOpen(false)} 
            onSubmit={handleConfirmCreateTable} 
        />
      </div>
    </div>
  );
}