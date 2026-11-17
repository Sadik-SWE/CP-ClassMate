const SKILL_ALIASES: Record<string, string> = {
  // Frontend & JS ecosystem
  js: 'javascript',
  'ecmascript': 'javascript',
  es6: 'javascript',
  es2022: 'javascript',
  ts: 'typescript',
  reactjs: 'react',
  'react.js': 'react',
  'react js': 'react',
  nextjs: 'next.js',
  'next.js': 'next.js',
  next: 'next.js',
  vuejs: 'vue.js',
  'vue.js': 'vue.js',
  vue: 'vue.js',
  angularjs: 'angular',
  tailwind: 'tailwind css',
  tailwindcss: 'tailwind css',
  'tailwind-css': 'tailwind css',
  html5: 'html',
  css3: 'css',

  // Backend & APIs
  node: 'node.js',
  nodejs: 'node.js',
  'node.js': 'node.js',
  express: 'express.js',
  expressjs: 'express.js',
  'express.js': 'express.js',
  rest: 'rest api',
  'rest apis': 'rest api',
  restful: 'rest api',
  'restful api': 'rest api',
  graphql: 'graphql',

  // Languages
  py: 'python',
  python3: 'python',
  cpp: 'c++',
  'c plus plus': 'c++',
  csharp: 'c#',
  golang: 'go',

  // Databases
  mongo: 'mongodb',
  mongodb: 'mongodb',
  mongoose: 'mongodb',
  postgres: 'postgresql',
  psql: 'postgresql',
  mysql: 'mysql',
  sql: 'sql',
  redis: 'redis',

  // AI / ML / Data
  ml: 'machine learning',
  'machine-learning': 'machine learning',
  dl: 'deep learning',
  'deep-learning': 'deep learning',
  ai: 'artificial intelligence',
  nlp: 'natural language processing',
  llm: 'large language models',
  llms: 'large language models',
  rag: 'retrieval augmented generation',
  sklearn: 'scikit-learn',
  'scikit learn': 'scikit-learn',
  tf: 'tensorflow',
  torch: 'pytorch',
  pandas: 'pandas',
  numpy: 'numpy',
  'data science': 'data analysis',

  // DevOps / Design / Testing
  k8s: 'kubernetes',
  docker: 'docker',
  gh: 'git',
  github: 'git',
  'ui/ux': 'ui/ux design',
  uiux: 'ui/ux design',
  ux: 'ui/ux design',
  ui: 'ui/ux design',
  'ui research': 'ui/ux design',
  figma: 'figma',
  qa: 'software testing',
  playwright: 'playwright',
  jest: 'testing',
  vitest: 'testing',
};

export function normalizeSkillName(raw: string): string {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  if (!cleaned) return '';
  if (SKILL_ALIASES[cleaned]) {
    return SKILL_ALIASES[cleaned];
  }
  const compact = cleaned.replace(/[._-]/g, '');
  if (SKILL_ALIASES[compact]) {
    return SKILL_ALIASES[compact];
  }
  return cleaned;
}

export function normalizeInterestName(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function getSkillAliasTableSize(): number {
  return Object.keys(SKILL_ALIASES).length;
}
