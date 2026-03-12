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
  title: string;
  cwd: string;
  shell?: string;
  envId?: string;
  groupName?: string;
  groupColor?: string;
  localVariables?: EnvVar[];
}
