export interface Workspace {
  id: string;
  name: string;
  basePath?: string;
  directories: { name: string; path: string }[];
}

export interface EnvVar {
  key: string;
  value: string;
  isPrivate: boolean;
}

export interface Environment {
  id: string;
  name: string;
  groupName?: string;
  variables: EnvVar[];
}

export interface Tab {
  id: string;
  sessionId?: string;      // server-side terminal session ID
  title: string;
  cwd: string;
  shell?: string;
  envId?: string;
  vars:   Record<string, string>;
  groupName?: string;
  groupColor?: string;
  initialCommand?: string;
}

export interface QuickCommand {
  id: string;
  name: string;
  command: string;
  cwd?: string;
  icon?: string;
  group?: string;
}
