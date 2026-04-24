import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Network, Search, AlertCircle, Play, GitBranchPlus, XCircle, LayoutTemplate } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Utility for cleaner class names
function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

// Tree Viewer Component
const TreeView = ({ treeObj }: { treeObj: Record<string, any> }) => {
  if (!treeObj || Object.keys(treeObj).length === 0) return null;
  return (
    <ul className="pl-6 border-l border-white/10 mt-2 space-y-2">
      {Object.entries(treeObj).map(([node, children], idx) => (
        <li key={node} className="relative">
          <div className="absolute -left-[24px] top-[14px] w-4 h-[1px] bg-white/20"></div>
          <div className="flex items-center gap-2 text-zinc-300 relative">
            <span className="font-mono flex items-center justify-center bg-blue-500/10 border border-blue-500/20 text-blue-400 w-7 h-7 rounded-md text-sm font-bold shadow-sm shadow-black/20">
              {node}
            </span>
          </div>
          <TreeView treeObj={children as Record<string, any>} />
        </li>
      ))}
    </ul>
  );
};

export default function App() {
    const [inputVal, setInputVal] = useState('{\n  "data": [\n    "A->B", "A->C", "B->D", "C->E", "E->F",\n    "X->Y", "Y->Z", "Z->X",\n    "P->Q", "Q->R",\n    "G->H", "G->H", "G->I",\n    "hello", "1->2", "A->"\n  ]\n}');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');

  const handleProcess = async () => {
    try {
      setLoading(true);
      setError('');
      setResult(null);

      // Try parsing input
      let parsedData: any = [];
      try {
        const parsed = JSON.parse(inputVal);
        if (parsed.data && Array.isArray(parsed.data)) {
            parsedData = parsed.data;
        } else if (Array.isArray(parsed)) {
            parsedData = parsed;
        } else {
            throw new Error("Invalid structure");
        }
      } catch (err) {
        // Fallback for simple comma separated
        parsedData = inputVal.split(',').map(s => s.trim().replace(/^"|"$/g, '').replace(/^'|'$/g, ''));
      }

      if (!Array.isArray(parsedData)) {
        throw new Error("Input must be an array of strings.");
      }

      const res = await fetch('/bfhl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: parsedData }),
      });

      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || `HTTP error ${res.status}`);
      
      setResult(json);
    } catch (err: any) {
      setError(err.message || 'An unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-zinc-300 font-sans selection:bg-blue-500/30">
      <div className="max-w-6xl mx-auto px-4 py-8 md:py-16">
        
        <header className="mb-12 flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center mb-6 shadow-xl shadow-blue-500/20 ring-1 ring-white/10">
            <Network className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl md:text-5xl font-bold text-white tracking-tight mb-4">
            Graph processing Engine
          </h1>
          <p className="text-zinc-400 max-w-lg text-lg">
            REST API for hierarchical node relationships. Built for SRM Engineering Challenge.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          
          {/* Input Section */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl overflow-hidden relative"
          >
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-blue-500/50 to-transparent"></div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                <LayoutTemplate className="w-5 h-5 text-zinc-400" /> API Payload
              </h2>
            </div>
            
            <p className="text-sm text-zinc-500 mb-4 font-mono">
              POST /bfhl
            </p>

            <textarea
              className="w-full bg-black/50 border border-zinc-800 rounded-xl p-4 text-zinc-300 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all min-h-[280px] resize-y"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              placeholder='["A->B", "A->C"]'
            />

            <button
              onClick={handleProcess}
              disabled={loading}
              className={cn(
                "w-full mt-6 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-semibold transition-all group",
                loading ? "bg-zinc-800 text-zinc-500 cursor-not-allowed" : "bg-white text-black hover:bg-zinc-200 hover:shadow-lg hover:shadow-white/10 active:scale-[0.98]"
              )}
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 rounded-full border-2 border-zinc-500 border-t-zinc-300 animate-spin"></div>
                  Processing...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 transition-transform group-hover:scale-110" /> Send Request
                </>
              )}
            </button>
          </motion.div>

          {/* Results Section */}
          <div className="w-full">
            <AnimatePresence mode="wait">
              {error && (
                <motion.div
                  key="error"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl flex items-start gap-3 mb-6"
                >
                  <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold mb-1">Processing Failed</h3>
                    <p className="text-sm opacity-90">{error}</p>
                  </div>
                </motion.div>
              )}

              {result && (
                <motion.div
                  key="result"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="space-y-6"
                >
                  {/* Summary Cards */}
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                      <div className="text-zinc-500 text-xs font-medium uppercase tracking-wider mb-1">Total Trees</div>
                      <div className="text-2xl font-bold text-white">{result.summary.total_trees}</div>
                    </div>
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                      <div className="text-zinc-500 text-xs font-medium uppercase tracking-wider mb-1">Cycles</div>
                      <div className="text-2xl font-bold text-amber-500">{result.summary.total_cycles}</div>
                    </div>
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                      <div className="text-zinc-500 text-xs font-medium uppercase tracking-wider mb-1">Largest Root</div>
                      <div className="text-2xl font-bold text-blue-400">{result.summary.largest_tree_root || '-'}</div>
                    </div>
                  </div>

                  {/* Bad entries */}
                  {(result.invalid_entries.length > 0 || result.duplicate_edges.length > 0) && (
                    <div className="flex flex-wrap gap-4">
                      {result.invalid_entries.length > 0 && (
                        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex-1 min-w-[200px]">
                          <div className="text-red-400 text-xs font-semibold mb-2 flex items-center gap-1.5"><XCircle className="w-3.5 h-3.5" /> Invalid Entries</div>
                          <div className="flex flex-wrap gap-1.5">
                            {result.invalid_entries.map((item: string, i: number) => (
                              <span key={i} className="text-xs bg-red-500/10 text-red-300 px-2 py-1 rounded border border-red-500/10 font-mono">{item}</span>
                            ))}
                          </div>
                        </div>
                      )}
                      {result.duplicate_edges.length > 0 && (
                        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 flex-1 min-w-[200px]">
                          <div className="text-amber-400 text-xs font-semibold mb-2 flex items-center gap-1.5"><GitBranchPlus className="w-3.5 h-3.5" /> Duplicate Edges</div>
                          <div className="flex flex-wrap gap-1.5">
                            {result.duplicate_edges.map((item: string, i: number) => (
                              <span key={i} className="text-xs bg-amber-500/10 text-amber-300 px-2 py-1 rounded border border-amber-500/10 font-mono">{item}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Hierarchies */}
                  <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
                    <div className="bg-zinc-950/50 p-4 border-b border-zinc-800 text-sm font-medium text-white flex justify-between items-center">
                      <div className="flex items-center gap-2"><Network className="w-4 h-4 text-zinc-400" /> Hierarchies</div>
                      <div className="text-xs text-zinc-500 font-mono">{result.hierarchies.length} groups found</div>
                    </div>
                    <div className="p-4 space-y-6 max-h-[500px] overflow-y-auto custom-scrollbar">
                      {result.hierarchies.map((h: any, i: number) => (
                        <div key={i} className="bg-black/30 border border-white/5 rounded-xl p-4">
                          <div className="flex items-center justify-between mb-4">
                            <div className="text-xs font-mono px-2 py-1 bg-white/10 rounded flex gap-2">
                              {h.has_cycle ? (
                                <span className="text-amber-400">● Cycle Detected</span>
                              ) : (
                                <span className="text-green-400">● Valid Tree</span>
                              )}
                              <span className="text-zinc-500">|</span>
                              <span className="text-zinc-300">Root: {h.root}</span>
                              {!h.has_cycle && (
                                <>
                                  <span className="text-zinc-500">|</span>
                                  <span className="text-zinc-300">Depth: {h.depth}</span>
                                </>
                              )}
                            </div>
                          </div>
                          
                          {/* Tree Rendering */}
                          <div className="pl-2 -mt-2">
                            {h.has_cycle ? (
                              <div className="text-amber-500/70 text-sm italic pl-4 py-2 border-l border-white/10 mt-2">
                                Nested tree structure hidden due to cycles.
                              </div>
                            ) : (
                              Object.keys(h.tree).length > 0 ? (
                                <TreeView treeObj={h.tree} />
                              ) : (
                                <div className="text-zinc-500 text-sm pl-4 py-2 border-l border-white/10 mt-2">
                                  No children
                                </div>
                              )
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                </motion.div>
              )}
            </AnimatePresence>
            
            {!result && !error && (
              <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-zinc-600 border border-dashed border-zinc-800 rounded-2xl p-8 text-center bg-zinc-900/50">
                <Search className="w-12 h-12 mb-4 opacity-50" />
                <h3 className="text-lg font-medium text-zinc-400 mb-2">Ready to Process</h3>
                <p className="text-sm max-w-[250px]">Enter relationships on the left and hit Submit to view graph analysis.</p>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Vercel-like thin scrollbar */}
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #3f3f46; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #52525b; }
      `}} />
    </div>
  );
}
