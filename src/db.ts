import Dexie, { type EntityTable } from 'dexie';

export interface HistoryItem {
  id?: number;
  fileName: string;
  status: 'success' | 'error';
  label: string;
  confidence: number;
  imageUrl: string; // Base64 or Blob URL
  message: string;
  timestamp: number;
}

const db = new Dexie('FaceForgeDB') as Dexie & {
  history: EntityTable<
    HistoryItem,
    'id' // primary key
  >;
};

// Schema definition
db.version(1).stores({
  history: '++id, fileName, status, label, confidence, timestamp'
});

export { db };
