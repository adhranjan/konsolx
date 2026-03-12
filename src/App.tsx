import React, { useState, useEffect } from 'react';
import { 
  Terminal as TerminalIcon, 
  Plus, 
  X, 
  Folder, 
  Settings, 
  Layers, 
  Globe, 
  Download, 
  Upload,
  Trash2,
  ChevronRight,
  ChevronDown,
  Play,
  RefreshCw,
  Edit3,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Search,
  Command,
  Monitor
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import TerminalComponent from './components/TerminalComponent';
import Modal from './components/Modal';
import { Workspace, Environment, Tab, EnvVar } from './types';

export default function App() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [selectedEnvId, setSelectedEnvId] = useState<string | null>(null);
  const [defaultShell, setDefaultShell] = useState<string>('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [commandSearch, setCommandSearch] = useState('');

  // Modal States
  const [isEnvModalOpen, setIsEnvModalOpen] = useState(false);
  const [editingEnv, setEditingEnv] = useState<Environment | null>(null);
  const [isWsModalOpen, setIsWsModalOpen] = useState(false);
  const [editingWs, setEditingWs] = useState<Workspace | null>(null);
  const [isTabSettingsModalOpen, setIsTabSettingsModalOpen] = useState(false);
  const [editingTabSettings, setEditingTabSettings] = useState<Tab | null>(null);

  // Form States
  const [envName, setEnvName] = useState('');
  const [envGroupName, setEnvGroupName] = useState('');
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [wsName, setWsName] = useState('');
  const [wsBasePath, setWsBasePath] = useState('');
  const [wsDirs, setWsDirs] = useState<{ name: string; path: string }[]>([]);
  const [tabLocalVars, setTabLocalVars] = useState<EnvVar[]>([]);
  const [tabEnvId, setTabEnvId] = useState<string | undefined>(undefined);
  const [expandedWorkspaces, setExpandedWorkspaces] = useState<Set<string>>(new Set());
  const [collapsedEnvGroups, setCollapsedEnvGroups] = useState<Set<string>>(new Set());
  const [importStatus, setImportStatus] = useState<{ message: string; type: 'info' | 'error' | 'success' } | null>(null);

  // Fetch initial data
  useEffect(() => {
    fetch('/api/workspaces').then(res => res.json()).then(setWorkspaces);
    fetch('/api/environments').then(res => res.json()).then(setEnvironments);
  }, []);

  const getGroupColor = (name: string) => {
    const colors = [
      '#3b82f6', // blue
      '#10b981', // emerald
      '#f59e0b', // amber
      '#ef4444', // red
      '#8b5cf6', // violet
      '#ec4899', // pink
      '#06b6d4', // cyan
      '#f97316', // orange
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  const addTab = (cwd: string = '.', title: string = 'Terminal', groupName?: string) => {
    const id = Math.random().toString(36).substr(2, 9);
    const effectiveGroupName = groupName || (activeEnv ? activeEnv.name : undefined);
    const newTab: Tab = { 
      id, 
      title, 
      cwd, 
      shell: defaultShell || undefined,
      envId: activeEnv?.id || selectedEnvId || undefined,
      groupName: effectiveGroupName,
      groupColor: effectiveGroupName ? getGroupColor(effectiveGroupName) : undefined
    };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(id);
  };

  const closeTab = (id: string) => {
    setTabs(prev => {
      const remainingTabs = prev.filter(t => t.id !== id);
      if (activeTabId === id) {
        setActiveTabId(remainingTabs[remainingTabs.length - 1]?.id || null);
      }
      return remainingTabs;
    });
  };

  const toggleWorkspace = (id: string) => {
    setExpandedWorkspaces(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleEnvGroup = (group: string) => {
    setCollapsedEnvGroups(prev => {
      const next = new Set(prev);
      if (next.has(group)) {
        next.delete(group);
      } else {
        next.add(group);
      }
      return next;
    });
  };

  const selectWorkspace = (ws: Workspace) => {
    console.log('Opening workspace:', ws.name, 'Directories:', ws.directories);
    if (!ws.directories || !Array.isArray(ws.directories) || ws.directories.length === 0) {
      console.warn('Workspace has no directories or directories is not an array');
      return;
    }

    const groupColor = getGroupColor(ws.name);
    const newTabs: Tab[] = [];
    
    for (let i = 0; i < ws.directories.length; i++) {
      const dir = ws.directories[i];
      const id = `tab-${Math.random().toString(36).substr(2, 9)}-${Date.now()}-${i}`;
      let resolvedPath = dir.path;
      if (!dir.path.startsWith('/') && ws.basePath) {
        resolvedPath = `${ws.basePath.replace(/\/$/, '')}/${dir.path.replace(/^\//, '')}`;
      }

      newTabs.push({ 
        id, 
        title: dir.name || dir.path.split('/').pop() || dir.path, 
        cwd: resolvedPath, 
        shell: defaultShell || undefined,
        envId: selectedEnvId || undefined,
        groupName: ws.name,
        groupColor
      });
    }
    
    console.log('Adding', newTabs.length, 'new tabs to existing', tabs.length, 'tabs');
    setTabs(prev => [...prev, ...newTabs]);
    
    if (newTabs.length > 0) {
      console.log('Setting active tab to:', newTabs[0].id);
      setActiveTabId(newTabs[0].id);
    }
  };

  const handleSaveWorkspace = (e: React.FormEvent) => {
    e.preventDefault();
    if (!wsName) return;

    const validDirs = wsDirs.filter(d => d.path.trim() !== '');

    const newWs: Workspace = {
      id: editingWs?.id || Math.random().toString(36).substr(2, 9),
      name: wsName,
      basePath: wsBasePath,
      directories: validDirs
    };

    fetch('/api/workspaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newWs)
    }).then(() => {
      if (editingWs) {
        setWorkspaces(prev => prev.map(w => w.id === editingWs.id ? newWs : w));
      } else {
        setWorkspaces(prev => [...prev, newWs]);
      }
      setIsWsModalOpen(false);
      setEditingWs(null);
      setWsName('');
      setWsBasePath('');
      setWsDirs([]);
    });
  };

  const addWsDirRow = () => {
    setWsDirs(prev => [...prev, { name: '', path: '' }]);
  };

  const updateWsDirRow = (index: number, updates: Partial<{ name: string; path: string }>) => {
    setWsDirs(prev => prev.map((d, i) => i === index ? { ...d, ...updates } : d));
  };

  const removeWsDirRow = (index: number) => {
    setWsDirs(prev => prev.filter((_, i) => i !== index));
  };

  const handleSaveEnvironment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!envName) return;

    // Filter out empty keys
    const validVars = envVars.filter(v => v.key.trim() !== '');

    const newEnv: Environment = {
      id: editingEnv?.id || Math.random().toString(36).substr(2, 9),
      name: envName,
      groupName: envGroupName || undefined,
      variables: validVars
    };

    fetch('/api/environments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newEnv)
    }).then(res => {
      if (!res.ok) throw new Error('Failed to save environment');
      return res.json();
    }).then(() => {
      if (editingEnv) {
        setEnvironments(prev => prev.map(e => e.id === editingEnv.id ? newEnv : e));
      } else {
        setEnvironments(prev => [...prev, newEnv]);
      }
      setIsEnvModalOpen(false);
      setEditingEnv(null);
      setEnvName('');
      setEnvGroupName('');
      setEnvVars([]);
    }).catch(err => {
      console.error('Error saving environment:', err);
    });
  };

  const addEnvVarRow = () => {
    setEnvVars(prev => [...prev, { key: '', value: '', isPrivate: false }]);
  };

  const importFromEnv = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const lines = content.split('\n');
      const newVars: EnvVar[] = [];
      
      lines.forEach(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        
        const [key, ...valueParts] = trimmed.split('=');
        if (key) {
          newVars.push({
            key: key.trim(),
            value: valueParts.join('=').trim().replace(/^["']|["']$/g, ''),
            isPrivate: false
          });
        }
      });

      if (newVars.length > 0) {
        setEnvVars(prev => [...prev, ...newVars]);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const exportToEnv = () => {
    const content = envVars
      .filter(v => v.key.trim() !== '')
      .map(v => `${v.key}=${v.value}`)
      .join('\n');
    
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${envName.toLowerCase().replace(/\s+/g, '-')}.env`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const updateEnvVarRow = (index: number, updates: Partial<EnvVar>) => {
    setEnvVars(prev => prev.map((v, i) => i === index ? { ...v, ...updates } : v));
  };

  const removeEnvVarRow = (index: number) => {
    setEnvVars(prev => prev.filter((_, i) => i !== index));
  };

  const openWsModal = (ws?: Workspace) => {
    if (ws) {
      setEditingWs(ws);
      setWsName(ws.name);
      setWsBasePath(ws.basePath || '');
      setWsDirs(ws.directories || []);
    } else {
      setEditingWs(null);
      setWsName('');
      setWsBasePath('');
      setWsDirs([{ name: 'Root', path: '.' }]);
    }
    setIsWsModalOpen(true);
  };

  const openEnvModal = (env?: Environment) => {
    if (env) {
      setEditingEnv(env);
      setEnvName(env.name);
      setEnvGroupName(env.groupName || '');
      // Ensure variables is an array (migration path)
      const vars = Array.isArray(env.variables) 
        ? env.variables 
        : Object.entries(env.variables).map(([key, value]) => ({ key, value: String(value), isPrivate: false }));
      setEnvVars(vars);
    } else {
      setEditingEnv(null);
      setEnvName('');
      setEnvGroupName('');
      setEnvVars([{ key: 'NODE_ENV', value: 'development', isPrivate: false }]);
    }
    setIsEnvModalOpen(true);
  };

  const openTabSettingsModal = (tab: Tab) => {
    setEditingTabSettings(tab);
    setTabLocalVars(tab.localVariables || []);
    setTabEnvId(tab.envId);
    setIsTabSettingsModalOpen(true);
  };

  const handleSaveTabSettings = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTabSettings) return;

    const validVars = tabLocalVars.filter(v => v.key.trim() !== '');
    setTabs(prev => prev.map(t => t.id === editingTabSettings.id ? { 
      ...t, 
      localVariables: validVars,
      envId: tabEnvId
    } : t));
    setIsTabSettingsModalOpen(false);
    setEditingTabSettings(null);
    setTabLocalVars([]);
    setTabEnvId(undefined);
  };

  const deleteWorkspace = (id: string) => {
    fetch(`/api/workspaces/${id}`, { method: 'DELETE' }).then(() => {
      setWorkspaces(prev => prev.filter(w => w.id !== id));
    });
  };

  const deleteEnvironment = (id: string) => {
    fetch(`/api/environments/${id}`, { method: 'DELETE' }).then(() => {
      setEnvironments(prev => prev.filter(e => e.id !== id));
      if (selectedEnvId === id) setSelectedEnvId(null);
    });
  };

  const handleExport = () => {
    const data = {
      workspaces,
      environments,
      version: '1.0',
      exportedAt: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `termisync-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportGroup = (groupName: string) => {
    const groupEnvs = environments.filter(e => (e.groupName || 'Ungrouped') === groupName);
    const data = {
      groupName,
      environments: groupEnvs,
      version: '1.0',
      exportedAt: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `termisync-group-${groupName.toLowerCase()}-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportStatus({ message: 'Reading file...', type: 'info' });

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (!data.environments) {
          setImportStatus({ message: 'Invalid backup file format', type: 'error' });
          return;
        }

        setImportStatus({ message: 'Importing data...', type: 'info' });
        console.log('Importing data:', data);

        // Import Workspaces (if present)
        if (data.workspaces) {
          for (const ws of data.workspaces) {
            console.log('Importing workspace:', ws);
            const response = await fetch('/api/workspaces', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(ws)
            });
            if (!response.ok) {
              const errorData = await response.json();
              throw new Error(`Workspace import failed: ${errorData.error || response.statusText}`);
            }
          }
        }
        // Import Environments
        for (const env of data.environments) {
          console.log('Importing environment:', env);
          const response = await fetch('/api/environments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(env)
          });
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Environment import failed: ${errorData.error || response.statusText}`);
          }
        }

        // Refresh data
        const [wsRes, envRes] = await Promise.all([
          fetch('/api/workspaces'),
          fetch('/api/environments')
        ]);
        const [wsData, envData] = await Promise.all([
          wsRes.json(),
          envRes.json()
        ]);
        
        setWorkspaces(wsData);
        setEnvironments(envData);
        
        setImportStatus({ message: 'Import successful!', type: 'success' });
        setTimeout(() => setImportStatus(null), 3000);
      } catch (err) {
        console.error('Import failed:', err);
        setImportStatus({ message: 'Import failed. Check console for details.', type: 'error' });
      }
    };
    reader.onerror = () => {
      setImportStatus({ message: 'Failed to read file', type: 'error' });
    };
    reader.readAsText(file);
    // Reset input
    e.target.value = '';
  };

  const handleImportToGroup = (e: React.ChangeEvent<HTMLInputElement>, groupName: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportStatus({ message: 'Reading file...', type: 'info' });

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        const envsToImport = data.environments || (Array.isArray(data) ? data : null);
        
        if (!envsToImport || !Array.isArray(envsToImport)) {
          setImportStatus({ message: 'Invalid environment data', type: 'error' });
          return;
        }

        setImportStatus({ message: 'Importing to group...', type: 'info' });

        for (const env of envsToImport) {
          const envWithGroup = { ...env, groupName: groupName === 'Ungrouped' ? undefined : groupName };
          await fetch('/api/environments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(envWithGroup)
          });
        }

        const envRes = await fetch('/api/environments');
        setEnvironments(await envRes.json());
        
        setImportStatus({ message: `Imported to ${groupName} successfully!`, type: 'success' });
        setTimeout(() => setImportStatus(null), 3000);
      } catch (err) {
        console.error('Group import failed:', err);
        setImportStatus({ message: 'Import failed', type: 'error' });
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const activeTab = tabs.find(t => t.id === activeTabId);
  const activeEnv = environments.find(e => e.id === (activeTab?.envId || selectedEnvId));
  const localVarsCount = activeTab?.localVariables?.length || 0;

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen(prev => !prev);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 't') {
        e.preventDefault();
        addTab();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'w' && activeTabId) {
        e.preventDefault();
        closeTab(activeTabId);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTabId]);

  const commands = [
    { id: 'new-tab', name: 'New Terminal Tab', icon: Plus, action: () => addTab() },
    { id: 'new-ws', name: 'New Workspace', icon: Folder, action: () => setIsWsModalOpen(true) },
    { id: 'new-env', name: 'New Environment', icon: Layers, action: () => setIsEnvModalOpen(true) },
    { id: 'toggle-sidebar', name: 'Toggle Sidebar', icon: ChevronRight, action: () => setIsSidebarOpen(!isSidebarOpen) },
    { id: 'import', name: 'Import Config', icon: Upload, action: () => document.getElementById('import-input')?.click() },
  ];

  const filteredCommands = commands.filter(c => 
    c.name.toLowerCase().includes(commandSearch.toLowerCase())
  );

  return (
    <div className="flex flex-col h-screen bg-[#0a0a0a] text-[#e0e0e0] font-sans overflow-hidden">
      {/* Native-style Title Bar */}
      <div className="h-10 flex items-center justify-between px-4 bg-[#0a0a0a] border-b border-white/5 select-none drag-region shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5 mr-4">
            <div className="w-3 h-3 rounded-full bg-[#ff5f56] border border-black/10" />
            <div className="w-3 h-3 rounded-full bg-[#ffbd2e] border border-black/10" />
            <div className="w-3 h-3 rounded-full bg-[#27c93f] border border-black/10" />
          </div>
          <div className="flex items-center gap-2 text-[11px] font-bold text-white/40 uppercase tracking-widest">
            <Monitor size={12} />
            <span>Konsolx Desktop</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setIsCommandPaletteOpen(true)}
            className="flex items-center gap-2 px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-[10px] text-white/40 transition-colors"
          >
            <Search size={12} />
            <span>Search Commands...</span>
            <span className="flex items-center gap-0.5 opacity-50">
              <Command size={10} />
              <span>K</span>
            </span>
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <motion.div 
          initial={false}
          animate={{ width: isSidebarOpen ? 260 : 0 }}
          className="bg-[#141414] border-r border-white/5 flex flex-col overflow-hidden"
        >
          <div className="p-4 flex items-center justify-between border-b border-white/5">
          <div className="flex items-center gap-2 font-semibold">
            <TerminalIcon size={18} className="text-emerald-500" />
            <span>Konsolx</span>
          </div>
          <div className="flex items-center gap-1">
            <button 
              onClick={handleExport} 
              className="p-1.5 hover:bg-white/5 rounded text-white/40 hover:text-white transition-colors"
              title="Export Backup"
            >
              <Download size={16} />
            </button>
            <label className="p-1.5 hover:bg-white/5 rounded text-white/40 hover:text-white transition-colors cursor-pointer" title="Import Backup">
              <Upload size={16} />
              <input type="file" accept=".json" onChange={handleImport} className="hidden" />
            </label>
            <button onClick={() => setIsSidebarOpen(false)} className="p-1.5 hover:bg-white/5 rounded text-white/40 hover:text-white transition-colors">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-6">
          {/* Shell Selection */}
          <div className="px-2">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-bold text-white/40 uppercase tracking-wider flex items-center gap-2">
                <TerminalIcon size={12} /> Default Shell
              </span>
            </div>
            <select 
              value={defaultShell}
              onChange={(e) => setDefaultShell(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white/80 outline-none focus:border-emerald-500/50 transition-colors cursor-pointer"
            >
              <option value="" className="bg-[#141414]">System Default</option>
              <option value="bash" className="bg-[#141414]">Bash</option>
              <option value="sh" className="bg-[#141414]">Sh</option>
              <option value="tmux" className="bg-[#141414]">Tmux</option>
              <option value="zsh" className="bg-[#141414]">Zsh</option>
            </select>
          </div>

          {importStatus && (
            <div className={`mx-2 p-2 rounded text-[10px] font-medium flex items-center justify-between ${
              importStatus.type === 'error' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
              importStatus.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
              'bg-blue-500/10 text-blue-400 border border-blue-500/20'
            }`}>
              <span>{importStatus.message}</span>
              <button onClick={() => setImportStatus(null)} className="hover:text-white">
                <X size={10} />
              </button>
            </div>
          )}
          {/* Workspaces */}
          <div>
            <div className="flex items-center justify-between px-2 mb-2">
              <span className="text-xs font-bold text-white/40 uppercase tracking-wider flex items-center gap-2">
                <Layers size={12} /> Workspaces
              </span>
              <button onClick={() => openWsModal()} className="p-1 hover:bg-white/5 rounded text-white/40 hover:text-white">
                <Plus size={14} />
              </button>
            </div>
            <div className="space-y-1">
              {workspaces.map(ws => (
                <div key={ws.id} className="group flex flex-col rounded hover:bg-white/5 transition-colors">
                  <div className="flex items-center gap-2 px-2 py-1.5 cursor-pointer">
                    <button 
                      onClick={(e) => { e.stopPropagation(); toggleWorkspace(ws.id); }}
                      className="text-white/20 hover:text-white/60 transition-colors"
                    >
                      {expandedWorkspaces.has(ws.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                    <div className="flex-1 flex items-center gap-2" onClick={() => selectWorkspace(ws)}>
                      <Folder size={14} className="text-blue-400" />
                      <span className="text-sm truncate font-medium">{ws.name}</span>
                      <span className="text-[10px] bg-white/5 px-1.5 rounded-full text-white/30">{ws.directories.length}</span>
                    </div>
                    <button 
                      onClick={(e) => { e.stopPropagation(); openWsModal(ws); }} 
                      className="opacity-0 group-hover:opacity-100 p-1 hover:text-emerald-400 transition-opacity"
                      title="Edit Workspace"
                    >
                      <Edit3 size={12} />
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); deleteWorkspace(ws.id); }} 
                      className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 transition-opacity"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                  
                  {/* Individual Directory Links */}
                  {expandedWorkspaces.has(ws.id) && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="pl-8 pr-2 pb-1 space-y-0.5 overflow-hidden"
                    >
                      {ws.directories.map((dir, idx) => (
                        <div 
                          key={idx}
                          onClick={() => {
                            const id = Math.random().toString(36).substr(2, 9);
                            let resolvedPath = dir.path;
                            if (!dir.path.startsWith('/') && ws.basePath) {
                              resolvedPath = `${ws.basePath.replace(/\/$/, '')}/${dir.path.replace(/^\//, '')}`;
                            }
                            const newTab: Tab = { 
                              id, 
                              title: dir.name || dir.path.split('/').pop() || dir.path, 
                              cwd: resolvedPath, 
                              shell: defaultShell || undefined,
                              envId: selectedEnvId || undefined,
                              groupName: ws.name,
                              groupColor: getGroupColor(ws.name)
                            };
                            setTabs(prev => [...prev, newTab]);
                            setActiveTabId(id);
                          }}
                          className="text-[10px] text-white/30 hover:text-white/60 cursor-pointer truncate flex items-center gap-1.5 py-0.5"
                          title={dir.path}
                        >
                          <div className="w-1 h-1 rounded-full bg-white/10" />
                          {dir.name || dir.path.split('/').pop()}
                        </div>
                      ))}
                    </motion.div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Environments */}
          <div>
            <div className="flex items-center justify-between px-2 mb-2">
              <span className="text-xs font-bold text-white/40 uppercase tracking-wider flex items-center gap-2">
                <Globe size={12} /> Environments
              </span>
              <button onClick={() => openEnvModal()} className="p-1 hover:bg-white/5 rounded text-white/40 hover:text-white">
                <Plus size={14} />
              </button>
            </div>
            <div className="space-y-3">
              {Object.entries(
                environments.reduce((acc, env) => {
                  const group = env.groupName || 'Ungrouped';
                  if (!acc[group]) acc[group] = [];
                  acc[group].push(env);
                  return acc;
                }, {} as Record<string, Environment[]>)
              ).map(([group, groupEnvs]) => {
                const isCollapsed = collapsedEnvGroups.has(group);
                return (
                  <div key={group} className="space-y-1">
                    <div 
                      className="px-2 text-[9px] font-bold text-white/20 uppercase tracking-widest mb-1 flex items-center gap-2 group/header"
                    >
                      <div className="h-px flex-1 bg-white/5" />
                      <div 
                        onClick={() => toggleEnvGroup(group)}
                        className="flex items-center gap-1 cursor-pointer hover:text-white/40 transition-colors"
                      >
                        {isCollapsed ? <ChevronRight size={8} /> : <ChevronDown size={8} />}
                        {group}
                      </div>
                      <button 
                        onClick={(e) => { e.stopPropagation(); exportGroup(group); }}
                        className="opacity-0 group-hover/header:opacity-100 p-0.5 hover:text-emerald-400 transition-all"
                        title="Export Group"
                      >
                        <Download size={10} />
                      </button>
                      <label 
                        className="opacity-0 group-hover/header:opacity-100 p-0.5 hover:text-emerald-400 transition-all cursor-pointer"
                        title="Import to Group"
                        onClick={e => e.stopPropagation()}
                      >
                        <Upload size={10} />
                        <input type="file" accept=".json" onChange={e => handleImportToGroup(e, group)} className="hidden" />
                      </label>
                      <div className="h-px flex-1 bg-white/5" />
                    </div>
                    {!isCollapsed && (groupEnvs as Environment[]).map(env => (
                      <div 
                        key={env.id} 
                        className={`group flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors ${selectedEnvId === env.id ? 'bg-emerald-500/10 text-emerald-400' : 'hover:bg-white/5'}`}
                      >
                        <div className="flex-1 flex flex-col min-w-0" onClick={() => setSelectedEnvId(env.id)}>
                          <div className="flex items-center gap-2">
                            <Settings size={14} className={selectedEnvId === env.id ? 'text-emerald-400' : 'text-orange-400'} />
                            <span className="text-sm truncate font-medium">{env.name}</span>
                          </div>
                          <div className="pl-6 text-[10px] text-white/30 truncate">
                            {Array.isArray(env.variables) 
                              ? env.variables.map(v => `${v.key}=${v.isPrivate ? '••••' : v.value}`).join(', ')
                              : Object.entries(env.variables).map(([k, v]) => `${k}=${v}`).join(', ')
                            }
                          </div>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); openEnvModal(env); }} className="opacity-0 group-hover:opacity-100 p-1 hover:text-emerald-400 transition-opacity" title="Edit Variables">
                          <Edit3 size={12} />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); deleteEnvironment(env.id); }} className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 transition-opacity">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {!isSidebarOpen && (
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-50 bg-[#141414] p-1 border border-white/5 rounded-r hover:bg-white/10"
          >
            <ChevronRight size={16} />
          </button>
        )}

        {/* Tab Bar */}
        <div className="h-12 bg-[#141414] border-b border-white/5 flex items-center px-2 gap-0.5 overflow-x-auto no-scrollbar">
          {tabs.map((tab, idx) => {
            const prevTab = tabs[idx - 1];
            const isSameGroup = prevTab && prevTab.groupName === tab.groupName && tab.groupName !== undefined;
            
            return (
              <div 
                key={tab.id}
                onClick={() => setActiveTabId(tab.id)}
                className={`flex flex-col justify-center px-3 py-1 rounded-t-md text-sm cursor-pointer transition-all group min-w-[140px] max-w-[220px] relative border-t-2 ${activeTabId === tab.id ? 'bg-[#0a0a0a] text-white border-x border-white/5' : 'text-white/40 hover:bg-white/5 border-transparent'} ${isSameGroup ? 'ml-0' : 'ml-1'}`}
                style={{ borderTopColor: tab.groupColor || 'transparent' }}
              >
                <div className="flex items-center gap-2">
                  <TerminalIcon size={12} className={activeTabId === tab.id ? 'text-emerald-500' : ''} />
                  <div className="flex flex-col min-w-0 flex-1">
                    <span 
                      className="truncate font-medium leading-none"
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        const newTitle = prompt('Rename Tab:', tab.title);
                        if (newTitle) {
                          setTabs(prev => prev.map(t => t.id === tab.id ? { ...t, title: newTitle } : t));
                        }
                      }}
                    >
                      {tab.title}
                    </span>
                  </div>
                  <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        setTabs(prev => prev.map(t => t.id === tab.id ? { ...t, envId: selectedEnvId || undefined, groupName: activeEnv?.name, groupColor: activeEnv ? getGroupColor(activeEnv.name) : undefined } : t));
                      }}
                      className="p-0.5 hover:bg-white/10 rounded"
                      title="Sync Environment & Group"
                    >
                      <RefreshCw size={10} />
                    </button>
                    <button 
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        openTabSettingsModal(tab);
                      }}
                      className="p-0.5 hover:bg-white/10 rounded"
                      title="Tab Settings (Local Env)"
                    >
                      <Settings size={10} />
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                      className="p-0.5 hover:bg-white/10 rounded"
                    >
                      <X size={10} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          <button 
            onClick={() => addTab()}
            className="p-1.5 hover:bg-white/5 rounded text-white/40 hover:text-white ml-2"
          >
            <Plus size={16} />
          </button>
        </div>

        {/* Active Env Indicator */}
        {(activeEnv || localVarsCount > 0) && (
          <div className="bg-emerald-500/5 px-4 py-1 border-b border-emerald-500/10 flex items-center gap-2 text-[10px] text-emerald-400/60 uppercase tracking-widest font-bold">
            <Globe size={10} />
            <span>
              Active Environment: {activeEnv?.name || 'Local Only'}
              {localVarsCount > 0 && ` (+ ${localVarsCount} local overrides)`}
            </span>
          </div>
        )}

        {/* Terminal Area */}
        <div className="flex-1 relative bg-[#0a0a0a]">
          {tabs.length === 0 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white/20">
              <TerminalIcon size={64} strokeWidth={1} className="mb-4" />
              <p className="text-lg font-medium">No active terminals</p>
              <button 
                onClick={() => addTab()}
                className="mt-4 px-4 py-2 bg-emerald-500/10 text-emerald-500 rounded-lg border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors flex items-center gap-2"
              >
                <Plus size={18} /> New Terminal
              </button>
            </div>
          ) : (
            tabs.map(tab => (
              <div 
                key={tab.id} 
                className={`absolute inset-0 ${activeTabId === tab.id ? 'block' : 'hidden'}`}
              >
                <TerminalComponent 
                  cwd={tab.cwd} 
                  shell={tab.shell}
                  env={(() => {
                    const envObj: Record<string, string> = {};
                    const targetEnv = environments.find(e => e.id === tab.envId);
                    if (targetEnv) {
                      if (Array.isArray(targetEnv.variables)) {
                        targetEnv.variables.forEach(v => {
                          envObj[v.key] = v.value;
                        });
                      } else {
                        Object.assign(envObj, targetEnv.variables);
                      }
                    }
                    // Merge local tab variables (they override global ones)
                    if (tab.localVariables) {
                      tab.localVariables.forEach(v => {
                        if (v.key.trim()) {
                          envObj[v.key] = v.value;
                        }
                      });
                    }
                    return envObj;
                  })()} 
                  onClose={() => closeTab(tab.id)}
                />
              </div>
            ))
          )}
        </div>
      </div>

      {/* Command Palette */}
      <AnimatePresence>
        {isCommandPaletteOpen && (
          <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCommandPaletteOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: -20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -20 }}
              className="relative w-full max-w-xl bg-[#151515] border border-white/10 rounded-xl shadow-2xl overflow-hidden"
            >
              <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5">
                <Search size={18} className="text-white/40" />
                <input 
                  autoFocus
                  type="text"
                  placeholder="What do you want to do?"
                  value={commandSearch}
                  onChange={e => setCommandSearch(e.target.value)}
                  className="flex-1 bg-transparent border-none outline-none text-sm placeholder:text-white/20"
                  onKeyDown={e => {
                    if (e.key === 'Enter' && filteredCommands.length > 0) {
                      filteredCommands[0].action();
                      setIsCommandPaletteOpen(false);
                    }
                    if (e.key === 'Escape') setIsCommandPaletteOpen(false);
                  }}
                />
              </div>
              <div className="max-h-[60vh] overflow-y-auto p-2">
                {filteredCommands.length > 0 ? (
                  filteredCommands.map((cmd, idx) => (
                    <button
                      key={cmd.id}
                      onClick={() => {
                        cmd.action();
                        setIsCommandPaletteOpen(false);
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/5 text-left transition-colors group"
                    >
                      <div className="w-8 h-8 rounded bg-white/5 flex items-center justify-center text-white/40 group-hover:text-emerald-500 transition-colors">
                        <cmd.icon size={16} />
                      </div>
                      <span className="text-sm font-medium text-white/70 group-hover:text-white">{cmd.name}</span>
                    </button>
                  ))
                ) : (
                  <div className="py-8 text-center text-white/20 text-sm">
                    No commands found
                  </div>
                )}
              </div>
              <div className="px-4 py-2 bg-white/5 border-t border-white/5 flex items-center justify-between text-[10px] text-white/30 uppercase font-bold tracking-wider">
                <div className="flex gap-3">
                  <span className="flex items-center gap-1"><span className="px-1 bg-white/10 rounded">↑↓</span> Navigate</span>
                  <span className="flex items-center gap-1"><span className="px-1 bg-white/10 rounded">↵</span> Select</span>
                </div>
                <span className="flex items-center gap-1"><span className="px-1 bg-white/10 rounded">ESC</span> Close</span>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modals */}
      <Modal 
        isOpen={isWsModalOpen} 
        onClose={() => setIsWsModalOpen(false)} 
        title={editingWs ? 'Edit Workspace' : 'New Workspace'}
      >
        <form onSubmit={handleSaveWorkspace} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-white/40 uppercase mb-1">Name</label>
              <input 
                autoFocus
                type="text" 
                value={wsName}
                onChange={e => setWsName(e.target.value)}
                placeholder="My Project"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500/50 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-white/40 uppercase mb-1">Base Path (Optional)</label>
              <input 
                type="text" 
                value={wsBasePath}
                onChange={e => setWsBasePath(e.target.value)}
                placeholder="/home/user/project"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500/50 transition-colors font-mono"
              />
            </div>
          </div>
          
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-bold text-white/40 uppercase">Directories</label>
              <button 
                type="button"
                onClick={addWsDirRow}
                className="text-[10px] flex items-center gap-1 text-emerald-500 hover:text-emerald-400 transition-colors uppercase font-bold tracking-wider"
              >
                <Plus size={10} /> Add Directory
              </button>
            </div>
            
            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
              {wsDirs.map((dir, index) => (
                <div key={index} className="flex items-center gap-2 group">
                  <input 
                    type="text"
                    value={dir.name}
                    onChange={e => updateWsDirRow(index, { name: e.target.value })}
                    placeholder="Name (e.g. API)"
                    className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-emerald-500/50 transition-colors"
                  />
                  <input 
                    type="text"
                    value={dir.path}
                    onChange={e => updateWsDirRow(index, { path: e.target.value })}
                    placeholder="Path (e.g. ./src)"
                    className="flex-[1.5] bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-emerald-500/50 transition-colors font-mono"
                  />
                  <button 
                    type="button"
                    onClick={() => removeWsDirRow(index)}
                    className="p-1.5 text-white/20 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              {wsDirs.length === 0 && (
                <div className="text-center py-4 text-white/20 text-xs italic">
                  No directories defined
                </div>
              )}
            </div>
            <p className="mt-2 text-[10px] text-white/20 italic">
              Paths starting with / are absolute. Others are relative to Base Path (or server root).
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button 
              type="button"
              onClick={() => setIsWsModalOpen(false)}
              className="px-4 py-2 text-sm text-white/40 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button 
              type="submit"
              className="px-4 py-2 bg-emerald-500 text-black font-semibold rounded-lg hover:bg-emerald-400 transition-colors text-sm"
            >
              Save Workspace
            </button>
          </div>
        </form>
      </Modal>

      <Modal 
        isOpen={isEnvModalOpen} 
        onClose={() => setIsEnvModalOpen(false)} 
        title={editingEnv ? 'Edit Environment' : 'New Environment'}
      >
        <form onSubmit={handleSaveEnvironment} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-white/40 uppercase mb-1">Name</label>
              <input 
                autoFocus
                type="text" 
                value={envName}
                onChange={e => setEnvName(e.target.value)}
                placeholder="Production"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500/50 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-white/40 uppercase mb-1">Group (Optional)</label>
              <input 
                type="text" 
                list="env-groups"
                value={envGroupName}
                onChange={e => setEnvGroupName(e.target.value)}
                placeholder="PROD"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500/50 transition-colors"
              />
              <datalist id="env-groups">
                {Array.from(new Set(environments.map(e => e.groupName).filter(Boolean))).map(group => (
                  <option key={group} value={group} />
                ))}
              </datalist>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-bold text-white/40 uppercase">Variables</label>
              <div className="flex items-center gap-3">
                <label className="text-[10px] flex items-center gap-1 text-white/40 hover:text-white transition-colors uppercase font-bold tracking-wider cursor-pointer">
                  <Upload size={10} /> Import .env
                  <input type="file" onChange={importFromEnv} className="hidden" />
                </label>
                <button 
                  type="button"
                  onClick={exportToEnv}
                  className="text-[10px] flex items-center gap-1 text-white/40 hover:text-white transition-colors uppercase font-bold tracking-wider"
                >
                  <Download size={10} /> Export .env
                </button>
                <button 
                  type="button"
                  onClick={addEnvVarRow}
                  className="text-[10px] flex items-center gap-1 text-emerald-500 hover:text-emerald-400 transition-colors uppercase font-bold tracking-wider"
                >
                  <Plus size={10} /> Add Variable
                </button>
              </div>
            </div>
            
            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
              {envVars.map((v, index) => (
                <div key={index} className="flex items-center gap-2 group">
                  <input 
                    type="text"
                    value={v.key}
                    onChange={e => updateEnvVarRow(index, { key: e.target.value })}
                    placeholder="KEY"
                    className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-emerald-500/50 transition-colors font-mono"
                  />
                  <div className="flex-[1.5] relative">
                    <input 
                      type={v.isPrivate ? "password" : "text"}
                      value={v.value}
                      onChange={e => updateEnvVarRow(index, { value: e.target.value })}
                      placeholder="VALUE"
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-emerald-500/50 transition-colors font-mono pr-8"
                    />
                    <button
                      type="button"
                      onClick={() => updateEnvVarRow(index, { isPrivate: !v.isPrivate })}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-white/20 hover:text-white transition-colors"
                      title={v.isPrivate ? "Make Public" : "Make Private"}
                    >
                      {v.isPrivate ? <Lock size={12} /> : <Unlock size={12} />}
                    </button>
                  </div>
                  <button 
                    type="button"
                    onClick={() => removeEnvVarRow(index)}
                    className="p-1.5 text-white/20 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              {envVars.length === 0 && (
                <div className="text-center py-4 text-white/20 text-xs italic">
                  No variables defined
                </div>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button 
              type="button"
              onClick={() => setIsEnvModalOpen(false)}
              className="px-4 py-2 text-sm text-white/40 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button 
              type="submit"
              className="px-4 py-2 bg-emerald-500 text-black font-semibold rounded-lg hover:bg-emerald-400 transition-colors text-sm"
            >
              Save Environment
            </button>
          </div>
        </form>
      </Modal>
      
      <Modal
        isOpen={isTabSettingsModalOpen}
        onClose={() => setIsTabSettingsModalOpen(false)}
        title={`Tab Settings: ${editingTabSettings?.title}`}
      >
        <form onSubmit={handleSaveTabSettings} className="space-y-6">
          <div>
            <label className="block text-xs font-bold text-white/40 uppercase mb-2">Base Environment</label>
            <select 
              value={tabEnvId || ''} 
              onChange={e => setTabEnvId(e.target.value || undefined)}
              className="w-full bg-[#1a1a1a] border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500/50 transition-colors text-white"
            >
              <option value="">None</option>
              {environments.map(env => (
                <option key={env.id} value={env.id}>{env.name} ({env.groupName || 'Ungrouped'})</option>
              ))}
            </select>
            <p className="mt-1 text-[10px] text-white/20 italic">Select a global environment to use as the base for this tab.</p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-bold text-white/40 uppercase">Local Overrides & Variables</label>
              <div className="flex items-center gap-2">
                <button 
                  type="button"
                  onClick={() => setTabLocalVars(prev => [...prev, { key: '', value: '', isPrivate: false }])}
                  className="text-[10px] flex items-center gap-1 text-emerald-500 hover:text-emerald-400 transition-colors uppercase font-bold tracking-wider"
                >
                  <Plus size={10} /> Add New
                </button>
              </div>
            </div>
            
            <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1 custom-scrollbar mb-4">
              {tabLocalVars.map((v, index) => (
                <div key={index} className="flex items-center gap-2 group">
                  <input 
                    type="text"
                    value={v.key}
                    onChange={e => setTabLocalVars(prev => prev.map((item, i) => i === index ? { ...item, key: e.target.value } : item))}
                    placeholder="KEY"
                    className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-emerald-500/50 transition-colors font-mono"
                  />
                  <div className="flex-[1.5] relative">
                    <input 
                      type={v.isPrivate ? "password" : "text"}
                      value={v.value}
                      onChange={e => setTabLocalVars(prev => prev.map((item, i) => i === index ? { ...item, value: e.target.value } : item))}
                      placeholder="VALUE"
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-emerald-500/50 transition-colors font-mono pr-8"
                    />
                    <button
                      type="button"
                      onClick={() => setTabLocalVars(prev => prev.map((item, i) => i === index ? { ...item, isPrivate: !item.isPrivate } : item))}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-white/20 hover:text-white transition-colors"
                    >
                      {v.isPrivate ? <Lock size={12} /> : <Unlock size={12} />}
                    </button>
                  </div>
                  <button 
                    type="button"
                    onClick={() => setTabLocalVars(prev => prev.filter((_, i) => i !== index))}
                    className="p-1.5 text-white/20 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              {tabLocalVars.length === 0 && (
                <div className="text-center py-4 text-white/20 text-xs italic border border-dashed border-white/5 rounded-lg">
                  No local overrides defined.
                </div>
              )}
            </div>

            <div className="border-t border-white/5 pt-4">
              <label className="block text-xs font-bold text-white/40 uppercase mb-2">Quick Add from Global Environments</label>
              <div className="grid grid-cols-2 gap-2 max-h-[150px] overflow-y-auto pr-1 custom-scrollbar">
                {environments.flatMap(env => 
                  (Array.isArray(env.variables) ? env.variables : []).map(v => ({ ...v, envName: env.name }))
                ).map((v, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      if (!tabLocalVars.some(lv => lv.key === v.key)) {
                        setTabLocalVars(prev => [...prev, { key: v.key, value: v.value, isPrivate: v.isPrivate }]);
                      }
                    }}
                    className="text-left px-2 py-1.5 rounded bg-white/5 hover:bg-emerald-500/10 border border-white/5 hover:border-emerald-500/30 transition-all group flex flex-col"
                  >
                    <span className="text-[10px] font-mono text-emerald-400 truncate">{v.key}</span>
                    <span className="text-[8px] text-white/20 truncate">{v.envName}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button 
              type="button"
              onClick={() => setIsTabSettingsModalOpen(false)}
              className="px-4 py-2 text-sm text-white/40 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button 
              type="submit"
              className="px-4 py-2 bg-emerald-500 text-black font-semibold rounded-lg hover:bg-emerald-400 transition-colors text-sm"
            >
              Save Tab Settings
            </button>
          </div>
        </form>
      </Modal>
    </div>
    </div>
  );
}
