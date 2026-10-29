import { create } from 'zustand';

type OfflineEditorState = {
  editingKey: string | null;
  open: (key: string) => void;
  close: () => void;
};

export const useOfflineEditorStore = create<OfflineEditorState>((set) => ({
  editingKey: null,
  open: (key) => set({ editingKey: key }),
  close: () => set({ editingKey: null }),
}));
